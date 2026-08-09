'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Experience = {
  id: string;
  name: string;
  date: string;
  price_kes: number;
  discount_kes: number;
  is_active: boolean;
  gyms: { name: string } | { name: string }[] | null;
  personal_trainers: { full_name: string; professional_name: string | null } | { full_name: string; professional_name: string | null }[] | null;
};

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const fmtKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

function hostName(exp: Experience): string {
  const gym = Array.isArray(exp.gyms) ? exp.gyms[0] : exp.gyms;
  if (gym?.name) return gym.name;
  const pt = Array.isArray(exp.personal_trainers) ? exp.personal_trainers[0] : exp.personal_trainers;
  if (pt) return pt.professional_name ?? pt.full_name;
  return '—';
}

export default function ExperiencesPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editExp, setEditExp] = useState<Experience | null>(null);
  const [discountInput, setDiscountInput] = useState('0');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => { loadExperiences(); }, []);

  async function loadExperiences() {
    const { data, error } = await supabase
      .from('experiences')
      .select('id, name, date, price_kes, discount_kes, is_active, gyms(name), personal_trainers(full_name, professional_name)')
      .order('date', { ascending: false });
    if (!error) setExperiences((data as any) || []);
    setLoading(false);
  }

  function openEdit(exp: Experience) {
    setEditExp(exp);
    setDiscountInput(String(exp.discount_kes ?? 0));
    setEditError('');
  }

  async function saveDiscount() {
    if (!editExp) return;
    const discount = Number(discountInput);
    if (isNaN(discount) || discount < 0) { setEditError('Enter a valid, non-negative amount.'); return; }
    if (discount > editExp.price_kes) { setEditError(`Discount can't exceed the listed price of ${fmtKes(editExp.price_kes)}.`); return; }

    setEditLoading(true);
    setEditError('');
    const { error } = await supabase
      .from('experiences')
      .update({ discount_kes: discount })
      .eq('id', editExp.id);
    setEditLoading(false);
    if (error) { setEditError(error.message); return; }
    setExperiences(prev => prev.map(e => e.id === editExp.id ? { ...e, discount_kes: discount } : e));
    setEditExp(null);
  }

  const filtered = experiences.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || hostName(e).toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-8 text-gray-500">Loading experiences…</div>;

  const previewCustomerPrice = editExp ? Math.max(0, editExp.price_kes - Number(discountInput || 0)) : 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Experiences</h1>
          <p className="text-sm text-gray-500 mt-0.5">{experiences.length} total · set a platform-funded discount per event</p>
        </div>
        <input
          type="text"
          placeholder="Search name or host…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Event</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Host</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Listed price</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Discount</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Customer pays</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(exp => (
              <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{exp.name}</p>
                  {!exp.is_active && <span className="text-xs text-gray-400">Inactive</span>}
                </td>
                <td className="px-5 py-4 text-gray-700">{hostName(exp)}</td>
                <td className="px-5 py-4 text-gray-500">
                  {new Date(exp.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-5 py-4 text-gray-900">{fmtKes(exp.price_kes)}</td>
                <td className="px-5 py-4">
                  {exp.discount_kes > 0 ? (
                    <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-semibold">
                      -{fmtKes(exp.discount_kes)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">None</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {exp.discount_kes > 0 ? (
                    <span className="font-semibold text-gray-900">{fmtKes(exp.price_kes - exp.discount_kes)}</span>
                  ) : (
                    <span className="text-gray-500">{fmtKes(exp.price_kes)}</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <button onClick={() => openEdit(exp)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                    Edit discount
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No experiences match your search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Discount Modal */}
      {editExp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Platform Discount</h2>
              <p className="text-sm text-gray-500">{editExp.name}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{editError}</div>}

              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Listed price</span>
                  <span className="font-medium">{fmtKes(editExp.price_kes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Partner still receives</span>
                  <span className="font-medium">{fmtKes(editExp.price_kes)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Discount (KES off, platform-funded)</label>
                <input
                  className={inp}
                  type="number"
                  min={0}
                  max={editExp.price_kes}
                  value={discountInput}
                  onChange={e => setDiscountInput(e.target.value)}
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                <span className="text-xs text-blue-500 uppercase tracking-wide font-semibold">Customer pays</span>
                <span className="text-lg font-bold text-blue-700">{fmtKes(previewCustomerPrice)}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setEditExp(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={saveDiscount} disabled={editLoading}
                className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
                {editLoading ? 'Saving…' : 'Save discount'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
