"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const METRICS = [
  { key: "distance_km", label: "Distance (km)" },
  { key: "activity_count", label: "Activity count" },
  { key: "days_active", label: "Days active" },
] as const;

const ACTIVITY_TYPES = ["run", "walk", "cycle"] as const;

// Maps a community's own activity category to a sensible default set of
// challenge activity types, so e.g. a cycling club's challenge doesn't
// default to counting runs — organisers can still change it.
const CATEGORY_DEFAULT_ACTIVITY_TYPES: Record<string, string[]> = {
  running: ["run"], walking: ["walk"], cycling: ["cycle"], hiking: ["walk"],
};

interface ChallengeRow {
  id: string; title: string; description: string | null;
  metric: typeof METRICS[number]["key"]; target_value: number;
  activity_types: string[]; period_start: string; period_end: string;
}
interface LeaderboardRow { user_id: string; name: string | null; avatar_url: string | null; metric_value: number; rank: number }

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

export default function CommunityDashboardChallengesPage() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [defaultActivityTypes, setDefaultActivityTypes] = useState<string[]>(["run"]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<typeof METRICS[number]["key"]>("distance_km");
  const [targetValue, setTargetValue] = useState("");
  const [activityTypes, setActivityTypes] = useState<string[]>(["run"]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardRow[]>>({});
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: membership } = await supabase
      .from("community_members").select("community_id")
      .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const cid = membership?.community_id ?? null;
    setCommunityId(cid);
    if (!cid) { setLoading(false); return; }

    const { data: communityRow } = await supabase.from("communities").select("category").eq("id", cid).single();
    const defaults = communityRow?.category ? (CATEGORY_DEFAULT_ACTIVITY_TYPES[communityRow.category] ?? ["run"]) : ["run"];
    setDefaultActivityTypes(defaults);
    setActivityTypes(defaults);

    const { data: rows } = await supabase
      .from("challenges")
      .select("id, title, description, metric, target_value, activity_types, period_start, period_end")
      .eq("community_id", cid)
      .order("period_start", { ascending: false });
    setChallenges((rows as ChallengeRow[]) ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const toggleActivityType = (a: string) => {
    setActivityTypes((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle(""); setDescription(""); setTargetValue(""); setActivityTypes(defaultActivityTypes);
    setMetric("distance_km"); setPeriodStart(""); setPeriodEnd(""); setShowForm(false); setError("");
  };

  const startEdit = (c: ChallengeRow) => {
    setEditingId(c.id);
    setTitle(c.title);
    setDescription(c.description ?? "");
    setMetric(c.metric);
    setTargetValue(String(c.target_value));
    setActivityTypes(c.activity_types);
    setPeriodStart(c.period_start);
    setPeriodEnd(c.period_end);
    setShowForm(true);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    if (!communityId) return;
    if (!title.trim()) { setError("Give the challenge a title."); return; }
    if (!targetValue || Number(targetValue) <= 0) { setError("Set a target value."); return; }
    if (activityTypes.length === 0) { setError("Select at least one activity type."); return; }
    if (!periodStart || !periodEnd) { setError("Set a start and end date."); return; }

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      metric,
      target_value: Number(targetValue),
      activity_types: activityTypes,
      period_start: periodStart,
      period_end: periodEnd,
    };
    const { error: saveErr } = editingId
      ? await supabase.from("challenges").update(payload).eq("id", editingId)
      : await supabase.from("challenges").insert({ ...payload, community_id: communityId });
    setSaving(false);
    if (saveErr) { setError(saveErr.message); return; }

    resetForm();
    load();
  };

  const toggleExpand = async (challengeId: string) => {
    if (expandedId === challengeId) { setExpandedId(null); return; }
    setExpandedId(challengeId);
    if (!leaderboards[challengeId]) {
      setLeaderboardLoading(true);
      const { data } = await supabase.rpc("get_challenge_leaderboard", { p_challenge_id: challengeId });
      setLeaderboards((prev) => ({ ...prev, [challengeId]: (data as LeaderboardRow[]) ?? [] }));
      setLeaderboardLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Challenges</h1>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition"
        >
          {showForm ? "Cancel" : "+ Create Challenge"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. August Distance Challenge"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="What are members competing for?"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Metric</label>
            <div className="flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button key={m.key} onClick={() => setMetric(m.key)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${metric === m.key ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target value</label>
            <input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="50"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Activity types</label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((a) => (
                <button key={a} onClick={() => toggleActivityType(a)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border capitalize transition ${activityTypes.includes(a) ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start date</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End date</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60">
            {saving ? "Saving…" : editingId ? "Save Changes" : "Create Challenge"}
          </button>
        </div>
      )}

      {challenges.length === 0 && !showForm && (
        <p className="text-sm text-gray-400">No challenges yet — create one to get members competing.</p>
      )}

      <div className="space-y-3">
        {challenges.map((c) => {
          const unit = c.metric === "distance_km" ? "km" : c.metric === "days_active" ? "days" : "activities";
          const expanded = expandedId === c.id;
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => toggleExpand(c.id)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Target {c.target_value} {unit} · {fmtDate(c.period_start)} – {fmtDate(c.period_end)}
                    </p>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button onClick={() => startEdit(c)} className="text-xs text-gray-400 hover:text-black transition flex-shrink-0">
                  Edit
                </button>
              </div>
              {expanded && (
                <div className="border-t border-gray-100 p-4">
                  {leaderboardLoading && !leaderboards[c.id] ? (
                    <p className="text-xs text-gray-400">Loading…</p>
                  ) : (leaderboards[c.id]?.length ?? 0) === 0 ? (
                    <p className="text-xs text-gray-400">No activity logged yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {leaderboards[c.id].map((row) => (
                        <div key={row.user_id} className="flex items-center gap-2.5">
                          <span className="text-xs font-bold text-gray-400 w-6">#{row.rank}</span>
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt={row.name ?? "Member"} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                              {(row.name ?? "M")[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="flex-1 text-sm font-medium text-gray-900 truncate">{row.name ?? "Member"}</span>
                          <span className="text-xs font-bold text-gray-600">
                            {c.metric === "distance_km" ? Number(row.metric_value).toFixed(1) : row.metric_value} {unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
