import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { gymId, accessToken } = await req.json();

    if (!gymId || !accessToken) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [gymRes, bookingsRes, expRes] = await Promise.all([
      adminSupabase.from('gyms').select('id, name, contact_email, type, location, area').eq('id', gymId).single(),
      adminSupabase
        .from('bookings')
        .select('id, booking_date, booking_time, status, session_price, deposit_amount, remainder_amount, guest_name, guest_email, created_at, sessions(name), users(name, email)')
        .eq('gym_id', gymId)
        .order('booking_date', { ascending: false })
        .limit(300),
      adminSupabase
        .from('experience_bookings')
        .select('id, status, deposit_amount, remainder_amount, session_price, guest_name, email, created_at, experiences!experience_id(name, date, start_time)')
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .limit(300),
    ]);

    if (gymRes.error) return NextResponse.json({ error: gymRes.error.message }, { status: 500 });
    if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
    if (expRes.error) return NextResponse.json({ error: expRes.error.message }, { status: 500 });

    return NextResponse.json({
      gym: gymRes.data,
      bookings: bookingsRes.data ?? [],
      experiences: expRes.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
