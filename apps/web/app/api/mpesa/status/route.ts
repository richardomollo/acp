import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkoutRequestId = searchParams.get('checkoutRequestId');

  if (!checkoutRequestId) {
    return NextResponse.json({ error: 'checkoutRequestId is required' }, { status: 400 });
  }

  const { data: payment, error } = await admin
    .from('booking_payments')
    .select('id, status, mpesa_receipt, booking_id, metadata, cancellation_reason')
    .eq('checkout_request_id', checkoutRequestId)
    .maybeSingle();

  if (error || !payment || payment.status === 'pending') {
    return NextResponse.json({ status: 'PENDING' });
  }

  if (payment.status === 'failed') {
    const reason = (payment as any).cancellation_reason as string | null ?? null;
    const darajaMsg = reason?.startsWith('mpesa_failed: ') ? reason.slice('mpesa_failed: '.length) : null;
    return NextResponse.json({ status: 'FAILED', reason: darajaMsg });
  }

  // Payment succeeded — enrich with confirmation code if available
  const result: Record<string, unknown> = {
    status: 'COMPLETED',
    mpesaReceipt: payment.mpesa_receipt ?? null,
  };

  if (payment.booking_id) {
    const { data: booking } = await admin
      .from('bookings')
      .select('confirmation_code, remainder_amount')
      .eq('id', payment.booking_id)
      .maybeSingle();
    result.confirmationCode = booking?.confirmation_code ?? null;
    result.remainderAmount = booking?.remainder_amount ?? null;
  }

  const expBookingId = (payment.metadata as any)?.experience_booking_id ?? null;
  if (expBookingId) {
    const { data: expBooking } = await admin
      .from('experience_bookings')
      .select('confirmation_code, remainder_amount')
      .eq('id', expBookingId)
      .maybeSingle();
    result.confirmationCode = expBooking?.confirmation_code ?? null;
    result.remainderAmount = expBooking?.remainder_amount ?? null;
  }

  return NextResponse.json(result);
}
