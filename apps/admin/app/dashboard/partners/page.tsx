'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type Gym = {
  id: string;
  name: string;
  contact_email: string;
  type: string;
  location: string;
  area: string;
  description: string;
  created_at: string;
};

type Tab = 'pending' | 'active';
type Action = 'approve' | 'activate' | 'deactivate' | 'reject';

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function PartnersPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [activeGyms, setActiveGyms] = useState<Gym[]>([]);
  const [pendingGyms, setPendingGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [pwGym, setPwGym] = useState<Gym | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, pendingRes] = await Promise.all([
        supabase
          .from('gyms')
          .select('id, name, contact_email, type, location, area, description, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('gyms')
          .select('id, name, contact_email, type, location, area, description, created_at')
          .eq('is_active', false)
          .order('created_at', { ascending: false }),
      ]);

      if (activeRes.error) throw activeRes.error;
      if (pendingRes.error) throw pendingRes.error;

      setActiveGyms(activeRes.data || []);
      setPendingGyms(pendingRes.data || []);

      setTab((pendingRes.data || []).length > 0 ? 'pending' : 'active');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(gymId: string, action: Action) {
    setActionLoading(gymId);
    setActionError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setActionError('Not authenticated'); setActionLoading(null); return; }

    const res = await fetch('/api/admin/approve-gym', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gymId, action, accessToken }),
    });
    const json = await res.json();
    setActionLoading(null);

    if (!res.ok) { setActionError(json.error || 'Failed'); return; }

    if (action === 'approve' || action === 'activate') {
      const gym = pendingGyms.find(g => g.id === gymId);
      if (gym) {
        setPendingGyms(prev => prev.filter(g => g.id !== gymId));
        setActiveGyms(prev => [gym, ...prev]);
      }
      setTab('active');
    } else if (action === 'deactivate') {
      const gym = activeGyms.find(g => g.id === gymId);
      if (gym) {
        setActiveGyms(prev => prev.filter(g => g.id !== gymId));
        setPendingGyms(prev => [gym, ...prev]);
      }
    } else if (action === 'reject') {
      setPendingGyms(prev => prev.filter(g => g.id !== gymId));
    }
  }

  async function changePassword() {
    if (!pwGym || !newPassword) return;
    setPwLoading(true);
    setPwError('');
    setPwSuccess(false);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setPwError('Not authenticated'); setPwLoading(false); return; }

    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pwGym.contact_email, newPassword, accessToken }),
    });
    const json = await res.json();
    setPwLoading(false);
    if (!res.ok) { setPwError(json.error || 'Failed'); return; }
    setPwSuccess(true);
    setNewPassword('');
  }

  const filteredActive = activeGyms.filter(g =>
    !search ||
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPending = pendingGyms.filter(g =>
    !search ||
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partners</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingGyms.length > 0 && (
              <span className="text-amber-600 font-medium">{pendingGyms.length} pending · </span>
            )}
            {activeGyms.length} active
          </p>
        </div>
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {actionError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{actionError}</div>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'pending' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Pending Approval
          {pendingGyms.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">
              {pendingGyms.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'active' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Active Partners
        </button>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Contact Email</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Location</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Applied</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPending.map(gym => (
                <tr key={gym.id} className="hover:bg-amber-50/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                    {gym.description && (
                      <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{gym.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{gym.contact_email}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">{gym.type || '—'}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {[gym.location, gym.area].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {new Date(gym.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleApproval(gym.id, 'activate')}
                        disabled={actionLoading === gym.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition font-medium disabled:opacity-50"
                      >
                        {actionLoading === gym.id ? '…' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleApproval(gym.id, 'reject')}
                        disabled={actionLoading === gym.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPending.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No pending applications.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Active Partners tab */}
      {tab === 'active' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Contact Email</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Location</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Since</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredActive.map(gym => (
                <tr key={gym.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{gym.contact_email}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">{gym.type || '—'}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {[gym.location, gym.area].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {new Date(gym.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/partners/${gym.id}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                      >
                        View bookings
                      </Link>
                      <button
                        onClick={() => handleApproval(gym.id, 'deactivate')}
                        disabled={actionLoading === gym.id}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition font-medium disabled:opacity-50"
                      >
                        {actionLoading === gym.id ? '…' : 'Deactivate'}
                      </button>
                      <button
                        onClick={() => { setPwGym(gym); setNewPassword(''); setPwError(''); setPwSuccess(false); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium"
                      >
                        Change password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredActive.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No active partners found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Change Password Modal */}
      {pwGym && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
              <p className="text-sm text-gray-500">
                {pwGym.name} · <span className="font-medium">{pwGym.contact_email}</span>
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {pwError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{pwError}</div>}
              {pwSuccess && (
                <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Password updated successfully.
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">New password</label>
                <input
                  className={inp}
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  minLength={6}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setPwGym(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition"
              >
                {pwSuccess ? 'Close' : 'Cancel'}
              </button>
              {!pwSuccess && (
                <button
                  onClick={changePassword}
                  disabled={pwLoading || newPassword.length < 6}
                  className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
                >
                  {pwLoading ? 'Updating…' : 'Update password'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
