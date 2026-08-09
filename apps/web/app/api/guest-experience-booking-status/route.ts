import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get('bookingId');

  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('experience_bookings')
    .select('id, status, confirmation_code, deposit_amount, remainder_amount, email')
    .eq('id', bookingId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }

  return NextResponse.json(data);
}
