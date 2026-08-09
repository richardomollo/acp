'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Row = { id: string; name: string; emoji: string | null; image_url?: string | null; sort_order: number };
type TableName = 'venue_types' | 'session_categories' | 'pt_specialisations';

const inp = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

async function uploadCategoryImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `category-thumbnails/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('fitpass-images').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('fitpass-images').getPublicUrl(path).data.publicUrl;
}

function ImageUploadCell({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadCategoryImage(file);
      onChange(url);
    } catch (err: unknown) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-14 h-14 rounded-lg overflow-hidden border border-gray-300 flex items-center justify-center bg-gray-50 hover:border-gray-400 transition flex-shrink-0"
        title={value ? 'Change image' : 'Upload image'}
      >
        {uploading ? (
          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-gray-300 text-lg leading-none">+</span>
        )}
      </button>
    </div>
  );
}

function CategorySection({
  title,
  table,
  usageTable,
  usageColumn,
  showEmoji = true,
  showImage = false,
}: {
  title: string;
  table: TableName;
  usageTable?: 'gyms' | 'sessions';
  usageColumn?: 'type' | 'category';
  showEmoji?: boolean;
  showImage?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', emoji: '', image_url: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', emoji: '', image_url: '', sort_order: 0 });
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const selectCols = showImage ? 'id, name, emoji, image_url, sort_order' : 'id, name, emoji, sort_order';
    const { data: rawData } = await supabase
      .from(table)
      .select(selectCols as any)
      .order('sort_order', { ascending: true });
    const data = (rawData as unknown as Row[]) || [];
    setRows(data);

    if (usageTable && usageColumn && data.length) {
      const counts: Record<string, number> = {};
      await Promise.all(
        data.map(async (row) => {
          const { count } = await supabase
            .from(usageTable)
            .select('id', { count: 'exact', head: true })
            .eq(usageColumn, row.name);
          counts[row.id] = count ?? 0;
        })
      );
      setUsageCounts(counts);
    }
    setLoading(false);
  }

  function startEdit(row: Row) {
    setEditId(row.id);
    setEditForm({ name: row.name, emoji: row.emoji ?? '', image_url: row.image_url ?? '', sort_order: row.sort_order });
    setError('');
  }

  async function saveEdit() {
    if (!editId || !editForm.name.trim()) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from(table)
      .update({
        name: editForm.name.trim(),
        ...(showEmoji ? { emoji: editForm.emoji.trim() || null } : {}),
        ...(showImage ? { image_url: editForm.image_url.trim() || null } : {}),
        sort_order: Number(editForm.sort_order),
      })
      .eq('id', editId);
    if (err) { setError(err.message); setSaving(false); return; }
    setEditId(null);
    setSaving(false);
    load();
  }

  async function deleteRow(row: Row) {
    const inUse = usageCounts[row.id] ?? 0;
    const msg = inUse > 0
      ? `"${row.name}" is used by ${inUse} ${usageTable}. Deleting won't remove those records — they'll just have an unrecognised value. Continue?`
      : `Delete "${row.name}"?`;
    if (!confirm(msg)) return;
    setDeleting(row.id);
    await supabase.from(table).delete().eq('id', row.id);
    setDeleting(null);
    load();
  }

  async function addRow() {
    if (!addForm.name.trim()) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from(table).insert({
      name: addForm.name.trim(),
      ...(showEmoji ? { emoji: addForm.emoji.trim() || null } : {}),
      ...(showImage ? { image_url: addForm.image_url.trim() || null } : {}),
      sort_order: Number(addForm.sort_order) || rows.length + 1,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setAddForm({ name: '', emoji: '', image_url: '', sort_order: 0 });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  const hasUsage = !!usageTable && !!usageColumn;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button
          onClick={() => { setShowAdd(true); setError(''); }}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition"
        >
          <span className="text-lg leading-none">+</span> Add
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="p-6 text-sm text-gray-400">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              {showEmoji && <th className="text-left px-6 py-3 font-medium">Emoji</th>}
              {showImage && <th className="text-left px-6 py-3 font-medium">Image</th>}
              <th className="text-left px-6 py-3 font-medium">Name</th>
              <th className="text-left px-6 py-3 font-medium">Order</th>
              {hasUsage && <th className="text-left px-6 py-3 font-medium">In use</th>}
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) =>
              editId === row.id ? (
                <tr key={row.id} className="bg-blue-50">
                  {showEmoji && (
                    <td className="px-6 py-3">
                      <input
                        className={inp + ' w-16 text-center text-lg'}
                        value={editForm.emoji}
                        onChange={e => setEditForm(p => ({ ...p, emoji: e.target.value }))}
                        placeholder="🏋️"
                      />
                    </td>
                  )}
                  {showImage && (
                    <td className="px-6 py-3">
                      <ImageUploadCell
                        value={editForm.image_url}
                        onChange={url => setEditForm(p => ({ ...p, image_url: url }))}
                      />
                    </td>
                  )}
                  <td className="px-6 py-3">
                    <input
                      className={inp + ' w-52'}
                      value={editForm.name}
                      onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveEdit()}
                      autoFocus
                    />
                  </td>
                  <td className="px-6 py-3">
                    <input
                      type="number"
                      className={inp + ' w-20'}
                      value={editForm.sort_order}
                      onChange={e => setEditForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
                    />
                  </td>
                  {hasUsage && <td className="px-6 py-3 text-gray-400">{usageCounts[row.id] ?? '—'}</td>}
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-gray-50 transition">
                  {showEmoji && <td className="px-6 py-3 text-lg">{row.emoji || '—'}</td>}
                  {showImage && (
                    <td className="px-6 py-3">
                      {row.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">—</div>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-3 font-medium text-gray-800">{row.name}</td>
                  <td className="px-6 py-3 text-gray-400">{row.sort_order}</td>
                  {hasUsage && (
                    <td className="px-6 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        (usageCounts[row.id] ?? 0) > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {usageCounts[row.id] ?? 0}
                      </span>
                    </td>
                  )}
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => startEdit(row)}
                        className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => deleteRow(row)} disabled={deleting === row.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50">
                        {deleting === row.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {showAdd && (
              <tr className="bg-green-50">
                {showEmoji && (
                  <td className="px-6 py-3">
                    <input
                      className={inp + ' w-16 text-center text-lg'}
                      value={addForm.emoji}
                      onChange={e => setAddForm(p => ({ ...p, emoji: e.target.value }))}
                      placeholder="🏋️"
                    />
                  </td>
                )}
                {showImage && (
                  <td className="px-6 py-3">
                    <ImageUploadCell
                      value={addForm.image_url}
                      onChange={url => setAddForm(p => ({ ...p, image_url: url }))}
                    />
                  </td>
                )}
                <td className="px-6 py-3">
                  <input
                    className={inp + ' w-52'}
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addRow()}
                    placeholder="e.g. Pilates"
                    autoFocus
                  />
                </td>
                <td className="px-6 py-3">
                  <input
                    type="number"
                    className={inp + ' w-20'}
                    value={addForm.sort_order || ''}
                    onChange={e => setAddForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
                    placeholder={String(rows.length + 1)}
                  />
                </td>
                {hasUsage && <td className="px-6 py-3" />}
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={addRow} disabled={saving || !addForm.name.trim()}
                      className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Adding…' : 'Add'}
                    </button>
                    <button onClick={() => setShowAdd(false)}
                      className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Types &amp; Categories</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage venue types, session categories, and PT specialisations shown across the platform. Changes apply immediately.
        </p>
      </div>

      <CategorySection
        title="Venue Types"
        table="venue_types"
        usageTable="gyms"
        usageColumn="type"
        showEmoji={true}
      />

      <CategorySection
        title="Session Categories"
        table="session_categories"
        usageTable="sessions"
        usageColumn="category"
        showEmoji={true}
        showImage={true}
      />

      <CategorySection
        title="PT Specialisations"
        table="pt_specialisations"
        showEmoji={false}
      />
    </div>
  );
}
