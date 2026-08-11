"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EventRow {
  id: string; title: string; event_type: string; date: string; start_time: string;
  location: string; capacity: number | null; status: string; image_url: string | null;
}

const TYPE_LABEL: Record<string, string> = { free: "Free", paid: "Paid", partner_session: "Partner Session", external: "External" };

export default function CommunityDashboardEventsPage() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

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

    const { data: eventRows } = await supabase
      .from("community_events")
      .select("id, title, event_type, date, start_time, location, capacity, status, image_url")
      .eq("community_id", cid)
      .order("date", { ascending: true });
    setEvents((eventRows as EventRow[]) ?? []);

    const ids = (eventRows ?? []).map((e) => e.id);
    if (ids.length > 0) {
      const { data: attendeeRows } = await supabase
        .from("community_event_attendees").select("event_id").in("event_id", ids).eq("status", "going");
      const counts: Record<string, number> = {};
      for (const r of attendeeRows ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      setAttendeeCounts(counts);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const cancelEvent = async (event: EventRow) => {
    if (!confirm(`Cancel "${event.title}"?`)) return;
    await supabase.from("community_events").update({ status: "cancelled" }).eq("id", event.id);
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, status: "cancelled" } : e)));
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= todayStr && e.status === "active");
  const past = events.filter((e) => e.date < todayStr || e.status === "cancelled");

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <Link href="/community-dashboard/events/create" className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition">
          + Create Event
        </Link>
      </div>

      {events.length === 0 && <p className="text-sm text-gray-400">No events yet — create your first one.</p>}

      {upcoming.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-3 mb-8">
            {upcoming.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                <Link href={`/community-dashboard/events/create?id=${e.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  {e.image_url ? (
                    <img src={e.image_url} alt={e.title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })} · {e.start_time.slice(0, 5)} · {e.location}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">{TYPE_LABEL[e.event_type] ?? e.event_type}</span>
                      <span className="text-xs text-gray-500">{attendeeCounts[e.id] ?? 0}{e.capacity ? `/${e.capacity}` : ""} going</span>
                    </div>
                  </div>
                </Link>
                <button onClick={() => cancelEvent(e)} className="text-xs text-gray-400 hover:text-red-600 transition flex-shrink-0">Cancel</button>
              </div>
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Past / Cancelled</h2>
          <div className="space-y-3">
            {past.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4 opacity-60">
                <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })} · {e.start_time.slice(0, 5)} · {e.location}
                  {e.status === "cancelled" ? " · Cancelled" : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
