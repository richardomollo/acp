"use client";

import { useState } from "react";
import Link from "next/link";
import CommunityDescription from "./CommunityDescription";

type EventRow = {
  id: string; slug: string | null; title: string; date: string; start_time: string;
  location: string; event_type: string; price_kes: number | null; image_url: string | null;
  activity_type: string | null;
};
type ChallengeRow = { id: string; title: string; metric: string; target_value: number; period_end: string };
type MemberRow = { user_id: string; name: string | null; avatar_url: string | null };

const METRIC_UNIT: Record<string, string> = { distance_km: "km", activity_count: "activities", days_active: "days" };

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (t: string) => t.slice(0, 5);

type Tab = "events" | "about";

export default function CommunityTabs({
  communitySlugOrId,
  categoryLabel,
  events,
  challenges,
  members,
  description,
  location,
}: {
  communitySlugOrId: string;
  categoryLabel: string;
  events: EventRow[];
  challenges: ChallengeRow[];
  members: MemberRow[];
  description: string | null;
  location: string | null;
}) {
  const [tab, setTab] = useState<Tab>("events");

  const tabs: { id: Tab; label: string }[] = [
    { id: "events", label: "Events & Challenges" },
    { id: "about", label: "About the community" },
  ];

  return (
    <div className="mt-8">
      {/* ── Tab bar ── */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id ? "border-black text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Events & Challenges ── */}
      {tab === "events" && (
        <div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Upcoming events</h2>
            {events.length === 0 ? (
              <p className="text-gray-500 py-8 text-center text-sm">No events scheduled yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {events.map((e) => (
                  <Link
                    key={e.id}
                    href={`/community/${communitySlugOrId}/event/${e.slug ?? e.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    {e.image_url ? (
                      <img src={e.image_url} alt={e.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-emerald-900 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 capitalize">
                        {(e.activity_type ?? categoryLabel).toString().replace("_", " ")}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price</p>
                      <p className="text-sm font-bold text-gray-900">{e.price_kes ? `KES ${Number(e.price_kes).toLocaleString()}` : "Free"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {challenges.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold mb-4">Challenges</h2>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                {challenges.map((c) => (
                  <Link
                    key={c.id}
                    href={`/community/${communitySlugOrId}/challenge/${c.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Target {c.target_value} {METRIC_UNIT[c.metric] ?? c.metric} · ends {new Date(`${c.period_end}T00:00:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── About the community ── */}
      {tab === "about" && (
        <div>
          {description && <CommunityDescription text={description} />}

          {members.length > 0 && (
            <div className={description ? "mt-12" : ""}>
              <h2 className="text-xl font-semibold mb-4">Members</h2>
              <div className="flex flex-wrap gap-4">
                {members.slice(0, 24).map((m) => (
                  <div key={m.user_id} className="flex flex-col items-center w-16">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name ?? "Member"} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-sm font-bold">
                        {(m.name ?? "M")[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-500 mt-1 text-center truncate w-full">{m.name ?? "Member"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {location && (
            <div className="mt-8 pt-6 border-t border-gray-100 space-y-2 text-sm text-gray-600">
              <p>📍 {location}</p>
            </div>
          )}

          {!description && members.length === 0 && !location && (
            <p className="text-gray-500 py-8 text-center text-sm">Nothing to show yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
