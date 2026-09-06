"use client";

// LANA PRO — Phase 4.3: Booking detail.
//   /lana-pro/bookings/appointment/<pt_bookings.id>
//   /lana-pro/bookings/class/<sessions.id>
// Only real evidence is shown. Actions reuse existing update paths (§16).

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import {
  normalisePtBooking,
  normaliseSessionBookings,
  normaliseGymServiceBooking,
  statusLabel,
  paymentLabel,
  type LanaBooking,
  type PtBookingRow,
  type SessionBookingRow,
  type GymServiceBookingRow,
} from "@/lib/lana-pro-bookings/booking-model";
import { rollUpClasses } from "@/lib/lana-pro-bookings/booking-buckets";

const PT_COLS =
  "id, pt_id, user_id, offering_id, scheduled_date, scheduled_time, status, payment_status, payment_method, amount_kes, location_type, checked_in, guest_name, users(id, full_name, email), pt_offerings(id, title, duration_minutes, is_programme, gym_id)";
const SESSION_COLS =
  "id, user_id, session_id, gym_id, booking_date, booking_time, status, checked_in, no_show, session_price, deposit_paid_at, remainder_collected, refund_status, guest_name, users(id, name, email), sessions(id, name, date, time, duration_minutes, max_capacity, instructor)";
const GYM_SVC_COLS =
  "id, gym_id, gym_service_id, gym_trainer_id, client_user_id, starts_at, duration_minutes, status, payment_status, price_kes, users(id, name, email), gym_services(id, name, duration_minutes), gym_trainers(id, full_name), gyms(id, name)";

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  const { source, id } = use(params);
  if (source === "class") return <ClassDetail sessionId={id} />;
  if (source === "venue") return <VenueDetail bookingId={id} />;
  return <ApptDetail bookingId={id} />;
}

// ── venue team-delivered appointment (Phase 4.6) ────────────────────────

function VenueDetail({ bookingId }: { bookingId: string }) {
  const [b, setB] = useState<LanaBooking | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("gym_service_bookings").select(GYM_SVC_COLS).eq("id", bookingId).maybeSingle();
    if (!data) {
      setB(null);
      return;
    }
    setB(normaliseGymServiceBooking(data as GymServiceBookingRow));
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (next: "completed" | "no_show" | "cancelled") => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("gym_service_bookings").update({ status: next }).eq("id", bookingId);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    load();
  };

  if (b === undefined) return <Shell>Loading…</Shell>;
  if (b === null) return <Shell>Booking not found.</Shell>;

  const canStart = b.status === "confirmed" || b.status === "pending";
  const canCancel = b.status === "pending" || b.status === "confirmed";

  return (
    <Shell>
      <Back />
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{b.serviceName || b.title}</h1>
      {err && <p className="text-sm text-red-500 mt-2">{err}</p>}

      <dl className="mt-6 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        <Row k="Status" v={statusLabel(b.status)} />
        <Row k="Client" v={b.clientName || "Client"} />
        <Row k="Professional" v={b.professionalName || "Unassigned"} />
        <Row k="Venue" v={b.venueName || "Your venue"} />
        <Row k="Service" v={`${b.serviceName || b.title}${b.endAt ? ` · ${Math.round((Date.parse(b.endAt + "Z") - Date.parse(b.startAt + "Z")) / 60000)} min` : ""}`} />
        <Row k="When" v={fmtWhen(b)} />
        <Row
          k="Payment"
          v={b.amount ? `KES ${Math.round(b.amount).toLocaleString("en-KE")} · ${paymentLabel(b.paymentDisplay)}` : paymentLabel(b.paymentDisplay)}
        />
      </dl>

      <div className="mt-7 flex flex-wrap gap-3">
        {canStart && (
          <Link href={`/lana-pro/bookings/venue/${bookingId}/session`} className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5">
            Prepare for session →
          </Link>
        )}
        {b.status === "confirmed" && (
          <button onClick={() => setStatus("completed")} disabled={busy} className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Mark complete
          </button>
        )}
        {b.status === "confirmed" && (
          <button onClick={() => setStatus("no_show")} disabled={busy} className="rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Mark no-show
          </button>
        )}
        {canCancel && (
          <button onClick={() => setStatus("cancelled")} disabled={busy} className="rounded-xl border border-gray-200 text-red-500 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Cancel booking
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3 max-w-md">
        Revenue for this appointment belongs to the venue. Cancelling keeps it in history; no refund is processed here.
      </p>
    </Shell>
  );
}

function fmtWhen(b: LanaBooking) {
  const d = b.startAt.slice(0, 10);
  const t1 = b.startAt.slice(11, 16);
  const t2 = b.endAt?.slice(11, 16);
  const today = new Date().toISOString().slice(0, 10);
  const dayLabel = d === today ? "Today" : new Date(d + "T00:00:00Z").toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });
  return `${dayLabel} · ${t1}${t2 ? `–${t2}` : ""}`;
}

