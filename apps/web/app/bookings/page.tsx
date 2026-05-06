"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  booking_date: string;
  booking_time: string;
  confirmation_code: string;
  status: string;
  credits_used: number;
  session_id: string;
  sessions?: {
    id: string;
    name: string;
    instructor: string;
    category: string;
    description: string;
    duration_minutes: number;
    gym_id: string;
  };
  gym?: { name: string; location: string };
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default function BookingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Booking[]>([]);
  const [previous, setPrevious] = useState<Booking[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      await fetchBookings(user.id);
      setLoading(false);
    };
    init();
  }, [router]);

  const fetchBookings = async (userId: string) => {
    const today = new Date().toISOString().split("T")[0];

    const [currentRes, previousRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("*, sessions(id, name, instructor, category, description, duration_minutes, gym_id)")
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .gte("booking_date", today)
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true }),
      supabase
        .from("bookings")
        .select("*, sessions(id, name, instructor, category, description, duration_minutes, gym_id)")
        .eq("user_id", userId)
        .or(`booking_date.lt.${today},status.eq.cancelled`)
        .order("booking_date", { ascending: false })
        .limit(20),
    ]);

    const allBookings = [...(currentRes.data || []), ...(previousRes.data || [])];
    const gymIds = [...new Set(allBookings.map((b) => b.sessions?.gym_id).filter(Boolean))];

    const { data: gyms } = gymIds.length
      ? await supabase.from("gyms").select("id, name, location").in("id", gymIds)
      : { data: [] };

    const gymsMap = new Map((gyms || []).map((g) => [g.id, g]));

    const attach = (b: any) => ({ ...b, gym: b.sessions?.gym_id ? gymsMap.get(b.sessions.gym_id) : undefined });
    setCurrent((currentRes.data || []).map(attach));
    setPrevious((previousRes.data || []).map(attach));
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm("Cancel this booking? Your credits will be returned.")) return;
    setCancelling(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", bookingId);
    setCancelling(null);
    if (error) { alert("Failed to cancel booking"); return; }
    if (user) await fetchBookings(user.id);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Loading…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 md:px-16 lg:px-24 xl:px-32 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">My Bookings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {current.length} upcoming · {previous.length} past
            </p>
          </div>
          <Link href="/sessions">
            <button className="text-sm font-semibold bg-gray-900 text-white px-5 py-2.5 rounded-full hover:bg-gray-700 transition">
              Book a class
            </button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "upcoming" ? `Upcoming (${current.length})` : `Past (${previous.length})`}
            </button>
          ))}
        </div>

        {/* Upcoming */}
        {tab === "upcoming" && (
          current.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
              <p className="text-gray-400 text-sm mb-3">No upcoming bookings.</p>
              <Link href="/sessions" className="text-sm text-blue-600 font-medium hover:underline">
                Browse classes →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-3xl">
              {current.map((b) => (
                <div key={b.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 uppercase tracking-wide capitalize mb-0.5">
                        {b.sessions?.category}
                        {b.sessions?.instructor ? ` · ${b.sessions.instructor}` : ""}
                      </p>
                      <p className="text-sm font-bold text-gray-900 mb-0.5">{b.sessions?.name ?? "—"}</p>
                      {b.gym && (
                        <p className="text-sm text-gray-500">{b.gym.name}{b.gym.location ? `, ${b.gym.location}` : ""}</p>
                      )}
                      <p className="text-sm text-gray-400 mt-1">
                        {fmtDate(b.booking_date)} · {b.booking_time.slice(0, 5)}
                        {b.sessions?.duration_minutes ? ` · ${b.sessions.duration_minutes} min` : ""}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400 mb-0.5">Check-in code</p>
                      <p className="text-lg font-mono font-bold text-gray-900">{b.confirmation_code}</p>
                      <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">
                        Confirmed
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400">{b.credits_used} credit{b.credits_used !== 1 ? "s" : ""} used</p>
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={cancelling === b.id}
                      className="text-xs text-red-500 hover:text-red-600 font-medium transition disabled:opacity-50"
                    >
                      {cancelling === b.id ? "Cancelling…" : "Cancel booking"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Past */}
        {tab === "past" && (
          previous.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center">
              <p className="text-gray-400 text-sm">No past bookings yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-w-3xl">
              <div className="divide-y divide-gray-100">
                {previous.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.sessions?.name ?? "—"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {b.sessions?.instructor && `${b.sessions.instructor} · `}
                        {b.gym?.name && `${b.gym.name} · `}
                        {fmtDate(b.booking_date)} · {b.booking_time.slice(0, 5)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-4 flex-shrink-0">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        b.status === "cancelled"
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {b.status}
                      </span>
                      <p className="text-xs text-gray-400 font-mono">{b.confirmation_code}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

      </div>
    </div>
  );
}
