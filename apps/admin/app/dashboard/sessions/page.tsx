'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Gym = { id: string; name: string };

type Session = {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  drop_in_price: number | null;
  max_capacity: number;
  spots_left: number;
  is_active: boolean;
  category: string | null;
  instructor: string | null;
  recurring: boolean | null;
  gyms: { name: string } | { name: string }[] | null;
};

const CATEGORIES_FALLBACK = ['yoga', 'pilates', 'hiit', 'cardio', 'strength', 'boxing', 'spinning', 'dance', 'swimming', 'crossfit'];

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t: string) => t?.slice(0, 5) ?? '';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [categories, setCategories] = useState<string[]>(CATEGORIES_FALLBACK);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterVenue, setFilterVenue] = useState('all');
  const [filterTime, setFilterTime] = useState<'upcoming' | 'all' | 'past'>('upcoming');
  const [filterStatus, setFilterStatus] = useState('all');

  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editForm, setEditForm] = useState<Partial<Session>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => { loadSessions(); loadGyms(); loadCategories(); }, []);

  async function loadSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, gyms(name)')
      .order('date', { ascending: false })
      .order('time', { ascending: true });
    if (!error) setSessions((data as any) || []);
    setLoading(false);
  }

  async function loadGyms() {
    const { data } = await supabase.from('gyms').select('id, name').order('name', { ascending: true });
    if (data?.length) setGyms(data);
  }

  async function loadCategories() {
    const { data } = await supabase.from('session_categories').select('name').order('sort_order', { ascending: true });
    if (data?.length) setCategories(data.map(r => r.name));
  }

  function gymName(s: Session) {
    const g = Array.isArray(s.gyms) ? s.gyms[0] : s.gyms;
    return g?.name ?? '—';
  }

  async function toggleActive(session: Session) {
    const { error } = await supabase.from('sessions').update({ is_active: !session.is_active }).eq('id', session.id);
    if (!error) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_active: !s.is_active } : s));
  }

  function openEdit(session: Session) {
    setEditSession(session);
    setEditForm({
      name: session.name,
      category: session.category,
      date: session.date,
      time: session.time?.slice(0, 5),
      duration_minutes: session.duration_minutes,
      max_capacity: session.max_capacity,
      drop_in_price: session.drop_in_price,
      instructor: session.instructor,
      description: session.description,
    });
    setEditError('');
  }

  async function saveEdit() {
    if (!editSession) return;
    setEditLoading(true);
    setEditError('');
    const { error } = await supabase
      .from('sessions')
      .update({
        name: editForm.name,
        category: editForm.category,
        date: editForm.date,
        time: editForm.time,
        duration_minutes: editForm.duration_minutes != null ? Number(editForm.duration_minutes) : null,
        max_capacity: editForm.max_capacity != null ? Number(editForm.max_capacity) : null,
        drop_in_price: editForm.drop_in_price != null && editForm.drop_in_price !== ('' as any) ? Number(editForm.drop_in_price) : null,
        instructor: editForm.instructor,
        description: editForm.description,
      })
      .eq('id', editSession.id);
    setEditLoading(false);
    if (error) { setEditError(error.message); return; }
    setSessions(prev => prev.map(s => s.id === editSession.id ? { ...s, ...editForm } as Session : s));
    setEditSession(null);
  }

  const t = todayStr();
  const filtered = sessions.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      gymName(s).toLowerCase().includes(search.toLowerCase()) ||
      (s.instructor ?? '').toLowerCase().includes(search.toLowerCase());
    const matchVenue = filterVenue === 'all' || s.gym_id === filterVenue;
    const matchTime = filterTime === 'all' || (filterTime === 'upcoming' ? s.date >= t : s.date < t);
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && s.is_active) ||
      (filterStatus === 'inactive' && !s.is_active);
    return matchSearch && matchVenue && matchTime && matchStatus;
  });

  if (loading) return <div className="p-8 text-gray-500">Loading sessions…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sessions.length} total · {filtered.length} shown</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search name, venue, instructor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${inp} w-64`}
        />
        <select value={filterVenue} onChange={e => setFilterVenue(e.target.value)} className={inp}>
          <option value="all">All venues</option>
          {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={filterTime} onChange={e => setFilterTime(e.target.value as any)} className={inp}>
          <option value="upcoming">Upcoming</option>
          <option value="all">All dates</option>
          <option value="past">Past</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inp}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Session</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Date / Time</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Price</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Capacity</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(session => (
              <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{session.name}</p>
                  {session.category && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium capitalize">
                      {session.category}
                    </span>
                  )}
                  {session.recurring && (
                    <span className="inline-block mt-1 ml-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">
                      recurring
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-gray-700">{gymName(session)}</td>
                <td className="px-5 py-4">
                  <p className="text-gray-900">{fmtDate(session.date)}</p>
                  <p className="text-xs text-gray-400">{fmtTime(session.time)}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">
                    {session.drop_in_price != null ? `KES ${Number(session.drop_in_price).toLocaleString()}` : '—'}
                  </p>
                </td>
                <td className="px-5 py-4 text-gray-700">
                  {session.spots_left} / {session.max_capacity}
                </td>
                <td className="px-5 py-4">
                  <button onClick={() => toggleActive(session)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                      session.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${session.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {session.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(session)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No sessions match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Edit Session</h2>
              <p className="text-sm text-gray-500">{editSession.name} · {gymName(editSession)}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{editError}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Session name</label>
                  <input className={inp} value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
                  <select className={inp} value={editForm.category || ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="">—</option>
                    {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Instructor</label>
                  <input className={inp} value={editForm.instructor || ''} onChange={e => setEditForm(p => ({ ...p, instructor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input type="date" className={inp} value={editForm.date || ''} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Time</label>
                  <input type="time" className={inp} value={editForm.time || ''} onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Duration (mins)</label>
                  <input type="number" min="0" className={inp} value={editForm.duration_minutes ?? ''} onChange={e => setEditForm(p => ({ ...p, duration_minutes: e.target.value === '' ? undefined : parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Max capacity</label>
                  <input type="number" min="0" className={inp} value={editForm.max_capacity ?? ''} onChange={e => setEditForm(p => ({ ...p, max_capacity: e.target.value === '' ? undefined : parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Drop-in price (KES)</label>
                  <input type="number" min="0" className={inp} value={editForm.drop_in_price ?? ''} onChange={e => setEditForm(p => ({ ...p, drop_in_price: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                  <textarea className={inp + ' resize-none'} rows={3}
                    value={editForm.description || ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                </div>
              </div>

              {editSession.recurring && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  This is one occurrence of a recurring session — changes here only apply to this date. Edit from the partner dashboard to update the whole series.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setEditSession(null)}
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
    </div>
  );
}
