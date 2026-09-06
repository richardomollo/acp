"use client";

// LANA PRO — Phase 4.2: Schedule.
//
// Two distinct concepts, kept separate (§6):
//   GENERAL AVAILABILITY  — "I could accept an appointment then" → pt_availability
//   SCHEDULED CLASSES      — "this class actually occurs then"   → sessions
// Availability NEVER generates sessions.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import { PrimaryButton } from "@/app/lana-pro/onboarding/OnboardingShell";
import { ScheduleOps } from "./ScheduleOps";
import {
  emptyWeek,
  weekFromRows,
  weekToRows,
  summariseDay,
  validateWeek,
  timeOptions,
  hasAnyAvailability,
  WEEKDAY_LABELS,
  DEFAULT_RANGE,
  type WeekSchedule,
} from "@/lib/lana-pro-services/availability-model";
import { normaliseSessions, type SessionRow, type LanaService } from "@/lib/lana-pro-services/service-model";
import { buildSessionInserts } from "@/lib/lana-pro-services/class-scheduling";

const TIMES = timeOptions();

export default function LanaProSchedulePage() {
  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [week, setWeek] = useState<WeekSchedule>(emptyWeek());
  const [savedWeek, setSavedWeek] = useState<WeekSchedule>(emptyWeek());
  const [classes, setClasses] = useState<LanaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availMsg, setAvailMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"schedule" | "availability">("schedule");

  const load = useCallback(async () => {
    setLoading(true);
    const context = await loadWorkspaceContext();
    setCtx(context);
    if (!context) {
      setLoading(false);
      return;
    }
    if (context.pt) {
      const { data } = await supabase
        .from("pt_availability")
        .select("day_of_week, start_time, end_time")
        .eq("pt_id", context.pt.id)
        .is("offering_id", null);
      const w = weekFromRows(data ?? []);
      setWeek(w);
      setSavedWeek(w);
    }
    if (context.gyms.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("sessions")
        .select("id, gym_id, name, description, date, time, duration_minutes, max_capacity, category, instructor_id, drop_in_price, is_active")
        .in("gym_id", context.gyms.map((g) => g.id))
        .gte("date", todayStr)
        .order("date", { ascending: true });
      setClasses(normaliseSessions((data as SessionRow[]) ?? [], todayStr));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (i: number) =>
    setWeek((w) =>
      w.map((d) =>
        d.day === i
          ? { ...d, enabled: !d.enabled, ranges: !d.enabled && d.ranges.length === 0 ? [{ ...DEFAULT_RANGE }] : d.ranges }
          : d,
      ),
    );

  const setRange = (i: number, ri: number, field: "start" | "end", value: string) =>
    setWeek((w) =>
      w.map((d) =>
        d.day === i ? { ...d, ranges: d.ranges.map((r, j) => (j === ri ? { ...r, [field]: value } : r)) } : d,
      ),
    );

  const addRange = (i: number) =>
    setWeek((w) => w.map((d) => (d.day === i ? { ...d, ranges: [...d.ranges, { ...DEFAULT_RANGE }] } : d)));

  const removeRange = (i: number, ri: number) =>
    setWeek((w) => w.map((d) => (d.day === i ? { ...d, ranges: d.ranges.filter((_, j) => j !== ri) } : d)));

  const saveAvailability = async () => {
    if (!ctx?.pt) return;
    const errs = validateWeek(week);
    if (errs.length > 0) {
      setError(errs[0].message);
      return;
    }
    setSavingAvail(true);
    setError(null);
    setAvailMsg(null);
    const del = await supabase.from("pt_availability").delete().eq("pt_id", ctx.pt.id).is("offering_id", null);
    if (del.error) {
      setError(del.error.message);
      setSavingAvail(false);
      return;
    }
    const rows = weekToRows(week, { pt_id: ctx.pt.id });
    if (rows.length > 0) {
      const ins = await supabase.from("pt_availability").insert(rows);
      if (ins.error) {
        setError(ins.error.message);
        setSavingAvail(false);
        return;
      }
    }
    setSavedWeek(week);
    setSavingAvail(false);
    setAvailMsg("Availability saved.");
    setTimeout(() => setAvailMsg(null), 3000);
  };

  if (loading || ctx === undefined) {
    return <div className="p-6 md:p-10 max-w-3xl mx-auto text-sm text-gray-400">Loading…</div>;
  }
  if (!ctx) {
    return <div className="p-6 md:p-10 max-w-3xl mx-auto text-sm text-gray-500">Please sign in again.</div>;
  }

  const showAvailability = !!ctx.pt;
  const showClasses = ctx.capability.categories.includes("class") && ctx.gyms.length > 0;
  const dirty = JSON.stringify(week) !== JSON.stringify(savedWeek);

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          What&apos;s happening, and when clients can book you — kept separate.
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-100 -mt-4">
        {(["schedule", "availability"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-current={view === v ? "page" : undefined}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px capitalize ${
              view === v ? "border-[#050040] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm">{error}</div>}

      {view === "schedule" && <ScheduleOps ctx={ctx} />}

      {view === "availability" && showAvailability && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">General availability</h2>
            {availMsg && <span className="text-xs font-semibold text-green-600">{availMsg}</span>}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            &quot;I could accept an appointment during these times.&quot; This does not create any sessions.
          </p>
          <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {week.map((d, i) => (
              <li key={i} className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-pressed={d.enabled}
                    className="flex items-center gap-3 text-left"
                  >
                    <span
                      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition ${
                        d.enabled ? "bg-[#050040] justify-end" : "bg-gray-200 justify-start"
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{WEEKDAY_LABELS[i]}</span>
                  </button>
                  {!d.enabled && <span className="text-sm text-gray-400">{summariseDay(d)}</span>}
                </div>
                {d.enabled && (
                  <div className="mt-3 space-y-2 pl-12">
                    {d.ranges.map((r, ri) => (
                      <div key={ri} className="flex items-center gap-2">
                        <select
                          className={selCls}
                          value={r.start}
                          onChange={(e) => setRange(i, ri, "start", e.target.value)}
                        >
                          {TIMES.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        <span className="text-gray-400 text-sm">to</span>
                        <select
                          className={selCls}
                          value={r.end}
                          onChange={(e) => setRange(i, ri, "end", e.target.value)}
                        >
                          {TIMES.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        {d.ranges.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRange(i, ri)}
                            className="text-xs font-semibold text-gray-400 hover:text-red-500"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addRange(i)}
                      className="text-xs font-semibold text-[#050040] hover:underline"
                    >
                      + Add another range
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <PrimaryButton onClick={saveAvailability} disabled={savingAvail || !dirty}>
              {savingAvail ? "Saving…" : "Save availability"}
            </PrimaryButton>
            {!hasAnyAvailability(week) && (
              <span className="text-xs text-gray-400">Turn on at least one day so clients can book.</span>
            )}
          </div>
        </section>
      )}

      {view === "availability" && showClasses && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Scheduled classes</h2>
            <Link href="/lana-pro/services/new" className="text-xs font-semibold text-[#050040] hover:underline">
              Schedule a class →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            &quot;This class actually occurs at this time.&quot; Each class time is real, bookable inventory.
          </p>
          {classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-semibold text-gray-900">No classes scheduled yet.</p>
              <p className="text-sm text-gray-500 mt-1">Add a class from Services, then set when it runs.</p>
              <Link
                href="/lana-pro/services/new"
                className="inline-block mt-4 rounded-xl bg-[#050040] text-white text-sm font-semibold px-4 py-2"
              >
                Add a class
              </Link>
            </div>
          ) : (
            <ul className="rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {classes.map((c) => (
                <li key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.durationMinutes ? `${c.durationMinutes} min · ` : ""}capacity {c.capacity ?? "–"} ·{" "}
                      {c.occurrences?.future ?? 0} upcoming
                    </p>
                  </div>
                  <AddOccurrence group={c} teamTrainers={ctx.teamTrainers} onDone={load} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// Inline "add another time" for an existing class group.
function AddOccurrence({
  group,
  teamTrainers,
  onDone,
}: {
  group: LanaService;
  teamTrainers: { id: string; full_name: string | null }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!date) {
      setErr("Pick a date.");
      return;
    }
    setSaving(true);
    setErr(null);
    const rows = buildSessionInserts(
      {
        gymId: group.venueIds[0],
        name: group.name,
        description: group.description ?? "",
        durationMinutes: group.durationMinutes ?? 60,
        capacity: group.capacity ?? 8,
        priceKes: group.price,
        category: "group",
        instructorId,
        time,
      },
      [date],
    );
    const { error } = await supabase.from("sessions").insert(rows);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setOpen(false);
    setDate("");
    onDone();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-shrink-0 text-xs font-semibold text-[#050040] hover:underline"
      >
        Add a time
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <input type="date" className={selCls} value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className={selCls} value={time} onChange={(e) => setTime(e.target.value)} />
        {teamTrainers.length > 0 && (
          <select className={selCls} value={instructorId ?? ""} onChange={(e) => setInstructorId(e.target.value || null)}>
            <option value="">Unassigned</option>
            {teamTrainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? "Trainer"}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-[#050040] text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40"
        >
          {saving ? "…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-400">
          Cancel
        </button>
      </div>
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  );
}

const selCls = "px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#050040]/25";
