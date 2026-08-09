'use client';

import { useEffect, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WalletOverview = {
  total: number;
  byType: Record<string, number>;
  wallets: Array<{
    walletId: string;
    walletAcc: string;
    walletType: string;
    emailAddress: string;
    status: string;
    currency: string;
    availableBalance: string;
    pendingBalance: string;
    totalBalance: string;
  }>;
};

type Reconciliation = {
  acp: { walletId: string; availableBalance: string; pendingBalance: string; totalBalance: string };
  wallets: { totalAvailable: string; totalPending: string; totalCombined: string };
  difference: string;
  isBalanced: boolean;
  status: string;
};

type PendingPayments = {
  totalPendingAmount: string;
  count: number;
  holds: Array<{
    holdId: string;
    walletId: string;
    walletAcc: string;
    amount: string;
    currency: string;
    reason: string | null;
    reference: string | null;
    status: string;
    expiresAt: string | null;
    createdAt: string;
  }>;
};

type Profits = {
  acpBalance: string;
  totalWalletBalances: string;
  profit: string;
  isProfit: boolean;
  status: string;
};

type Stats = {
  totalCount: number;
  totalVolume: string;
  byType: Array<{ type: string; count: number; volume: string }>;
  byStatus: Record<string, number>;
  filters?: { from?: string; to?: string };
};

type AcpLedger = {
  acpWalletId: string;
  totalCredit: string;
  totalDebit: string;
  netFlow: string;
  count: number;
  entries: Array<{
    id: string;
    walletId: string;
    transactionId: string;
    type: string;
    status: string;
    amount: string;
    runningBalance: string;
    createdAt: string;
  }>;
};

type LoadableState<T> = { data: T | null; loading: boolean; error: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (value: string | number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0
  );
};

const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-KE', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

async function fetchJson<T>(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}

function isExpiringSoon(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
}

// ─── Small components ─────────────────────────────────────────────────────────

function Skeleton() {
  return <div className="h-8 w-32 animate-pulse rounded-lg bg-gray-100" />;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="mt-0.5 text-base">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function SectionHeader({ title, description, loading }: { title: string; description?: string; loading?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
          Loading…
        </div>
      )}
    </div>
  );
}

const statusColors: Record<string, string> = {
  SETTLED:  'bg-emerald-100 text-emerald-700',
  PENDING:  'bg-amber-100 text-amber-700',
  RELEASED: 'bg-blue-100 text-blue-700',
  REVERSED: 'bg-red-100 text-red-700',
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
};

const walletTypeColors: Record<string, string> = {
  ACP:     'bg-indigo-100 text-indigo-700',
  PARTNER: 'bg-purple-100 text-purple-700',
  USER:    'bg-sky-100 text-sky-700',
};

