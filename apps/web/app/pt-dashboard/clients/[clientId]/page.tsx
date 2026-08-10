"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Avatar } from "../../../components/ui/Avatar";
import { Chip } from "../../../components/ui/Chip";
import { ListHeader } from "../../../components/ui/ListHeader";
import { EmptyState } from "../../../components/ui/EmptyState";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ClientInfo = { name: string | null; email: string | null };
type PtClientRow = { id: string; share_progress: boolean };
type FitnessProfile = { goals: string[]; experience_level: string | null };
type AssignedWorkout = { id: string; title: string; difficulty: string; duration_minutes: number };
type HistoryRow = {
  id: string; completed_at: string; duration_minutes: number | null;
  rating: number | null; notes: string | null; logged_by_pt_id: string | null;
  workouts: { title: string } | null;
};
type SetLogRow = {
  id: string; workout_history_id: string; set_number: number;
  weight_kg: number | null; reps: number | null;
  exercises: { name: string } | null;
};
type MeasurementRow = {
  id: string; weight_kg: number | null; waist_cm: number | null;
  chest_cm: number | null; hips_cm: number | null; logged_at: string;
  logged_by_pt_id: string | null;
};
type CheckinRow = { id: string; mood: number; checkin_date: string };
type ActivityRow = {
  id: string; activity_type: "run" | "walk" | "cycle" | "strength" | "mobility" | "class" | "other";
  name: string | null; start_time: string; distance_meters: number | null;
};
type TaskRow = {
  id: string; title: string; due_date: string | null; status: "pending" | "done";
  recurrence: "once" | "daily" | "weekly"; weekdays: number[]; last_completed_date: string | null;
};

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTIVITY_ICON: Record<string, string> = {
  run: "🏃", walk: "🚶", cycle: "🚴", strength: "🏋️", mobility: "🧘", class: "👥", other: "⚡",
};
const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose Weight", build_muscle: "Build Muscle",
  improve_mobility: "Mobility", general_fitness: "General Fitness",
  maintain_weight: "Maintain Weight", eat_healthier: "Eat Healthier",
};

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function groupByExercise(logs: SetLogRow[]): { name: string; sets: SetLogRow[] }[] {
  const order: string[] = [];
  const byName = new Map<string, SetLogRow[]>();
  for (const log of logs) {
    const name = log.exercises?.name ?? "Exercise";
    if (!byName.has(name)) { byName.set(name, []); order.push(name); }
    byName.get(name)!.push(log);
  }
  return order.map(name => ({ name, sets: byName.get(name)! }));
}

function decrementDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const days = Array.from(new Set(completedDates.map(d => d.slice(0, 10)))).sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const first = days[0];
  if (first !== today && first !== decrementDay(today)) return 0;
  let streak = 1;
  let cursor = first;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === decrementDay(cursor)) { streak++; cursor = days[i]; }
    else break;
  }
  return streak;
}

// Date-only sibling of the mobile app's computeNextOccurrence — tasks have
// no time-of-day, only a day granularity.
function currentTaskPeriod(task: TaskRow, today: Date = new Date()): string {
  const todayStr = today.toISOString().slice(0, 10);
  if (task.recurrence === "daily") return todayStr;
  if (task.recurrence === "weekly") {
    const dow = today.getDay();
    if (task.weekdays.includes(dow)) return todayStr;
    for (let back = 1; back <= 7; back++) {
      const d = new Date(today);
      d.setDate(d.getDate() - back);
      if (task.weekdays.includes(d.getDay())) return d.toISOString().slice(0, 10);
    }
  }
  return task.due_date ?? todayStr;
}

function isTaskDoneNow(task: TaskRow): boolean {
  return task.recurrence === "once" ? task.status === "done" : task.last_completed_date === currentTaskPeriod(task);
}

