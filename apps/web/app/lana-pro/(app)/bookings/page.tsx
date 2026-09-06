"use client";

// LANA PRO — Phase 4.3: Bookings (replaces the 4.1 stub).
//
// One operational list over pt_bookings (appointments) + bookings/sessions
// (class attendance). Marketplace-acquired and professional-created bookings
// look identical here (§8).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import {
  normalisePtBookings,
  normaliseSessionBookings,
  normaliseGymServiceBookings,
  statusLabel,
  paymentLabel,
  type LanaBooking,
  type PtBookingRow,
  type SessionBookingRow,
  type GymServiceBookingRow,
} from "@/lib/lana-pro-bookings/booking-model";
import {
  bucketBookings,
  searchBookings,
  rollUpClasses,
  visibilityFor,
  filterVisible,
  type BookingBucket,
} from "@/lib/lana-pro-bookings/booking-buckets";

const PT_COLS =
  "id, pt_id, user_id, offering_id, scheduled_date, scheduled_time, status, payment_status, payment_method, amount_kes, location_type, checked_in, guest_name, users(id, full_name, email), pt_offerings(id, title, duration_minutes, is_programme, gym_id)";
const SESSION_COLS =
  "id, user_id, session_id, gym_id, booking_date, booking_time, status, checked_in, no_show, session_price, deposit_paid_at, remainder_collected, refund_status, guest_name, users(id, name, email), sessions(id, name, date, time, duration_minutes, max_capacity, instructor)";
const GYM_SVC_BOOKING_COLS =
  "id, gym_id, gym_service_id, gym_trainer_id, client_user_id, starts_at, duration_minutes, status, payment_status, price_kes, users(id, name, email), gym_services(id, name, duration_minutes), gym_trainers(id, full_name), gyms(id, name)";

