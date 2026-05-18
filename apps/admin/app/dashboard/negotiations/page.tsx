'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

type Gym = {
  id: string;
  name: string;
  type: string;
  area: string;
  location: string;
  rate_floor: number | null;
  rate_floor_percentage: number | null;
  contact_email: string | null;
  is_active: boolean;
};

type Negotiation = {
  id: string;
  gym_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'countered';
  proposed_floor: number;
  proposed_percentage: number | null;
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  gyms?: { name: string; location: string };
  partners?: { business_name: string; email: string } | null;
};

type Tab = 'all' | 'pending' | 'agreed' | 'unset';

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900';

function rateColor(pct: number | null) {
  if (pct == null) return 'text-gray-400';
  if (pct <= 60) return 'text-green-600';
  if (pct <= 75) return 'text-amber-600';
  return 'text-red-600';
}

function rateBg(pct: number | null) {
  if (pct == null) return 'bg-gray-100 text-gray-500';
  if (pct <= 60) return 'bg-green-50 text-green-700';
  if (pct <= 75) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

function computeCredits(payout: number, margin: number, creditUnit: number): number {
  return Math.ceil((payout / creditUnit) / (1 - margin));
}

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  for (const [u, v] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]] as [string, number][]) {
    const n = Math.floor(s / v);
    if (n >= 1) return `${n} ${u}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export default function NegotiationsPage() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [pending, setPending] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  // Pricing settings
  const [targetMargin, setTargetMargin] = useState(0.20);
  const [marginInput, setMarginInput] = useState('20');
  const [creditUnit, setCreditUnit] = useState(99);
  const [creditUnitInput, setCreditUnitInput] = useState('99');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Set Floor modal
  const [floorGym, setFloorGym] = useState<Gym | null>(null);
  const [floorPct, setFloorPct] = useState('');
  const [previewPrice, setPreviewPrice] = useState('');
  const [floorNotes, setFloorNotes] = useState('');
  const [floorSaving, setFloorSaving] = useState(false);
  const [floorError, setFloorError] = useState('');

  // Reject/counter modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [counterPct, setCounterPct] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [gymsRes, negRes, settingsRes] = await Promise.all([
      supabase
        .from('gyms')
        .select('id, name, type, area, location, rate_floor, rate_floor_percentage, contact_email, is_active')
        .order('name'),
      supabase
        .from('rate_floor_negotiations')
        .select('*, gyms(name, location), partners(business_name, email)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['target_margin', 'credit_unit_value']),
    ]);
    if (!gymsRes.error) setGyms(gymsRes.data || []);
    if (!negRes.error) setPending(negRes.data || []);
    if (!settingsRes.error && settingsRes.data) {
      const marginSetting = settingsRes.data.find(s => s.key === 'target_margin');
      if (marginSetting) {
        const m = parseFloat(marginSetting.value);
        setTargetMargin(m);
        setMarginInput(String(Math.round(m * 100)));
      }
      const unitSetting = settingsRes.data.find(s => s.key === 'credit_unit_value');
      if (unitSetting) {
        const u = parseFloat(unitSetting.value);
        setCreditUnit(u);
        setCreditUnitInput(String(u));
      }
    }
    setLoading(false);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsSaved(false);
    const m = parseFloat(marginInput) / 100;
    const u = parseFloat(creditUnitInput);
    if (isNaN(m) || m <= 0 || m >= 1 || isNaN(u) || u <= 0) { setSettingsSaving(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    await Promise.all([
      fetch('/api/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'target_margin', value: m.toString(), accessToken: session?.access_token }),
      }),
      fetch('/api/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'credit_unit_value', value: u.toString(), accessToken: session?.access_token }),
      }),
    ]);
    setTargetMargin(m);
    setCreditUnit(u);
    setSettingsSaving(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  // ── Live preview (modal) ───────────────────────────────────────
  const livePct     = parseFloat(floorPct) || 0;
  const liveExample = parseFloat(previewPrice) || 0;
  const livePayout  = liveExample > 0 && livePct > 0 ? Math.round(liveExample * livePct / 100) : null;
  const liveCredits = livePayout != null ? computeCredits(livePayout, targetMargin, creditUnit) : null;
  const liveRetail  = liveCredits != null ? liveCredits * creditUnit : null;

  function openFloor(gym: Gym) {
    setFloorGym(gym);
    setFloorPct(gym.rate_floor_percentage?.toString() || '');
    setPreviewPrice('');
    setFloorNotes('');
    setFloorError('');
  }

  async function saveFloor() {
    if (!floorGym) return;
    const pct = parseFloat(floorPct);
    if (!pct || pct <= 0 || pct > 100) { setFloorError('Enter a valid percentage between 1 and 100'); return; }

    setFloorSaving(true);
    setFloorError('');

    const now   = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    const { data: { user } } = await supabase.auth.getUser();

    // Save percentage to gym
    const { error: gymErr } = await supabase
      .from('gyms')
      .update({ rate_floor_percentage: pct })
      .eq('id', floorGym.id);

    if (gymErr) { setFloorError(gymErr.message); setFloorSaving(false); return; }

    // Recompute credits on all upcoming sessions that have a drop_in_price
    const { data: sessionsToUpdate } = await supabase
      .from('sessions')
      .select('id, drop_in_price')
      .eq('gym_id', floorGym.id)
      .gte('date', today)
      .not('drop_in_price', 'is', null);

    if (sessionsToUpdate?.length) {
      await Promise.all(
        sessionsToUpdate.map(s =>
          supabase.from('sessions')
            .update({ credits_required: computeCredits((s.drop_in_price as number) * pct / 100, targetMargin, creditUnit) })
            .eq('id', s.id)
        )
      );
    }

    // Log negotiation record
    await supabase.from('rate_floor_negotiations').insert({
      gym_id: floorGym.id,
      proposed_floor: 0,
      proposed_percentage: pct,
      notes: floorNotes || null,
      status: 'approved',
      submitted_at: now,
      reviewed_at: now,
      reviewed_by: user?.id,
    });

    setGyms(prev => prev.map(g =>
      g.id === floorGym.id ? { ...g, rate_floor_percentage: pct } : g
    ));
    setFloorGym(null);
    setFloorSaving(false);
  }

  async function approvePending(neg: Negotiation) {
    const { data: { user } } = await supabase.auth.getUser();
    const now   = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    const pct   = neg.proposed_percentage ?? null;

    await supabase.from('rate_floor_negotiations')
      .update({ status: 'approved', reviewed_at: now, reviewed_by: user?.id })
      .eq('id', neg.id);

    await supabase.from('gyms')
      .update({ rate_floor: neg.proposed_floor || null, rate_floor_percentage: pct })
      .eq('id', neg.gym_id);

    // Per-session credits update
    if (pct) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, drop_in_price')
        .eq('gym_id', neg.gym_id)
        .gte('date', today)
        .not('drop_in_price', 'is', null);

      if (sessions?.length) {
        await Promise.all(
          sessions.map(s =>
            supabase.from('sessions')
              .update({ credits_required: computeCredits((s.drop_in_price as number) * pct / 100, targetMargin, creditUnit) })
              .eq('id', s.id)
          )
        );
      }
    }

    setPending(prev => prev.filter(n => n.id !== neg.id));
    setGyms(prev => prev.map(g =>
      g.id === neg.gym_id
        ? { ...g, rate_floor: neg.proposed_floor || null, rate_floor_percentage: pct }
        : g
    ));
  }

  async function submitReject() {
    if (!rejectId) return;
    setRejectSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const now     = new Date().toISOString();
    const counter = parseFloat(counterPct);

    await supabase.from('rate_floor_negotiations').update({
      status: counter ? 'countered' : 'rejected',
      reviewed_at: now,
      reviewed_by: user?.id,
      notes: [rejectReason, counter ? `Counter: ${counter}%` : ''].filter(Boolean).join(' — ') || null,
    }).eq('id', rejectId);

    setPending(prev => prev.filter(n => n.id !== rejectId));
    setRejectId(null);
    setRejectReason('');
    setCounterPct('');
    setRejectSaving(false);
  }

  // ── Filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => gyms.filter(g => {
    const matchSearch = !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.area?.toLowerCase().includes(search.toLowerCase());
    const matchTab =
      tab === 'pending' ? pending.some(n => n.gym_id === g.id) :
      tab === 'agreed'  ? g.rate_floor_percentage != null :
      tab === 'unset'   ? g.rate_floor_percentage == null :
      true;
    return matchSearch && matchTab;
  }), [gyms, pending, tab, search]);

  // ── Stats ──────────────────────────────────────────────────────
  const negotiated = gyms.filter(g => g.rate_floor_percentage != null).length;
  const avgPct = (() => {
    const withPct = gyms.filter(g => g.rate_floor_percentage != null);
    return withPct.length > 0
      ? Math.round(withPct.reduce((s, g) => s + g.rate_floor_percentage!, 0) / withPct.length)
      : null;
  })();
  const highFloors = gyms.filter(g => g.rate_floor_percentage != null && g.rate_floor_percentage > 70).length;

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

  const rejectNeg = pending.find(n => n.id === rejectId);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rate Floor Negotiations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Negotiate a wholesale rate % per venue — payout is calculated per session from its own walk-in price
          </p>
        </div>
        <input
          type="text"
          placeholder="Search venue or area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-56"
        />
      </div>

      {/* Pricing Settings Panel */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Credit Pricing Formula</p>
        <div className="flex items-end gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-1">Formula</p>
            <p className="text-sm text-gray-700 font-mono">
              Credits = ⌈ (Session Drop-in × Rate%) ÷ KES {creditUnit} ÷ (1 − Margin) ⌉
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Rate % is agreed per venue · Drop-in price is set per session by the partner · 1 credit = KES {creditUnit}
            </p>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Credit unit value (KES)</label>
              <input
                type="number" min={1} step={1} value={creditUnitInput}
                onChange={e => setCreditUnitInput(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Target margin</label>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={1} max={99} step={1} value={marginInput}
                  onChange={e => setMarginInput(e.target.value)}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 text-right"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            <button
              onClick={saveSettings} disabled={settingsSaving}
              className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
            >
              {settingsSaving ? 'Saving…' : settingsSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600 min-w-[220px]">
            <p className="font-semibold text-gray-700 mb-1">Example at {Math.round(targetMargin * 100)}% margin, 50% floor</p>
            <p>Session drop-in: KES 2,000 → payout KES 1,000</p>
            <p className="mt-0.5">
              Credits = ⌈(1,000 ÷ {creditUnit}) ÷ {(1 - targetMargin).toFixed(2)}⌉
              {' = '}
              <strong>{computeCredits(1000, targetMargin, creditUnit)} credits</strong>
              {' (KES '}{(computeCredits(1000, targetMargin, creditUnit) * creditUnit).toLocaleString()}{' to user)'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total venues',       value: gyms.length },
          { label: 'Rate floor agreed',  value: negotiated },
          { label: 'Avg floor rate',     value: avgPct != null ? `${avgPct}%` : '—' },
          { label: 'High floors (>70%)', value: highFloors, warn: highFloors > 0 },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.warn ? 'text-red-600' : 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          ['all',     'All Venues'],
          ['pending', 'Partner Proposals'],
          ['agreed',  'Rate Agreed'],
          ['unset',   'No Floor Set'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
            {t === 'pending' && pending.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs font-bold rounded-full bg-amber-100 text-amber-700">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending proposals */}
      {tab === 'pending' && pending.length > 0 && (
        <div className="space-y-3 mb-6">
          {pending
            .filter(n => !search || n.gyms?.name.toLowerCase().includes(search.toLowerCase()))
            .map(neg => {
              const pct     = neg.proposed_percentage;
              const credits = pct != null ? computeCredits(1000 * pct / 100, targetMargin, creditUnit) : null;
              return (
                <div key={neg.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900">{neg.gyms?.name}</p>
                        {pct != null && pct > 70 && (
                          <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">High floor</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-3">{neg.gyms?.location} · {timeAgo(neg.submitted_at)}</p>
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Proposed rate</p>
                          <p className={`font-semibold text-lg ${rateColor(pct ?? null)}`}>
                            {pct != null ? `${pct}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Example (KES 1,000 session)</p>
                          <p className="text-xs text-gray-500">
                            {pct != null
                              ? `KES ${Math.round(1000 * pct / 100)} payout → ${credits} credits`
                              : '—'}
                          </p>
                        </div>
                      </div>
                      {neg.notes && (
                        <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">"{neg.notes}"</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => approvePending(neg)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition font-medium">
                        Approve
                      </button>
                      <button onClick={() => { setRejectId(neg.id); setRejectReason(''); setCounterPct(''); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium">
                        Reject / Counter
                      </button>
                    </div>
                  </div>
                </div>
              );
          })}
        </div>
      )}

      {/* Venues table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Rate Floor</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Payout logic</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(gym => {
              const pct       = gym.rate_floor_percentage;
              const hasPending = pending.some(n => n.gym_id === gym.id);
              return (
                <tr key={gym.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">{gym.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{gym.type} · {gym.area}</p>
                  </td>
                  <td className="px-5 py-4">
                    {pct != null
                      ? <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${rateBg(pct)}`}>{pct}%</span>
                      : <span className="text-gray-300 text-xs">Not set</span>}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {pct != null
                      ? <span>Session drop-in × {pct}% = payout</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {hasPending
                      ? <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-medium">Pending</span>
                      : pct != null
                        ? <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">Agreed</span>
                        : <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">Not set</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => openFloor(gym)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                      {pct != null ? 'Update' : 'Set floor'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">No venues match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Set / Update Floor Modal */}
      {floorGym && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Set Wholesale Floor</h2>
              <p className="text-sm text-gray-500 mt-0.5">{floorGym.name} · {floorGym.area}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {floorError && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{floorError}</div>}

              {/* Percentage quick buttons */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Target rate (% of session walk-in price)</p>
                <div className="flex gap-2 mb-3">
                  {[40, 50, 60].map(p => (
                    <button key={p} onClick={() => setFloorPct(p.toString())}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition ${
                        floorPct === p.toString()
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : p <= 50
                            ? 'border-green-300 text-green-700 hover:bg-green-50'
                            : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                      }`}>{p}%</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={100} step={1} placeholder="Custom %"
                    value={floorPct} onChange={e => setFloorPct(e.target.value)}
                    className={inp}
                  />
                  <span className="text-sm text-gray-500 flex-shrink-0">%</span>
                </div>
                {livePct > 70 && (
                  <p className="text-xs text-red-500 mt-1">⚠ Above 70% — target 40–60%</p>
                )}
              </div>

              {/* Live preview using an example price */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Preview with example session price (KES)
                </label>
                <input
                  type="number" min={0} step={100} placeholder="e.g. 2000"
                  value={previewPrice} onChange={e => setPreviewPrice(e.target.value)}
                  className={inp}
                />
                <p className="text-xs text-gray-400 mt-1">Not saved — just for previewing the credit formula</p>
              </div>

              {liveCredits != null && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm space-y-1">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Credit pricing preview</p>
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-blue-900">
                    <span className="text-blue-500">Example drop-in</span>
                    <span className="font-medium">KES {liveExample.toLocaleString()}</span>
                    <span className="text-blue-500">Rate floor</span>
                    <span className="font-medium">{livePct}%</span>
                    <span className="text-blue-500">Partner payout</span>
                    <span className="font-medium">KES {livePayout?.toLocaleString()}</span>
                    <span className="text-blue-500">Target margin</span>
                    <span className="font-medium">{Math.round(targetMargin * 100)}%</span>
                    <span className="text-blue-700 font-semibold pt-1 border-t border-blue-100">Credits required</span>
                    <span className="font-bold text-blue-900 pt-1 border-t border-blue-100">{liveCredits} credits</span>
                    <span className="text-blue-500">User pays</span>
                    <span className="font-medium">KES {liveRetail?.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Internal notes (optional)</label>
                <input type="text" placeholder="e.g. Dead-hour sessions only, agreed verbally"
                  value={floorNotes} onChange={e => setFloorNotes(e.target.value)} className={inp} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setFloorGym(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">
                Cancel
              </button>
              <button onClick={saveFloor} disabled={floorSaving || !floorPct}
                className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
                {floorSaving ? 'Saving…' : 'Save & apply to sessions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Counter Modal */}
      {rejectId && rejectNeg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Reject / Counter Offer</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {rejectNeg.gyms?.name} · proposed {rejectNeg.proposed_percentage != null ? `${rejectNeg.proposed_percentage}%` : `KES ${rejectNeg.proposed_floor?.toLocaleString()}`}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason</label>
                <input type="text" placeholder="e.g. Floor too high, target is 50% max"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Counter offer — % (optional)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={100} placeholder="Leave blank to reject"
                    value={counterPct} onChange={e => setCounterPct(e.target.value)} className={inp} />
                  <span className="text-sm text-gray-500 flex-shrink-0">%</span>
                </div>
                {counterPct && (
                  <p className="text-xs text-gray-400 mt-1">
                    Counter: {counterPct}% of session drop-in
                    {' → e.g. KES 1,000 session → '}
                    KES {Math.round(1000 * parseFloat(counterPct) / 100)} payout
                    {' → '}{computeCredits(1000 * parseFloat(counterPct) / 100, targetMargin, creditUnit)} credits
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setRejectId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition">Cancel</button>
              <button onClick={submitReject} disabled={rejectSaving || !rejectReason.trim()}
                className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50">
                {rejectSaving ? 'Sending…' : counterPct ? 'Send counter' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
