'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Community = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string;
  location: string | null;
  logo_url: string | null;
  cover_url: string | null;
  community_type: 'open' | 'approval_required';
  review_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  owner_user_id: string;
  member_count: number;
  social_links: Record<string, string> | null;
  is_active: boolean;
  created_at: string;
};

type OwnerInfo = { name: string | null; email: string | null };
type Tab = 'all' | 'pending' | 'approved' | 'rejected';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusStyle: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>{text}</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CommunitiesAdminPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [owners, setOwners] = useState<Record<string, OwnerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Community | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionInput, setRejectionInput] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Communities load error:', error);
      setLoadError(`${error.code}: ${error.message}`);
      setLoading(false);
      return;
    }
    setCommunities(data || []);

    // owner_user_id references auth.users, which PostgREST can't embed —
    // batch-fetch from public.users instead (same fix used in send-booking-reminders).
    const ownerIds = [...new Set((data ?? []).map(c => c.owner_user_id))];
    if (ownerIds.length > 0) {
      const { data: ownerRows } = await supabase.from('users').select('id, name, email').in('id', ownerIds);
      const map: Record<string, OwnerInfo> = {};
      for (const o of ownerRows ?? []) map[o.id] = { name: o.name, email: o.email };
      setOwners(map);
    }
    setLoading(false);
  }

  // ── Approval actions ───────────────────────────────────────────────────────

  async function approve(c: Community) {
    setActionLoading(true);
    const { error } = await supabase
      .from('communities')
      .update({ review_status: 'approved', rejection_reason: null })
      .eq('id', c.id);
    if (!error) {
      setCommunities(prev => prev.map(x => x.id === c.id ? { ...x, review_status: 'approved' } : x));
      setSelected(prev => prev?.id === c.id ? { ...prev, review_status: 'approved' } : prev);
    }
    setActionLoading(false);
  }

  async function reject(c: Community, reason: string) {
    setActionLoading(true);
    const { error } = await supabase
      .from('communities')
      .update({ review_status: 'rejected', rejection_reason: reason })
      .eq('id', c.id);
    if (!error) {
      setCommunities(prev => prev.map(x => x.id === c.id ? { ...x, review_status: 'rejected', rejection_reason: reason } : x));
      setSelected(prev => prev?.id === c.id ? { ...prev, review_status: 'rejected', rejection_reason: reason } : prev);
    }
    setActionLoading(false);
    setShowRejectModal(false);
    setRejectionInput('');
  }

  async function toggleActive(c: Community) {
    setActionLoading(true);
    const { error } = await supabase
      .from('communities')
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (!error) {
      setCommunities(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
      setSelected(prev => prev?.id === c.id ? { ...prev, is_active: !prev.is_active } : prev);
    }
    setActionLoading(false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:      communities.length,
    pending:  communities.filter(c => c.review_status === 'pending').length,
    approved: communities.filter(c => c.review_status === 'approved').length,
    rejected: communities.filter(c => c.review_status === 'rejected').length,
  }), [communities]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? communities : communities.filter(c => c.review_status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        owners[c.owner_user_id]?.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [communities, tab, search, owners]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left panel ── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white">

        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Communities</h1>
            <button
              onClick={load}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {counts.pending > 0 && (
            <button
              onClick={() => setTab('pending')}
              className="mt-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-left"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                {counts.pending}
              </span>
              <span className="text-sm font-semibold text-amber-800">
                {counts.pending === 1 ? 'community' : 'communities'} awaiting review
              </span>
            </button>
          )}

          <input
            type="text"
            placeholder="Search by name, category, owner…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-5 py-3">
          {(['pending', 'approved', 'all', 'rejected'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {counts[t] > 0 && (
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${tab === t ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadError && (
            <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-mono break-all">
              {loadError}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">
                {tab === 'pending' ? 'No pending communities' : 'No communities found'}
              </p>
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full border-b border-gray-50 px-5 py-4 text-left transition hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                      {c.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                      <Badge text={c.review_status} color={statusStyle[c.review_status]} />
                    </div>
                    <p className="text-xs text-gray-400">{owners[c.owner_user_id]?.email ?? '—'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 capitalize">{c.category}</span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{c.member_count} members</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{fmtDate(c.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel — Detail ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-5xl">🏃</div>
              <p className="mt-4 text-sm font-medium text-gray-400">Select a community to review</p>
              {counts.pending > 0 && (
                <p className="mt-1 text-xs text-amber-600">{counts.pending} communit{counts.pending > 1 ? 'ies' : 'y'} need your attention</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-8 py-8 space-y-6">

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected.logo_url ? (
                  <img src={selected.logo_url} className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow" alt="" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-300 text-xl font-bold text-white shadow">
                    {selected.name[0]}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                  <p className="text-sm text-gray-500">{owners[selected.owner_user_id]?.email ?? selected.owner_user_id}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge text={selected.review_status} color={statusStyle[selected.review_status]} />
                    {selected.review_status === 'approved' && !selected.is_active && (
                      <Badge text="deactivated" color="bg-gray-100 text-gray-600 border-gray-200" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {selected.review_status === 'pending' && (
                  <>
                    <button
                      onClick={() => approve(selected)}
                      disabled={actionLoading}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      disabled={actionLoading}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      ✕ Reject
                    </button>
                  </>
                )}
                {selected.review_status === 'approved' && (
                  <button
                    onClick={() => toggleActive(selected)}
                    disabled={actionLoading}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {selected.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
                {selected.review_status === 'rejected' && (
                  <button
                    onClick={() => approve(selected)}
                    disabled={actionLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Reinstate
                  </button>
                )}
              </div>
            </div>

            {selected.rejection_reason && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <strong>Rejection reason:</strong> {selected.rejection_reason}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Details</h3>
                <div className="space-y-3">
                  <div><p className="text-xs text-gray-400">Category</p><p className="mt-0.5 text-sm font-medium text-gray-800 capitalize">{selected.category}</p></div>
                  <div><p className="text-xs text-gray-400">Location</p><p className="mt-0.5 text-sm font-medium text-gray-800">{selected.location || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Membership</p><p className="mt-0.5 text-sm font-medium text-gray-800 capitalize">{selected.community_type.replace('_', ' ')}</p></div>
                  <div><p className="text-xs text-gray-400">Slug / public URL</p><p className="mt-0.5 text-xs font-mono text-gray-800">{selected.slug ? `activecitypass.com/communities/${selected.slug}` : '—'}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Stats</h3>
                <div className="space-y-3">
                  <div><p className="text-xs text-gray-400">Members</p><p className="mt-0.5 text-sm font-medium text-gray-800">{selected.member_count}</p></div>
                  <div><p className="text-xs text-gray-400">Created</p><p className="mt-0.5 text-sm font-medium text-gray-800">{fmtDate(selected.created_at)}</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 md:col-span-2">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Description</h3>
                {selected.description ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.description}</p>
                ) : <p className="text-sm text-gray-400">No description provided</p>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-400 space-y-1">
              <p>Owner ID: <span className="font-mono">{selected.owner_user_id}</span></p>
              <p>Community ID: <span className="font-mono">{selected.id}</span></p>
            </div>

          </div>
        )}
      </div>

      {/* ── Reject modal ── */}
      {showRejectModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Reject community</h3>
            <p className="mt-1 text-sm text-gray-500">
              Give the owner of {selected.name} a reason so they can reapply.
            </p>
            <textarea
              value={rejectionInput}
              onChange={e => setRejectionInput(e.target.value)}
              placeholder="e.g. Please add a description and choose a more specific category."
              className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={4}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectionInput(''); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => reject(selected, rejectionInput)}
                disabled={!rejectionInput.trim() || actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject community
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
