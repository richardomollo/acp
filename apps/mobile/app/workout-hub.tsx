import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import {
  computeNextOccurrence, cancelWorkoutNotifications,
  ensureNotificationPermission, scheduleWorkoutNotifications,
  type Recurrence,
} from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Workout {
  id: string;
  title: string;
  description: string | null;
  category: string;
  location_type: 'home' | 'gym' | 'both';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration_minutes: number;
  goal: string | null;
  equipment: string | null;
  user_id: string | null;
  created_at: string;
  assigned_by: string | null;
}

interface ScheduleRow {
  id: string;
  workout_id: string;
  start_date: string;
  time_of_day: string;
  recurrence: Recurrence;
  weekdays: number[];
  notification_ids: string[];
  assigned_by: string | null;
  location_type: 'gym' | 'home' | 'outdoor' | null;
  location_address: string | null;
  workouts: { title: string; category: string } | null;
}

interface TaskRow {
  id: string;
  due_date: string | null;
  status: 'pending' | 'done';
  recurrence: Recurrence;
  weekdays: number[];
  last_completed_date: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatUpcoming(d: Date): string {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function recurrenceLabel(recurrence: Recurrence): string {
  if (recurrence === 'daily') return 'Daily';
  if (recurrence === 'weekly') return 'Weekly';
  return 'Once';
}

// Date-only sibling of computeNextOccurrence — tasks have no time-of-day,
// only a day granularity.
function currentTaskPeriod(task: TaskRow, today: Date = new Date()): string {
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
}

function isTaskDoneNow(task: TaskRow): boolean {
  return task.recurrence === 'once' ? task.status === 'done' : task.last_completed_date === currentTaskPeriod(task);
}

// ── Visual config per workout category ────────────────────────────────────────

const CARD_STYLES: Record<string, { colors: readonly [string, string]; icon: string }> = {
  full_body: { colors: [palette.blue500, '#0044ee'] as const, icon: 'body-outline'     },
  hiit:      { colors: ['#ef4444', '#f97316'] as const,       icon: 'flame-outline'    },
  mobility:  { colors: ['#15803d', '#16a34a'] as const,       icon: 'leaf-outline'     },
  core:      { colors: ['#7c3aed', '#9333ea'] as const,       icon: 'shield-outline'   },
  push:      { colors: ['#111111', '#374151'] as const,       icon: 'barbell-outline'  },
  pull:      { colors: ['#1d4ed8', '#1e40af'] as const,       icon: 'fitness-outline'  },
  legs:      { colors: ['#92400e', '#b45309'] as const,       icon: 'walk-outline'     },
  strength:  { colors: ['#000000', '#111827'] as const,       icon: 'trophy-outline'   },
};

const DEFAULT_CARD = { colors: [palette.ink900, '#333'] as const, icon: 'barbell-outline' };

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner:     { bg: palette.success50,  text: palette.success700 },
  intermediate: { bg: palette.warning50,  text: palette.warning800 },
  advanced:     { bg: palette.danger50,   text: palette.danger600  },
};

const GOAL_LABELS: Record<string, string> = {
  lose_weight:      'Lose Weight',
  build_muscle:     'Build Muscle',
  improve_mobility: 'Mobility',
  general_fitness:  'General Fitness',
};

const CATEGORY_LABELS: Record<string, string> = {
  full_body: 'Full Body',
  hiit:      'HIIT',
  mobility:  'Mobility',
  core:      'Core',
  push:      'Push',
  pull:      'Pull',
  legs:      'Legs',
  strength:  'Strength',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  const cs   = CARD_STYLES[workout.category] ?? DEFAULT_CARD;
  const diff = DIFFICULTY_COLORS[workout.difficulty] ?? DIFFICULTY_COLORS.beginner;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.88}>
      <View style={s.cardBody}>
        {/* Top row: icon + title/category + location */}
        <View style={s.cardTopRow}>
          <View style={s.catIconWrap}>
            <Ionicons name={cs.icon as any} size={19} color={palette.ink900} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <ThemedText style={s.cardTitle} numberOfLines={1}>{workout.title}</ThemedText>
            <ThemedText style={s.catLabel}>
              {CATEGORY_LABELS[workout.category] ?? workout.category}
              {workout.assigned_by ? ' · Assigned by trainer' : ''}
            </ThemedText>
          </View>
          <View style={s.locationPill}>
            <ThemedText style={s.locationPillText}>
              {workout.location_type === 'home' ? '🏠 Home' : workout.location_type === 'gym' ? '🏋️ Gym' : '🌐 Any'}
            </ThemedText>
          </View>
        </View>

