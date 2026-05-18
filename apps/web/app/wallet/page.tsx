import { redirect } from 'next/navigation';

import { createClient } from '@/app/lib/supabase/server';
import { WalletServiceError, walletService } from '@/app/lib/wallet/service';

import WalletClient from './WalletClient';

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/login');
  }

  let initialSummary = null;
  let initialError = '';

  try {
    initialSummary = await walletService.getWalletSummaryIfExistsByEmail(user.email);
  } catch (error) {
    initialError =
      error instanceof WalletServiceError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Failed to load wallet.';
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto w-full max-w-7xl px-6 md:px-10 lg:px-16">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Payments</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">Wallet</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Manage wallet funding, see your M-Pesa top-up status, and review your full transaction statement.
          </p>
        </div>

        <WalletClient
          emailAddress={user.email}
          initialSummary={initialSummary}
          initialError={initialError}
        />
      </div>
    </div>
  );
}
