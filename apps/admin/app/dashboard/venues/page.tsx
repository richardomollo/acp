'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Gym = {
  id: string;
  name: string;
  location: string;
  area: string;
  type: string;
  description: string;
  contact_email: string;
  contact_phone: string;
  rating: number;
  is_active: boolean;
  image_url: string | null;
  rate_floor: number | null;
  rate_floor_percentage: number | null;
  created_at: string;
  setup_reminder_sent_at: string | null;
};

const VENUE_TYPES_FALLBACK = ['gym', 'yoga', 'pilates', 'studio', 'crossfit', 'martial-arts', 'swimming', 'spa', 'dance', 'kids'];

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function VenuesPage() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [offeringCounts, setOfferingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSetup, setFilterSetup] = useState('all');

  const [editGym, setEditGym] = useState<Gym | null>(null);
  const [editForm, setEditForm] = useState<Partial<Gym>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [venueTypes, setVenueTypes] = useState<string[]>(VENUE_TYPES_FALLBACK);

  const [reassignGym, setReassignGym] = useState<Gym | null>(null);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignError, setReassignError] = useState('');

  const [deleteGym, setDeleteGym] = useState<Gym | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { loadGyms(); loadVenueTypes(); }, []);

  async function loadVenueTypes() {
    const { data } = await supabase
      .from('venue_types')
      .select('name')
      .order('sort_order', { ascending: true });
    if (data?.length) setVenueTypes(data.map(r => r.name));
  }

  async function loadGyms() {
    const [{ data, error }, { data: sessionRows }, { data: experienceRows }] = await Promise.all([
      supabase.from('gyms').select('*').order('created_at', { ascending: false }),
      supabase.from('sessions').select('gym_id'),
      supabase.from('experiences').select('gym_id'),
    ]);
    if (!error) setGyms(data || []);
    const counts: Record<string, number> = {};
    for (const r of sessionRows ?? []) counts[r.gym_id] = (counts[r.gym_id] ?? 0) + 1;
    for (const r of experienceRows ?? []) counts[r.gym_id] = (counts[r.gym_id] ?? 0) + 1;
    setOfferingCounts(counts);
    setLoading(false);
  }

  function isIncomplete(gym: Gym) {
    return !gym.image_url || (offeringCounts[gym.id] ?? 0) === 0;
  }

  async function toggleActive(gym: Gym) {
    const { error } = await supabase
      .from('gyms')
      .update({ is_active: !gym.is_active })
      .eq('id', gym.id);
    if (!error) setGyms(prev => prev.map(g => g.id === gym.id ? { ...g, is_active: !g.is_active } : g));
  }

  function openEdit(gym: Gym) {
    setEditGym(gym);
    setEditForm({
      name: gym.name,
      location: gym.location,
      area: gym.area,
      type: gym.type,
      description: gym.description,
      contact_email: gym.contact_email,
      contact_phone: gym.contact_phone,
      rating: gym.rating,
    });
    setEditError('');
  }

  async function saveEdit() {
    if (!editGym) return;
    setEditLoading(true);
    setEditError('');
    const { error } = await supabase
      .from('gyms')
      .update(editForm)
      .eq('id', editGym.id);
    setEditLoading(false);
    if (error) { setEditError(error.message); return; }
    setGyms(prev => prev.map(g => g.id === editGym.id ? { ...g, ...editForm } as Gym : g));
    setEditGym(null);
  }

  async function confirmDelete() {
    if (!deleteGym) return;
    setDeleteLoading(true);
    setDeleteError('');
    const { error } = await supabase.from('gyms').delete().eq('id', deleteGym.id);
    setDeleteLoading(false);
    if (error) { setDeleteError(error.message); return; }
    setGyms(prev => prev.filter(g => g.id !== deleteGym.id));
    setDeleteGym(null);
  }

  async function saveReassign() {
    if (!reassignGym || !newOwnerEmail.trim()) return;
    setReassignLoading(true);
    setReassignError('');
    const { error } = await supabase
      .from('gyms')
      .update({ contact_email: newOwnerEmail.trim() })
      .eq('id', reassignGym.id);
    setReassignLoading(false);
    if (error) { setReassignError(error.message); return; }
    setGyms(prev => prev.map(g => g.id === reassignGym.id ? { ...g, contact_email: newOwnerEmail.trim() } : g));
    setReassignGym(null);
    setNewOwnerEmail('');
  }

  const filtered = gyms.filter(g => {
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.area?.toLowerCase().includes(search.toLowerCase()) ||
      g.contact_email?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || g.type === filterType;
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && g.is_active) ||
      (filterStatus === 'inactive' && !g.is_active);
    const matchSetup = filterSetup === 'all' ||
      (filterSetup === 'incomplete' && isIncomplete(g)) ||
      (filterSetup === 'complete' && !isIncomplete(g));
    return matchSearch && matchType && matchStatus && matchSetup;
  });

  if (loading) return <div className="p-8 text-gray-500">Loading venues…</div>;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {gyms.length} total · {gyms.filter(g => g.is_active).length} active ·{' '}
            <span className={gyms.filter(isIncomplete).length > 0 ? 'text-amber-600 font-medium' : ''}>
              {gyms.filter(isIncomplete).length} incomplete setup
            </span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search name, area, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All types</option>
          {venueTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={filterSetup} onChange={e => setFilterSetup(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All setup states</option>
          <option value="incomplete">Incomplete setup</option>
          <option value="complete">Complete setup</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Type / Area</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Owner</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Rating</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Rate Floor</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Setup</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(gym => (
              <tr key={gym.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{gym.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{gym.location}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium capitalize">
                    {gym.type}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{gym.area}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="text-gray-700 truncate max-w-[180px]">{gym.contact_email || '—'}</p>
                  <p className="text-xs text-gray-400">{gym.contact_phone}</p>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400">★</span>
                    <span className="font-medium">{gym.rating ?? '—'}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  {gym.rate_floor != null ? (
                    <div>
                      <p className="text-sm font-semibold text-gray-900">KES {gym.rate_floor.toLocaleString()}</p>
                      {gym.rate_floor_percentage != null && (
                        <p className={`text-xs font-medium ${gym.rate_floor_percentage <= 60 ? 'text-green-600' : gym.rate_floor_percentage <= 75 ? 'text-amber-600' : 'text-red-500'}`}>
                          {gym.rate_floor_percentage}% of drop-in
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Not negotiated</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <button onClick={() => toggleActive(gym)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                      gym.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${gym.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {gym.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-4">
                  {isIncomplete(gym) ? (
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Incomplete
                      </span>
                      <p className="text-xs text-gray-400 mt-1">
                        {[!gym.image_url && 'no photo', (offeringCounts[gym.id] ?? 0) === 0 && 'no classes/experiences']
                          .filter(Boolean).join(' · ')}
                      </p>
                      {gym.setup_reminder_sent_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Last reminded {new Date(gym.setup_reminder_sent_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Complete
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(gym)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                      Edit
                    </button>
                    <button onClick={() => { setReassignGym(gym); setNewOwnerEmail(''); setReassignError(''); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                      Reassign
                    </button>
                    <button onClick={() => { setDeleteGym(gym); setDeleteError(''); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-gray-400">No venues match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editGym && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Edit Venue</h2>
              <p className="text-sm text-gray-500">{editGym.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{editError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Venue name</label>
                  <input className={inp} value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Street address</label>
                  <input className={inp} value={editForm.location || ''} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Area</label>
                  <input className={inp} value={editForm.area || ''} onChange={e => setEditForm(p => ({ ...p, area: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                  <select className={inp} value={editForm.type || 'gym'} onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}>
                    {venueTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact email</label>
                  <input className={inp} type="email" value={editForm.contact_email || ''} onChange={e => setEditForm(p => ({ ...p, contact_email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact phone</label>
                  <input className={inp} value={editForm.contact_phone || ''} onChange={e => setEditForm(p => ({ ...p, contact_phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Rating (0–5)</label>
                  <input className={inp} type="number" min="0" max="5" step="0.1"
                    value={editForm.rating ?? ''} onChange={e => setEditForm(p => ({ ...p, rating: parseFloat(e.target.value) }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                  <textarea className={inp + ' resize-none'} rows={3}
                    value={editForm.description || ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setEditGym(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editLoading}
                className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
                {editLoading ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteGym && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Delete venue</h2>
              <p className="text-sm text-gray-500">{deleteGym.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {deleteError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{deleteError}</div>}
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                <strong>This cannot be undone.</strong> Deleting <strong>{deleteGym.name}</strong> will permanently remove the venue and all associated data from the platform.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setDeleteGym(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteLoading}
                className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                {deleteLoading ? 'Deleting…' : 'Delete venue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Ownership Modal */}
      {reassignGym && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Reassign Ownership</h2>
              <p className="text-sm text-gray-500">{reassignGym.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {reassignError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{reassignError}</div>}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                Current owner: <strong>{reassignGym.contact_email || 'none'}</strong>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">New owner email</label>
                <input
                  className={inp}
                  type="email"
                  placeholder="partner@example.com"
                  value={newOwnerEmail}
                  onChange={e => setNewOwnerEmail(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Must match an existing partner account email.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setReassignGym(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={saveReassign} disabled={reassignLoading || !newOwnerEmail.trim()}
                className="px-5 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50">
                {reassignLoading ? 'Reassigning…' : 'Reassign ownership'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
