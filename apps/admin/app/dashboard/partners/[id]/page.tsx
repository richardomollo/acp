'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type Gym = {
  id: string;
  name: string;
  contact_email: string;
  type: string;
  location: string;
  area: string;
};

type SessionBooking = {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  session_price: number | null;
  deposit_amount: number | null;
  remainder_amount: number | null;
  guest_name: string | null;
  guest_email: string | null;
  created_at: string;
  sessions: { name: string } | null;
  users: { name: string; email: string } | null;
};

type ExperienceBooking = {
  id: string;
  status: string;
  deposit_amount: number | null;
  remainder_amount: number | null;
  session_price: number | null;
  guest_name: string | null;
  email: string | null;
  created_at: string;
  experiences: { name: string; date: string; start_time: string } | null;
};

type Row =
  | { kind: 'session'; data: SessionBooking }
  | { kind: 'experience'; data: ExperienceBooking };

const statusStyles: Record<string, string> = {
  confirmed: 'bg-green-50 text-green-700',
  deposit_paid: 'bg-green-50 text-green-700',
  checked_in: 'bg-blue-50 text-blue-700',
  pending_payment: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-600',
  cancelled_by_customer: 'bg-red-50 text-red-600',
  cancelled_by_partner: 'bg-orange-50 text-orange-700',
  no_show: 'bg-red-50 text-red-600',
};

function money(n: number | null | undefined) {
  return `KES ${(n ?? 0).toLocaleString()}`;
}

export default function PartnerBookingsPage() {
  const params = useParams();
  const router = useRouter();
  const gymId = params.id as string;

  const [gym, setGym] = useState<Gym | null>(null);
  const [sessionBookings, setSessionBookings] = useState<SessionBooking[]>([]);
  const [experienceBookings, setExperienceBookings] = useState<ExperienceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, [gymId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      // Bookings and experience_bookings' RLS policies only allow a customer
      // to see their own rows or a partner to see rows for gyms they own —
      // there's no "admin sees everything" policy, so this must go through a
      // service-role-backed API route rather than the anon-key client, same
      // pattern as approve-gym/reset-password.
      const res = await fetch('/api/admin/partner-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymId, accessToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load bookings');

      setGym(json.gym as Gym);
      setSessionBookings((json.bookings as SessionBooking[]) ?? []);
      setExperienceBookings((json.experiences as ExperienceBooking[]) ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!gym) return <div className="p-8 text-gray-500">Partner not found.</div>;

  const allRows: Row[] = [
    ...sessionBookings.map(d => ({ kind: 'session' as const, data: d })),
    ...experienceBookings.map(d => ({ kind: 'experience' as const, data: d })),
  ].sort((a, b) => {
    const dateA = a.kind === 'session' ? a.data.booking_date : a.data.created_at;
    const dateB = b.kind === 'session' ? b.data.booking_date : b.data.created_at;
    return dateB.localeCompare(dateA);
  });

  const filteredRows = allRows.filter(r => {
    if (statusFilter !== 'all' && r.data.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const name = r.kind === 'session'
      ? (r.data.users?.name ?? r.data.guest_name ?? '')
      : (r.data.guest_name ?? '');
    const email = r.kind === 'session'
      ? (r.data.users?.email ?? r.data.guest_email ?? '')
      : (r.data.email ?? '');
    const itemName = r.kind === 'session' ? (r.data.sessions?.name ?? '') : (r.data.experiences?.name ?? '');
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || itemName.toLowerCase().includes(q);
  });

  const totalRevenue = allRows.reduce((sum, r) => {
    if (['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'no_show'].includes(r.data.status)) return sum;
    const deposit = r.data.deposit_amount ?? 0;
    const remainder = r.data.remainder_amount ?? 0;
    const price = r.data.session_price ?? 0;
    return sum + (deposit || remainder ? deposit + remainder : price);
  }, 0);

  const statusOptions = ['all', ...new Set(allRows.map(r => r.data.status))];

  return (
    <div className="p-8">
      <Link href="/dashboard/partners" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Partners
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{gym.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {gym.contact_email} · <span className="capitalize">{gym.type || '—'}</span>
            {gym.location ? ` · ${[gym.location, gym.area].filter(Boolean).join(', ')}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 text-right">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Bookings</p>
            <p className="text-xl font-bold text-gray-900">{allRows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 text-right">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Revenue (non-cancelled)</p>
            <p className="text-xl font-bold text-gray-900">{money(totalRevenue)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search customer name, email, or session/experience…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
        >
          {statusOptions.map(s => (
            <option key={s} value={s} className="capitalize">{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Session / Experience</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Customer</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Amount</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRows.map(r => {
              if (r.kind === 'session') {
                const b = r.data;
                const name = b.users?.name ?? b.guest_name ?? 'Guest';
                const email = b.users?.email ?? b.guest_email ?? '';
                const amount = (b.deposit_amount || b.remainder_amount)
                  ? (b.deposit_amount ?? 0) + (b.remainder_amount ?? 0)
                  : (b.session_price ?? 0);
                return (
                  <tr key={`s-${b.id}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">Class</span>
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-900">{b.sessions?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-gray-600">
                      {name}{email && <span className="text-gray-400"> · {email}</span>}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {new Date(b.booking_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {b.booking_time ? ` · ${b.booking_time.slice(0, 5)}` : ''}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-900 font-medium">{money(amount)}</td>
                    <td className="px-5 py-4 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusStyles[b.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {b.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                );
              }

              const eb = r.data;
              const amount = (eb.deposit_amount || eb.remainder_amount)
                ? (eb.deposit_amount ?? 0) + (eb.remainder_amount ?? 0)
                : (eb.session_price ?? 0);
              return (
                <tr key={`e-${eb.id}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">Experience</span>
                  </td>
                  <td className="px-5 py-4 font-medium text-gray-900">{eb.experiences?.name ?? '—'}</td>
                  <td className="px-5 py-4 text-gray-600">
                    {eb.guest_name ?? 'Guest'}{eb.email && <span className="text-gray-400"> · {eb.email}</span>}
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {eb.experiences?.date
                      ? new Date(eb.experiences.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                    {eb.experiences?.start_time ? ` · ${eb.experiences.start_time.slice(0, 5)}` : ''}
                  </td>
                  <td className="px-5 py-4 text-right text-gray-900 font-medium">{money(amount)}</td>
                  <td className="px-5 py-4 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusStyles[eb.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {eb.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No bookings found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
