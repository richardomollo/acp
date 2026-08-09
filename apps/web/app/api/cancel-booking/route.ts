import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CANCELLABLE_STATUSES = ['confirmed', 'deposit_paid', 'pending_payment'];

// Returns session start as a Date in EAT (Kenya, UTC+3)
function sessionStart(date: string, time: string): Date {
  // date: "YYYY-MM-DD", time: "HH:MM" or "HH:MM:SS"
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

  let body: { bookingId?: string; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { bookingId, reason } = body;
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  // ── Fetch booking with session + gym details ──────────────────────────────
  const { data: booking, error: fetchErr } = await admin
    .from('bookings')
    .select(`
      *,
      sessions!left(id, name, date, time, duration_minutes, gym_id),
      gyms!left(cancellation_cutoff_hours, name, contact_email)
    `)
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Booking cannot be cancelled (status: ${booking.status})` },
      { status: 422 },
    );
  }

  // ── Check cancellation window ─────────────────────────────────────────────
  const cutoffHours: number = booking.gyms?.cancellation_cutoff_hours ?? 24;
  const sessionDate: string = booking.sessions?.date ?? booking.booking_date;
  const sessionTime: string = booking.sessions?.time ?? booking.booking_time;
  const hours = hoursUntilSession(sessionDate, sessionTime);
  const isRefundable = hours > cutoffHours;

  if (!isRefundable) {
    return NextResponse.json({
      error: `This booking cannot be cancelled for a refund — it starts in less than ${cutoffHours} hours.`,
      code: 'WITHIN_CUTOFF',
      hoursUntilSession: Math.round(hours * 10) / 10,
    }, { status: 422 });
  }

  // ── Update booking ────────────────────────────────────────────────────────
  const depositAmount = Number(booking.deposit_amount ?? 0);
  const now = new Date().toISOString();

  const { error: updateErr } = await admin
    .from('bookings')
    .update({
      status:            'cancelled_by_customer',
      cancelled_by:      'customer',
      cancelled_at:      now,
      cancellation_reason: reason ?? 'Customer requested cancellation',
      refund_status:     depositAmount > 0 ? 'pending' : 'none',
      refund_amount:     depositAmount > 0 ? depositAmount : null,
      deposit_refunded:  depositAmount > 0,
      updated_at:        now,
    })
    .eq('id', bookingId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── Restore spot ──────────────────────────────────────────────────────────
  if (booking.sessions?.id) {
    const { data: sess } = await admin
      .from('sessions')
      .select('spots_left')
      .eq('id', booking.sessions.id)
      .single();
    if (sess) {
      await admin
        .from('sessions')
        .update({ spots_left: sess.spots_left + 1 })
        .eq('id', booking.sessions.id);
    }
  }

  // ── Create refund record ──────────────────────────────────────────────────
  let refundId: string | null = null;
  if (depositAmount > 0) {
    const { data: refund } = await admin
      .from('refund_transactions')
      .insert({
        booking_id:       bookingId,
        payment_provider: 'mpesa',
        amount:           depositAmount,
        status:           'pending',
        notes:            `Customer cancellation. Session: ${booking.sessions?.name ?? bookingId}. Cancelled ${Math.round(hours)} h before start.`,
      })
      .select('id')
      .single();
    refundId = refund?.id ?? null;
  }

  // ── Notifications (fire-and-forget) ───────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const notifyHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  // Email to customer
  const { data: userData } = await admin
    .from('users')
    .select('email, name')
    .eq('id', user.id)
    .single();

  if (userData?.email) {
    fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: notifyHeaders,
      body: JSON.stringify({
        type: 'booking_cancellation',
        data: {
          email:          userData.email,
          customerName:   userData.name ?? 'there',
          sessionName:    booking.sessions?.name ?? 'your session',
          sessionDate:    sessionDate,
          sessionTime:    sessionTime,
          venueName:      booking.gyms?.name ?? '',
          refundAmount:   depositAmount,
          refundEligible: isRefundable,
        },
      }),
    }).catch(e => console.error('Customer cancel email error:', e));
  }

  // Email to partner
  if (booking.gyms?.contact_email) {
    fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: notifyHeaders,
      body: JSON.stringify({
        type: 'partner_booking_cancelled_by_customer',
        data: {
          email:        booking.gyms.contact_email,
          venueName:    booking.gyms.name ?? '',
          sessionName:  booking.sessions?.name ?? 'a session',
          sessionDate:  sessionDate,
          sessionTime:  sessionTime,
          customerName: userData?.name ?? 'A customer',
        },
      }),
    }).catch(e => console.error('Partner cancel email error:', e));
  }

  return NextResponse.json({
    success:        true,
    refundEligible: isRefundable,
    refundAmount:   depositAmount,
    refundId,
    message:        depositAmount > 0
      ? `Booking cancelled. A refund of KES ${depositAmount.toLocaleString()} has been initiated and will be processed within 3–5 business days.`
      : 'Booking cancelled.',
  });
}
