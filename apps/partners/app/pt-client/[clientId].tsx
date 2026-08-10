import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

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
  id: string; activity_type: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility' | 'class' | 'other';
  name: string | null; start_time: string; distance_meters: number | null;
};
type TaskRow = {
  id: string; title: string; due_date: string | null; status: 'pending' | 'done';
  recurrence: 'once' | 'daily' | 'weekly'; weekdays: number[]; last_completed_date: string | null;
};

const MOOD_EMOJI: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
const STRAVA_ORANGE = '#FC4C02';
const ACTIVITY_ICON: Record<string, string> = {
  run: 'walk-outline', walk: 'footsteps-outline', cycle: 'bicycle-outline',
  strength: 'barbell-outline', mobility: 'body-outline', class: 'people-outline', other: 'fitness-outline',
};

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose Weight', build_muscle: 'Build Muscle',
  improve_mobility: 'Mobility', general_fitness: 'General Fitness',
  maintain_weight: 'Maintain Weight', eat_healthier: 'Eat Healthier',
};

function groupByExercise(logs: SetLogRow[]): { name: string; sets: SetLogRow[] }[] {
  const order: string[] = [];
  const byName = new Map<string, SetLogRow[]>();
  for (const log of logs) {
    const name = log.exercises?.name ?? 'Exercise';
    if (!byName.has(name)) { byName.set(name, []); order.push(name); }
    byName.get(name)!.push(log);
  }
  return order.map(name => ({ name, sets: byName.get(name)! }));
}

// Ported from apps/mobile/services/fitnessStats.ts (no shared package between
// apps in this monorepo) — keeps the streak definition identical to what the
// client sees on their own Fitness Journey page.
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

