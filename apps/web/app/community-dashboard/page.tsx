"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface EventRow {
  id: string; title: string; date: string; start_time: string; location: string;
}

export default function CommunityDashboardOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [communityName, setCommunityName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);

  const dateLabel = new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }

      const { data: membership } = await supabase
        .from("community_members").select("community_id, communities(name, member_count)")
        .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const cid = membership?.community_id;
      if (!cid) { router.push("/partner-login"); return; }
      const community = membership?.communities as any;
      setCommunityName(community?.name ?? "");
      setMemberCount(community?.member_count ?? 0);

      const { count: pending } = await supabase
        .from("community_members").select("id", { count: "exact", head: true })
        .eq("community_id", cid).eq("status", "pending");
      setPendingCount(pending ?? 0);

      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: events } = await supabase
        .from("community_events")
        .select("id, title, date, start_time, location")
        .eq("community_id", cid).eq("status", "active").gte("date", todayStr)
        .order("date", { ascending: true }).limit(5);
      setUpcoming((events as EventRow[]) ?? []);

      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <p className="text-sm text-gray-400 mb-1">{dateLabel}</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{communityName}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs text-gray-400 mb-1">Members</p>
          <p className="text-2xl font-bold text-gray-900">{memberCount}</p>
        </div>
        <Link href="/community-dashboard/members" className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <p className="text-xs text-gray-400 mb-1">Pending requests</p>
          <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
        </Link>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs text-gray-400 mb-1">Upcoming events</p>
          <p className="text-2xl font-bold text-gray-900">{upcoming.length}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Upcoming events</h2>
        <Link href="/community-dashboard/events/create" className="text-sm font-semibold text-black hover:underline">
          + Create event
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-gray-400">No upcoming events yet.</p>
      ) : (
        <div className="space-y-3">
          {upcoming.map((e) => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })} · {e.start_time.slice(0, 5)} · {e.location}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
