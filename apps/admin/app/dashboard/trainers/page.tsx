'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type PT = {
  id: string;
  user_id: string | null;
  full_name: string;
  professional_name: string | null;
  slug: string | null;
  photo_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  years_of_experience: number | null;
  certifications: string[];
  specialisations: string[];
  languages: string[];
  training_locations: string[];
  session_types: string[];
  service_areas: string[];
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejection_reason: string | null;
  is_certified_verified: boolean;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  // joined
  booking_count?: number;
  avg_rating?: number;
};

type Tab = 'all' | 'pending' | 'approved' | 'rejected' | 'suspended';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusStyle: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700 border-amber-200',
  approved:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:  'bg-red-100 text-red-700 border-red-200',
  suspended: 'bg-gray-100 text-gray-600 border-gray-200',
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color}`}>{text}</span>;
}

function Tag({ text }: { text: string }) {
  return <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{text}</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrainersAdminPage() {
  const [trainers, setTrainers] = useState<PT[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PT | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionInput, setRejectionInput] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('personal_trainers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Trainers load error:', error);
      setLoadError(`${error.code}: ${error.message}`);
    } else {
      setTrainers(data || []);
    }
    setLoading(false);
  }

  // ── Approval actions ───────────────────────────────────────────────────────

  async function approve(pt: PT) {
    setActionLoading(true);
    const { error } = await supabase
      .from('personal_trainers')
      .update({ status: 'approved', approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', pt.id);
    if (!error) {
      setTrainers(prev => prev.map(t => t.id === pt.id ? { ...t, status: 'approved', approved_at: new Date().toISOString() } : t));
      setSelected(prev => prev?.id === pt.id ? { ...prev, status: 'approved' } : prev);
    }
    setActionLoading(false);
  }

  async function reject(pt: PT, reason: string) {
    setActionLoading(true);
    const { error } = await supabase
      .from('personal_trainers')
      .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason })
      .eq('id', pt.id);
    if (!error) {
      setTrainers(prev => prev.map(t => t.id === pt.id ? { ...t, status: 'rejected', rejection_reason: reason } : t));
      setSelected(prev => prev?.id === pt.id ? { ...prev, status: 'rejected', rejection_reason: reason } : prev);
    }
    setActionLoading(false);
    setShowRejectModal(false);
    setRejectionInput('');
  }

  async function suspend(pt: PT) {
    setActionLoading(true);
    const { error } = await supabase
      .from('personal_trainers')
      .update({ status: 'suspended' })
      .eq('id', pt.id);
    if (!error) {
      setTrainers(prev => prev.map(t => t.id === pt.id ? { ...t, status: 'suspended' } : t));
      setSelected(prev => prev?.id === pt.id ? { ...prev, status: 'suspended' } : prev);
    }
    setActionLoading(false);
  }

  async function confirmDelete(pt: PT) {
    setDeleteLoading(true);
    setDeleteError('');
    const { error } = await supabase.from('personal_trainers').delete().eq('id', pt.id);
    setDeleteLoading(false);
    if (error) { setDeleteError(error.message); return; }
    setTrainers(prev => prev.filter(t => t.id !== pt.id));
    setSelected(null);
    setShowDeleteModal(false);
  }

  async function verifyCerts(pt: PT) {
    setActionLoading(true);
    const { error } = await supabase
      .from('personal_trainers')
      .update({ is_certified_verified: !pt.is_certified_verified })
      .eq('id', pt.id);
    if (!error) {
      setTrainers(prev => prev.map(t => t.id === pt.id ? { ...t, is_certified_verified: !t.is_certified_verified } : t));
      setSelected(prev => prev?.id === pt.id ? { ...prev, is_certified_verified: !prev.is_certified_verified } : prev);
    }
    setActionLoading(false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:       trainers.length,
    pending:   trainers.filter(t => t.status === 'pending').length,
    approved:  trainers.filter(t => t.status === 'approved').length,
    rejected:  trainers.filter(t => t.status === 'rejected').length,
    suspended: trainers.filter(t => t.status === 'suspended').length,
  }), [trainers]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? trainers : trainers.filter(t => t.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.full_name.toLowerCase().includes(q) ||
        t.professional_name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.specialisations.some(s => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [trainers, tab, search]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left panel ── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white">

        {/* Header */}
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Personal Trainers</h1>
            <button
              onClick={load}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {/* Pending alert */}
          {counts.pending > 0 && (
            <button
              onClick={() => setTab('pending')}
              className="mt-3 flex w-full items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-left"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                {counts.pending}
              </span>
              <span className="text-sm font-semibold text-amber-800">
                {counts.pending === 1 ? 'application' : 'applications'} awaiting review
              </span>
            </button>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search by name, email, specialisation…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 px-5 py-3">
          {(['pending', 'approved', 'all', 'suspended', 'rejected'] as Tab[]).map(t => (
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

        {/* List */}
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
                {tab === 'pending' ? 'No pending applications' : 'No trainers found'}
              </p>
            </div>
          ) : (
            filtered.map(pt => (
              <button
                key={pt.id}
                onClick={() => setSelected(pt)}
                className={`w-full border-b border-gray-50 px-5 py-4 text-left transition hover:bg-gray-50 ${selected?.id === pt.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {pt.photo_url ? (
                      <img src={pt.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                        {pt.full_name[0]}
                      </div>
                    )}
                    {pt.is_certified_verified && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-xs" title="Verified">✓</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {pt.professional_name || pt.full_name}
                      </p>
                      <Badge text={pt.status} color={statusStyle[pt.status]} />
                    </div>
                    {pt.professional_name && (
                      <p className="text-xs text-gray-400">{pt.full_name}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pt.specialisations.slice(0, 2).map(s => <Tag key={s} text={s} />)}
                      {pt.specialisations.length > 2 && (
                        <span className="text-xs text-gray-400">+{pt.specialisations.length - 2}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{fmtDate(pt.created_at)}</p>
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
              <div className="text-5xl">🏋️</div>
              <p className="mt-4 text-sm font-medium text-gray-400">Select a trainer to review</p>
              {counts.pending > 0 && (
                <p className="mt-1 text-xs text-amber-600">{counts.pending} application{counts.pending > 1 ? 's' : ''} need your attention</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-8 py-8 space-y-6">

            {/* ── Action bar ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected.photo_url ? (
                  <img src={selected.photo_url} className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow" alt="" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-300 text-xl font-bold text-white shadow">
                    {selected.full_name[0]}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selected.professional_name || selected.full_name}
                    {selected.is_certified_verified && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        ✓ Verified
                      </span>
                    )}
                  </h2>
                  {selected.professional_name && (
                    <p className="text-sm text-gray-500">{selected.full_name}</p>
                  )}
                  <div className="mt-1">
                    <Badge text={selected.status} color={statusStyle[selected.status]} />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap justify-end gap-2">
                {selected.status === 'pending' && (
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
                {selected.status === 'approved' && (
                  <button
                    onClick={() => suspend(selected)}
                    disabled={actionLoading}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Suspend
                  </button>
                )}
                {(selected.status === 'suspended' || selected.status === 'rejected') && (
                  <button
                    onClick={() => approve(selected)}
                    disabled={actionLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Reinstate
                  </button>
                )}
                <button
                  onClick={() => verifyCerts(selected)}
                  disabled={actionLoading}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                    selected.is_certified_verified
                      ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {selected.is_certified_verified ? '✓ Certs verified' : 'Verify certs'}
                </button>
                <button
                  onClick={() => { setShowDeleteModal(true); setDeleteError(''); }}
                  disabled={actionLoading}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Rejection reason */}
            {selected.rejection_reason && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <strong>Rejection reason:</strong> {selected.rejection_reason}
              </div>
            )}

            {/* ── Profile fields ── */}
            <div className="grid gap-4 md:grid-cols-2">

              <Section title="Contact">
                <Field label="Email" value={selected.email} />
                <Field label="Phone" value={selected.phone} />
                <Field label="Instagram" value={selected.instagram_handle ? `@${selected.instagram_handle}` : null} />
                <Field label="Slug / public URL" value={selected.slug ? `activecitypass.com/trainers/${selected.slug}` : null} mono />
              </Section>

              <Section title="Professional">
                <Field label="Experience" value={selected.years_of_experience ? `${selected.years_of_experience} years` : null} />
                <Field label="Session types" value={selected.session_types.join(', ') || null} />
                <Field label="Locations" value={selected.training_locations.join(', ') || null} />
                <Field label="Languages" value={selected.languages.join(', ') || null} />
              </Section>

              <Section title="Specialisations" full>
                {selected.specialisations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.specialisations.map(s => (
                      <span key={s} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{s}</span>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">None listed</p>}
              </Section>

              <Section title="Certifications" full>
                {selected.certifications.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.certifications.map(c => (
                      <span key={c} className={`rounded-full px-3 py-1 text-xs font-semibold border ${selected.is_certified_verified ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {selected.is_certified_verified ? '✓ ' : ''}{c}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">None listed</p>}
              </Section>

              <Section title="Bio" full>
                {selected.bio ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.bio}</p>
                ) : <p className="text-sm text-gray-400">No bio provided</p>}
              </Section>

              <Section title="Service areas (home visits)" full>
                {selected.service_areas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.service_areas.map(a => <Tag key={a} text={a} />)}
                  </div>
                ) : <p className="text-sm text-gray-400">Not specified</p>}
              </Section>

            </div>

            {/* Timestamps */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-400 space-y-1">
              <p>Applied: {fmtDate(selected.created_at)}</p>
              {selected.approved_at && <p>Approved: {fmtDate(selected.approved_at)}</p>}
              {selected.rejected_at && <p>Rejected: {fmtDate(selected.rejected_at)}</p>}
              {selected.user_id && <p>User ID: <span className="font-mono">{selected.user_id}</span></p>}
            </div>

          </div>
        )}
      </div>

      {/* ── Delete modal ── */}
      {showDeleteModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Delete trainer</h3>
            <p className="mt-1 text-sm text-gray-500">{selected.professional_name || selected.full_name}</p>
            {deleteError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{deleteError}</div>
            )}
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <strong>This cannot be undone.</strong> This will permanently delete <strong>{selected.professional_name || selected.full_name}</strong> and all associated data from the platform.
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteError(''); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(selected)}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting…' : 'Delete trainer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ── */}
      {showRejectModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Reject application</h3>
            <p className="mt-1 text-sm text-gray-500">
              Give {selected.professional_name || selected.full_name} a reason so they can reapply.
            </p>
            <textarea
              value={rejectionInput}
              onChange={e => setRejectionInput(e.target.value)}
              placeholder="e.g. Certification could not be verified. Please resubmit with a clearer document."
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
                Reject application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 ${full ? 'md:col-span-2' : ''}`}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || <span className="text-gray-300">—</span>}
      </p>
    </div>
  );
}