export default function PTClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);

  const [ptId, setPtId] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [ptClient, setPtClient] = useState<PtClientRow | null>(null);
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [workouts, setWorkouts] = useState<AssignedWorkout[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [setLogs, setSetLogs] = useState<Record<string, SetLogRow[]>>({});
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [progressStats, setProgressStats] = useState({ streak: 0, totalWorkouts: 0, totalMinutes: 0 });
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<"once" | "daily" | "weekly">("once");
  const [newTaskWeekdays, setNewTaskWeekdays] = useState<number[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: pt } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).single();
    if (!pt) { setLoading(false); return; }
    setPtId(pt.id);

    const [{ data: userRow }, { data: pcRow }, { data: profileRow }, { data: workoutRows }] = await Promise.all([
      supabase.from("users").select("name, email").eq("id", clientId).single(),
      supabase.from("pt_clients").select("id, share_progress").eq("pt_id", pt.id).eq("client_user_id", clientId).single(),
      supabase.from("fitness_profile").select("goals, experience_level").eq("user_id", clientId).maybeSingle(),
      supabase.from("workouts").select("id, title, difficulty, duration_minutes").eq("assigned_by", pt.id).eq("user_id", clientId).order("created_at", { ascending: false }),
    ]);

    setClient(userRow ?? null);
    setPtClient(pcRow ?? null);
    setProfile(profileRow ?? null);
    setWorkouts((workoutRows as any) ?? []);

    const { data: taskRows } = await supabase
      .from("client_tasks")
      .select("id, title, due_date, status, recurrence, weekdays, last_completed_date")
      .eq("pt_id", pt.id)
      .eq("client_user_id", clientId)
      .order("created_at", { ascending: false });
    setTasks((taskRows as any) ?? []);

    const { data: historyRows } = await supabase
      .from("workout_history")
      .select("id, completed_at, duration_minutes, rating, notes, logged_by_pt_id, workouts(title)")
      .eq("user_id", clientId)
      .order("completed_at", { ascending: false })
      .limit(10);
    setHistory((historyRows as any) ?? []);

    const historyIds = (historyRows ?? []).map((h: any) => h.id);
    if (historyIds.length > 0) {
      const { data: logRows } = await supabase
        .from("workout_set_logs")
        .select("id, workout_history_id, set_number, weight_kg, reps, exercises(name)")
        .in("workout_history_id", historyIds)
        .order("set_number", { ascending: true });
      const grouped: Record<string, SetLogRow[]> = {};
      for (const log of (logRows as any) ?? []) {
        (grouped[log.workout_history_id] ??= []).push(log);
      }
      setSetLogs(grouped);
    } else {
      setSetLogs({});
    }

    const { data: measurementRows } = await supabase
      .from("client_measurements")
      .select("id, weight_kg, waist_cm, chest_cm, hips_cm, logged_at, logged_by_pt_id")
      .eq("user_id", clientId)
      .order("logged_at", { ascending: false })
      .limit(5);
    setMeasurements((measurementRows as any) ?? []);

    const { data: allHistory } = await supabase
      .from("workout_history")
      .select("completed_at, duration_minutes")
      .eq("user_id", clientId)
      .limit(500);
    const rows = allHistory ?? [];
    setProgressStats({
      streak: computeStreak(rows.map(r => r.completed_at)),
      totalWorkouts: rows.length,
      totalMinutes: rows.reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0),
    });

    if (pcRow?.share_progress) {
      const { data: checkinRows } = await supabase
        .from("daily_checkins")
        .select("id, mood, checkin_date")
        .eq("user_id", clientId)
        .order("checkin_date", { ascending: false })
        .limit(7);
      setCheckins((checkinRows as any) ?? []);

      // RLS on `activities` grants trainers the same share_progress-gated
      // read as workout_history/measurements — see
      // 20260810000002_trainer_view_client_activities.sql.
      const { data: activityRows } = await supabase
        .from("activities")
        .select("id, activity_type, name, start_time, distance_meters")
        .eq("user_id", clientId)
        .order("start_time", { ascending: false })
        .limit(10);
      setActivities((activityRows as any) ?? []);
    } else {
      setCheckins([]);
      setActivities([]);
    }

    setLoading(false);
  }, [clientId, router]);

  useEffect(() => { load(); }, [load]);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || !ptId || !clientId) return;
    if (newTaskRecurrence === "weekly" && newTaskWeekdays.length === 0) {
      alert("Choose at least one weekday for a weekly task.");
      return;
    }
    setSavingTask(true);
    const { data, error } = await supabase
      .from("client_tasks")
      .insert({
        pt_id: ptId, client_user_id: clientId, title,
        recurrence: newTaskRecurrence,
        weekdays: newTaskRecurrence === "weekly" ? newTaskWeekdays : [],
      })
      .select("id, title, due_date, status, recurrence, weekdays, last_completed_date")
      .single();
    setSavingTask(false);
    if (error) { alert(error.message); return; }
    setTasks(prev => [data as TaskRow, ...prev]);
    setNewTaskTitle("");
    setNewTaskRecurrence("once");
    setNewTaskWeekdays([]);
    setAddingTask(false);
  };

  const toggleTaskDone = async (task: TaskRow) => {
    setTogglingTaskId(task.id);
    const doneNow = isTaskDoneNow(task);

    if (task.recurrence === "once") {
      const nextStatus = doneNow ? "pending" : "done";
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      const { error } = await supabase.from("client_tasks").update({ status: nextStatus }).eq("id", task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    } else {
      const nextDate = doneNow ? null : currentTaskPeriod(task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: nextDate } : t));
      const { error } = await supabase.from("client_tasks").update({ last_completed_date: nextDate }).eq("id", task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: task.last_completed_date } : t));
    }
    setTogglingTaskId(null);
  };

  if (!clientId || loading) {
    return <div className="p-8 text-[--text-muted] text-center">Loading…</div>;
  }

  const name = client?.name ?? client?.email ?? "Client";

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <Link href="/pt-dashboard/clients" className="text-sm text-[--text-secondary] hover:underline mb-6 inline-block">
        ← Back to Clients
      </Link>

      {/* Profile card */}
      <Card radius="2xl" className="p-6 flex flex-col items-center text-center mb-6">
        <Avatar name={name} size="md" className="mb-3" />
        <p className="text-lg font-bold text-ink-900">{name}</p>
        {client?.email && <p className="text-sm text-[--text-muted]">{client.email}</p>}
        {profile && ptClient?.share_progress && ((profile.goals?.length ?? 0) > 0 || profile.experience_level) && (
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {profile.goals?.map(g => (
              <Badge key={g} variant="accent">{GOAL_LABELS[g] ?? g}</Badge>
            ))}
            {profile.experience_level && (
              <Badge variant="accent" className="capitalize">{profile.experience_level}</Badge>
            )}
          </div>
        )}
      </Card>

      {/* Dashboard stats */}
      {ptClient?.share_progress && (
        <Card radius="2xl" className="mb-6 divide-y divide-[--border-faint]">
          {[
            { icon: "🔥", label: "Current Streak", value: `${progressStats.streak} days` },
            { icon: "🏋️", label: "Workouts", value: `${progressStats.totalWorkouts} completed` },
            { icon: "⏱️", label: "Minutes", value: `${progressStats.totalMinutes}` },
            { icon: "⚖️", label: "Weight", value: measurements[0]?.weight_kg != null ? `${measurements[0].weight_kg}kg` : "Not logged" },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span>{row.icon}</span>
                <span className="text-sm font-semibold text-ink-600">{row.label}</span>
              </div>
              <span className="text-sm font-bold text-ink-900">{row.value}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Actions */}
      <Link href={`/pt-dashboard/clients/${clientId}/assign-workout`} className="block mb-3">
        <Button block>+ Assign Workout</Button>
      </Link>
      <div className="flex gap-3 mb-8">
        <Link href={`/pt-dashboard/clients/${clientId}/log-session`} className="flex-1">
          <Button variant="secondary" block>Log Session</Button>
        </Link>
        <Link href={`/pt-dashboard/clients/${clientId}/log-progress`} className="flex-1">
          <Button variant="secondary" block>Log Progress</Button>
        </Link>
      </div>
      <div className="flex gap-3 mb-8">
        <Link href={`/pt-dashboard/clients/${clientId}/assign-meal-plan`} className="flex-1">
          <Button variant="secondary" block>🥗 Assign Meal Plan</Button>
        </Link>
        <Link href={`/pt-dashboard/clients/${clientId}/nutrition-adherence`} className="flex-1">
          <Button variant="secondary" block>Nutrition Adherence</Button>
        </Link>
      </div>

      {/* Assigned Workouts */}
      <ListHeader title="Assigned Workouts" />
      {workouts.length === 0 ? (
        <EmptyState className="mb-8">No workouts assigned yet</EmptyState>
      ) : (
        <div className="space-y-2 mb-8">
          {workouts.map(w => (
            <Card key={w.id} radius="xl" className="flex items-center p-4">
              <div className="flex-1">
                <p className="font-semibold text-ink-900 text-sm">{w.title}</p>
                <p className="text-xs text-[--text-muted] capitalize">{w.difficulty} · {w.duration_minutes} min</p>
              </div>
              <Link
                href={`/pt-dashboard/clients/${clientId}/schedule-workout/${w.id}`}
                className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100"
                title="Schedule"
              >
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {/* Tasks */}
      <ListHeader
        title="Tasks"
        action={
          <button onClick={() => setAddingTask(o => !o)} className="text-ink-900">
            {addingTask ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            )}
          </button>
        }
      />

      {addingTask && (
        <Card radius="xl" className="mb-4 p-4">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="e.g. Drink 2L water today"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
              className="flex-1 px-3 py-2.5 border-[1.5px] border-border rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-surface"
            />
            <button
              onClick={handleAddTask}
              disabled={savingTask}
              className="w-10 h-10 rounded-lg bg-ink-900 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            {(["once", "daily", "weekly"] as const).map(opt => (
              <Chip key={opt} selected={newTaskRecurrence === opt} onClick={() => setNewTaskRecurrence(opt)} className="px-3 py-1.5 text-xs">
                {opt === "once" ? "Once" : opt === "daily" ? "Daily" : "Weekly"}
              </Chip>
            ))}
          </div>
          {newTaskRecurrence === "weekly" && (
            <div className="flex gap-1.5">
              {WEEKDAY_NAMES.map((label, day) => (
                <button
                  key={day}
                  onClick={() => setNewTaskWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())}
                  className={`w-8 h-8 rounded-full text-xs font-bold transition ${newTaskWeekdays.includes(day) ? "bg-ink-900 text-white" : "bg-surface-muted text-ink-600 border border-border"}`}
                >
                  {label[0]}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tasks.length === 0 ? (
        <EmptyState className="mb-8">No tasks assigned yet</EmptyState>
      ) : (
        <div className="space-y-2 mb-8">
          {tasks.map(task => {
            const done = isTaskDoneNow(task);
            const repeatLabel = task.recurrence === "daily"
              ? "Repeats daily"
              : task.recurrence === "weekly"
                ? `Repeats ${[...task.weekdays].sort().map(d => WEEKDAY_NAMES[d]).join(", ")}`
                : null;
            return (
              <button
                key={task.id}
                onClick={() => toggleTaskDone(task)}
                disabled={togglingTaskId === task.id}
                className="w-full text-left"
              >
                <Card radius="xl" className="flex items-center gap-3 p-4 hover:bg-surface-muted transition">
                  {togglingTaskId === task.id ? (
                    <svg className="animate-spin w-5 h-5 text-[--text-muted]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  ) : done ? (
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-[--gray-200] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth={2} /></svg>
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${done ? "text-[--text-muted] line-through" : "text-ink-900"}`}>{task.title}</p>
                    {repeatLabel && <p className="text-xs text-[--text-muted] mt-0.5">{repeatLabel}</p>}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {/* Body stats + mood */}
      {ptClient?.share_progress && (
        <>
          <ListHeader title="Body Stats" />
          {measurements.length === 0 ? (
            <EmptyState className="mb-8">No measurements logged yet</EmptyState>
          ) : (
            <Link href={`/pt-dashboard/clients/${clientId}/body-stats`} className="block mb-8">
              <Card radius="xl" className="flex items-center justify-between p-4 hover:bg-surface-muted transition">
                <div>
                  <p className="text-xl font-bold text-ink-900">{measurements[0].weight_kg} kg</p>
                  {measurements.length > 1 && measurements[0].weight_kg != null && measurements[1].weight_kg != null && (
                    <p className="text-xs text-[--text-muted] mt-1">
                      {Math.abs(measurements[0].weight_kg - measurements[1].weight_kg).toFixed(1)} kg since last log
                    </p>
                  )}
                  <p className="text-xs text-[--text-muted] mt-1">
                    Logged {new Date(measurements[0].logged_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <svg className="w-5 h-5 text-[--gray-200]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Card>
            </Link>
          )}

          <ListHeader title="Mood (7 days)" />
          <Card radius="xl" className="flex justify-between p-4 mb-8">
            {last7Days().map(date => {
              const entry = checkins.find(c => c.checkin_date === date);
              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  <span className="text-base">{entry ? MOOD_EMOJI[entry.mood] : "·"}</span>
                  <span className="text-[10px] font-semibold text-[--text-muted]">
                    {new Date(date + "T00:00:00").toLocaleDateString("en-KE", { weekday: "narrow" })}
                  </span>
                </div>
              );
            })}
          </Card>

          <ListHeader title="Strava Activity" />
          {activities.length === 0 ? (
            <EmptyState className="mb-8">No Strava activity yet</EmptyState>
          ) : (
            <div className="space-y-2 mb-8">
              {activities.map(a => (
                <Card key={a.id} radius="xl" className="flex items-center gap-3 p-4">
                  <span className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-sm flex-shrink-0">
                    {ACTIVITY_ICON[a.activity_type] ?? "⚡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink-900 text-sm truncate">
                      {a.name ?? (a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1))}
                    </p>
                    <p className="text-xs text-[--text-muted] mt-0.5">
                      {new Date(a.start_time).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                      {a.distance_meters ? ` · ${(a.distance_meters / 1000).toFixed(1)} km` : ""}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Progress / history */}
      <ListHeader title="Progress" />
      {!ptClient?.share_progress && history.length === 0 ? (
        <Card radius="xl" className="flex items-center gap-2 p-4 text-sm text-[--text-muted] bg-surface-muted">
          This client hasn&apos;t shared their workout progress with you yet
        </Card>
      ) : history.length === 0 ? (
        <EmptyState>No completed workouts yet</EmptyState>
      ) : (
        <div className="space-y-2">
          {!ptClient?.share_progress && (
            <Card radius="xl" className="p-3 text-xs text-[--text-muted] bg-surface-muted mb-2">
              This client hasn&apos;t shared their full progress — showing only what you&apos;ve logged yourself
            </Card>
          )}
          {history.map(h => {
            const expanded = expandedId === h.id;
            const groups = expanded ? groupByExercise(setLogs[h.id] ?? []) : [];
            return (
              <button
                key={h.id}
                onClick={() => setExpandedId(expanded ? null : h.id)}
                className="w-full text-left"
              >
                <Card radius="xl" className="p-4 hover:bg-surface-muted transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink-900 text-sm">{h.workouts?.title ?? "Workout"}</p>
                      <p className="text-xs text-[--text-muted] mt-0.5">
                        {new Date(h.completed_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                        {h.duration_minutes ? ` · ${h.duration_minutes} min` : ""}
                        {h.logged_by_pt_id ? " · Logged by you" : ""}
                      </p>
                    </div>
                    <svg className={`w-4 h-4 text-[--gray-200] transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-[--border-faint] space-y-3">
                      {h.rating && (
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <svg key={n} className={`w-3.5 h-3.5 ${n <= h.rating! ? "text-[--warning-500]" : "text-[--gray-200]"}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                          ))}
                        </div>
                      )}
                      {h.notes && <p className="text-sm text-[--text-secondary] italic">&quot;{h.notes}&quot;</p>}
                      {groups.length === 0 ? (
                        <EmptyState>No set details logged</EmptyState>
                      ) : (
                        groups.map(g => (
                          <div key={g.name}>
                            <p className="text-xs font-bold text-ink-900 mb-1.5">{g.name}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {g.sets.map(s => (
                                <span key={s.id} className="bg-surface-muted border border-[--border-faint] rounded-full px-2 py-0.5 text-[11px] font-semibold text-[--text-muted]">
                                  {s.weight_kg ? `${s.weight_kg}kg` : "—"}{s.reps ? ` × ${s.reps}` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
