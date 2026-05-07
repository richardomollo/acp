'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type User = {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  subscription_tier: string;
  subscription_status: string;
  trial_end_date: string | null;
  created_at: string;
};

type Plan = {
  tier: string;
  name: string;
  credits: number;
  price: number;
  duration_days: number;
};

const TIER_COLORS: Record<string, string> = {
  free_trial: 'bg-amber-100 text-amber-700',
  basic: 'bg-blue-100 text-blue-700',
  standard: 'bg-indigo-100 text-indigo-700',
  premium: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_COLORS: Record<string, string> = {
  trial: 'bg-amber-50 text-amber-600',
  active: 'bg-green-50 text-green-700',
  expired: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-50 text-gray-500',
};

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');

  // Modal state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCredits, setSelectedCredits] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, plansRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, name, credits, subscription_tier, subscription_status, trial_end_date, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('subscription_plans')
          .select('tier, name, credits, price, duration_days')
          .eq('is_active', true)
          .order('price', { ascending: true }),
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      setPlans(plansRes.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user: User) {
    setEditUser(user);
    setSelectedTier(user.subscription_tier);
    setSelectedStatus(user.subscription_status);
    setSelectedCredits(user.credits);
    setNote('');
    setSaveError('');
    setSaveSuccess(false);
  }

  function onTierChange(tier: string) {
    setSelectedTier(tier);
    if (editUser) {
      const oldPlan = plans.find(p => p.tier === editUser.subscription_tier);
      const newPlan = plans.find(p => p.tier === tier);
      const oldPlanCredits = oldPlan?.credits ?? editUser.credits;
      const newPlanCredits = newPlan?.credits ?? 0;
      const delta = newPlanCredits - oldPlanCredits;
      setSelectedCredits(Math.max(0, editUser.credits + delta));
    }
    setSelectedStatus(tier === 'free_trial' ? 'trial' : tier === 'cancelled' ? 'cancelled' : 'active');
  }

  async function saveSubscription() {
    if (!editUser) return;
    setSaving(true);
    setSaveError('');

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setSaveError('Not authenticated'); setSaving(false); return; }

    const res = await fetch('/api/admin/update-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: editUser.id,
        tier: selectedTier,
        credits: selectedCredits,
        status: selectedStatus,
        note,
        accessToken,
      }),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setSaveError(json.error || 'Failed to update'); return; }

    setSaveSuccess(true);
    setUsers(prev => prev.map(u =>
      u.id === editUser.id
        ? { ...u, subscription_tier: selectedTier, subscription_status: selectedStatus, credits: selectedCredits }
        : u
    ));
  }

  const tiers = ['all', ...Array.from(new Set(users.map(u => u.subscription_tier)))];

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.name?.toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === 'all' || u.subscription_tier === tierFilter;
    return matchSearch && matchTier;
  });

  const tierLabel = (tier: string) =>
    plans.find(p => p.tier === tier)?.name || tier.replace(/_/g, ' ');

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} total members</p>
        </div>
        <div className="flex gap-3">
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            {tiers.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All tiers' : tierLabel(t)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-64"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">User</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Subscription</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Credits</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Trial ends</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Joined</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900">{user.name || '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${TIER_COLORS[user.subscription_tier] || 'bg-gray-100 text-gray-600'}`}>
                    {tierLabel(user.subscription_tier)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[user.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                    {user.subscription_status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="font-semibold text-gray-900">{user.credits}</span>
                  <span className="text-gray-400 ml-1 text-xs">cr</span>
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">
                  {user.trial_end_date
                    ? new Date(user.trial_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </td>
                <td className="px-5 py-4 text-gray-400 text-xs">
                  {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => openEdit(user)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Manage Subscription</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {editUser.name || editUser.email}
                {editUser.name && <span className="text-gray-400 ml-1">· {editUser.email}</span>}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {saveError && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{saveError}</div>
              )}
              {saveSuccess && (
                <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Subscription updated successfully.
                </div>
              )}

              {/* Current state */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Current tier</span>
                  <span className="font-medium capitalize">{tierLabel(editUser.subscription_tier)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium capitalize">{editUser.subscription_status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Credits</span>
                  <span className="font-medium">{editUser.credits}</span>
                </div>
              </div>

              {/* Tier select */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">New tier</label>
                <select
                  value={selectedTier}
                  onChange={e => onTierChange(e.target.value)}
                  className={inp}
                >
                  {plans.length > 0 ? (
                    plans.map(p => (
                      <option key={p.tier} value={p.tier}>
                        {p.name} — {p.credits} credits
                        {p.price > 0 ? ` / KES ${p.price}` : ' (free)'}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="free_trial">Free Trial — 50 credits (free)</option>
                      <option value="basic">Basic — 100 credits</option>
                      <option value="standard">Standard — 200 credits</option>
                      <option value="premium">Premium — 500 credits</option>
                      <option value="cancelled">Cancelled — 0 credits</option>
                    </>
                  )}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className={inp}
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Credits */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-600">Credits (new balance)</label>
                  {editUser && selectedTier !== editUser.subscription_tier && (() => {
                    const oldPlan = plans.find(p => p.tier === editUser.subscription_tier);
                    const newPlan = plans.find(p => p.tier === selectedTier);
                    const oldPlanCredits = oldPlan?.credits ?? editUser.credits;
                    const newPlanCredits = newPlan?.credits ?? 0;
                    const delta = newPlanCredits - oldPlanCredits;
                    if (delta === 0) return null;
                    return (
                      <span className={`text-xs font-medium ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {editUser.credits} {delta > 0 ? '+' : '−'} {Math.abs(delta)} = {selectedCredits}
                      </span>
                    );
                  })()}
                </div>
                <input
                  type="number"
                  min={0}
                  value={selectedCredits}
                  onChange={e => setSelectedCredits(Number(e.target.value))}
                  className={inp}
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Note (optional)</label>
                <input
                  type="text"
                  placeholder="Reason for change…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className={inp}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setEditUser(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition"
              >
                {saveSuccess ? 'Close' : 'Cancel'}
              </button>
              {!saveSuccess && (
                <button
                  onClick={saveSubscription}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
