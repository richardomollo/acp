"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const METRIC_UNIT: Record<string, string> = { distance_km: "km", activity_count: "activities", days_active: "days" };
const STRAVA_ORANGE = "#FC4C02";

interface ChallengeRow {
  id: string; title: string; description: string | null;
  metric: "distance_km" | "activity_count" | "days_active";
  target_value: number; activity_types: string[];
  period_start: string; period_end: string;
}
interface ActivityRow { activity_type: string; start_time: string; distance_meters: number | null }
interface LeaderboardRow { user_id: string; name: string | null; avatar_url: string | null; metric_value: number; rank: number }

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

export default function CommunityChallengeDetailPage({ params }: { params: Promise<{ slug: string; challengeId: string }> }) {
  const { slug, challengeId } = use(params);

  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [myValue, setMyValue] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setUserId(uid);

      const { data: c } = await supabase
        .from("challenges")
        .select("id, title, description, metric, target_value, activity_types, period_start, period_end")
        .eq("id", challengeId).single();
      setChallenge(c as ChallengeRow);

      if (uid && c) {
        const { data: activityRows } = await supabase
          .from("activities").select("activity_type, start_time, distance_meters")
          .eq("user_id", uid).order("start_time", { ascending: false }).limit(500);
        const inWindow = ((activityRows as ActivityRow[]) ?? []).filter(a =>
          c.activity_types.includes(a.activity_type) &&
          a.start_time.slice(0, 10) >= c.period_start &&
          a.start_time.slice(0, 10) <= c.period_end,
        );
        let value = 0;
        if (c.metric === "distance_km") value = inWindow.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0) / 1000;
        else if (c.metric === "activity_count") value = inWindow.length;
        else if (c.metric === "days_active") value = new Set(inWindow.map(a => a.start_time.slice(0, 10))).size;
        setMyValue(value);
      }

      const { data: lb, error: lbErr } = await supabase.rpc("get_challenge_leaderboard", { p_challenge_id: challengeId });
      if (lbErr) { setLeaderboardError(lbErr.message); setLeaderboard([]); }
      else { setLeaderboardError(null); setLeaderboard((lb as LeaderboardRow[]) ?? []); }

      setLoading(false);
    })();
  }, [challengeId]);

  if (loading) return <div className="p-8 text-sm text-gray-400 max-w-2xl mx-auto">Loading…</div>;
  if (!challenge) return <div className="p-8 text-sm text-gray-400 max-w-2xl mx-auto">Challenge not found.</div>;

  const unit = METRIC_UNIT[challenge.metric] ?? challenge.metric;
  const pct = Math.min(100, Math.round((myValue / challenge.target_value) * 100));
  const displayValue = challenge.metric === "distance_km" ? myValue.toFixed(1) : myValue;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href={`/community/${slug}`} className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to community
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{challenge.title}</h1>
      <p className="text-sm text-gray-400 mb-6">{fmtDate(challenge.period_start)} – {fmtDate(challenge.period_end)}</p>

      {challenge.description && <p className="text-sm text-gray-600 leading-relaxed mb-8">{challenge.description}</p>}

      {userId ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-8">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Your progress</p>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: STRAVA_ORANGE }} />
          </div>
          <p className="text-sm font-bold text-gray-700">{displayValue} / {challenge.target_value} {unit}</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-5 mb-8 text-sm text-gray-500">
          <Link href={`/login?redirect=${encodeURIComponent(`/community/${slug}/challenge/${challengeId}`)}`} className="underline hover:text-black">
            Sign in
          </Link>{" "}
          to see your progress.
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Leaderboard</h2>
      {leaderboardError ? (
        <p className="text-sm text-gray-400">Join this community to see the leaderboard.</p>
      ) : leaderboard.length === 0 ? (
        <p className="text-sm text-gray-400">No activity logged yet — be the first!</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((row) => (
            <div
              key={row.user_id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${row.user_id === userId ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-white"}`}
            >
              <span className="text-xs font-bold text-gray-400 w-6">#{row.rank}</span>
              {row.avatar_url ? (
                <img src={row.avatar_url} alt={row.name ?? "Member"} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {(row.name ?? "M")[0]?.toUpperCase()}
                </div>
              )}
              <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                {row.name ?? "Member"}{row.user_id === userId ? " (you)" : ""}
              </span>
              <span className="text-sm font-bold text-gray-700">
                {challenge.metric === "distance_km" ? Number(row.metric_value).toFixed(1) : row.metric_value} {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