const TABS: { id: BookingBucket | "all"; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

export default function LanaProBookingsPage() {
  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [bookings, setBookings] = useState<LanaBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BookingBucket | "all">("today");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const context = await loadWorkspaceContext();
    setCtx(context);
    if (!context) {
      setLoading(false);
      return;
    }
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const sinceTs = `${since}T00:00:00`;
    const kind = context.activeContext?.kind ?? (context.pt ? "independent" : context.gyms.length > 0 ? "business" : "employed");
    let ptRows: PtBookingRow[] = [];
    let clsRows: SessionBookingRow[] = [];
    let venueRows: GymServiceBookingRow[] = [];

    if (kind === "independent" && context.pt) {
      const { data } = await supabase
        .from("pt_bookings")
        .select(PT_COLS)
        .eq("pt_id", context.pt.id)
        .gte("scheduled_date", since);
      ptRows = (data as PtBookingRow[] | null) ?? [];
    }

    if (kind === "business" && context.gyms.length > 0) {
      const gymIds =
        context.activeContext?.kind === "business" && context.activeContext.gymId
          ? [context.activeContext.gymId]
          : context.gyms.map((g) => g.id);
      const [{ data: cls }, { data: vnu }] = await Promise.all([
        supabase.from("bookings").select(SESSION_COLS).in("gym_id", gymIds).gte("booking_date", since).limit(2000),
        supabase
          .from("gym_service_bookings")
          .select(GYM_SVC_BOOKING_COLS)
          .in("gym_id", gymIds)
          .gte("starts_at", sinceTs)
          .order("starts_at", { ascending: false })
          .limit(1000),
      ]);
      clsRows = (cls as SessionBookingRow[] | null) ?? [];
      venueRows = (vnu as GymServiceBookingRow[] | null) ?? [];
    }

    if (kind === "employed" && context.activeContext?.gymTrainerId) {
      const { data } = await supabase
        .from("gym_service_bookings")
        .select(GYM_SVC_BOOKING_COLS)
        .eq("gym_trainer_id", context.activeContext.gymTrainerId)
        .gte("starts_at", sinceTs)
        .order("starts_at", { ascending: false })
        .limit(1000);
      venueRows = (data as GymServiceBookingRow[] | null) ?? [];
    }

    const all = [
      ...normalisePtBookings(ptRows),
      ...normaliseSessionBookings(clsRows),
      ...normaliseGymServiceBookings(venueRows),
    ];
    const vis = visibilityFor({
      isIndependentPro: kind === "independent",
      isStaffTrainer: kind === "employed",
      ownsVenue: kind === "business",
      venueDoesClasses: context.capability.categories.includes("class"),
      venueDoesAccess: context.capability.categories.includes("access"),
      venueDoesAppointments: kind === "business",
    });
    setBookings(filterVisible(all, vis));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nowIso = new Date().toISOString().slice(0, 19);
  const buckets = useMemo(() => bucketBookings(bookings, nowIso), [bookings, nowIso]);
  const visible = useMemo(() => {
    const base = tab === "all" ? buckets.all : buckets[tab];
    return searchBookings(base, query);
  }, [buckets, tab, query]);

  if (loading || ctx === undefined) {
    return <div className="p-6 md:p-10 max-w-4xl mx-auto text-sm text-gray-400">Loading…</div>;
  }
  if (!ctx) {
    return <div className="p-6 md:p-10 max-w-4xl mx-auto text-sm text-gray-500">Please sign in again.</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage upcoming and past bookings.</p>
        </div>
        {ctx.activeContext?.kind === "independent" && ctx.pt ? (
          <Link
            href="/lana-pro/bookings/new"
            className="flex-shrink-0 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
          >
            + New booking
          </Link>
        ) : ctx.activeContext?.kind === "business" || ctx.activeContext?.kind === "employed" ? (
          <Link
            href="/lana-pro/bookings/new-venue"
            className="flex-shrink-0 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0a0866] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
          >
            + New booking
          </Link>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === t.id ? "border-[#050040] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.id !== "all" && buckets[t.id].length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">{buckets[t.id].length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, service or class…"
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#050040]/25"
        />
      </div>

      <div className="mt-5">
        {visible.length === 0 ? (
          <EmptyBucket tab={tab} />
        ) : (
          <BookingList bookings={visible} classRollups={rollUpClasses(visible)} />
        )}
      </div>
    </div>
  );
}

function BookingList({
  bookings,
  classRollups,
}: {
  bookings: LanaBooking[];
  classRollups: ReturnType<typeof rollUpClasses>;
}) {
  // Show appointments individually; collapse class attendees into one row.
  const appts = bookings.filter((b) => b.kind === "appointment");
  const rows = [
    ...appts.map((b) => ({ key: b.id, node: <ApptRow key={b.id} b={b} /> })),
    ...classRollups.map((c) => ({ key: `cls:${c.classId}`, node: <ClassRow key={c.classId} c={c} /> })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  return <ul className="space-y-3">{rows.map((r) => r.node)}</ul>;
}

function timeLabel(iso: string) {
  const hhmm = iso.slice(11, 16);
  if (!/^\d\d:\d\d$/.test(hhmm)) return "--";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function ApptRow({ b }: { b: LanaBooking }) {
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <span className="text-sm font-bold text-gray-900 w-16 flex-shrink-0">{timeLabel(b.startAt)}</span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{b.clientName || "Client"}</p>
          <p className="text-sm text-gray-500 truncate">
            {b.serviceName || b.title}
            {b.endAt ? ` · ${Math.round((Date.parse(b.endAt + "Z") - Date.parse(b.startAt + "Z")) / 60000)} min` : ""}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {statusLabel(b.status)}
            {b.amount ? ` · KES ${Math.round(b.amount).toLocaleString("en-KE")} · ${paymentLabel(b.paymentDisplay)}` : ""}
          </p>
        </div>
      </div>
      <Link href={b.href} className="flex-shrink-0 text-xs font-semibold text-[#050040] hover:underline">
        View
      </Link>
    </li>
  );
}

function ClassRow({ c }: { c: ReturnType<typeof rollUpClasses>[number] }) {
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <span className="text-sm font-bold text-gray-900 w-16 flex-shrink-0">{timeLabel(c.startAt)}</span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{c.title}</p>
          <p className="text-sm text-gray-500">
            {c.bookedCount} / {c.capacity ?? "–"} booked · Class
            {c.overCapacity ? " · over capacity" : ""}
          </p>
        </div>
      </div>
      <Link
        href={`/lana-pro/bookings/class/${c.classId}`}
        className="flex-shrink-0 text-xs font-semibold text-[#050040] hover:underline"
      >
        View class
      </Link>
    </li>
  );
}

function EmptyBucket({ tab }: { tab: BookingBucket | "all" }) {
  if (tab === "today") {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm font-semibold text-gray-900">No bookings today.</p>
        <p className="text-sm text-gray-500 mt-1">Your schedule is clear.</p>
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          <Link href="/lana-pro/schedule" className="rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2">
            View schedule
          </Link>
          <Link href="/lana-pro/clients/invite" className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2">
            Invite clients
          </Link>
        </div>
      </div>
    );
  }
  const msg = { upcoming: "Nothing coming up yet.", past: "No past bookings.", cancelled: "No cancelled bookings.", all: "No bookings yet." }[tab];
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-900">{msg}</p>
    </div>
  );
}
