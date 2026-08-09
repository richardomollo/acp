"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  pt_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  payment_method: string | null;
  amount_kes: number | null;
  notes: string | null;
  location_type: string | null;
  users: { full_name: string; email: string } | null;
  pt_offerings: { title: string; duration_minutes: number; type: string; is_programme?: boolean } | null;
};

type ProgrammeEnrollment = {
  id: string;
  intro_booking_id: string;
  status: string;
  trainer_intro_confirmed: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  no_show:   "bg-gray-100 text-gray-500 border-gray-200",
};

const DOT_COLORS: Record<string, string> = {
  pending:   "bg-amber-400",
  confirmed: "bg-green-500",
  completed: "bg-blue-400",
  cancelled: "bg-gray-300",
  no_show:   "bg-gray-300",
};

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

export default function BookingsPage() {
  const router = useRouter();
  const [ptId, setPtId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [programmeEnrollments, setProgrammeEnrollments] = useState<ProgrammeEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const today = new Date().toISOString().slice(0, 10);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today);

  useEffect(() => { loadBookings(); }, []);

  async function loadBookings() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: pt } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).maybeSingle();
    if (!pt) { router.push("/partner-login"); return; }

    setPtId(pt.id);

    const { data: enrollments } = await supabase
      .from("pt_programme_enrollments")
      .select("id, intro_booking_id, status, trainer_intro_confirmed")
      .eq("pt_id", pt.id);
    setProgrammeEnrollments((enrollments ?? []) as ProgrammeEnrollment[]);

    const queryWith = (cols: string) =>
      supabase.from("pt_bookings").select(cols).eq("pt_id", pt.id)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

    const fullCols  = "id, pt_id, scheduled_date, scheduled_time, status, payment_method, amount_kes, notes, location_type, users(full_name, email), pt_offerings(title, duration_minutes, type, is_programme)";
    const basicCols = "id, pt_id, scheduled_date, scheduled_time, status, payment_method, amount_kes, notes, location_type, users(full_name, email), pt_offerings(title, duration_minutes, type)";

    const res = await queryWith(fullCols);
    const finalData = res.error ? (await queryWith(basicCols)).data : res.data;
    setBookings((finalData as unknown as Booking[]) ?? []);
    setLoading(false);
  }

  async function markIntroComplete(enrollmentId: string, bookingId: string) {
    setActionLoading(p => ({ ...p, [bookingId]: true }));
    await fetch("/api/pt-programme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: enrollmentId, trainer_intro_confirmed: true, status: "intro_complete" }),
    });
    setProgrammeEnrollments(p => p.map(e =>
      e.id === enrollmentId ? { ...e, trainer_intro_confirmed: true, status: "intro_complete" } : e
    ));
    setActionLoading(p => ({ ...p, [bookingId]: false }));
  }

  async function updateStatus(bookingId: string, newStatus: Booking["status"]) {
    setActionLoading(p => ({ ...p, [bookingId]: true }));
    const { error } = await supabase.from("pt_bookings").update({ status: newStatus }).eq("id", bookingId);
    if (!error) setBookings(p => p.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    setActionLoading(p => ({ ...p, [bookingId]: false }));
  }

  // ── Calendar helpers ─────────────────────────────────────────────────────────

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const offset      = (firstDow + 6) % 7; // Mon=0 … Sun=6

  // Group bookings by date
  const byDate: Record<string, Booking[]> = {};
  for (const b of bookings) {
    (byDate[b.scheduled_date] ??= []).push(b);
  }

  const dayBookings = byDate[selectedDate] ?? [];

  function dateStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-KE", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }

  function formatTime(t: string) {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  }

  function initials(name: string) {
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <p className="text-gray-500 text-sm mt-1">
          {bookings.length} total · {bookings.filter(b => b.status === "confirmed" && b.scheduled_date >= today).length} upcoming
        </p>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-6 items-start">

        {/* ── Calendar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

          {/* Month header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-sm font-semibold text-gray-900">{MONTHS[viewMonth]} {viewYear}</p>
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const ds       = dateStr(day);
              const dayBks   = byDate[ds] ?? [];
              const isToday  = ds === today;
              const isSel    = ds === selectedDate;
              const hasBooks = dayBks.length > 0;
              // Pick most important status for the dot
              const dotStatus = dayBks.find(b => b.status === "confirmed")?.status
                ?? dayBks.find(b => b.status === "pending")?.status
                ?? dayBks[0]?.status;

              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(ds)}
                  className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 text-xs font-medium transition-colors aspect-square
                    ${isSel ? "bg-[#050040] text-white" :
                      isToday ? "bg-[#050040]/8 text-[#050040] font-semibold" :
                      "hover:bg-gray-100 text-gray-700"}`}
                >
                  {day}
                  {hasBooks && (
                    <span className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      isSel ? "bg-white/70" : (DOT_COLORS[dotStatus!] ?? "bg-gray-400")
                    }`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-gray-50 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Completed</span>
          </div>
        </div>

        {/* ── Day panel ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{formatDate(selectedDate)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {dayBookings.length === 0 ? "No sessions" : `${dayBookings.length} session${dayBookings.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            {selectedDate === today && (
              <span className="px-2.5 py-1 bg-[#050040]/8 text-[#050040] text-xs font-semibold rounded-full">Today</span>
            )}
          </div>

          {dayBookings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-400 font-medium">No sessions on this day</p>
              <p className="text-xs text-gray-300 mt-1">Select a highlighted date to see bookings</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayBookings.map(booking => {
                const clientName = booking.users?.full_name ?? "Unknown Client";
                const busy = actionLoading[booking.id] ?? false;
                const programmeEnrollment = booking.pt_offerings?.is_programme
                  ? programmeEnrollments.find(e => e.intro_booking_id === booking.id)
                  : null;

                return (
                  <div key={booking.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0">
                        {initials(clientName)}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{clientName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{booking.users?.email ?? ""}</p>
                          </div>
                          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[booking.status] ?? "bg-gray-100 text-gray-500"}`}>
                            {booking.status.replace("_", " ")}
                          </span>
                        </div>

                        {/* Session info */}
                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                          <span className="text-sm text-gray-900 font-medium">
                            {booking.pt_offerings?.title ?? "Session"}
                          </span>
                          {booking.pt_offerings?.type && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">
                              {booking.pt_offerings.type.split(",")[0].replace("-", " ")}
                            </span>
                          )}
                        </div>

                        {/* Time / duration / payment */}
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-500">
                          {booking.scheduled_time && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatTime(booking.scheduled_time)}
                              {booking.pt_offerings?.duration_minutes ? ` · ${booking.pt_offerings.duration_minutes} min` : ""}
                            </span>
                          )}
                          {(booking.payment_method === "free" || booking.amount_kes) && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              {booking.payment_method === "free"
                                ? "Free intro"
                                : `KES ${Number(booking.amount_kes).toLocaleString()}`}
                            </span>
                          )}
                          {booking.location_type && (
                            <span className="capitalize">{booking.location_type.replace("-", " ")}</span>
                          )}
                        </div>

                        {booking.notes && (
                          <p className="mt-1.5 text-xs text-gray-400 italic">"{booking.notes}"</p>
                        )}

                        {/* Actions */}
                        {booking.status === "pending" && (
                          <div className="mt-3 flex gap-2">
                            <button onClick={() => updateStatus(booking.id, "confirmed")} disabled={busy}
                              className="px-4 py-1.5 bg-green-600 text-white text-xs rounded-full font-medium hover:bg-green-700 transition disabled:opacity-50">
                              {busy ? "…" : "Confirm"}
                            </button>
                            <button onClick={() => updateStatus(booking.id, "cancelled")} disabled={busy}
                              className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 text-xs rounded-full font-medium hover:bg-gray-50 transition disabled:opacity-50">
                              {busy ? "…" : "Decline"}
                            </button>
                          </div>
                        )}
                        {booking.status === "confirmed" && (
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button onClick={() => updateStatus(booking.id, "completed")} disabled={busy}
                              className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded-full font-medium hover:bg-blue-700 transition disabled:opacity-50">
                              {busy ? "…" : "Mark Complete"}
                            </button>
                            <button onClick={() => updateStatus(booking.id, "no_show")} disabled={busy}
                              className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 text-xs rounded-full font-medium hover:bg-gray-50 transition disabled:opacity-50">
                              {busy ? "…" : "No Show"}
                            </button>
                            {programmeEnrollment && !programmeEnrollment.trainer_intro_confirmed && (
                              <button onClick={() => markIntroComplete(programmeEnrollment.id, booking.id)} disabled={busy}
                                className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-full font-medium hover:bg-indigo-700 transition disabled:opacity-50">
                                {busy ? "…" : "Mark intro complete"}
                              </button>
                            )}
                            {programmeEnrollment?.trainer_intro_confirmed && (
                              <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs rounded-full font-medium">
                                Intro confirmed
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
