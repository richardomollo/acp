import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Service role client bypasses RLS — stays server-side only
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { email, accessToken } = await req.json();

    if (!email || !accessToken) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Verify the caller has a valid session
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 });
    }

    // Check 1: gym directly owned via contact_email (partner-signup flow)
    const { data: gym } = await adminSupabase
      .from('gyms')
      .select('id, name, is_active')
      .ilike('contact_email', email)
      .maybeSingle();

    if (gym) {
      return NextResponse.json({ isPartner: true, gym }, { status: 200 });
    }

    // Check 2: user is in the partners table (negotiation/admin-created partners)
    const { data: partner } = await adminSupabase
      .from('partners')
      .select('id, business_name')
      .eq('email', email)
      .maybeSingle();

    if (partner) {
      return NextResponse.json({ isPartner: true, partner }, { status: 200 });
    }

    return NextResponse.json({ isPartner: false }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