        {workout.description ? (
          <ThemedText style={s.cardDesc} numberOfLines={2}>{workout.description}</ThemedText>
        ) : null}

        {/* Meta row */}
        <View style={s.cardMeta}>
          <View style={s.metaItem}>
            <Ionicons name="time-outline" size={13} color={palette.gray450} />
            <ThemedText style={s.metaText}>{workout.duration_minutes} min</ThemedText>
          </View>
          {workout.equipment && workout.equipment !== 'None' ? (
            <View style={s.metaItem}>
              <Ionicons name="barbell-outline" size={13} color={palette.gray450} />
              <ThemedText style={s.metaText} numberOfLines={1}>Equipment needed</ThemedText>
            </View>
          ) : (
            <View style={s.metaItem}>
              <Ionicons name="checkmark-circle-outline" size={13} color={palette.success700} />
              <ThemedText style={[s.metaText, { color: palette.success700 }]}>No equipment</ThemedText>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.cardFooter}>
          <View style={[s.diffBadge, { backgroundColor: diff.bg }]}>
            <ThemedText style={[s.diffText, { color: diff.text }]}>
              {workout.difficulty.charAt(0).toUpperCase() + workout.difficulty.slice(1)}
            </ThemedText>
          </View>
          {workout.goal ? (
            <ThemedText style={s.goalLabel}>{GOAL_LABELS[workout.goal] ?? workout.goal}</ThemedText>
          ) : null}
          <View style={s.startBtn}>
            <ThemedText style={s.startBtnText}>View</ThemedText>
            <Ionicons name="arrow-forward" size={13} color={palette.ink900} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function WorkoutHubScreen() {
  const router = useRouter();

  const [myWorkouts, setMyWorkouts] = useState<Workout[]>([]);
  const [schedules, setSchedules]   = useState<ScheduleRow[]>([]);
  const [tasks, setTasks]           = useState<TaskRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [userId, setUserId]         = useState<string | null>(null);

  // Local notifications only fire on the device that registered them, so a
  // schedule a trainer creates from the partner app can't ring on this
  // client's phone — this device self-registers the reminder the first time
  // it sees a trainer-assigned schedule with no notification_ids yet, then
  // writes the resulting ids back so it only ever happens once.
  const registerTrainerScheduleNotifications = async (rows: ScheduleRow[]) => {
    const pending = rows.filter(r => r.assigned_by && r.notification_ids.length === 0);
    if (pending.length === 0) return;
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    for (const row of pending) {
      const [hh, mm] = row.time_of_day.split(':').map(Number);
      const timeOfDay = new Date();
      timeOfDay.setHours(hh, mm, 0, 0);
      const ids = await scheduleWorkoutNotifications({
        workoutTitle: row.workouts?.title ?? 'Workout',
        startDate: new Date(`${row.start_date}T00:00:00`),
        timeOfDay,
        recurrence: row.recurrence,
        weekdays: row.weekdays,
      });
      if (ids.length > 0) {
        await supabase.from('workout_schedules').update({ notification_ids: ids }).eq('id', row.id);
      }
    }
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (active) setUserId(session?.user.id ?? null);

      if (!session?.user.id) {
        if (active) { setMyWorkouts([]); setSchedules([]); setTasks([]); setLoading(false); }
        return;
      }

      const [{ data }, { data: scheduleData }, { data: taskData }] = await Promise.all([
        supabase
          .from('workouts')
          .select('id, title, description, category, location_type, difficulty, duration_minutes, goal, equipment, user_id, created_at, assigned_by')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('workout_schedules')
          .select('id, workout_id, start_date, time_of_day, recurrence, weekdays, notification_ids, assigned_by, location_type, location_address, workouts ( title, category )')
          .eq('user_id', session.user.id)
          .eq('is_active', true),
        supabase
          .from('client_tasks')
          .select('id, due_date, status, recurrence, weekdays, last_completed_date')
          .eq('client_user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (active) {
        setMyWorkouts((data as Workout[]) ?? []);
        const scheduleRows = (scheduleData as unknown as ScheduleRow[]) ?? [];
        setSchedules(scheduleRows);
        registerTrainerScheduleNotifications(scheduleRows);
        setTasks((taskData as TaskRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const upcoming = useMemo(() => {
    return schedules
      .map(row => ({ row, at: computeNextOccurrence(row) }))
      .filter((x): x is { row: ScheduleRow; at: Date } => !!x.at)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [schedules]);

  const assignedWorkouts = useMemo(() => myWorkouts.filter(w => w.assigned_by), [myWorkouts]);
  const ownWorkouts = useMemo(() => myWorkouts.filter(w => !w.assigned_by), [myWorkouts]);

  const handleCancelSchedule = (row: ScheduleRow) => {
    Alert.alert('Cancel this schedule?', 'The reminder will be removed.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Schedule', style: 'destructive',
        onPress: async () => {
          await cancelWorkoutNotifications(row.notification_ids ?? []);
          await supabase.from('workout_schedules').delete().eq('id', row.id);
          setSchedules(prev => prev.filter(s => s.id !== row.id));
        },
      },
    ]);
  };

  const pendingTaskCount = tasks.filter(t => !isTaskDoneNow(t)).length;

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={20} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Workout Hub</ThemedText>
            <ThemedText style={s.headerSub}>Free workouts, any time</ThemedText>
          </View>
          {userId && (
            <TouchableOpacity
              style={s.journeyBtn}
              onPress={() => router.push('/fitness-journey')}
              activeOpacity={0.8}
            >
              <Ionicons name="stats-chart-outline" size={16} color={palette.blue500} />
              <ThemedText style={s.journeyBtnText}>Journey</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Upcoming Workouts ── */}
          {upcoming.length > 0 && (
            <>
              <View style={s.bodyPartHeader}>
                <ThemedText style={s.bodyPartEyebrow}>SCHEDULED</ThemedText>
                <ThemedText style={s.bodyPartTitle}>Upcoming Workouts</ThemedText>
              </View>
              <View style={s.upcomingList}>
                {upcoming.map(({ row, at }, i) => (
                  <View
                    key={row.id}
                    style={[s.upcomingRow, i === upcoming.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <TouchableOpacity
                      style={s.upcomingRowMain}
                      onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: row.workout_id } } as any)}
                      activeOpacity={0.8}
                    >
                      <View style={s.upcomingIcon}>
                        <Ionicons name="barbell-outline" size={17} color={palette.blue500} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.upcomingTitle} numberOfLines={1}>
                          {row.workouts?.title ?? 'Workout'}
                        </ThemedText>
                        <ThemedText style={s.upcomingMeta}>
                          {formatUpcoming(at)}
                          {row.location_type === 'outdoor' && row.location_address
                            ? ` · ${row.location_address}`
                            : row.location_type
                              ? ` · ${row.location_type === 'gym' ? 'Gym' : 'Home'}`
                              : ''}
                        </ThemedText>
                      </View>
                      <View style={s.upcomingBadge}>
                        <ThemedText style={s.upcomingBadgeText}>{recurrenceLabel(row.recurrence)}</ThemedText>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleCancelSchedule(row)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={palette.gray300} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Tasks from your trainer ── */}
          {tasks.length > 0 && (
            <TouchableOpacity
              style={s.taskTeaserCard}
              onPress={() => router.push('/trainer-tasks' as any)}
              activeOpacity={0.85}
            >
              <View style={s.taskTeaserIcon}>
                <Ionicons name="checkbox-outline" size={20} color={palette.blue500} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.taskTeaserTitle}>
                  {pendingTaskCount > 0 ? `${pendingTaskCount} task${pendingTaskCount === 1 ? '' : 's'} to do` : 'All caught up'}
                </ThemedText>
                <ThemedText style={s.taskTeaserSub}>Tasks from your trainer</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>
          )}

          {/* ── Assigned by Your Trainer ── */}
          {assignedWorkouts.length > 0 ? (
            <>
              <View style={s.mySectionRow}>
                <ThemedText style={[s.mySectionLabel, { marginBottom: 0 }]}>Assigned by Your Trainer</ThemedText>
                {assignedWorkouts.length > 1 && (
                  <TouchableOpacity onPress={() => router.push('/your-workouts' as any)}>
                    <ThemedText style={s.seeAllText}>See all</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
              <WorkoutCard
                workout={assignedWorkouts[0]}
                onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: assignedWorkouts[0].id } })}
              />
            </>
          ) : (
            <>
              <ThemedText style={s.mySectionLabel}>Assigned by Your Trainer</ThemedText>
              <TouchableOpacity
                style={s.browseCta}
                onPress={() => router.push('/(tabs)/trainers' as any)}
                activeOpacity={0.85}
              >
                <View style={s.browseCtaIcon}>
                  <Ionicons name="person-outline" size={22} color={palette.blue500} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.createCtaTitle}>Find a Personal Trainer</ThemedText>
                  <ThemedText style={s.createCtaSub}>Get a custom workout plan and 1-on-1 coaching</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
              </TouchableOpacity>
            </>
          )}

          {/* ── Browse Exercises ── */}
          <View style={s.bodyPartHeader}>
            <ThemedText style={s.bodyPartEyebrow}>EXERCISES</ThemedText>
            <ThemedText style={s.bodyPartTitle}>Browse Exercises</ThemedText>
          </View>
          <TouchableOpacity
            style={s.browseCta}
            onPress={() => router.push('/browse-exercises' as any)}
            activeOpacity={0.85}
          >
            <View style={s.browseCtaIcon}>
              <Ionicons name="search-outline" size={22} color={palette.blue500} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.createCtaTitle}>By Body Part & Premade Workouts</ThemedText>
              <ThemedText style={s.createCtaSub}>800+ exercises from ExerciseDB, plus curated workouts</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>

         <View style={s.bodyPartHeader}>
            <ThemedText style={s.bodyPartEyebrow}>WORKOUT BUILDER</ThemedText>
            <ThemedText style={s.bodyPartTitle}>Your Own Workouts</ThemedText>
          </View>

          {/* ── My Workouts ── */}
          {ownWorkouts.length > 0 && (
            <>
              <View style={s.mySectionRow}>
                <ThemedText style={[s.mySectionLabel, { marginBottom: 0 }]}>My Workouts</ThemedText>
                {ownWorkouts.length > 1 && (
                  <TouchableOpacity onPress={() => router.push('/your-workouts' as any)}>
                    <ThemedText style={s.seeAllText}>See all</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
              <WorkoutCard
                workout={ownWorkouts[0]}
                onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: ownWorkouts[0].id } })}
              />
            </>
          )}

           {/* ── Create Your Workout CTA ── */}
            <ThemedText style={s.mySectionLabel}>Create New</ThemedText>
          <TouchableOpacity
            style={s.createCta}
            onPress={() => router.push('/create-workout' as any)}
            activeOpacity={0.85}
          >
            <View style={s.createCtaIcon}>
              <Ionicons name="add" size={22} color={palette.blue500} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.createCtaTitle}>Create Your Own Workout</ThemedText>
              <ThemedText style={s.createCtaSub}>Pick exercises, set reps & rest · home or gym</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  journeyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: palette.blue25, borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  journeyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  // ── Workout card
  card: {
    marginBottom: 14, borderRadius: radii.xl,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
  },
  cardBody: { padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  catIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: palette.ink900 },
  catLabel: { fontSize: 12, fontWeight: '600', color: palette.gray300, marginTop: 1 },
  locationPill: {
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, flexShrink: 0,
  },
  locationPillText: { fontSize: 11.5, fontWeight: '600', color: palette.gray450 },
  cardDesc: { fontSize: 13, color: palette.gray450, lineHeight: 18, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, fontWeight: '500', color: palette.gray450 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline },
  diffBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  diffText: { fontSize: 11, fontWeight: '700' },
  goalLabel: { flex: 1, fontSize: 12, color: palette.gray300, fontWeight: '500' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.hairline, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  startBtnText: { fontSize: 12.5, fontWeight: '700', color: palette.ink900 },

  // ── Section header
  bodyPartHeader: { marginBottom: 14 },
  bodyPartEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, color: palette.gray300, textTransform: 'uppercase', marginBottom: 4 },
  bodyPartTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },

  // ── Create CTA
  createCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.xl, borderWidth: 1,
    borderColor: palette.hairline, backgroundColor: palette.white,
    padding: 14, marginBottom: 24, ...shadows.sm,
  },
  createCtaIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  createCtaTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  createCtaSub: { fontSize: 12, color: palette.gray300, marginTop: 2 },

  // ── Browse Exercises CTA
  browseCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.xl, borderWidth: 1,
    borderColor: palette.hairline, backgroundColor: palette.white,
    padding: 14, marginBottom: 24, ...shadows.sm,
  },
  browseCtaIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },

  mySectionLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  mySectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  seeAllText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },

  // Upcoming workouts
  upcomingList: {
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 14, marginBottom: 28,
  },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  upcomingRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upcomingIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  upcomingTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  upcomingMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  upcomingBadge: {
    backgroundColor: palette.warning100, borderRadius: radii.pill,
    paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  upcomingBadgeText: {
    fontSize: 10, fontWeight: '700', color: palette.warning700,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // Tasks teaser
  taskTeaserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 24, ...shadows.sm,
  },
  taskTeaserIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  taskTeaserTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  taskTeaserSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },
});
