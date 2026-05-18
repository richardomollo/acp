import { NextResponse } from 'next/server';

import { createClient } from '@/app/lib/supabase/server';
import { WalletServiceError, walletService } from '@/app/lib/wallet/service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

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
