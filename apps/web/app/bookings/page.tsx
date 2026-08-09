"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import QRCode from "qrcode";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  booking_date: string;
  booking_time: string;
  confirmation_code: string;
  status: string;
  session_id: string;
  deposit_amount?: number;
  session_price?: number;
  refund_status?: string;
  refund_amount?: number;
  cancelled_at?: string;
  cancelled_by?: string;
  reschedule_count?: number;
  sessions?: {
    id: string;
    name: string;
    instructor: string;
    category: string;
    description: string;
    duration_minutes: number;
    gym_id: string;
    date?: string;
    time?: string;
  };
  gym?: { id: string; name: string; location: string };
};

type AvailableSession = {
  id: string;
  name: string;
  date: string;
  time: string;
  spots_left: number;
  duration_minutes: number;
};

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const fmtDateTime = (dt: Date) =>
  dt.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" }) +
  " at " +
  dt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

function sessionStart(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+03:00`);
}

function cancelDeadline(date: string, time: string): Date {
  const start = sessionStart(date, time);
  return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}

function hoursUntil(date: string, time: string): number {
  return (sessionStart(date, time).getTime() - Date.now()) / (1000 * 60 * 60);
}

function statusLabel(status: string): { label: string; classes: string } {
  switch (status) {
    case "confirmed":       return { label: "Confirmed",          classes: "bg-green-50 text-green-700" };
    case "deposit_paid":    return { label: "Deposit paid",       classes: "bg-green-50 text-green-700" };
    case "pending_payment": return { label: "Pending payment",    classes: "bg-yellow-50 text-yellow-700" };
    case "checked_in":
    case "attended":        return { label: "Attended",           classes: "bg-gray-100 text-gray-600" };
    case "no_show":         return { label: "No show",            classes: "bg-red-50 text-red-600" };
    case "rescheduled":     return { label: "Rescheduled",        classes: "bg-blue-50 text-blue-700" };
    case "cancelled_by_customer":
    case "cancelled":       return { label: "Cancelled",          classes: "bg-red-50 text-red-600" };
    case "cancelled_by_partner":
      return { label: "Cancelled by venue", classes: "bg-orange-50 text-orange-700" };
    default:                return { label: status,               classes: "bg-gray-100 text-gray-500" };
  }
}

// ── QR modal ───────────────────────────────────────────────────────────────────

function QRModal({ code, label, onClose }: { code: string; label: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(code, { margin: 2, width: 240, color: { dark: "#111111", light: "#ffffff" } })
      .then(setDataUrl);
  }, [code]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Check-in code</p>
        <p className="text-2xl font-mono font-black text-gray-900 mb-4">{code}</p>
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code for ${code}`} className="mx-auto rounded-xl" width={200} height={200} />
        ) : (
          <div className="w-[200px] h-[200px] mx-auto bg-gray-100 rounded-xl animate-pulse" />
        )}
        <p className="text-xs text-gray-400 mt-4 leading-relaxed truncate">{label}</p>
        <button
          onClick={onClose}
          className="mt-5 w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Cancel modal ───────────────────────────────────────────────────────────────

