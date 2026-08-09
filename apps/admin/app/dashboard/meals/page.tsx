'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Meal = {
  id: string;
  name: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'smoothie';
  description: string | null;
  image_url: string | null;
  ingredients: string[];
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  prep_time_minutes: number | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  tags: string[];
  cuisine: string;
  is_active: boolean;
};

type MealForm = {
  name: string;
  category: Meal['category'];
  description: string;
  image_url: string;
  ingredients: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fibre_g: string;
  prep_time_minutes: string;
  difficulty: '' | 'beginner' | 'intermediate' | 'advanced';
  tags: string;
  cuisine: string;
  is_active: boolean;
};

const CATEGORY_ICON: Record<Meal['category'], string> = {
  breakfast: '🍳', lunch: '🍲', dinner: '🍽️', snack: '🥜', smoothie: '🥤',
};

const CATEGORIES: Meal['category'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'];

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'block text-xs font-semibold text-gray-600 mb-1';

const EMPTY_FORM: MealForm = {
  name: '', category: 'breakfast', description: '', image_url: '', ingredients: '',
  calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', prep_time_minutes: '',
  difficulty: '', tags: '', cuisine: 'Kenyan', is_active: true,
};

function toForm(m: Meal): MealForm {
  return {
    name: m.name,
    category: m.category,
    description: m.description ?? '',
    image_url: m.image_url ?? '',
    ingredients: (m.ingredients ?? []).join(', '),
    calories: m.calories?.toString() ?? '',
    protein_g: m.protein_g?.toString() ?? '',
    carbs_g: m.carbs_g?.toString() ?? '',
    fat_g: m.fat_g?.toString() ?? '',
    fibre_g: m.fibre_g?.toString() ?? '',
    prep_time_minutes: m.prep_time_minutes?.toString() ?? '',
    difficulty: m.difficulty ?? '',
    tags: (m.tags ?? []).join(', '),
    cuisine: m.cuisine,
    is_active: m.is_active,
  };
}

function toPayload(f: MealForm) {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    name: f.name.trim(),
    category: f.category,
    description: f.description.trim() || null,
    image_url: f.image_url.trim() || null,
    ingredients: f.ingredients.split(',').map(s => s.trim()).filter(Boolean),
    calories: num(f.calories),
    protein_g: num(f.protein_g),
    carbs_g: num(f.carbs_g),
    fat_g: num(f.fat_g),
    fibre_g: num(f.fibre_g),
    prep_time_minutes: num(f.prep_time_minutes),
    difficulty: f.difficulty || null,
    tags: f.tags.split(',').map(s => s.trim()).filter(Boolean),
    cuisine: f.cuisine.trim() || 'Kenyan',
    is_active: f.is_active,
  };
}

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | Meal['category']>('all');

  const [editing, setEditing] = useState<Meal | 'new' | null>(null);
  const [form, setForm] = useState<MealForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadMeals(); }, []);

  async function loadMeals() {
    const { data, error } = await supabase
      .from('meals')
      .select('id, name, category, description, image_url, ingredients, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes, difficulty, tags, cuisine, is_active')
      .order('name');
    if (!error) setMeals((data as any) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing('new');
    setForm(EMPTY_FORM);
    setError('');
  }

  function openEdit(m: Meal) {
    setEditing(m);
    setForm(toForm(m));
    setError('');
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    const payload = toPayload(form);

    if (editing === 'new') {
      const { data, error } = await supabase.from('meals').insert(payload).select().single();
      setSaving(false);
      if (error) { setError(error.message); return; }
      setMeals(prev => [...prev, data as Meal].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
    } else if (editing) {
      const { error } = await supabase.from('meals').update(payload).eq('id', editing.id);
      setSaving(false);
      if (error) { setError(error.message); return; }
      setMeals(prev => prev.map(m => m.id === editing.id ? { ...m, ...payload } as Meal : m));
      setEditing(null);
    }
  }

  async function deleteMeal(m: Meal) {
    if (!confirm(`Delete "${m.name}"? This can't be undone.`)) return;
    const { error } = await supabase.from('meals').delete().eq('id', m.id);
    if (!error) setMeals(prev => prev.filter(x => x.id !== m.id));
  }

  const filtered = meals.filter(m =>
    (categoryFilter === 'all' || m.category === categoryFilter) &&
    (!search || m.name.toLowerCase().includes(search.toLowerCase()) || m.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
  );

  if (loading) return <div className="p-8 text-gray-500">Loading meals…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meal Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{meals.length} total · the curated Kenyan meal library used across the Nutrition Hub</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition"
        >
          + Add Meal
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name or tag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${categoryFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            All
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${categoryFilter === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {CATEGORY_ICON[c]} {c}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Meal</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Category</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Calories</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Protein</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Difficulty</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  {m.tags.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{m.tags.join(' · ')}</p>}
                </td>
                <td className="px-5 py-4 text-gray-700 capitalize">{CATEGORY_ICON[m.category]} {m.category}</td>
                <td className="px-5 py-4 text-gray-700">{m.calories != null ? `${m.calories} kcal` : '—'}</td>
                <td className="px-5 py-4 text-gray-700">{m.protein_g != null ? `${m.protein_g}g` : '—'}</td>
                <td className="px-5 py-4 text-gray-500 capitalize">{m.difficulty ?? '—'}</td>
                <td className="px-5 py-4">
                  {m.is_active ? (
                    <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-semibold">Active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-semibold">Inactive</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right space-x-2">
                  <button onClick={() => openEdit(m)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                    Edit
                  </button>
                  <button onClick={() => deleteMeal(m)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-600 hover:bg-red-50 transition font-medium">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No meals match your search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editing === 'new' ? 'Add Meal' : 'Edit Meal'}</h2>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>}

              <div>
                <label className={label}>Name</label>
                <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ugali + Sukuma Wiki + Grilled Chicken" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Category</label>
                  <select className={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Meal['category'] }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Difficulty</label>
                  <select className={inp} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as MealForm['difficulty'] }))}>
                    <option value="">—</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={label}>Description</label>
                <textarea className={inp} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <label className={label}>Image URL</label>
                <input className={inp} value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://…" />
              </div>

              <div>
                <label className={label}>Ingredients (comma-separated)</label>
                <input className={inp} value={form.ingredients} onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))} placeholder="Chicken, Ugali, Sukuma wiki, Tomatoes" />
              </div>

              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className={label}>Calories</label>
                  <input className={inp} type="number" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Protein (g)</label>
                  <input className={inp} type="number" value={form.protein_g} onChange={e => setForm(f => ({ ...f, protein_g: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Carbs (g)</label>
                  <input className={inp} type="number" value={form.carbs_g} onChange={e => setForm(f => ({ ...f, carbs_g: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Fat (g)</label>
                  <input className={inp} type="number" value={form.fat_g} onChange={e => setForm(f => ({ ...f, fat_g: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Fibre (g)</label>
                  <input className={inp} type="number" value={form.fibre_g} onChange={e => setForm(f => ({ ...f, fibre_g: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={label}>Prep time (min)</label>
                  <input className={inp} type="number" value={form.prep_time_minutes} onChange={e => setForm(f => ({ ...f, prep_time_minutes: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Cuisine</label>
                  <input className={inp} value={form.cuisine} onChange={e => setForm(f => ({ ...f, cuisine: e.target.value }))} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                    Active (visible to users)
                  </label>
                </div>
              </div>

              <div>
                <label className={label}>Tags (comma-separated — e.g. muscle_building, weight_loss, vegetarian)</label>
                <input className={inp} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Save meal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
