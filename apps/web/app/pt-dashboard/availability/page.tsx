"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeSlot = { id?: string; start_time: string; end_time: string };
type DayAvailability = { enabled: boolean; slots: TimeSlot[] };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_SLOT: TimeSlot = { start_time: "08:00", end_time: "17:00" };

function initWeek(): DayAvailability[] {
  return DAYS.map(() => ({ enabled: false, slots: [] }));
}

const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
})();

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateDisplay(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const router = useRouter();
  const [ptId, setPtId] = useState<string | null>(null);
  const [ptName, setPtName] = useState("");
  const [hasVenueRole, setHasVenueRole] = useState(false);
  const [loading, setLoading] = useState(true);

  // Per-offering mode
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [offeringTitle, setOfferingTitle] = useState<string>("");

  // Weekly schedule
  const [week, setWeek] = useState<DayAvailability[]>(initWeek());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Blocked dates (global only)
  const [blockedDates, setBlockedDates] = useState<{ id: string; date: string; reason: string | null }[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get("offering");

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }

      const { data: pt } = await supabase
        .from("personal_trainers")
        .select("id, full_name, professional_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!pt) { router.push("/partner-login"); return; }

      const { data: venueData } = await supabase
        .from("gyms")
        .select("id")
        .ilike("contact_email", user.email ?? "")
        .maybeSingle();

      setPtId(pt.id);
      setPtName(pt.professional_name || pt.full_name);
      setHasVenueRole(!!venueData);

      // Fetch offering name if in per-offering mode
      if (oid) {
        const { data: off } = await supabase
          .from("pt_offerings")
          .select("title")
          .eq("id", oid)
          .single();
        setOfferingId(oid);
        setOfferingTitle(off?.title ?? "Session");
      }

      // Load availability (scoped to offering or global)
      const baseQ = supabase
        .from("pt_availability")
        .select("id, day_of_week, start_time, end_time")
        .eq("pt_id", pt.id)
        .order("day_of_week")
        .order("start_time");

      const { data: avail } = oid
        ? await baseQ.eq("offering_id", oid)
        : await baseQ.is("offering_id", null);

      if (avail && avail.length > 0) {
        const w = initWeek();
        for (const row of avail) {
          const dow = row.day_of_week as number;
          w[dow].enabled = true;
          w[dow].slots.push({
            id: row.id,
            start_time: row.start_time.slice(0, 5),
            end_time: row.end_time.slice(0, 5),
          });
        }
        setWeek(w);
      }

      // Load blocked dates (global PT-level only, not per-offering)
      if (!oid) {
        const { data: blocked } = await supabase
          .from("pt_blocked_dates")
          .select("id, date, reason")
          .eq("pt_id", pt.id)
          .order("date");
        setBlockedDates(blocked ?? []);
      }

      setLoading(false);
    })();
  }, []);

  // ── Weekly schedule helpers ───────────────────────────────────────────────────

  const toggleDay = (dow: number) => {
    setWeek((prev) => prev.map((d, i) => {
      if (i !== dow) return d;
      return d.enabled
        ? { enabled: false, slots: [] }
        : { enabled: true, slots: [{ ...DEFAULT_SLOT }] };
    }));
  };

  const addSlot = (dow: number) => {
    setWeek((prev) => prev.map((d, i) => {
      if (i !== dow) return d;
      const last = d.slots[d.slots.length - 1];
      return { ...d, slots: [...d.slots, { start_time: last?.end_time ?? "08:00", end_time: "18:00" }] };
    }));
  };

  const removeSlot = (dow: number, idx: number) => {
    setWeek((prev) => prev.map((d, i) => {
      if (i !== dow) return d;
      const slots = d.slots.filter((_, si) => si !== idx);
      return { ...d, slots, enabled: slots.length > 0 };
    }));
  };

  const updateSlot = (dow: number, idx: number, field: "start_time" | "end_time", value: string) => {
    setWeek((prev) => prev.map((d, i) => {
      if (i !== dow) return d;
      const slots = d.slots.map((s, si) => si === idx ? { ...s, [field]: value } : s);
      return { ...d, slots };
    }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const saveSchedule = async () => {
    if (!ptId) return;
    setSaving(true);
    setSaved(false);

    // Delete existing rows for this scope
    const deleteQ = supabase.from("pt_availability").delete().eq("pt_id", ptId);
    if (offeringId) {
      await deleteQ.eq("offering_id", offeringId);
    } else {
      await deleteQ.is("offering_id", null);
    }

    const toInsert: Record<string, any>[] = [];
    week.forEach((day, dow) => {
      if (!day.enabled) return;
      day.slots.forEach((slot) => {
        if (slot.start_time < slot.end_time) {
          const row: Record<string, any> = {
            pt_id: ptId,
            day_of_week: dow,
            start_time: slot.start_time,
            end_time: slot.end_time,
          };
          if (offeringId) row.offering_id = offeringId;
          toInsert.push(row);
        }
      });
    });

    if (toInsert.length > 0) {
      await supabase.from("pt_availability").insert(toInsert);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // ── Blocked dates ─────────────────────────────────────────────────────────────

  const addBlockedDate = async () => {
    if (!ptId || !newBlockDate) return;
    setAddingBlock(true);
    const { data, error } = await supabase
      .from("pt_blocked_dates")
      .insert({ pt_id: ptId, date: newBlockDate, reason: newBlockReason.trim() || null })
      .select()
      .single();
    if (!error && data) {
      setBlockedDates((prev) => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockDate("");
      setNewBlockReason("");
    }
    setAddingBlock(false);
  };

  const removeBlockedDate = async (id: string) => {
    await supabase.from("pt_blocked_dates").delete().eq("id", id);
    setBlockedDates((prev) => prev.filter((b) => b.id !== id));
  };

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (loading || !ptId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-[3px] border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        {offeringId ? (
          /* Per-offering mode */
          <div className="mb-6">
            <Link
              href="/pt-dashboard/offerings"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Offerings
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{offeringTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">Session availability</p>

            {/* Info banner */}
            <div className="mt-4 flex gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-0.5">Session-specific schedule</p>
                <p className="text-blue-700 leading-snug">
                  These hours apply <strong>only</strong> to <em>{offeringTitle}</em>. When set, they override your default schedule for this session type. Leave all days off to use your default schedule instead.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Global mode */
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
            <p className="text-sm text-gray-500 mt-1">Set your default weekly schedule and block time off.</p>

            {/* Info banner */}
            <div className="mt-4 flex gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-amber-900">
                <p className="font-medium mb-0.5">This is your default schedule</p>
                <p className="text-amber-800 leading-snug">
                  It applies to all your sessions unless a session has its own schedule set. To customise hours for a specific session type, go to{" "}
                  <Link href="/pt-dashboard/offerings" className="underline font-medium hover:text-amber-900">
                    Offerings
                  </Link>{" "}
                  and click the clock icon on any session.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Weekly hours ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Weekly hours</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {offeringId
                ? `The days and times clients can book "${offeringTitle}"`
                : "Your general working hours across all session types"}
            </p>
          </div>

          <div className="divide-y divide-gray-50">
            {DAYS.map((dayName, dow) => {
              const day = week[dow];
              return (
                <div key={dow} className={`px-6 py-4 ${day.enabled ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-4">
                    {/* Toggle + label */}
                    <div className="flex items-center gap-3 w-32 flex-shrink-0 pt-1">
                      <button
                        onClick={() => toggleDay(dow)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${day.enabled ? "bg-gray-900" : "bg-gray-200"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${day.enabled ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                      <span className="text-sm font-medium text-gray-800">{dayName.slice(0, 3)}</span>
                    </div>

                    {/* Slots */}
                    <div className="flex-1 space-y-2">
                      {!day.enabled ? (
                        <p className="text-sm text-gray-400 py-0.5">Unavailable</p>
                      ) : (
                        <>
                          {day.slots.map((slot, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <select
                                value={slot.start_time}
                                onChange={(e) => updateSlot(dow, idx, "start_time", e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                              >
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>{fmtTime(t)}</option>
                                ))}
                              </select>
                              <span className="text-gray-400 text-sm">–</span>
                              <select
                                value={slot.end_time}
                                onChange={(e) => updateSlot(dow, idx, "end_time", e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                              >
                                {TIME_OPTIONS.filter((t) => t > slot.start_time).map((t) => (
                                  <option key={t} value={t}>{fmtTime(t)}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => removeSlot(dow, idx)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                title="Remove slot"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}

                          {day.slots.some((s) => s.start_time >= s.end_time) && (
                            <p className="text-xs text-red-500">End time must be after start time.</p>
                          )}

                          <button
                            onClick={() => addSlot(dow)}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors mt-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add time slot
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className={`text-sm font-medium transition-opacity ${saved ? "text-green-600 opacity-100" : "opacity-0"}`}>
              ✓ Saved
            </p>
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="px-6 py-2 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-gray-700 transition-colors disabled:bg-gray-300"
            >
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>

        {/* ── Date overrides (global mode only) ────────────────────────────────── */}
        {!offeringId && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Date overrides</h2>
              <p className="text-xs text-gray-500 mt-0.5">Block specific dates across all sessions — holidays, time off, events</p>
            </div>

            {blockedDates.length > 0 && (
              <ul className="divide-y divide-gray-50">
                {blockedDates.map((b) => (
                  <li key={b.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{fmtDateDisplay(b.date)}</p>
                      {b.reason && <p className="text-xs text-gray-400 mt-0.5">{b.reason}</p>}
                    </div>
                    <button
                      onClick={() => removeBlockedDate(b.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="px-6 py-4 border-t border-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add a date override</p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newBlockDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setNewBlockDate(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="text"
                  value={newBlockReason}
                  onChange={(e) => setNewBlockReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={addBlockedDate}
                  disabled={!newBlockDate || addingBlock}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 flex-shrink-0"
                >
                  {addingBlock ? "…" : "Block"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Offering-mode hint for blocked dates ─────────────────────────────── */}
        {offeringId && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Need to block a specific date?{" "}
            <Link href="/pt-dashboard/availability" className="underline hover:text-gray-600">
              Manage date overrides
            </Link>{" "}
            from your default schedule — they apply across all session types.
          </p>
        )}
    </div>
  );
}
