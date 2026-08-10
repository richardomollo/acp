"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { StravaConnectCard } from "@/app/components/strava/StravaConnectCard";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Trainer = { id: string; full_name: string; gymName: string };
type SessionRow = {
  id: string; name: string; date: string; time: string; duration_minutes: number;
  category: string; max_capacity: number;
};
type Booking = {
  id: string; checked_in?: boolean; no_show?: boolean; status?: string;
  guest_email?: string | null;
  users?: { name: string; email: string; phone: string } | null;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const todayStr = () => new Date().toISOString().split("T")[0];

export default function TrainerDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [roster, setRoster] = useState<Booking[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      router.push("/partner-login?redirect=/trainer-dashboard");
      return;
    }

    const { data: trainerRow } = await supabase
      .from("gym_trainers")
      .select("id, full_name, status, gyms(name)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!trainerRow || trainerRow.status !== "active") {
      await supabase.auth.signOut();
      router.push("/partner-login");
      return;
    }

    setTrainer({ id: trainerRow.id, full_name: trainerRow.full_name, gymName: (trainerRow as any).gyms?.name ?? "Your gym" });

    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("id, name, date, time, duration_minutes, category, max_capacity")
      .eq("instructor_id", trainerRow.id)
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    setSessions(sessionRows ?? []);
    setLoading(false);
  }

  async function selectSession(id: string) {
    setSelectedSession(id);
    setRosterLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select("id, checked_in, no_show, status, guest_email, users(name, email, phone)")
      .eq("session_id", id);
    setRoster((data as any) ?? []);
    setRosterLoading(false);
  }

  async function toggleCheckIn(booking: Booking) {
    const next = !booking.checked_in;
    setRoster(prev => prev.map(b => b.id === booking.id ? { ...b, checked_in: next } : b));
    await supabase.from("bookings").update({ checked_in: next }).eq("id", booking.id);
  }

  async function toggleNoShow(booking: Booking) {
    const next = !booking.no_show;
    setRoster(prev => prev.map(b => b.id === booking.id ? { ...b, no_show: next } : b));
    await supabase.from("bookings").update({ no_show: next }).eq("id", booking.id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  const upcoming = sessions.filter(s => s.date >= todayStr());
  const past = sessions.filter(s => s.date < todayStr());
  const selected = sessions.find(s => s.id === selectedSession) ?? null;

  return (
    <div>
      <div className="px-6 py-6 border-b border-gray-100 bg-white">
        <h1 className="text-xl font-bold text-gray-900">Hi, {trainer?.full_name.split(" ")[0]}</h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Your classes</h2>

          {sessions.length === 0 && (
            <p className="text-sm text-gray-500">No classes assigned to you yet — check back once your gym schedules one.</p>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-2 mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upcoming</p>
              {upcoming.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`w-full text-left bg-white rounded-xl p-4 border-2 transition ${
                    selectedSession === s.id ? "border-gray-900" : "border-gray-100 hover:border-gray-300"
                  }`}
                >
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtDate(s.date)} · {s.time} · {s.duration_minutes} mins · {s.category}</p>
                </button>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Past</p>
              {past.map(s => (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`w-full text-left bg-white rounded-xl p-4 border-2 transition opacity-70 ${
                    selectedSession === s.id ? "border-gray-900" : "border-gray-100 hover:border-gray-300"
                  }`}
                >
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtDate(s.date)} · {s.time}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">
            {selected ? `Students — ${selected.name}` : "Select a class"}
          </h2>

          {!selected && (
            <p className="text-sm text-gray-500">Pick a class on the left to see who's booked in.</p>
          )}

          {selected && rosterLoading && (
            <p className="text-sm text-gray-400">Loading…</p>
          )}

          {selected && !rosterLoading && roster.length === 0 && (
            <p className="text-sm text-gray-500">No one has booked this class yet.</p>
          )}

          {selected && !rosterLoading && roster.length > 0 && (
            <div className="space-y-2">
              {roster.map(b => (
                <div key={b.id} className="bg-white rounded-xl p-4 border border-gray-100 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{b.users?.name ?? b.guest_email?.split("@")[0] ?? "Guest"}</p>
                    <p className="text-xs text-gray-500">{b.users?.email ?? b.guest_email}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleCheckIn(b)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition ${
                        b.checked_in ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {b.checked_in ? "Checked in" : "Check in"}
                    </button>
                    <button
                      onClick={() => toggleNoShow(b)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition ${
                        b.no_show ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {b.no_show ? "No-show" : "Mark no-show"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pb-8">
        <StravaConnectCard returnTo="/trainer-dashboard" />
      </div>
    </div>
  );
}
