import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const RESCHEDULABLE_STATUSES = ['confirmed', 'deposit_paid', 'pending_payment'];

function sessionStart(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+03:00`);
}

function hoursUntilSession(date: string, time: string): number {
  return (sessionStart(date, time).getTime() - Date.now()) / (1000 * 60 * 60);
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { bookingId?: string; newSessionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { bookingId, newSessionId } = body;
  if (!bookingId || !newSessionId) {
    return NextResponse.json({ error: 'bookingId and newSessionId are required' }, { status: 400 });
  }

  // ── Fetch original booking ────────────────────────────────────────────────
  const { data: booking, error: fetchErr } = await admin
    .from('bookings')
    .select(`
      *,
      sessions!left(id, name, date, time, duration_minutes, gym_id),
      gyms!left(id, name, cancellation_cutoff_hours)
    `)
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Booking cannot be rescheduled (status: ${booking.status})` },
      { status: 422 },
    );
  }

  if ((booking.reschedule_count ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'This booking has already been rescheduled once. No further rescheduling is allowed.' },
      { status: 422 },
    );
  }

  // ── Check 24h cutoff ──────────────────────────────────────────────────────
  const cutoffHours: number = booking.gyms?.cancellation_cutoff_hours ?? 24;
  const sessionDate: string = booking.sessions?.date ?? booking.booking_date;
  const sessionTime: string = booking.sessions?.time ?? booking.booking_time;
  const hours = hoursUntilSession(sessionDate, sessionTime);

  if (hours <= cutoffHours) {
    return NextResponse.json({
      error: `Rescheduling is not allowed within ${cutoffHours} hours of the session.`,
      code:  'WITHIN_CUTOFF',
      hoursUntilSession: Math.round(hours * 10) / 10,
    }, { status: 422 });
  }

  // ── Fetch new session ─────────────────────────────────────────────────────
  const { data: newSession, error: sessErr } = await admin
    .from('sessions')
    .select('id, name, date, time, gym_id, spots_left')
    .eq('id', newSessionId)
    .single();

  if (sessErr || !newSession) {
    return NextResponse.json({ error: 'New session not found' }, { status: 404 });
  }

  // Must be at the same gym
  if (newSession.gym_id !== booking.sessions?.gym_id) {
    return NextResponse.json(
      { error: 'Rescheduling is only allowed to sessions at the same venue.' },
      { status: 422 },
    );
  }

  if (newSession.spots_left < 1) {
    return NextResponse.json({ error: 'The selected session is fully booked.' }, { status: 422 });
  }

  // ── Create new booking ────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: newBooking, error: insertErr } = await admin
    .from('bookings')
    .insert({
      user_id:              user.id,
      session_id:           newSession.id,
      gym_id:               newSession.gym_id,
      booking_date:         newSession.date,
      booking_time:         newSession.time,
      status:               booking.status,
      deposit_amount:       booking.deposit_amount,
      session_price:        booking.session_price,
      original_booking_id:  booking.id,
      reschedule_count:     0,
      created_at:           now,
      updated_at:           now,
    })
    .select('id')
    .single();

  if (insertErr || !newBooking) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create new booking' }, { status: 500 });
  }

  // ── Update original booking to RESCHEDULED ────────────────────────────────
  await admin
    .from('bookings')
    .update({
      status:                    'rescheduled',
      cancelled_by:              'customer',
      cancelled_at:              now,
      rescheduled_to_booking_id: newBooking.id,
      reschedule_count:          (booking.reschedule_count ?? 0) + 1,
      updated_at:                now,
    })
    .eq('id', bookingId);

  // ── Restore spot on original session, claim on new session ───────────────
  const [origSess, newSess] = await Promise.all([
    booking.sessions?.id
      ? admin.from('sessions').select('spots_left').eq('id', booking.sessions.id).single()
      : Promise.resolve({ data: null }),
    admin.from('sessions').select('spots_left').eq('id', newSession.id).single(),
  ]);

  await Promise.all([
    origSess.data
      ? admin.from('sessions').update({ spots_left: origSess.data.spots_left + 1 }).eq('id', booking.sessions!.id)
      : Promise.resolve(),
    newSess.data
      ? admin.from('sessions').update({ spots_left: newSess.data.spots_left - 1 }).eq('id', newSession.id)
      : Promise.resolve(),
  ]);

  // ── Notify customer (fire-and-forget) ────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const { data: userData } = await admin.from('users').select('email, name').eq('id', user.id).single();

  if (userData?.email) {
    fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        type: 'booking_rescheduled',
        data: {
          email:          userData.email,
          customerName:   userData.name ?? 'there',
          sessionName:    newSession.name,
          newSessionDate: newSession.date,
          newSessionTime: newSession.time,
          oldSessionDate: sessionDate,
          oldSessionTime: sessionTime,
        },
      }),
    }).catch(e => console.error('Reschedule email error:', e));
  }

  return NextResponse.json({
    success:      true,
    newBookingId: newBooking.id,
    message:      `Your booking has been rescheduled to ${newSession.date} at ${newSession.time.slice(0, 5)}.`,
  });
}