function StatusBadge({ status }: { status: string }) {
  const cls = statusColors[status.toUpperCase()] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const cls = walletTypeColors[type.toUpperCase()] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{type}</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WalletsAdminPage() {
  const [overview, setOverview] = useState<LoadableState<WalletOverview>>({ data: null, loading: true, error: null });
  const [reconciliation, setReconciliation] = useState<LoadableState<Reconciliation>>({ data: null, loading: true, error: null });
  const [pending, setPending] = useState<LoadableState<PendingPayments>>({ data: null, loading: true, error: null });
  const [profits, setProfits] = useState<LoadableState<Profits>>({ data: null, loading: true, error: null });
  const [stats, setStats] = useState<LoadableState<Stats>>({ data: null, loading: true, error: null });
  const [ledger, setLedger] = useState<LoadableState<AcpLedger>>({ data: null, loading: true, error: null });

  const [ledgerType, setLedgerType] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => { void loadStaticPanels(); }, []);
  useEffect(() => { void loadLedgerAndStats(); }, [ledgerType, ledgerStatus, fromDate, toDate]);

  async function loadStaticPanels() {
    const loaders = [
      { setter: setOverview, url: '/api/admin-wallet/wallets' },
      { setter: setReconciliation, url: '/api/admin-wallet/reconciliation' },
      { setter: setPending, url: '/api/admin-wallet/pending-payments' },
      { setter: setProfits, url: '/api/admin-wallet/profits' },
    ] as const;
    await Promise.all(
      loaders.map(async ({ setter, url }) => {
        setter((c: any) => ({ ...c, loading: true, error: null }));
        try {
          setter({ data: await fetchJson(url) as any, loading: false, error: null });
        } catch (e) {
          setter({ data: null, loading: false, error: e instanceof Error ? e.message : 'Failed to load.' });
        }
      })
    );
  }

  async function loadLedgerAndStats() {
    const params = new URLSearchParams();
    if (ledgerType) params.set('type', ledgerType);
    if (ledgerStatus) params.set('status', ledgerStatus);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    setLedger((c) => ({ ...c, loading: true, error: null }));
    setStats((c) => ({ ...c, loading: true, error: null }));
    try {
      const [l, s] = await Promise.all([
        fetchJson<AcpLedger>(`/api/admin-wallet/acp-ledger?${params}`),
        fetchJson<Stats>(`/api/admin-wallet/stats?${params}`),
      ]);
      setLedger({ data: l, loading: false, error: null });
      setStats({ data: s, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load.';
      setLedger({ data: null, loading: false, error: msg });
      setStats({ data: null, loading: false, error: msg });
    }
  }

  const topWallets = useMemo(
    () => [...(overview.data?.wallets || [])].sort((a, b) => Number(b.totalBalance) - Number(a.totalBalance)).slice(0, 10),
    [overview.data]
  );

  const rec = reconciliation.data;
  const prof = profits.data;
  const staticLoading = overview.loading || reconciliation.loading || profits.loading || pending.loading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Wallet Operations</h1>
            <p className="mt-1 text-sm text-gray-500">
              Financial health, reconciliation, transaction flow, and partner holds.
            </p>
          </div>
          <button
            onClick={() => { void loadStaticPanels(); void loadLedgerAndStats(); }}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
          >
            <span className={staticLoading ? 'animate-spin' : ''}>↻</span>
            Refresh
          </button>
        </div>

        {/* Section jump links */}
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ['#health', 'Health'],
            ['#overview', 'Wallets'],
            ['#ledger', 'ACP Ledger'],
            ['#pending', 'Pending Holds'],
            ['#stats', 'Stats'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-white"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl space-y-8 px-8 py-8">

        {/* ══════════════════════════════════════════════════════════════
            SECTION 1 — Financial Health (most critical, always first)
        ══════════════════════════════════════════════════════════════ */}
        <section id="health" className="space-y-4">

          {/* Reconciliation alert banner */}
          {rec && !rec.isBalanced && (
            <div className="flex items-start gap-4 rounded-2xl border border-red-300 bg-red-50 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl">⚠</div>
              <div>
                <p className="font-semibold text-red-800">Reconciliation mismatch detected</p>
                <p className="mt-1 text-sm text-red-700">
                  ACP master wallet and the sum of all wallet balances differ by{' '}
                  <strong>{money(rec.difference)}</strong>. Investigate the ACP ledger immediately.
                </p>
              </div>
            </div>
          )}
          {rec && rec.isBalanced && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5">
              <span className="text-lg">✓</span>
              <p className="text-sm font-medium text-emerald-800">
                All balances reconciled — ACP wallet matches the sum of all partner and user wallets.
              </p>
            </div>
          )}

          {/* 4-metric health strip */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* ACP balance */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">ACP Master Balance</p>
              <p className="mt-3 text-2xl font-bold text-gray-900">
                {reconciliation.loading ? <Skeleton /> : rec ? money(rec.acp.totalBalance) : '—'}
              </p>
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>Available: <strong>{rec ? money(rec.acp.availableBalance) : '—'}</strong></span>
                <span>Pending: <strong>{rec ? money(rec.acp.pendingBalance) : '—'}</strong></span>
              </div>
            </div>

            {/* All wallet liabilities */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Wallet Liabilities</p>
              <p className="mt-3 text-2xl font-bold text-gray-900">
                {reconciliation.loading ? <Skeleton /> : rec ? money(rec.wallets.totalCombined) : '—'}
              </p>
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>Available: <strong>{rec ? money(rec.wallets.totalAvailable) : '—'}</strong></span>
                <span>Pending: <strong>{rec ? money(rec.wallets.totalPending) : '—'}</strong></span>
              </div>
            </div>

            {/* Profit */}
            <div className={`rounded-2xl border p-5 shadow-sm ${prof?.isProfit ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">ACP Profit / Margin</p>
              <p className={`mt-3 text-2xl font-bold ${prof?.isProfit ? 'text-emerald-700' : 'text-red-700'}`}>
                {profits.loading ? <Skeleton /> : prof ? money(prof.profit) : '—'}
              </p>
              <p className="mt-3 text-xs text-gray-500">
                {prof?.isProfit ? '↑ Revenue exceeds liabilities' : '↓ Liabilities exceed revenue'}
              </p>
            </div>

            {/* Pending holds */}
            <div className={`rounded-2xl border p-5 shadow-sm ${(pending.data?.count ?? 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Locked in Holds</p>
              <p className="mt-3 text-2xl font-bold text-gray-900">
                {pending.loading ? <Skeleton /> : pending.data ? money(pending.data.totalPendingAmount) : '—'}
              </p>
              <p className="mt-3 text-xs text-gray-500">
                {pending.data ? `${pending.data.count} active hold${pending.data.count !== 1 ? 's' : ''}` : '—'}
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 2 — Wallet Overview
        ══════════════════════════════════════════════════════════════ */}
        <section id="overview" className="space-y-4">
          <SectionHeader
            title="Wallet Overview"
            description="All wallets by type, sorted by highest balance."
            loading={overview.loading}
          />
          {overview.error && <ErrorBanner message={overview.error} />}

          {/* Breakdown by type */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'ACP Wallets', key: 'ACP', color: 'bg-indigo-50 border-indigo-100' },
              { label: 'Partner Wallets', key: 'PARTNER', color: 'bg-purple-50 border-purple-100' },
              { label: 'User Wallets', key: 'USER', color: 'bg-sky-50 border-sky-100' },
            ].map(({ label, key, color }) => (
              <div key={key} className={`rounded-2xl border p-5 ${color}`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {overview.loading ? <Skeleton /> : (overview.data?.byType?.[key] ?? 0)}
                </p>
                <p className="mt-1 text-xs text-gray-500">of {overview.data?.total ?? '—'} total</p>
              </div>
            ))}
          </div>

          {/* Wallets table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Top wallets by balance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3 text-left">Account</th>
                    <th className="px-5 py-3 text-left">Type</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-right">Available</th>
                    <th className="px-5 py-3 text-right">Pending</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topWallets.map((w) => (
                    <tr key={w.walletId} className="transition hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{w.walletAcc}</p>
                        <p className="text-xs text-gray-400">{w.emailAddress}</p>
                      </td>
                      <td className="px-5 py-4"><TypeBadge type={w.walletType} /></td>
                      <td className="px-5 py-4"><StatusBadge status={w.status} /></td>
                      <td className="px-5 py-4 text-right tabular-nums text-gray-700">{money(w.availableBalance)}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-amber-600">{money(w.pendingBalance)}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-semibold text-gray-900">{money(w.totalBalance)}</td>
                    </tr>
                  ))}
                  {!topWallets.length && !overview.loading && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No wallets found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 3 — ACP Ledger
        ══════════════════════════════════════════════════════════════ */}
        <section id="ledger" className="space-y-4">
          <SectionHeader
            title="ACP Ledger"
            description="Every credit and debit through the ACP master wallet, with running balance."
            loading={ledger.loading}
          />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Filter</span>
            <select
              value={ledgerType}
              onChange={(e) => setLedgerType(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="">All types</option>
              <option value="CREDIT">Credit only</option>
              <option value="DEBIT">Debit only</option>
            </select>
            <select
              value={ledgerStatus}
              onChange={(e) => setLedgerStatus(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="">All statuses</option>
              <option value="SETTLED">Settled</option>
              <option value="PENDING">Pending</option>
              <option value="RELEASED">Released</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="text-xs font-medium text-gray-400">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <span className="text-xs font-medium text-gray-400">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            {(ledgerType || ledgerStatus || fromDate || toDate) && (
              <button
                onClick={() => { setLedgerType(''); setLedgerStatus(''); setFromDate(''); setToDate(''); }}
                className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-700"
              >
                Clear filters
              </button>
            )}
          </div>

          {ledger.error && <ErrorBanner message={ledger.error} />}

          {/* Summary metrics */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Credit</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {ledger.loading ? <Skeleton /> : ledger.data ? money(ledger.data.totalCredit) : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Money in</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Debit</p>
              <p className="mt-2 text-xl font-bold text-red-600">
                {ledger.loading ? <Skeleton /> : ledger.data ? money(ledger.data.totalDebit) : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Money out</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Net Flow</p>
              <p className={`mt-2 text-xl font-bold ${Number(ledger.data?.netFlow ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {ledger.loading ? <Skeleton /> : ledger.data ? money(ledger.data.netFlow) : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Credit minus debit</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Entries</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {ledger.loading ? <Skeleton /> : (ledger.data?.count ?? '—')}
              </p>
              <p className="mt-1 text-xs text-gray-400">In this view</p>
            </div>
          </div>

          {/* Ledger table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3 text-left">Type</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-right">Running Balance</th>
                    <th className="px-5 py-3 text-left">Transaction ID</th>
                    <th className="px-5 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledger.data?.entries.map((entry) => {
                    const isCredit = entry.type === 'CREDIT';
                    return (
                      <tr key={entry.id} className={`transition hover:bg-gray-50 ${isCredit ? 'bg-emerald-50/30' : 'bg-red-50/30'}`}>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 font-semibold ${isCredit ? 'text-emerald-700' : 'text-red-600'}`}>
                            <span>{isCredit ? '↑' : '↓'}</span>
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={entry.status} /></td>
                        <td className={`px-5 py-4 text-right tabular-nums font-semibold ${isCredit ? 'text-emerald-700' : 'text-red-600'}`}>
                          {isCredit ? '+' : '−'}{money(entry.amount)}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums font-semibold text-gray-900">
                          {money(entry.runningBalance)}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-gray-400">{entry.transactionId}</td>
                        <td className="px-5 py-4 text-gray-500">{dateTime(entry.createdAt)}</td>
                      </tr>
                    );
                  })}
                  {!ledger.data?.entries.length && !ledger.loading && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No entries for the selected filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 4 — Pending Holds
        ══════════════════════════════════════════════════════════════ */}
        <section id="pending" className="space-y-4">
          <SectionHeader
            title="Pending Holds"
            description="Funds locked and awaiting settlement. Holds expiring within 24h are highlighted."
            loading={pending.loading}
          />
          {pending.error && <ErrorBanner message={pending.error} />}

          {pending.data && pending.data.count === 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <span>✓</span>
              <p className="text-sm font-medium text-emerald-800">No active holds — all funds are settled.</p>
            </div>
          )}

          {(pending.data?.count ?? 0) > 0 && (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Active holds</h3>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                  {pending.data?.count} hold{(pending.data?.count ?? 0) !== 1 ? 's' : ''} · {money(pending.data?.totalPendingAmount ?? 0)} locked
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      <th className="px-5 py-3 text-left">Wallet</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-left">Reference</th>
                      <th className="px-5 py-3 text-left">Reason</th>
                      <th className="px-5 py-3 text-left">Expires</th>
                      <th className="px-5 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pending.data?.holds.map((hold) => {
                      const expiring = isExpiringSoon(hold.expiresAt);
                      return (
                        <tr key={hold.holdId} className={`transition hover:bg-gray-50 ${expiring ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-gray-900">{hold.walletAcc}</p>
                            <p className="font-mono text-xs text-gray-400">{hold.walletId}</p>
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums font-semibold text-amber-700">{money(hold.amount)}</td>
                          <td className="px-5 py-4 text-gray-600">{hold.reference || '—'}</td>
                          <td className="px-5 py-4 text-gray-600">{hold.reason || '—'}</td>
                          <td className="px-5 py-4">
                            {hold.expiresAt ? (
                              <span className={`font-medium ${expiring ? 'text-amber-600' : 'text-gray-500'}`}>
                                {expiring && '⚠ '}{dateTime(hold.expiresAt)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-5 py-4 text-gray-500">{dateTime(hold.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 5 — Transaction Stats
        ══════════════════════════════════════════════════════════════ */}
        <section id="stats" className="space-y-4">
          <SectionHeader
            title="Transaction Stats"
            description="Aggregate volume and counts across transaction types and statuses. Follows the ledger date filter."
            loading={stats.loading}
          />
          {stats.error && <ErrorBanner message={stats.error} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Transactions</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {stats.loading ? <Skeleton /> : (stats.data?.totalCount ?? '—')}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Volume</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {stats.loading ? <Skeleton /> : stats.data ? money(stats.data.totalVolume) : '—'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* By type */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Volume by type</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {stats.data?.byType.map((item) => {
                  const pct = stats.data?.totalVolume
                    ? Math.round((Number(item.volume) / Number(stats.data.totalVolume)) * 100)
                    : 0;
                  return (
                    <div key={item.type} className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{item.type}</p>
                          <p className="text-xs text-gray-400">{item.count} transactions</p>
                        </div>
                        <p className="font-semibold text-gray-900">{money(item.volume)}</p>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-gray-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!stats.data?.byType.length && !stats.loading && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">No data.</p>
                )}
              </div>
            </div>

            {/* By status */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Transactions by status</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.entries(stats.data?.byStatus || {}).map(([status, count]) => {
                  const total = Object.values(stats.data?.byStatus || {}).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={status} className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <StatusBadge status={status} />
                        <p className="font-semibold text-gray-900">{count} <span className="text-xs font-normal text-gray-400">({pct}%)</span></p>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-1.5 rounded-full ${statusColors[status.toUpperCase()]?.includes('emerald') ? 'bg-emerald-400' : statusColors[status.toUpperCase()]?.includes('amber') ? 'bg-amber-400' : statusColors[status.toUpperCase()]?.includes('red') ? 'bg-red-400' : statusColors[status.toUpperCase()]?.includes('blue') ? 'bg-blue-400' : 'bg-gray-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!Object.keys(stats.data?.byStatus || {}).length && !stats.loading && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">No data.</p>
                )}
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
