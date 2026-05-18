import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { WalletServiceError, walletService } from '@/app/lib/wallet/service';

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

    const {
      data: { user },
      error,
    } = await adminSupabase.auth.getUser(accessToken);

    if (error || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const amount = body?.amount;
    const phone = body?.phone;

    if (amount === undefined || amount === null || !phone) {
      return NextResponse.json(
        { error: 'Amount and phone are required.' },
        { status: 400 }
      );
    }

    const result = await walletService.topupMpesaForEmail({
      emailAddress: user.email,
      amount,
      phone,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof WalletServiceError) {
      return NextResponse.json(
        { error: error.message, details: error.body ?? null },
        { status: error.status ?? 500 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start top-up.' },
      { status: 500 }
    );
  }
}
