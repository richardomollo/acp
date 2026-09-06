"use client";

// LANA PRO — Phase 4.3: operational schedule (Day / Week).
// Combines appointments + class occurrences from the SAME LanaBooking
// normaliser /bookings and Home use. Availability appears only as a light
// per-day summary — never as materialised slots (§5).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import type { WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import {
  normalisePtBookings,
  normaliseSessionBookings,
  statusLabel,
  type LanaBooking,
  type PtBookingRow,
  type SessionBookingRow,
} from "@/lib/lana-pro-bookings/booking-model";
import { rollUpClasses } from "@/lib/lana-pro-bookings/booking-buckets";
import {
  scheduleForDate,
  buildWeek,
  mondayOf,
  type ScheduleEntry,
} from "@/lib/lana-pro-bookings/schedule-agg";
import { weekFromRows, summariseDay, WEEKDAY_LABELS } from "@/lib/lana-pro-services/availability-model";

const PT_COLS =
  "id, pt_id, user_id, offering_id, scheduled_date, scheduled_time, status, payment_status, payment_method, amount_kes, location_type, checked_in, guest_name, users(id, full_name, email), pt_offerings(id, title, duration_minutes, is_programme, gym_id)";
const SESSION_COLS =
  "id, user_id, session_id, gym_id, booking_date, booking_time, status, checked_in, no_show, session_price, guest_name, users(id, name, email), sessions(id, name, date, time, duration_minutes, max_capacity, instructor)";

function fmtDay(dateStr: string) {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function timeLabel(iso: string) {
  const hhmm = iso.slice(11, 16);
  return /^\d\d:\d\d$/.test(hhmm) ? hhmm : "";
}

export function ScheduleOps({ ctx }: { ctx: WorkspaceContext }) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [cursor, setCursor] = useState(() => new Date().toISOString().slice(0, 10));
  const [appts, setAppts] = useState<LanaBooking[]>([]);
  const [classBookings, setClassBookings] = useState<LanaBooking[]>([]);
  const [availWeek, setAvailWeek] = useState<ReturnType<typeof weekFromRows> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    if (ctx.pt) {
      const [bRes, aRes] = await Promise.all([
        supabase.from("pt_bookings").select(PT_COLS).eq("pt_id", ctx.pt.id).gte("scheduled_date", since).lte("scheduled_date", until),
        supabase.from("pt_availability").select("day_of_week, start_time, end_time").eq("pt_id", ctx.pt.id).is("offering_id", null),
      ]);
      setAppts(normalisePtBookings((bRes.data as PtBookingRow[]) ?? []));
      setAvailWeek(weekFromRows((aRes.data as { day_of_week: number; start_time: string; end_time: string }[]) ?? []));
    }
    if (ctx.gyms.length > 0) {
      const { data } = await supabase
        .from("bookings")
        .select(SESSION_COLS)
        .in("gym_id", ctx.gyms.map((g) => g.id))
        .gte("booking_date", since)
        .lte("booking_date", until);
      setClassBookings(normaliseSessionBookings((data as SessionBookingRow[]) ?? []));
    }
    setLoading(false);
  }, [ctx]);

  useEffect(() => {
    load();
  }, [load]);

  const rollups = useMemo(() => rollUpClasses(classBookings), [classBookings]);

  const dayEntries = useMemo(
    () =>
      scheduleForDate({
        dateStr: cursor,
        appointments: appts,
        classRollups: rollups,
        availabilitySummary: availWeek ? summariseDay(availWeek[isoIdx(cursor)]) : undefined,
      }),
    [cursor, appts, rollups, availWeek],
  );

  const weekCols = useMemo(
    () =>
      buildWeek({
        mondayStr: mondayOf(cursor),
        appointments: appts,
        classBookings,
        availabilityWeek: availWeek ?? undefined,
      }),
    [cursor, appts, classBookings, availWeek],
  );

  const shift = (days: number) => {
    const d = new Date(cursor + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setCursor(d.toISOString().slice(0, 10));
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {(["day", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-[#050040] text-white" : "text-gray-600"}`}
            >
              {m === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(mode === "day" ? -1 : -7)} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500">‹</button>
          <button type="button" onClick={() => setCursor(new Date().toISOString().slice(0, 10))} className="text-xs font-semibold text-gray-500 px-2">Today</button>
          <button type="button" onClick={() => shift(mode === "day" ? 1 : 7)} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8">Loading…</p>
      ) : mode === "day" ? (
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-[0.12em] mb-3">{fmtDay(cursor)}</h3>
          {dayEntries.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing scheduled. Availability is set on the Availability tab.</p>
          ) : (
            <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {dayEntries.map((e) => (
                <li key={e.id}>{renderEntry(e)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekCols.map((col) => (
            <div key={col.dateStr} className="rounded-xl border border-gray-100 bg-white p-2 min-h-[120px]">
              <p className="text-xs font-bold text-gray-500">{WEEKDAY_LABELS[col.weekday].slice(0, 3)}</p>
              <p className="text-[11px] text-gray-400 mb-1.5">{col.dateStr.slice(8)}</p>
              {col.availabilitySummary && (
                <p className="text-[10px] text-gray-400 mb-1">{col.availabilitySummary}</p>
              )}
              {col.entries
                .filter((e) => e.kind !== "availability")
                .map((e) => (
                  <div key={e.id} className="text-[11px] mb-1 leading-tight">
                    <span className="font-semibold text-gray-800">{timeLabel(e.startAt)}</span>{" "}
                    <span className="text-gray-600">{e.title}</span>
                    {e.kind === "class" && (
                      <span className="text-gray-400"> {e.bookedCount}/{e.capacity ?? "–"}</span>
                    )}
                  </div>
                ))}
              {col.entries.filter((e) => e.kind !== "availability").length === 0 && (
                <p className="text-[11px] text-gray-300">—</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function isoIdx(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function renderEntry(e: ScheduleEntry) {
  if (e.kind === "availability") {
    return (
      <div className="px-5 py-2.5 bg-gray-50/60 text-xs text-gray-500 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Open for bookings · {e.subtitle}
      </div>
    );
  }
  const inner = (
    <div className="px-5 py-3.5 flex items-center gap-4">
      <span className="text-sm font-semibold text-gray-900 w-14 flex-shrink-0">{timeLabel(e.startAt) || "--"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
        <p className="text-xs text-gray-500 truncate">
          {e.subtitle}
          {e.kind === "class" ? ` · ${e.bookedCount}/${e.capacity ?? "–"} booked` : e.status ? ` · ${statusLabel(e.status as never)}` : ""}
        </p>
      </div>
    </div>
  );
  return e.href ? <Link href={e.href}>{inner}</Link> : inner;
}