function CancelModal({
  booking,
  token,
  onClose,
  onCancelled,
}: {
  booking: Booking;
  token: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const date = booking.sessions?.date ?? booking.booking_date;
  const time = booking.sessions?.time ?? booking.booking_time;
  const hours = hoursUntil(date, time);
  const deadline = cancelDeadline(date, time);
  const isRefundable = hours > 24;
  const depositAmount = Number(booking.deposit_amount ?? 0);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to cancel booking.");
        setSubmitting(false);
        return;
      }
      onCancelled();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-900 mb-1">Cancel booking?</h2>
        <p className="text-sm text-gray-500 mb-4">
          {booking.sessions?.name ?? "This session"} · {fmtDate(date)} at {time.slice(0, 5)}
        </p>

        {isRefundable ? (
          <div className="bg-green-50 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-green-800">
              {depositAmount > 0
                ? `You'll receive a full refund of KES ${depositAmount.toLocaleString()}.`
                : "No charge — cancellation is free."}
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Refunds are processed within 3–5 business days via M-Pesa.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-red-800">No refund available.</p>
            <p className="text-xs text-red-700 mt-0.5">
              Free cancellation closed {fmtDateTime(deadline)}. Cancelling now means you forfeit your deposit.
            </p>
          </div>
        )}

        {!isRefundable && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 mb-4">
            Your booking will remain active. If you don't attend, it will be marked as a no-show.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>
        )}

        {isRefundable && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Schedule conflict"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-50 transition-colors"
          >
            Keep booking
          </button>
          {isRefundable && (
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-full hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Cancelling…" : "Confirm cancel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reschedule modal ───────────────────────────────────────────────────────────

function RescheduleModal({
  booking,
  token,
  onClose,
  onRescheduled,
}: {
  booking: Booking;
  token: string;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const [sessions, setSessions] = useState<AvailableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = booking.sessions?.gym_id ?? booking.gym?.id;
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!gymId) { setLoading(false); return; }
    supabase
      .from("sessions")
      .select("id, name, date, time, spots_left, duration_minutes")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .gte("date", today)
      .neq("id", booking.session_id)
      .gt("spots_left", 0)
      .order("date", { ascending: true })
      .limit(20)
      .then(({ data }) => {
        setSessions((data ?? []) as AvailableSession[]);
        setLoading(false);
      });
  }, [gymId]);

  async function handleReschedule() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reschedule-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id, newSessionId: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to reschedule.");
        setSubmitting(false);
        return;
      }
      onRescheduled();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-900 mb-1">Reschedule booking</h2>
        <p className="text-sm text-gray-500 mb-4">Pick a new slot at {booking.gym?.name ?? "the same venue"}.</p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No other available sessions found at this venue.</p>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-2 mb-4">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  selected === s.id
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(s.date)} · {s.time.slice(0, 5)}
                  {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  {" · "}
                  <span className={s.spots_left < 3 ? "text-orange-600 font-medium" : ""}>
                    {s.spots_left} spot{s.spots_left !== 1 ? "s" : ""} left
                  </span>
                </p>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-full hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleReschedule}
            disabled={!selected || submitting}
            className="flex-1 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Rescheduling…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Guest view ─────────────────────────────────────────────────────────────────

