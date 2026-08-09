'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type BookingType = 'session' | 'experience' | 'pt';
type BookingStatus = 'earned' | 'pending' | 'no_show' | 'cancelled';

interface BookingRow {
  id: string;
  type: BookingType;
  partnerName: string;
  itemName: string;
  customerName: string;
  date: string;
  amount: number;
  rawStatus: string;
  status: BookingStatus;
}

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface PayoutRow {
  id: string;
  type: 'venue' | 'pt';
  table: 'partner_withdrawals' | 'pt_payout_requests';
  partnerName: string;
  amount: number;
  method: string;
  destinationType: string | null;
  status: PayoutStatus;
  receiptNumber: string | null;
  failureReason: string | null;
  createdAt: string;
}

const fmtKes = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

const RANGE_OPTIONS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time', days: null as number | null },
];

const STATUS_BADGE: Record<string, string> = {
  earned: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  no_show: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-700',
  processing: 'bg-blue-50 text-blue-700',
  failed: 'bg-red-50 text-red-700',
};

export default function FinancePage() {
  const [tab, setTab] = useState<'overview' | 'bookings' | 'payouts'>('overview');
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  const [bookingTypeFilter, setBookingTypeFilter] = useState<'all' | BookingType>('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | BookingStatus>('all');

  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'all' | PayoutStatus>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { status: PayoutStatus; receiptNumber: string; failureReason: string }>>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx]);

  async function load() {
    setLoading(true);
    try {
      const days = RANGE_OPTIONS[rangeIdx].days;
      const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;
      const sinceDate = since ? since.slice(0, 10) : null;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // ── Sessions ──────────────────────────────────────────────────────────
      let sessionQuery = supabase
        .from('bookings')
        .select('id, booking_date, checked_in, no_show, status, user_id, guest_name, guest_email, users(name), sessions(name, drop_in_price, gym_id, gyms(name, rate_floor_percentage))')
        .order('booking_date', { ascending: false })
        .limit(2000);
      if (sinceDate) sessionQuery = sessionQuery.gte('booking_date', sinceDate);
      const { data: sessionData } = await sessionQuery;

      const mappedSessions: BookingRow[] = (sessionData || []).map((b: any) => {
        const session = Array.isArray(b.sessions) ? b.sessions[0] : b.sessions;
        const gym = Array.isArray(session?.gyms) ? session.gyms[0] : session?.gyms;
        const price = Number(session?.drop_in_price) || 0;
        const commissionPct = gym?.rate_floor_percentage ?? 15;
        const payout = Math.round(price * (1 - commissionPct / 100));
        const bDate = new Date(b.booking_date);
        const isCancelled = b.status === 'cancelled';
        const isNoShow = !isCancelled && (b.no_show || (!b.checked_in && bDate < new Date() && b.status === 'confirmed'));
        const isEarned = !isCancelled && !isNoShow && b.checked_in;

        let status: BookingStatus;
        if (isCancelled) status = 'cancelled';
        else if (isNoShow) status = 'no_show';
        else if (isEarned) status = 'earned';
        else status = 'pending';

        const customerName = b.users?.name || b.guest_name || (b.guest_email ? b.guest_email.split('@')[0] : 'Member');

        return {
          id: b.id,
          type: 'session',
          partnerName: gym?.name || 'Unknown venue',
          itemName: session?.name || 'Session',
          customerName,
          date: b.booking_date,
          amount: status === 'earned' ? payout : payout,
          rawStatus: b.status,
          status,
        };
      });

      // ── Experiences ───────────────────────────────────────────────────────
      let expQuery = supabase
        .from('experience_bookings')
        .select('id, status, deposit_amount, created_at, guest_name, email, experiences!experience_id(name, date), gyms!gym_id(name, rate_floor_percentage)')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (since) expQuery = expQuery.gte('created_at', since);
      const { data: expData } = await expQuery;

      const mappedExp: BookingRow[] = (expData || []).map((b: any) => {
        const exp = Array.isArray(b.experiences) ? b.experiences[0] : b.experiences;
        const gym = Array.isArray(b.gyms) ? b.gyms[0] : b.gyms;
        const commission = gym?.rate_floor_percentage ?? 15;
        const payout = Math.round(Number(b.deposit_amount || 0) * (1 - commission / 100));
        const isCancelled = b.status === 'cancelled';
        const isEarned = !isCancelled && ['deposit_paid', 'confirmed', 'checked_in', 'completed'].includes(b.status);
        const customerName = b.guest_name || (b.email ? b.email.split('@')[0] : 'Guest');

        return {
          id: b.id,
          type: 'experience',
          partnerName: gym?.name || 'Unknown venue',
          itemName: exp?.name || 'Experience',
          customerName,
          date: exp?.date || b.created_at.slice(0, 10),
          amount: payout,
          rawStatus: b.status,
          status: isCancelled ? 'cancelled' : isEarned ? 'earned' : 'pending',
        };
      });

      // ── PT sessions ───────────────────────────────────────────────────────
      let ptQuery = supabase
        .from('pt_bookings')
        .select('id, status, amount_kes, scheduled_date, guest_name, guest_email, user_id, users(name), personal_trainers(full_name, professional_name), pt_offerings(title)')
        .order('scheduled_date', { ascending: false })
        .limit(2000);
      if (sinceDate) ptQuery = ptQuery.gte('scheduled_date', sinceDate);
      const { data: ptData } = await ptQuery;

      const mappedPt: BookingRow[] = (ptData || []).map((b: any) => {
        const pt = Array.isArray(b.personal_trainers) ? b.personal_trainers[0] : b.personal_trainers;
        const offering = Array.isArray(b.pt_offerings) ? b.pt_offerings[0] : b.pt_offerings;
        const payout = Math.round(Number(b.amount_kes || 0) * 0.85);
        const isCancelled = b.status === 'cancelled';
        const isEarned = b.status === 'completed';
        const isNoShow = b.status === 'no_show';
        const customerName = b.users?.name || b.guest_name || (b.guest_email ? b.guest_email.split('@')[0] : 'Client');

        let status: BookingStatus;
        if (isCancelled) status = 'cancelled';
        else if (isNoShow) status = 'no_show';
        else if (isEarned) status = 'earned';
        else status = 'pending';

        return {
          id: b.id,
          type: 'pt',
          partnerName: pt?.professional_name || pt?.full_name || 'Unknown trainer',
          itemName: offering?.title || 'PT session',
          customerName,
          date: b.scheduled_date,
          amount: payout,
          rawStatus: b.status,
          status,
        };
      });

      const allBookings = [...mappedSessions, ...mappedExp, ...mappedPt].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setBookings(allBookings);

      // ── Payouts ───────────────────────────────────────────────────────────
      let venueQuery = supabase
        .from('partner_withdrawals')
        .select('id, amount, method, destination_type, status, receipt_number, failure_reason, created_at, gyms(name)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (since) venueQuery = venueQuery.gte('created_at', since);
      const { data: venuePayouts } = await venueQuery;

      let ptPayoutQuery = supabase
        .from('pt_payout_requests')
        .select('id, amount, method, destination_type, status, receipt_number, failure_reason, created_at, personal_trainers(full_name, professional_name)')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (since) ptPayoutQuery = ptPayoutQuery.gte('created_at', since);
      const { data: ptPayouts } = await ptPayoutQuery;

      const mappedVenuePayouts: PayoutRow[] = (venuePayouts || []).map((p: any) => {
        const gym = Array.isArray(p.gyms) ? p.gyms[0] : p.gyms;
        return {
          id: p.id,
          type: 'venue',
          table: 'partner_withdrawals',
          partnerName: gym?.name || 'Unknown venue',
          amount: Number(p.amount),
          method: p.method,
          destinationType: p.destination_type,
          status: p.status,
          receiptNumber: p.receipt_number,
          failureReason: p.failure_reason,
          createdAt: p.created_at,
        };
      });

      const mappedPtPayouts: PayoutRow[] = (ptPayouts || []).map((p: any) => {
        const pt = Array.isArray(p.personal_trainers) ? p.personal_trainers[0] : p.personal_trainers;
        return {
          id: p.id,
          type: 'pt',
          table: 'pt_payout_requests',
          partnerName: pt?.professional_name || pt?.full_name || 'Unknown trainer',
          amount: Number(p.amount),
          method: p.method,
          destinationType: p.destination_type,
          status: p.status,
          receiptNumber: p.receipt_number,
          failureReason: p.failure_reason,
          createdAt: p.created_at,
        };
      });

      const allPayouts = [...mappedVenuePayouts, ...mappedPtPayouts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setPayouts(allPayouts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const earned = bookings.filter((b) => b.status === 'earned');
    const totalEarnings = earned.reduce((sum, b) => sum + b.amount, 0);
    const pendingPayoutAmount = payouts
      .filter((p) => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + p.amount, 0);
    const completedPayoutAmount = payouts
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    const byPartner = new Map<string, number>();
    for (const b of earned) {
      byPartner.set(b.partnerName, (byPartner.get(b.partnerName) || 0) + b.amount);
    }
    const breakdown = Array.from(byPartner.entries())
      .map(([partnerName, amount]) => ({ partnerName, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalEarnings,
      totalBookings: bookings.length,
      pendingPayoutAmount,
      completedPayoutAmount,
      breakdown,
    };
  }, [bookings, payouts]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (bookingTypeFilter !== 'all' && b.type !== bookingTypeFilter) return false;
      if (bookingStatusFilter !== 'all' && b.status !== bookingStatusFilter) return false;
      return true;
    });
  }, [bookings, bookingTypeFilter, bookingStatusFilter]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => (payoutStatusFilter === 'all' ? true : p.status === payoutStatusFilter));
  }, [payouts, payoutStatusFilter]);

  function startEdit(p: PayoutRow) {
    setEditState((prev) => ({
      ...prev,
      [p.id]: {
        status: p.status,
        receiptNumber: p.receiptNumber || '',
        failureReason: p.failureReason || '',
      },
    }));
  }

  async function savePayout(p: PayoutRow) {
    const edit = editState[p.id];
    if (!edit) return;
    setSavingId(p.id);
    try {
      const updates: Record<string, any> = { status: edit.status };
      if (edit.receiptNumber.trim()) updates.receipt_number = edit.receiptNumber.trim();
      if (edit.failureReason.trim()) updates.failure_reason = edit.failureReason.trim();
      if (edit.status === 'completed') updates.completed_at = new Date().toISOString();

      const { error } = await supabase.from(p.table).update(updates).eq('id', p.id);
      if (error) throw error;

      setPayouts((prev) =>
        prev.map((row) =>
          row.id === p.id
            ? { ...row, status: edit.status, receiptNumber: updates.receipt_number ?? row.receiptNumber, failureReason: updates.failure_reason ?? row.failureReason }
            : row
        )
      );
      setEditState((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to update payout status.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Finance</h1>
        <select
          value={rangeIdx}
          onChange={(e) => setRangeIdx(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {RANGE_OPTIONS.map((r, i) => (
            <option key={r.label} value={i}>{r.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(['overview', 'bookings', 'payouts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Total Earnings</p>
              <p className="text-3xl font-bold">{fmtKes(summary.totalEarnings)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Total Bookings</p>
              <p className="text-3xl font-bold">{summary.totalBookings}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Pending Payouts</p>
              <p className="text-3xl font-bold">{fmtKes(summary.pendingPayoutAmount)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 mb-1">Completed Payouts</p>
              <p className="text-3xl font-bold">{fmtKes(summary.completedPayoutAmount)}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Earnings by Partner</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Partner</th>
                  <th className="px-6 py-3 font-medium text-right">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {summary.breakdown.map((row) => (
                  <tr key={row.partnerName} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3">{row.partnerName}</td>
                    <td className="px-6 py-3 text-right font-semibold">{fmtKes(row.amount)}</td>
                  </tr>
                ))}
                {summary.breakdown.length === 0 && (
                  <tr><td colSpan={2} className="px-6 py-8 text-center text-gray-400">No earnings in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'bookings' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
            <select value={bookingTypeFilter} onChange={(e) => setBookingTypeFilter(e.target.value as any)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="all">All types</option>
              <option value="session">Sessions</option>
              <option value="experience">Experiences</option>
              <option value="pt">PT sessions</option>
            </select>
            <select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value as any)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="all">All statuses</option>
              <option value="earned">Earned</option>
              <option value="pending">Pending</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filteredBookings.length} bookings</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Partner</th>
                  <th className="px-6 py-3 font-medium">Item</th>
                  <th className="px-6 py-3 font-medium">Customer</th>
                  <th className="px-6 py-3 font-medium text-right">Payout</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={`${b.type}-${b.id}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 whitespace-nowrap">{fmtDate(b.date)}</td>
                    <td className="px-6 py-3 capitalize">{b.type}</td>
                    <td className="px-6 py-3">{b.partnerName}</td>
                    <td className="px-6 py-3">{b.itemName}</td>
                    <td className="px-6 py-3">{b.customerName}</td>
                    <td className="px-6 py-3 text-right font-semibold">{fmtKes(b.amount)}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
                {filteredBookings.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No bookings match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payouts' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex gap-3 items-center">
            <select value={payoutStatusFilter} onChange={(e) => setPayoutStatusFilter(e.target.value as any)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filteredPayouts.length} payout requests</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Partner</th>
                  <th className="px-6 py-3 font-medium">Method</th>
                  <th className="px-6 py-3 font-medium text-right">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayouts.map((p) => {
                  const edit = editState[p.id];
                  return (
                    <tr key={`${p.table}-${p.id}`} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-6 py-3 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                      <td className="px-6 py-3 capitalize">{p.type}</td>
                      <td className="px-6 py-3">{p.partnerName}</td>
                      <td className="px-6 py-3">{p.method}{p.destinationType ? ` · ${p.destinationType}` : ''}</td>
                      <td className="px-6 py-3 text-right font-semibold whitespace-nowrap">{fmtKes(p.amount)}</td>
                      <td className="px-6 py-3">
                        {!edit ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                        ) : (
                          <select
                            value={edit.status}
                            onChange={(e) => setEditState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], status: e.target.value as PayoutStatus } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="pending">pending</option>
                            <option value="processing">processing</option>
                            <option value="completed">completed</option>
                            <option value="failed">failed</option>
                          </select>
                        )}
                        {p.receiptNumber && !edit && <p className="text-xs text-gray-400 mt-1">Receipt: {p.receiptNumber}</p>}
                        {p.failureReason && !edit && <p className="text-xs text-red-500 mt-1">{p.failureReason}</p>}
                      </td>
                      <td className="px-6 py-3 min-w-[220px]">
                        {edit ? (
                          <div className="space-y-1.5">
                            <input
                              placeholder="Receipt number (optional)"
                              value={edit.receiptNumber}
                              onChange={(e) => setEditState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], receiptNumber: e.target.value } }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            />
                            <input
                              placeholder="Failure reason (optional)"
                              value={edit.failureReason}
                              onChange={(e) => setEditState((prev) => ({ ...prev, [p.id]: { ...prev[p.id], failureReason: e.target.value } }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => savePayout(p)}
                                disabled={savingId === p.id}
                                className="text-xs font-semibold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingId === p.id ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditState((prev) => { const next = { ...prev }; delete next[p.id]; return next; })}
                                className="text-xs font-medium text-gray-500 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Update status
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredPayouts.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No payout requests match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