// ── appointment ─────────────────────────────────────────────────────────

function ApptDetail({ bookingId }: { bookingId: string }) {
  const [b, setB] = useState<LanaBooking | null | undefined>(undefined);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("pt_bookings").select(PT_COLS).eq("id", bookingId).maybeSingle();
    if (!data) {
      setB(null);
      return;
    }
    const norm = normalisePtBooking(data as PtBookingRow);
    setB(norm);
    if (norm?.venueId) {
      const { data: g } = await supabase.from("gyms").select("name").eq("id", norm.venueId).maybeSingle();
      setVenueName(g?.name ?? null);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (next: "completed" | "no_show" | "cancelled") => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("pt_bookings").update({ status: next }).eq("id", bookingId);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    load();
  };

  if (b === undefined) return <Shell>Loading…</Shell>;
  if (b === null) return <Shell>Booking not found.</Shell>;

  const canStart = b.status === "confirmed" || b.status === "pending";
  const canComplete = b.status === "confirmed";
  const canCancel = b.status === "pending" || b.status === "confirmed";

  return (
    <Shell>
      <Back />
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{b.serviceName || b.title}</h1>
      {err && <p className="text-sm text-red-500 mt-2">{err}</p>}

      <dl className="mt-6 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
        <Row k="Status" v={statusLabel(b.status)} />
        <Row
          k="Client"
          v={b.clientName || "Client"}
          extra={b.clientId ? <Link href={`/lana-pro/clients/${b.clientId}`} className="text-xs font-semibold text-[#050040] hover:underline">View client</Link> : undefined}
        />
        <Row k="Service" v={`${b.serviceName || b.title}${b.endAt ? ` · ${Math.round((Date.parse(b.endAt + "Z") - Date.parse(b.startAt + "Z")) / 60000)} min` : ""}`} />
        <Row k="When" v={fmtWhen(b)} />
        <Row k="Where" v={b.venueId ? venueName || "At your venue" : b.rawStatus && b.title ? "Online / as arranged" : "As arranged"} />
        <Row
          k="Payment"
          v={b.amount ? `KES ${Math.round(b.amount).toLocaleString("en-KE")} · ${paymentLabel(b.paymentDisplay)}` : paymentLabel(b.paymentDisplay)}
        />
      </dl>

      <div className="mt-7 flex flex-wrap gap-3">
        {canStart && (
          <Link
            href={`/lana-pro/bookings/appointment/${bookingId}/session`}
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5"
          >
            Prepare for session →
          </Link>
        )}
        {canComplete && (
          <button onClick={() => setStatus("completed")} disabled={busy} className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Mark complete
          </button>
        )}
        {b.status === "confirmed" && (
          <button onClick={() => setStatus("no_show")} disabled={busy} className="rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Mark no-show
          </button>
        )}
        {canCancel && (
          <button onClick={() => setStatus("cancelled")} disabled={busy} className="rounded-xl border border-gray-200 text-red-500 text-sm font-semibold px-4 py-2.5 disabled:opacity-40">
            Cancel booking
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3 max-w-md">
        Cancelling keeps the booking in your history and follows the platform&apos;s existing cancellation rules.
        No refund is processed from here.
      </p>
      {b.status === "completed" && <p className="text-sm text-gray-500 mt-6">This booking is complete and now appears under Past.</p>}
    </Shell>
  );
}

// ── class ───────────────────────────────────────────────────────────────

function ClassDetail({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<SessionBookingRow[] | null | undefined>(undefined);
  const [sessionMeta, setSessionMeta] = useState<{ name: string; date: string; time: string; instructor: string | null; gymName: string | null; capacity: number | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: s } = await supabase
      .from("sessions")
      .select("name, date, time, instructor, max_capacity, gym_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (s) {
      const { data: g } = await supabase.from("gyms").select("name").eq("id", s.gym_id).maybeSingle();
      setSessionMeta({ name: s.name, date: s.date, time: s.time, instructor: s.instructor, gymName: g?.name ?? null, capacity: s.max_capacity });
    }
    const { data } = await supabase.from("bookings").select(SESSION_COLS).eq("session_id", sessionId);
    setRows((data as SessionBookingRow[] | null) ?? []);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = async (rowId: string, next: boolean) => {
    setBusyId(rowId);
    await supabase.from("bookings").update({ checked_in: next }).eq("id", rowId);
    setBusyId(null);
    load();
  };
  const noShow = async (rowId: string) => {
    setBusyId(rowId);
    await supabase.from("bookings").update({ no_show: true, checked_in: false }).eq("id", rowId);
    setBusyId(null);
    load();
  };

  if (rows === undefined) return <Shell>Loading…</Shell>;
  const attendees = normaliseSessionBookings(rows ?? []);
  const roll = rollUpClasses(attendees)[0];

  return (
    <Shell>
      <Back />
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight uppercase">{sessionMeta?.name ?? "Class"}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {sessionMeta ? `${sessionMeta.date} · ${sessionMeta.time?.slice(0, 5)}` : ""}
        {sessionMeta?.gymName ? ` · ${sessionMeta.gymName}` : ""}
      </p>
      <p className="text-lg font-bold text-gray-900 mt-4">
        {roll?.bookedCount ?? 0} / {sessionMeta?.capacity ?? roll?.capacity ?? "–"} booked
      </p>
      {sessionMeta?.instructor && (
        <p className="text-sm text-gray-500 mt-1">Instructor: {sessionMeta.instructor}</p>
      )}

      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mt-7 mb-2">Attendees</h2>
      {attendees.length === 0 ? (
        <p className="text-sm text-gray-400">No bookings for this class yet.</p>
      ) : (
        <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
          {attendees.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-4 h-4 rounded-full flex-shrink-0 ${
                    a.noShow ? "bg-red-200" : a.checkedIn ? "bg-green-500" : "border-2 border-gray-300"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-gray-900 truncate">{a.clientName || "Guest"}</span>
                {a.status === "cancelled" && <span className="text-xs text-gray-400">cancelled</span>}
                {a.noShow && <span className="text-xs text-red-400">no-show</span>}
              </div>
              {a.status !== "cancelled" && !a.noShow && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => checkIn(a.sourceId, !a.checkedIn)}
                    disabled={busyId === a.sourceId}
                    className="text-xs font-semibold text-[#050040] hover:underline disabled:opacity-40"
                  >
                    {a.checkedIn ? "Undo check-in" : "Check in"}
                  </button>
                  {!a.checkedIn && (
                    <button
                      onClick={() => noShow(a.sourceId)}
                      disabled={busyId === a.sourceId}
                      className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-40"
                    >
                      No-show
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-4 max-w-md">
        A class booking is not a coaching relationship. Attendee health and progress are never shown here.
      </p>
    </Shell>
  );
}

// ── shared ──────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="p-6 md:p-10 max-w-2xl mx-auto">{children}</div>;
}
function Back() {
  return (
    <Link href="/lana-pro/bookings" className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5">
      ← Bookings
    </Link>
  );
}
function Row({ k, v, extra }: { k: string; v: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{k}</span>
      <span className="text-sm text-gray-800 text-right flex items-center gap-2">
        {v}
        {extra}
      </span>
    </div>
  );
}