function GuestView() {
  const [contact, setContact] = useState("");
  const [step, setStep] = useState<"form" | "results">("form");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Booking[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const q = contact.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lookup-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setResults(data.bookings ?? []);
      setExperiences(data.experiences ?? []);
      setStep("results");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === "results") {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">Bookings lookup</p>
            <h1 className="text-3xl font-black text-gray-900 mb-1">Your bookings</h1>
            <p className="text-gray-400 text-sm mb-4">Results for {contact}</p>
            <button
              onClick={() => { setStep("form"); setContact(""); setResults([]); setExperiences([]); }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              ← Search again
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {results.length === 0 && experiences.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 py-14 text-center max-w-2xl">
              <p className="text-gray-700 font-semibold text-sm mb-1">No bookings found</p>
              <p className="text-gray-400 text-xs">
                No bookings match <strong>{contact}</strong>. Try a different email or phone number,
                or {" "}
                <Link href="/login?redirect=%2Fbookings" className="text-blue-600 hover:underline">sign in</Link>
                {" "} to your account.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-2xl">
              {experiences.map((eb) => {
                const exp = Array.isArray(eb.experiences) ? eb.experiences[0] : eb.experiences;
                const gym = Array.isArray(exp?.gyms) ? exp.gyms[0] : exp?.gyms;
                const { label, classes } = statusLabel(eb.status);
                return (
                  <div key={`exp-${eb.id}`} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Experience</p>
                        <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{exp?.name ?? "Experience"}</p>
                        {gym && (
                          <p className="text-xs text-gray-500 truncate">
                            {gym.name}{gym.location ? `, ${gym.location}` : ""}
                          </p>
                        )}
                        {exp?.date && (
                          <p className="text-xs text-gray-400 mt-1">
                            {fmtDate(exp.date)}{exp.start_time ? ` · ${String(exp.start_time).slice(0, 5)}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Code</p>
                        <p className="text-base font-mono font-black text-gray-900 leading-tight">
                          {eb.confirmation_code}
                        </p>
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${classes}`}>
                          {label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {results.map((b) => {
                const date = b.sessions?.date ?? b.booking_date;
                const time = b.sessions?.time ?? b.booking_time;
                const { label, classes } = statusLabel(b.status);
                return (
                  <div key={b.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                          {b.sessions?.category ?? "Class"}
                          {b.sessions?.instructor ? ` · ${b.sessions.instructor}` : ""}
                        </p>
                        <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{b.sessions?.name ?? "—"}</p>
                        {b.gym && (
                          <p className="text-xs text-gray-500 truncate">
                            {b.gym.name}{b.gym.location ? `, ${b.gym.location}` : ""}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {fmtDate(date)} · {time.slice(0, 5)}
                          {b.sessions?.duration_minutes ? ` · ${b.sessions.duration_minutes} min` : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Code</p>
                        <p className="text-base font-mono font-black text-gray-900 leading-tight">
                          {b.confirmation_code}
                        </p>
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${classes}`}>
                          {label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 mt-2">
                Need to cancel or reschedule?{" "}
                <Link href="/login?redirect=%2Fbookings" className="text-blue-600 hover:underline">
                  Sign in
                </Link>{" "}
                to manage your bookings.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
            My bookings
          </p>
          <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
            Find your booking.
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
            Enter the email address or phone number you used when booking to view your sessions
            and check-in codes.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <form onSubmit={handleLookup} className="max-w-md">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Email or phone number
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. name@email.com or 0712 345 678"
              className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={loading || !contact.trim()}
              className="px-5 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Find"
              )}
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-500 mt-3">{error}</p>
          )}
        </form>

        <div className="mt-10 max-w-md pt-8 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Have an account?{" "}
            <Link href="/login?redirect=%2Fbookings" className="text-blue-600 hover:underline font-medium">
              Sign in
            </Link>{" "}
            to see your full history, cancel or reschedule sessions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Authenticated view ─────────────────────────────────────────────────────────

function AuthView({ user }: { user: any }) {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Booking[]>([]);
  const [previous, setPrevious] = useState<Booking[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [token, setToken] = useState<string | null>(null);
  const [qr, setQr] = useState<{ code: string; label: string } | null>(null);
  const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        fetchBookings(session.access_token);
      } else {
        setLoading(false);
      }
    });
  }, [user.id]);

  const fetchBookings = async (accessToken: string) => {
    const res = await fetch("/api/bookings", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const { upcoming, past, gyms, experiences: exps } = await res.json();
    const gymsMap = new Map((gyms || []).map((g: any) => [g.id, g]));
    const attach = (b: any) => ({ ...b, gym: b.sessions?.gym_id ? gymsMap.get(b.sessions.gym_id) : undefined });
    setCurrent((upcoming || []).map(attach));
    setPrevious((past || []).map(attach));
    setExperiences(exps || []);
    setLoading(false);
  };

  function refreshBookings() {
    if (token) fetchBookings(token);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Loading your bookings…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {qr && <QRModal code={qr.code} label={qr.label} onClose={() => setQr(null)} />}

      {cancelBooking && token && (
        <CancelModal
          booking={cancelBooking}
          token={token}
          onClose={() => setCancelBooking(null)}
          onCancelled={() => { setCancelBooking(null); refreshBookings(); }}
        />
      )}

      {rescheduleBooking && token && (
        <RescheduleModal
          booking={rescheduleBooking}
          token={token}
          onClose={() => setRescheduleBooking(null)}
          onRescheduled={() => { setRescheduleBooking(null); refreshBookings(); }}
        />
      )}

      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 lg:py-14 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
              My bookings · Dashboard
            </p>
            <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-2">
              Your classes.
            </h1>
            <p className="text-gray-400 text-sm">
              {current.length} upcoming{previous.length > 0 ? ` · ${previous.length} past` : ""}
            </p>
          </div>
          <Link
            href="/sessions"
            className="inline-flex items-center px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-700 transition-colors"
          >
            Book a class
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 lg:py-10">
        <div className="flex gap-1 border-b border-gray-100 mb-5 sm:mb-8">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-semibold capitalize transition-colors ${
                tab === t
                  ? "text-gray-900 border-b-2 border-gray-900 -mb-px"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "upcoming" ? `Upcoming (${current.length + experiences.length})` : `Past (${previous.length})`}
            </button>
          ))}
        </div>

        {/* Upcoming tab */}
        {tab === "upcoming" && (
          current.length === 0 && experiences.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 py-16 text-center max-w-2xl">
              <p className="text-gray-400 text-sm mb-5">No upcoming bookings.</p>
              <Link href="/sessions">
                <button className="px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-gray-700 transition-colors">
                  Browse classes
                </button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-2xl">
              {experiences.map((eb) => {
                const exp = Array.isArray(eb.experiences) ? eb.experiences[0] : eb.experiences;
                const gym = Array.isArray(exp?.gyms) ? exp.gyms[0] : exp?.gyms;
                return (
                  <div key={eb.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 hover:shadow-sm transition-shadow duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Experience</p>
                        <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{exp?.name ?? "Experience"}</p>
                        {gym && (
                          <p className="text-xs text-gray-500 truncate">{gym.name}{gym.location ? `, ${gym.location}` : ""}</p>
                        )}
                        {exp?.date && (
                          <p className="text-xs text-gray-400 mt-1">{fmtDate(exp.date)}{exp.start_time ? ` · ${String(exp.start_time).slice(0, 5)}` : ""}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Code</p>
                        <p className="text-base sm:text-lg font-mono font-black text-gray-900 leading-tight">{eb.confirmation_code}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-700">Confirmed</span>
                          <button
                            onClick={() => setQr({ code: eb.confirmation_code, label: exp?.name ?? "Experience" })}
                            className="text-[10px] text-gray-400 hover:text-gray-700 font-semibold transition-colors"
                            title="Show QR code"
                          >
                            QR
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {current.map((b) => {
                const date = b.sessions?.date ?? b.booking_date;
                const time = b.sessions?.time ?? b.booking_time;
                const deadline = cancelDeadline(date, time);
                const isWithinCutoff = hoursUntil(date, time) <= 24;
                const canReschedule = (b.reschedule_count ?? 0) < 1 && !isWithinCutoff;

                return (
                  <div key={b.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 hover:shadow-sm transition-shadow duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                          {b.sessions?.category ?? "Class"}
                          {b.sessions?.instructor ? ` · ${b.sessions.instructor}` : ""}
                        </p>
                        <p className="text-sm font-bold text-gray-900 mb-0.5 truncate">{b.sessions?.name ?? "—"}</p>
                        {b.gym && (
                          <p className="text-xs text-gray-500 truncate">{b.gym.name}{b.gym.location ? `, ${b.gym.location}` : ""}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {fmtDate(date)} · {time.slice(0, 5)}
                          {b.sessions?.duration_minutes ? ` · ${b.sessions.duration_minutes} min` : ""}
                        </p>
                        {!isWithinCutoff && (
                          <p className="text-xs text-green-600 mt-1 font-medium">
                            Free cancellation until {fmtDateTime(deadline)}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Code</p>
                        <p className="text-base sm:text-lg font-mono font-black text-gray-900 leading-tight">{b.confirmation_code}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            b.status === "pending_payment" ? "bg-yellow-50 text-yellow-700" : "bg-green-50 text-green-700"
                          }`}>
                            {b.status === "pending_payment" ? "Pending" : "Confirmed"}
                          </span>
                          <button
                            onClick={() => setQr({ code: b.confirmation_code, label: b.sessions?.name ?? "" })}
                            className="text-[10px] text-gray-400 hover:text-gray-700 font-semibold transition-colors"
                            title="Show QR code"
                          >
                            QR
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 gap-3">
                      <button
                        onClick={() => setCancelBooking(b)}
                        className="text-xs text-red-500 hover:text-red-600 font-semibold transition-colors"
                      >
                        {isWithinCutoff ? "Cancel (no refund)" : "Cancel booking"}
                      </button>
                      {canReschedule && (
                        <button
                          onClick={() => setRescheduleBooking(b)}
                          className="text-xs text-gray-500 hover:text-gray-700 font-semibold transition-colors"
                        >
                          Reschedule
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Past tab */}
        {tab === "past" && (
          previous.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl border border-gray-100 py-16 text-center max-w-2xl">
              <p className="text-gray-400 text-sm">No past bookings yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-w-2xl">
              {previous.map((b) => {
                const { label, classes } = statusLabel(b.status);
                const hasRefund = b.refund_status && b.refund_status !== "none";

                return (
                  <div key={b.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:border-gray-200 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{b.sessions?.name ?? "—"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {b.sessions?.instructor ? `${b.sessions.instructor} · ` : ""}
                          {b.gym?.name ? `${b.gym.name} · ` : ""}
                          {fmtDate(b.booking_date)} · {b.booking_time.slice(0, 5)}
                        </p>
                        {hasRefund && (
                          <p className={`text-xs mt-1 font-medium ${
                            b.refund_status === "completed"
                              ? "text-green-600"
                              : b.refund_status === "failed"
                              ? "text-red-500"
                              : "text-blue-600"
                          }`}>
                            Refund {b.refund_status === "pending" ? "in progress" : b.refund_status}
                            {b.refund_amount ? ` · KES ${Number(b.refund_amount).toLocaleString()}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 ml-2 flex-shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${classes}`}>
                          {label}
                        </span>
                        <p className="text-xs text-gray-400 font-mono">{b.confirmation_code}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );

  return user ? <AuthView user={user} /> : <GuestView />;
}
