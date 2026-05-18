'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '@/app/lib/supabase';

type WalletRecord = {
  walletId: string;
  walletAcc: string;
  emailAddress: string;
  currency: string;
  status: string;
  balance: string;
  createdAt: string;
};

type WalletBalance = {
  balance: string;
  currency: string;
};

type WalletTransaction = {
  id: string;
  walletId: string;
  type: string;
  status: string;
  provider: string | null;
  amount: string;
  currency: string;
  providerReference: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type WalletSummary = {
  wallet: WalletRecord;
  balance: WalletBalance;
  transactions: WalletTransaction[];
};

type SummaryResponse = {
  walletExists: boolean;
  summary: WalletSummary | null;
};

type WalletClientProps = {
  emailAddress?: string;
  initialSummary?: WalletSummary | null;
  initialError?: string;
};

const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 2,
});

function formatMoney(amount: string | number) {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return `KES ${amount}`;
  }

  return currencyFormatter.format(numericAmount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusClasses(status: string) {
  const value = status.toUpperCase();

  if (value === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (value === 'FAILED') return 'bg-red-100 text-red-700';
  if (value === 'PROCESSING') return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
}

export default function WalletClient({
  emailAddress: initialEmailAddress = '',
  initialSummary = null,
  initialError = '',
}: WalletClientProps) {
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState(initialEmailAddress);
  const [summary, setSummary] = useState<WalletSummary | null>(initialSummary);
  const [amount, setAmount] = useState('500');
  const [phone, setPhone] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [booting, setBooting] = useState(!initialEmailAddress);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');

  const statementSummary = useMemo(() => {
    const transactions = summary?.transactions ?? [];

    return {
      total: transactions.length,
      completed: transactions.filter((item) => item.status === 'COMPLETED').length,
      inFlight: transactions.filter((item) =>
        item.status === 'PENDING' || item.status === 'PROCESSING'
      ).length,
    };
  }, [summary]);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? '';
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        router.replace('/login');
        return;
      }

      setEmailAddress(user.email);

      if (!initialSummary) {
        await refreshSummary(user.email);
      }

      setBooting(false);
    };

    init();
  }, [router, initialSummary]);

  const refreshSummary = async (resolvedEmail?: string) => {
    setLoadingSummary(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/wallet/summary', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = (await response.json()) as SummaryResponse | { error?: string };

      if (!response.ok) {
        throw new Error('error' in data && data.error ? data.error : 'Failed to refresh wallet.');
      }

      if ('summary' in data) {
        setSummary(data.summary);
        if (resolvedEmail) {
          setEmailAddress(resolvedEmail);
        }
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Failed to refresh wallet.'
      );
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleTopup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amount,
          phone,
        }),
      });

      const data = (await response.json()) as
        | {
            topup?: { message?: string; providerReference?: string | null };
            error?: string;
          }
        | undefined;

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to start top-up.');
      }

      const message = data?.topup?.message || 'STK push sent. Check your phone.';
      const reference = data?.topup?.providerReference;
      setSuccess(reference ? `${message} Ref: ${reference}` : message);

      await refreshSummary();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to start top-up.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (booting) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-white px-6 py-16 text-center">
        <p className="text-sm text-gray-500">Loading wallet…</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Wallet</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                {summary ? formatMoney(summary.balance.balance) : 'No wallet yet'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {summary
                  ? `${summary.wallet.currency} balance available for future purchases and top-ups.`
                  : 'Your wallet will be created automatically the first time you top up.'}
              </p>
            </div>

            <button
              onClick={() => {
                void refreshSummary();
              }}
              disabled={loadingSummary}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-900 disabled:opacity-50"
            >
              {loadingSummary ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Wallet account</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">
                {summary?.wallet.walletAcc ?? 'Will appear after first top-up'}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Status</p>
              <p className="mt-2 text-sm font-semibold capitalize text-gray-900">
                {summary?.wallet.status ?? 'Not created'}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Email</p>
              <p className="mt-2 truncate text-sm font-semibold text-gray-900">{emailAddress}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Top up</p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">M-Pesa wallet funding</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter an amount and M-Pesa number. We’ll create the wallet automatically if this is the first top-up.
          </p>

          <form onSubmit={handleTopup} className="mt-6 space-y-4">
            <div>
              <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">
                Amount (KES)
              </label>
              <input
                id="amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
                placeholder="500"
                required
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
                M-Pesa phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900"
                placeholder="07xx xxx xxx or 2547xxxxxxxx"
                required
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              {submitting ? 'Sending STK push…' : 'Top up wallet'}
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400">Transactions</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{statementSummary.total}</p>
          <p className="mt-1 text-sm text-gray-500">Total statement entries available.</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400">Completed top-ups</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{statementSummary.completed}</p>
          <p className="mt-1 text-sm text-gray-500">Successful wallet funding records.</p>
        </div>
        <div className="rounded-3xl border border-gray-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400">In progress</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{statementSummary.inFlight}</p>
          <p className="mt-1 text-sm text-gray-500">Pending or processing M-Pesa requests.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Statement</p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">Wallet transactions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track top-ups, current processing requests, and provider references in one place.
          </p>
        </div>

        {!summary || summary.transactions.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-900">No wallet transactions yet.</p>
            <p className="mt-2 text-sm text-gray-500">
              Your statement will appear here after your first wallet top-up.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {summary.transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="grid gap-3 px-6 py-4 md:grid-cols-[1.6fr_1fr]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {transaction.type}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(
                        transaction.status
                      )}`}
                    >
                      {transaction.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {transaction.provider ?? 'Provider unavailable'}
                    {transaction.providerReference
                      ? ` · Ref ${transaction.providerReference}`
                      : ' · Waiting for provider reference'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(transaction.createdAt)}
                  </p>
                </div>

                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-900">
                    {formatMoney(transaction.amount)}
                  </p>
                  <p className="mt-1">
                    Phone:{' '}
                    {typeof transaction.metadata?.phone === 'string'
                      ? transaction.metadata.phone
                      : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
