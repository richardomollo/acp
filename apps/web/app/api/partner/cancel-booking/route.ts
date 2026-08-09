import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CANCELLABLE_STATUSES = ['confirmed', 'deposit_paid', 'pending_payment'];

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { bookingId?: string; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { bookingId, reason } = body;
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  // ── Fetch booking with gym details ────────────────────────────────────────
  const { data: booking, error: fetchErr } = await admin
    .from('bookings')
    .select(`
      *,
      sessions!left(id, name, date, time, duration_minutes, gym_id),
      gyms!left(id, name, contact_email, cancellation_cutoff_hours)
    `)
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // ── Verify the authenticated user owns this gym ───────────────────────────
  if (booking.gyms?.contact_email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Booking cannot be cancelled (status: ${booking.status})` },
      { status: 422 },
    );
  }

  // ── Update booking: partner cancellation always gives full refund ─────────
  const depositAmount = Number(booking.deposit_amount ?? 0);
  const now = new Date().toISOString();
  const sessionDate: string = booking.sessions?.date ?? booking.booking_date;
  const sessionTime: string = booking.sessions?.time ?? booking.booking_time;

  const { error: updateErr } = await admin
    .from('bookings')
    .update({
      status:              'cancelled_by_partner',
      cancelled_by:        'partner',
      cancelled_at:        now,
      cancellation_reason: reason ?? 'Cancelled by venue',
      refund_status:       depositAmount > 0 ? 'pending' : 'none',
      refund_amount:       depositAmount > 0 ? depositAmount : null,
      deposit_refunded:    depositAmount > 0,
      updated_at:          now,
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
        notes:            `Partner cancellation by ${booking.gyms?.name ?? 'venue'}. Session: ${booking.sessions?.name ?? bookingId}.`,
      })
      .select('id')
      .single();
    refundId = refund?.id ?? null;
  }

  // ── Notify customer (fire-and-forget) ────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const notifyHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const customerId = booking.user_id;
  const guestEmail = booking.guest_email;

  if (customerId) {
    const { data: customerData } = await admin
      .from('users')
      .select('email, name')
      .eq('id', customerId)
      .single();

    const emailTo = customerData?.email ?? guestEmail;
    if (emailTo) {
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: notifyHeaders,
        body: JSON.stringify({
          type: 'partner_cancellation',
          data: {
            email:        emailTo,
            customerName: customerData?.name ?? 'there',
            sessionName:  booking.sessions?.name ?? 'your session',
            sessionDate,
            sessionTime,
            venueName:    booking.gyms?.name ?? '',
            refundAmount: depositAmount,
          },
        }),
      }).catch(e => console.error('Partner cancel customer email error:', e));
    }
  } else if (guestEmail) {
    fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: notifyHeaders,
      body: JSON.stringify({
        type: 'partner_cancellation',
        data: {
          email:        guestEmail,
          customerName: 'there',
          sessionName:  booking.sessions?.name ?? 'your session',
          sessionDate,
          sessionTime,
          venueName:    booking.gyms?.name ?? '',
          refundAmount: depositAmount,
        },
      }),
    }).catch(e => console.error('Partner cancel guest email error:', e));
  }

  return NextResponse.json({
    success:      true,
    refundAmount: depositAmount,
    refundId,
    message:      depositAmount > 0
      ? `Booking cancelled. A full refund of KES ${depositAmount.toLocaleString()} has been initiated for the customer.`
      : 'Booking cancelled.',
  });
}
