import { NextResponse } from 'next/server';

import { createClient } from '@/app/lib/supabase/server';
import { WalletServiceError, walletService } from '@/app/lib/wallet/service';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await walletService.getWalletSummaryIfExistsByEmail(user.email);

    return NextResponse.json({
      walletExists: !!summary,
      summary,
    });
  } catch (error) {
    if (error instanceof WalletServiceError) {
      return NextResponse.json(
        { error: error.message, details: error.body ?? null },
        { status: error.status ?? 500 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load wallet summary.' },
      { status: 500 }
    );
  }
}
