"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Button } from "../../../../../components/ui/Button";
import { Chip } from "../../../../../components/ui/Chip";
import { ListHeader } from "../../../../../components/ui/ListHeader";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Recurrence = "once" | "daily" | "weekly";
type LocationType = "gym" | "home" | "outdoor";

const WEEKDAY_CHIPS = [
  { key: 0, label: "S" }, { key: 1, label: "M" }, { key: 2, label: "T" },
  { key: 3, label: "W" }, { key: 4, label: "T" }, { key: 5, label: "F" },
  { key: 6, label: "S" },
] as const;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RECURRENCE_OPTIONS: { key: Recurrence; label: string }[] = [
  { key: "once", label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
];

const LOCATION_OPTIONS: { key: LocationType; label: string }[] = [
  { key: "gym", label: "Gym" },
  { key: "home", label: "Home" },
  { key: "outdoor", label: "Outdoor" },
];

interface ScheduleRow {
  id: string;
  start_date: string;
  time_of_day: string;
  recurrence: Recurrence;
  weekdays: number[];
  location_type: LocationType | null;
  location_address: string | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function describeSchedule(row: ScheduleRow): string {
  const time = row.time_of_day.slice(0, 5);
  let base: string;
  if (row.recurrence === "once") {
    const d = new Date(`${row.start_date}T00:00:00`);
    base = `Once · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
  } else if (row.recurrence === "daily") {
    base = `Every day at ${time}`;
  } else {
    const days = [...row.weekdays].sort().map(d => WEEKDAY_NAMES[d]).join(", ");
    base = `Every ${days} at ${time}`;
  }
  if (row.location_type === "outdoor" && row.location_address) return `${base} · ${row.location_address}`;
  if (row.location_type) return `${base} · ${row.location_type === "gym" ? "Gym" : "Home"}`;
  return base;
}

export default function ScheduleWorkoutPage({ params }: { params: Promise<{ clientId: string; workoutId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);

  const [workoutTitle, setWorkoutTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [ptId, setPtId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);

  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("18:00");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [locationType, setLocationType] = useState<LocationType>("gym");
  const [locationAddress, setLocationAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(p => { setClientId(p.clientId); setWorkoutId(p.workoutId); }); }, [params]);

  const load = useCallback(async () => {
    if (!workoutId || !clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }
    const { data: pt } = await supabase.from("personal_trainers").select("id").eq("user_id", user.id).single();
    setPtId(pt?.id ?? null);

    const { data: workout } = await supabase.from("workouts").select("title").eq("id", workoutId).single();
    setWorkoutTitle(workout?.title ?? "Workout");

    if (pt) {
      const { data } = await supabase
        .from("workout_schedules")
        .select("id, start_date, time_of_day, recurrence, weekdays, location_type, location_address")
        .eq("workout_id", workoutId)
        .eq("user_id", clientId)
        .eq("assigned_by", pt.id)
        .eq("is_active", true)
        .order("start_date");
      setSchedules((data as any) ?? []);
    }
    setLoading(false);
  }, [workoutId, clientId, router]);

  useEffect(() => { load(); }, [load]);

  const toggleWeekday = (day: number) =>
    setWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());

  const canSave = recurrence !== "weekly" || weekdays.length > 0;

  const handleSchedule = async () => {
    if (!ptId || !clientId) { setError("Trainer profile not found."); return; }
    if (!canSave) { setError("Choose at least one weekday for a weekly schedule."); return; }
    if (recurrence === "once") {
      const combined = new Date(`${date}T${time}:00`);
      if (combined.getTime() <= Date.now()) {
        setError("The scheduled date and time must be in the future.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("workout_schedules").insert({
        user_id: clientId,
        assigned_by: ptId,
        workout_id: workoutId,
        start_date: date,
        time_of_day: `${time}:00`,
        recurrence,
        weekdays: recurrence === "weekly" ? weekdays : [],
        location_type: locationType,
        location_address: locationType === "outdoor" ? (locationAddress.trim() || null) : null,
        notification_ids: [],
      });

      if (err) { setError(err.message ?? "Failed to schedule workout."); setSaving(false); return; }

      setRecurrence("once");
      setWeekdays([]);
      setLocationAddress("");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSchedule = async (row: ScheduleRow) => {
    if (!confirm("Cancel this schedule? This reminder will be removed.")) return;
    await supabase.from("workout_schedules").delete().eq("id", row.id);
    setSchedules(prev => prev.filter(s => s.id !== row.id));
  };

  if (!clientId || !workoutId) return null;

  return (
    <div className="p-6 md:p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-[--text-secondary] hover:underline">← Back</button>
        <h1 className="text-lg font-bold text-ink-900">Schedule Workout</h1>
      </div>

      {loading ? (
        <p className="text-[--text-muted] py-16 text-center">Loading…</p>
      ) : (
        <>
          <p className="text-xl font-extrabold text-ink-900 mb-5">{workoutTitle}</p>

          {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

          <ListHeader title="Date & Time" className="mb-2.5" />
          <div className="flex gap-2.5 mb-5">
            <input
              type="date"
              value={date}
              min={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 px-3.5 py-3 border-[1.5px] border-border rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-500 bg-surface"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 px-3.5 py-3 border-[1.5px] border-border rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-500 bg-surface"
            />
          </div>

          <ListHeader title="Repeat" className="mb-2.5" />
          <div className="flex gap-2.5 mb-4">
            {RECURRENCE_OPTIONS.map(opt => (
              <Chip key={opt.key} selected={recurrence === opt.key} onClick={() => setRecurrence(opt.key)} className="flex-1 text-center justify-center">
                {opt.label}
              </Chip>
            ))}
          </div>

          {recurrence === "weekly" && (
            <div className="flex gap-2 mb-5 -mt-1.5">
              {WEEKDAY_CHIPS.map(wd => (
                <button
                  key={wd.key}
                  onClick={() => toggleWeekday(wd.key)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition ${weekdays.includes(wd.key) ? "bg-ink-900 text-white" : "bg-surface-muted text-ink-600 border border-border"}`}
                >
                  {wd.label}
                </button>
              ))}
            </div>
          )}

          <ListHeader title="Location" className="mb-2.5" />
          <div className="flex gap-2.5 mb-4">
            {LOCATION_OPTIONS.map(opt => (
              <Chip key={opt.key} selected={locationType === opt.key} onClick={() => setLocationType(opt.key)} className="flex-1 text-center justify-center">
                {opt.label}
              </Chip>
            ))}
          </div>
          {locationType === "outdoor" && (
            <input
              type="text"
              placeholder="Named location, e.g. Karura Forest"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-xl text-sm mb-5 -mt-1.5 focus:outline-none focus:border-blue-500 bg-surface"
            />
          )}

          <Button block onClick={handleSchedule} disabled={saving} className="mt-2 mb-7">
            {saving ? "Scheduling…" : "Schedule"}
          </Button>

          {schedules.length > 0 && (
            <>
              <ListHeader title="Upcoming" className="mb-2.5" />
              <div className="divide-y divide-[--border-faint]">
                {schedules.map(row => (
                  <div key={row.id} className="flex items-center gap-2.5 py-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="flex-1 text-sm font-semibold text-ink-600">{describeSchedule(row)}</span>
                    <button onClick={() => handleCancelSchedule(row)}>
                      <svg className="w-5 h-5 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