export default function PTClientDetailScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

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
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<'once' | 'daily' | 'weekly'>('once');
  const [newTaskWeekdays, setNewTaskWeekdays] = useState<number[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) { setLoading(false); return; }
    setPtId(pt.id);

    const [{ data: userRow }, { data: pcRow }, { data: profileRow }, { data: workoutRows }] = await Promise.all([
      supabase.from('users').select('name, email').eq('id', clientId).single(),
      supabase.from('pt_clients').select('id, share_progress').eq('pt_id', pt.id).eq('client_user_id', clientId).single(),
      supabase.from('fitness_profile').select('goals, experience_level').eq('user_id', clientId).maybeSingle(),
      supabase.from('workouts').select('id, title, difficulty, duration_minutes').eq('assigned_by', pt.id).eq('user_id', clientId).order('created_at', { ascending: false }),
    ]);

    setClient(userRow ?? null);
    setPtClient(pcRow ?? null);
    setProfile(profileRow ?? null);
    setWorkouts((workoutRows as any) ?? []);

    const { data: taskRows } = await supabase
      .from('client_tasks')
      .select('id, title, due_date, status, recurrence, weekdays, last_completed_date')
      .eq('pt_id', pt.id)
      .eq('client_user_id', clientId)
      .order('created_at', { ascending: false });
    setTasks((taskRows as any) ?? []);

    // workout_history / workout_set_logs / client_measurements always fetch —
    // RLS returns the client's full history when share_progress is on, or
    // just this trainer's own logged-in-person entries when it's off (a
    // trainer should always see what they themselves logged).
    const { data: historyRows } = await supabase
      .from('workout_history')
      .select('id, completed_at, duration_minutes, rating, notes, logged_by_pt_id, workouts(title)')
      .eq('user_id', clientId)
      .order('completed_at', { ascending: false })
      .limit(10);
    setHistory((historyRows as any) ?? []);

    const historyIds = (historyRows ?? []).map((h: any) => h.id);
    if (historyIds.length > 0) {
      const { data: logRows } = await supabase
        .from('workout_set_logs')
        .select('id, workout_history_id, set_number, weight_kg, reps, exercises(name)')
        .in('workout_history_id', historyIds)
        .order('set_number', { ascending: true });
      const grouped: Record<string, SetLogRow[]> = {};
      for (const log of (logRows as any) ?? []) {
        (grouped[log.workout_history_id] ??= []).push(log);
      }
      setSetLogs(grouped);
    } else {
      setSetLogs({});
    }

    const { data: measurementRows } = await supabase
      .from('client_measurements')
      .select('id, weight_kg, waist_cm, chest_cm, hips_cm, logged_at, logged_by_pt_id')
      .eq('user_id', clientId)
      .order('logged_at', { ascending: false })
      .limit(5);
    setMeasurements((measurementRows as any) ?? []);

    // Separate, uncapped fetch for the dashboard totals — `historyRows` above
    // is capped at 10 for the display list, which would undercount streak/
    // total-workouts/total-minutes for anyone with a longer history.
    const { data: allHistory } = await supabase
      .from('workout_history')
      .select('completed_at, duration_minutes')
      .eq('user_id', clientId)
      .limit(500);
    const rows = allHistory ?? [];
    setProgressStats({
      streak: computeStreak(rows.map(r => r.completed_at)),
      totalWorkouts: rows.length,
      totalMinutes: rows.reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0),
    });

    if (pcRow?.share_progress) {
      const { data: checkinRows } = await supabase
        .from('daily_checkins')
        .select('id, mood, checkin_date')
        .eq('user_id', clientId)
        .order('checkin_date', { ascending: false })
        .limit(7);
      setCheckins((checkinRows as any) ?? []);

      // RLS on `activities` grants trainers the same share_progress-gated
      // read as workout_history/measurements — see
      // 20260810000002_trainer_view_client_activities.sql.
      const { data: activityRows } = await supabase
        .from('activities')
        .select('id, activity_type, name, start_time, distance_meters')
        .eq('user_id', clientId)
        .order('start_time', { ascending: false })
        .limit(10);
      setActivities((activityRows as any) ?? []);
    } else {
      setCheckins([]);
      setActivities([]);
    }

    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || !ptId || !clientId) return;
    if (newTaskRecurrence === 'weekly' && newTaskWeekdays.length === 0) {
      Alert.alert('Pick a day', 'Choose at least one weekday for a weekly task.');
      return;
    }
    setSavingTask(true);
    const { data, error } = await supabase
      .from('client_tasks')
      .insert({
        pt_id: ptId, client_user_id: clientId, title,
        recurrence: newTaskRecurrence,
        weekdays: newTaskRecurrence === 'weekly' ? newTaskWeekdays : [],
      })
      .select('id, title, due_date, status, recurrence, weekdays, last_completed_date')
      .single();
    setSavingTask(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setTasks(prev => [data as TaskRow, ...prev]);
    setNewTaskTitle('');
    setNewTaskRecurrence('once');
    setNewTaskWeekdays([]);
    setAddingTask(false);
  };

  // Date-only sibling of apps/mobile/services/notifications.ts's
  // computeNextOccurrence — tasks have no time-of-day, only a day granularity.
  const currentTaskPeriod = (task: TaskRow, today: Date = new Date()): string => {
    const todayStr = today.toISOString().slice(0, 10);
    if (task.recurrence === 'daily') return todayStr;
    if (task.recurrence === 'weekly') {
      const dow = today.getDay();
      if (task.weekdays.includes(dow)) return todayStr;
      for (let back = 1; back <= 7; back++) {
        const d = new Date(today);
        d.setDate(d.getDate() - back);
        if (task.weekdays.includes(d.getDay())) return d.toISOString().slice(0, 10);
      }
    }
    return task.due_date ?? todayStr;
  };

  const isTaskDoneNow = (task: TaskRow): boolean =>
    task.recurrence === 'once' ? task.status === 'done' : task.last_completed_date === currentTaskPeriod(task);

  const toggleTaskDone = async (task: TaskRow) => {
    setTogglingTaskId(task.id);
    const doneNow = isTaskDoneNow(task);

    if (task.recurrence === 'once') {
      const nextStatus = doneNow ? 'pending' : 'done';
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      const { error } = await supabase.from('client_tasks').update({ status: nextStatus }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    } else {
      const nextDate = doneNow ? null : currentTaskPeriod(task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: nextDate } : t));
      const { error } = await supabase.from('client_tasks').update({ last_completed_date: nextDate }).eq('id', task.id);
      if (error) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: task.last_completed_date } : t));
    }
    setTogglingTaskId(null);
  };

  const name = client?.name ?? client?.email ?? 'Client';

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{name}</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <ThemedText style={styles.avatarText}>{name[0]?.toUpperCase()}</ThemedText>
            </View>
            <ThemedText style={styles.profileName}>{name}</ThemedText>
            {client?.email && <ThemedText style={styles.profileEmail}>{client.email}</ThemedText>}

            {profile && ptClient?.share_progress && ((profile.goals?.length ?? 0) > 0 || profile.experience_level) && (
              <View style={styles.profileTags}>
                {profile.goals?.map(g => (
                  <View key={g} style={styles.tag}><ThemedText style={styles.tagText}>{GOAL_LABELS[g] ?? g}</ThemedText></View>
                ))}
                {profile.experience_level && (
                  <View style={styles.tag}><ThemedText style={styles.tagText}>{profile.experience_level}</ThemedText></View>
                )}
              </View>
            )}
          </View>

          {ptClient?.share_progress && (
            <View style={styles.dashboard}>
              {[
                { icon: 'flame', color: '#f97316', label: 'Current Streak', value: `${progressStats.streak} days` },
                { icon: 'barbell', color: '#1d3cb0', label: 'Workouts', value: `${progressStats.totalWorkouts} completed` },
                { icon: 'time', color: '#16a34a', label: 'Minutes', value: `${progressStats.totalMinutes}` },
                { icon: 'scale', color: '#7c3aed', label: 'Weight', value: measurements[0]?.weight_kg != null ? `${measurements[0].weight_kg}kg` : 'Not logged' },
              ].map((row, i, arr) => (
                <View key={row.label} style={[styles.dashboardRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.dashboardRowLeft}>
                    <View style={[styles.dashboardIconWrap, { backgroundColor: `${row.color}1a` }]}>
                      <Ionicons name={`${row.icon}-outline` as any} size={15} color={row.color} />
                    </View>
                    <ThemedText style={styles.dashboardLabel}>{row.label}</ThemedText>
                  </View>
                  <ThemedText style={styles.dashboardValue}>{row.value}</ThemedText>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => router.push({ pathname: '/pt-client/assign-workout', params: { clientId } })}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <ThemedText style={styles.assignBtnText}>Assign Workout</ThemedText>
          </TouchableOpacity>

          <View style={styles.secondaryBtnRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push({ pathname: '/pt-client/log-session', params: { clientId } })}
              activeOpacity={0.85}
            >
              <Ionicons name="barbell-outline" size={18} color="#000" />
              <ThemedText style={styles.secondaryBtnText}>Log Session</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push({ pathname: '/pt-client/log-progress', params: { clientId } })}
              activeOpacity={0.85}
            >
              <Ionicons name="body-outline" size={18} color="#000" />
              <ThemedText style={styles.secondaryBtnText}>Log Progress</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.secondaryBtnRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push({ pathname: '/pt-client/assign-meal-plan', params: { clientId } })}
              activeOpacity={0.85}
            >
              <Ionicons name="restaurant-outline" size={18} color="#000" />
              <ThemedText style={styles.secondaryBtnText}>Assign Meal Plan</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push({ pathname: '/pt-client/nutrition-adherence', params: { clientId } })}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#000" />
              <ThemedText style={styles.secondaryBtnText}>Nutrition Adherence</ThemedText>
            </TouchableOpacity>
          </View>

          <ThemedText style={styles.sectionTitle}>Assigned Workouts</ThemedText>
          {workouts.length === 0 ? (
            <ThemedText style={styles.emptyText}>No workouts assigned yet</ThemedText>
          ) : (
            <View style={styles.cardList}>
              {workouts.map(w => (
                <View key={w.id} style={styles.workoutCard}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.workoutTitle}>{w.title}</ThemedText>
                    <ThemedText style={styles.workoutMeta}>
                      {w.difficulty} · {w.duration_minutes} min
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    style={styles.scheduleIconBtn}
                    onPress={() => router.push({ pathname: '/pt-client/schedule-workout', params: { workoutId: w.id, clientId } })}
                    hitSlop={8}
                  >
                    <Ionicons name="alarm-outline" size={18} color="#1d3cb0" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.tasksHeader}>
            <ThemedText style={[styles.sectionTitle, { marginBottom: 0 }]}>Tasks</ThemedText>
            <TouchableOpacity onPress={() => setAddingTask(o => !o)} hitSlop={8}>
              <Ionicons name={addingTask ? 'close' : 'add'} size={20} color="#000" />
            </TouchableOpacity>
          </View>

          {addingTask && (
            <View style={{ marginBottom: 12 }}>
              <View style={styles.addTaskRow}>
                <TextInput
                  style={styles.addTaskInput}
                  placeholder="e.g. Drink 2L water today"
                  placeholderTextColor="#9ca3af"
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  returnKeyType="done"
                  onSubmitEditing={handleAddTask}
                />
                <TouchableOpacity style={styles.addTaskBtn} onPress={handleAddTask} disabled={savingTask}>
                  {savingTask
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="checkmark" size={18} color="#fff" />
                  }
                </TouchableOpacity>
              </View>

              <View style={styles.recurRow}>
                {(['once', 'daily', 'weekly'] as const).map(opt => {
                  const active = newTaskRecurrence === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.recurChip, active && styles.recurChipActive]}
                      onPress={() => setNewTaskRecurrence(opt)}
                    >
                      <ThemedText style={[styles.recurChipText, active && styles.recurChipTextActive]}>
                        {opt === 'once' ? 'Once' : opt === 'daily' ? 'Daily' : 'Weekly'}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {newTaskRecurrence === 'weekly' && (
                <View style={styles.weekdayRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, day) => {
                    const active = newTaskWeekdays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.weekdayChip, active && styles.weekdayChipActive]}
                        onPress={() => setNewTaskWeekdays(prev =>
                          prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())}
                      >
                        <ThemedText style={[styles.weekdayChipText, active && styles.weekdayChipTextActive]}>{label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {tasks.length === 0 ? (
            <ThemedText style={styles.emptyText}>No tasks assigned yet</ThemedText>
          ) : (
            <View style={styles.cardList}>
              {tasks.map(task => {
                const done = isTaskDoneNow(task);
                const repeatLabel = task.recurrence === 'daily'
                  ? 'Repeats daily'
                  : task.recurrence === 'weekly'
                    ? `Repeats ${[...task.weekdays].sort().map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`
                    : null;
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.taskRow}
                    activeOpacity={0.75}
                    onPress={() => toggleTaskDone(task)}
                    disabled={togglingTaskId === task.id}
                  >
                    {togglingTaskId === task.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20} color={done ? '#1d3cb0' : '#d1d5db'}
                      />
                    )}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.taskTitle, done && styles.taskTitleDone]}>
                        {task.title}
                      </ThemedText>
                      {repeatLabel && <ThemedText style={styles.taskRepeatLabel}>{repeatLabel}</ThemedText>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {ptClient?.share_progress && (
            <>
              <ThemedText style={styles.sectionTitle}>Body Stats</ThemedText>
              {measurements.length === 0 ? (
                <ThemedText style={styles.emptyText}>No measurements logged yet</ThemedText>
              ) : (
                <TouchableOpacity
                  style={styles.bodyStatsCard}
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/pt-client/body-stats', params: { clientId } })}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.bodyStatsValue}>{measurements[0].weight_kg} kg</ThemedText>
                    {measurements.length > 1 && measurements[0].weight_kg != null && measurements[1].weight_kg != null && (
                      <View style={styles.bodyStatsDeltaRow}>
                        <Ionicons
                          name={measurements[0].weight_kg! >= measurements[1].weight_kg! ? 'arrow-up' : 'arrow-down'}
                          size={12} color="#9ca3af"
                        />
                        <ThemedText style={styles.bodyStatsDelta}>
                          {Math.abs(measurements[0].weight_kg! - measurements[1].weight_kg!).toFixed(1)} kg since last log
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText style={styles.bodyStatsDate}>
                      Logged {new Date(measurements[0].logged_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                </TouchableOpacity>
              )}

              <ThemedText style={styles.sectionTitle}>Mood (7 days)</ThemedText>
              <View style={styles.moodWeekCard}>
                {last7Days().map(date => {
                  const entry = checkins.find(c => c.checkin_date === date);
                  return (
                    <View key={date} style={styles.moodDayWrap}>
                      <ThemedText style={styles.moodDayEmoji}>{entry ? MOOD_EMOJI[entry.mood] : '·'}</ThemedText>
                      <ThemedText style={styles.moodDayLabel}>
                        {new Date(date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'narrow' })}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>

              <ThemedText style={styles.sectionTitle}>Strava Activity</ThemedText>
              {activities.length === 0 ? (
                <ThemedText style={styles.emptyText}>No Strava activity yet</ThemedText>
              ) : (
                <View style={styles.cardList}>
                  {activities.map(a => (
                    <View key={a.id} style={styles.activityRow}>
                      <View style={styles.activityIconWrap}>
                        <Ionicons name={(ACTIVITY_ICON[a.activity_type] ?? 'fitness-outline') as any} size={16} color={STRAVA_ORANGE} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.workoutTitle} numberOfLines={1}>
                          {a.name ?? (a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1))}
                        </ThemedText>
                        <ThemedText style={styles.workoutMeta}>
                          {new Date(a.start_time).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                          {a.distance_meters ? ` · ${(a.distance_meters / 1000).toFixed(1)} km` : ''}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <ThemedText style={styles.sectionTitle}>Progress</ThemedText>
          {!ptClient?.share_progress && history.length === 0 ? (
            <View style={styles.shareNotice}>
              <Ionicons name="lock-closed-outline" size={16} color="#9ca3af" />
              <ThemedText style={styles.shareNoticeText}>
                This client hasn't shared their workout progress with you yet
              </ThemedText>
            </View>
          ) : history.length === 0 ? (
            <ThemedText style={styles.emptyText}>No completed workouts yet</ThemedText>
          ) : (
            <View style={styles.cardList}>
              {!ptClient?.share_progress && (
                <View style={styles.shareNotice}>
                  <Ionicons name="lock-closed-outline" size={13} color="#9ca3af" />
                  <ThemedText style={styles.shareNoticeText}>
                    This client hasn't shared their full progress — showing only what you've logged yourself
                  </ThemedText>
                </View>
              )}
              {history.map(h => {
                const expanded = expandedId === h.id;
                const groups = expanded ? groupByExercise(setLogs[h.id] ?? []) : [];
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={styles.workoutCard}
                    activeOpacity={0.8}
                    onPress={() => setExpandedId(expanded ? null : h.id)}
                  >
                    <View style={{ width: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.workoutTitle}>{h.workouts?.title ?? 'Workout'}</ThemedText>
                          <ThemedText style={styles.workoutMeta}>
                            {new Date(h.completed_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                            {h.duration_minutes ? ` · ${h.duration_minutes} min` : ''}
                            {h.logged_by_pt_id ? ' · Logged by you' : ''}
                          </ThemedText>
                        </View>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#d1d5db" />
                      </View>

                      {expanded && (
                        <View style={styles.expandedBox}>
                          {h.rating && (
                            <View style={styles.ratingRow}>
                              {[1, 2, 3, 4, 5].map(n => (
                                <Ionicons
                                  key={n}
                                  name={n <= h.rating! ? 'star' : 'star-outline'}
                                  size={14} color="#f59e0b"
                                />
                              ))}
                            </View>
                          )}
                          {h.notes && (
                            <ThemedText style={styles.historyNote}>"{h.notes}"</ThemedText>
                          )}
                          {groups.length === 0 ? (
                            <ThemedText style={styles.noSetsText}>No set details logged</ThemedText>
                          ) : (
                            groups.map(g => (
                              <View key={g.name} style={styles.exerciseRow}>
                                <ThemedText style={styles.exerciseName}>{g.name}</ThemedText>
                                <View style={styles.setChipRow}>
                                  {g.sets.map(s => (
                                    <View key={s.id} style={styles.setChip}>
                                      <ThemedText style={styles.setChipText}>
                                        {s.weight_kg ? `${s.weight_kg}kg` : '—'}{s.reps ? ` × ${s.reps}` : ''}
                                      </ThemedText>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#000', textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 20 },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 16,
  },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#1d3cb0' },
  profileName: { fontSize: 18, fontWeight: '800', color: '#000' },
  profileEmail: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  profileTags: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tag: { backgroundColor: '#f0f5ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  tagText: { fontSize: 12, fontWeight: '600', color: '#1d3cb0', textTransform: 'capitalize' },

  dashboard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 16,
  },
  dashboardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  dashboardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dashboardIconWrap: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  dashboardLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dashboardValue: { fontSize: 14, fontWeight: '800', color: '#000' },

  assignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#000', paddingVertical: 16, borderRadius: 30, marginBottom: 24,
  },
  assignBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  secondaryBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#000', paddingVertical: 14, borderRadius: 30,
  },
  secondaryBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af', marginBottom: 24 },

  tasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addTaskRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addTaskInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#000',
  },
  addTaskBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  taskTitle: { fontSize: 14, fontWeight: '600', color: '#000' },
  taskTitleDone: { color: '#9ca3af', textDecorationLine: 'line-through' },
  taskRepeatLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  recurRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  recurChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
  },
  recurChipActive: { backgroundColor: '#1d3cb0', borderColor: '#1d3cb0' },
  recurChipText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  recurChipTextActive: { color: '#fff' },

  weekdayRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  weekdayChip: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
  },
  weekdayChipActive: { backgroundColor: '#000', borderColor: '#000' },
  weekdayChipText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  weekdayChipTextActive: { color: '#fff' },

  moodWeekCard: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 24,
  },
  moodDayWrap: { alignItems: 'center', gap: 4 },
  moodDayEmoji: { fontSize: 16 },
  moodDayLabel: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },

  bodyStatsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 24,
  },
  bodyStatsValue: { fontSize: 20, fontWeight: '800', color: '#000' },
  bodyStatsDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  bodyStatsDelta: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  bodyStatsDate: { fontSize: 11, color: '#9ca3af', marginTop: 4 },

  cardList: { gap: 10, marginBottom: 24 },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f0f0f0',
  },
  activityIconWrap: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff1eb',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  workoutCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f0f0f0',
  },
  workoutTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  workoutMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2, textTransform: 'capitalize' },
  scheduleIconBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },

  expandedBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 10 },
  ratingRow: { flexDirection: 'row', gap: 2 },
  historyNote: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', lineHeight: 18 },
  noSetsText: { fontSize: 13, color: '#9ca3af' },
  exerciseRow: { gap: 6 },
  exerciseName: { fontSize: 13, fontWeight: '700', color: '#000' },
  setChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setChip: {
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#f0f0f0',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  setChipText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },

  shareNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  shareNoticeText: { flex: 1, fontSize: 13, color: '#9ca3af', lineHeight: 18 },
});
