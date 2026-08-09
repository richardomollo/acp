import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function getAccessToken(request: Request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

export async function POST(request: Request) {
  try {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(accessToken);
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { gymId, amount, method, phone, bankName, accountNumber, accountName } = body;

    if (!gymId || !amount || !method) {
      return NextResponse.json({ error: 'gymId, amount, and method are required.' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero.' }, { status: 400 });
    }

    if (method === 'mpesa' && !phone) {
      return NextResponse.json({ error: 'Phone number required for M-Pesa payout.' }, { status: 400 });
    }
    if (method === 'bank' && (!bankName || !accountNumber || !accountName)) {
      return NextResponse.json({ error: 'Bank name, account number, and account name are required.' }, { status: 400 });
    }

    // Verify the gym belongs to this partner
    const { data: gym, error: gymError } = await adminSupabase
      .from('gyms')
      .select('id')
      .eq('id', gymId)
      .ilike('contact_email', user.email ?? '')
      .single();

    if (gymError || !gym) {
      return NextResponse.json({ error: 'Venue not found for this account.' }, { status: 403 });
    }

    const { data: withdrawal, error: insertError } = await adminSupabase
      .from('partner_withdrawals')
      .insert({
        gym_id: gymId,
        partner_email: user.email,
        amount: numericAmount,
        method,
        phone: method === 'mpesa' ? phone : null,
        bank_name: method === 'bank' ? bankName : null,
        account_number: method === 'bank' ? accountNumber : null,
        account_name: method === 'bank' ? accountName : null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit withdrawal request.' },
      { status: 500 }
    );
  }
}
