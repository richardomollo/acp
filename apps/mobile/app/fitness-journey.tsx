import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { type Recurrence } from '@/services/notifications';
import { computeStreak, buildAchievements, type Stats, type Achievement } from '@/services/fitnessStats';
import { getStravaStatus } from '@/services/strava';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const STRAVA_ORANGE = '#FC4C02';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FitnessGoal {
  key: 'lose_weight' | 'build_muscle' | 'improve_mobility' | 'general_fitness' | 'maintain_weight' | 'eat_healthier';
  label: string;
  desc: string;
  icon: string;
  color: string;
}

interface ExperienceLevel {
  key: 'beginner' | 'intermediate' | 'advanced';
  label: string;
  desc: string;
  icon: string;
}

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { key: 'beginner',     label: 'Beginner',     desc: 'New to working out',      icon: 'leaf-outline'    },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training 6+ months',      icon: 'barbell-outline' },
  { key: 'advanced',     label: 'Advanced',     desc: 'Serious athlete',          icon: 'trophy-outline'  },
];

const GOALS: FitnessGoal[] = [
  { key: 'build_muscle',     label: 'Build Muscle',    desc: 'Strength & hypertrophy',  icon: 'barbell-outline',  color: '#1d4ed8' },
  { key: 'lose_weight',      label: 'Lose Weight',     desc: 'Burn fat & get lean',      icon: 'flame-outline',    color: '#ef4444' },
  { key: 'general_fitness',  label: 'General Fitness', desc: 'Overall health & energy',  icon: 'heart-outline',    color: '#16a34a' },
  { key: 'improve_mobility', label: 'Mobility',        desc: 'Flexibility & recovery',   icon: 'leaf-outline',     color: '#7c3aed' },
  { key: 'maintain_weight',  label: 'Maintain Weight', desc: 'Stay where you are',       icon: 'trending-up-outline', color: '#0891b2' },
  { key: 'eat_healthier',    label: 'Eat Healthier',   desc: 'Better food, fewer processed meals', icon: 'nutrition-outline', color: '#f59e0b' },
];

interface HistoryRow {
  completed_at: string;
  duration_minutes: number | null;
}

interface MeasurementRow {
  id: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  logged_at: string;
}

interface CheckinRow {
  id: string;
  mood: number;
  checkin_date: string;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'done';
  recurrence: Recurrence;
  weekdays: number[];
  last_completed_date: string | null;
}

interface NutritionStats {
  streak: number;
  mealsLogged: number;
  avgProtein: number;
  avgHydration: number;
}

interface ActivityRow {
  activity_type: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility' | 'class' | 'other';
  start_time: string;
  duration_seconds: number | null;
  moving_time_seconds: number | null;
  distance_meters: number | null;
}

interface OutdoorStats {
  runs: number;
  walks: number;
  rides: number;
  distanceKm: number;
  activeMinutes: number;
}

interface ChallengeRow {
  id: string;
  title: string;
  description: string | null;
  metric: 'distance_km' | 'activity_count' | 'days_active';
  target_value: number;
  activity_types: string[];
  period_start: string;
  period_end: string;
}

interface ChallengeProgress extends ChallengeRow {
  value: number;
}

function formatActiveTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '🙁' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '🙂' },
  { value: 5, emoji: '😄' },
] as const;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ value, label, icon, color = palette.blue500 }: { value: string; label: string; icon: string; color?: string }) {
  return (
    <View style={s.statCard}>
      <Ionicons name={icon as any} size={22} color={color} />
      <ThemedText style={s.statValue}>{value}</ThemedText>
      <ThemedText style={s.statLabel}>{label}</ThemedText>
    </View>
  );
}

function AchievementBadge({ a }: { a: Achievement }) {
  return (
    <View style={[s.achievement, !a.unlocked && s.achievementLocked]}>
      <View style={[s.achievementIcon, { backgroundColor: a.unlocked ? a.iconBg : palette.border }]}>
        <Ionicons name={a.icon as any} size={24} color={a.unlocked ? '#fff' : palette.gray300} />
      </View>
      <ThemedText style={[s.achievementTitle, !a.unlocked && s.achievementLockedText]}>
        {a.title}
      </ThemedText>
      <ThemedText style={s.achievementSub}>{a.subtitle}</ThemedText>
      {!a.unlocked && (
        <View style={s.lockOverlay}>
          <Ionicons name="lock-closed" size={12} color={palette.gray300} />
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FitnessJourneyScreen() {
  const router = useRouter();

  const [loading, setLoading]       = useState(true);
  const [stats, setStats]           = useState<Stats>({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
  const [userId, setUserId]         = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [goals, setGoals]           = useState<string[]>([]);
  const [level, setLevel]           = useState<string | null>(null);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [nutrition, setNutrition] = useState<NutritionStats>({ streak: 0, mealsLogged: 0, avgProtein: 0, avgHydration: 0 });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [outdoorStats, setOutdoorStats] = useState<OutdoorStats>({ runs: 0, walks: 0, rides: 0, distanceKm: 0, activeMinutes: 0 });
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!active) return;

      if (!session?.user.id) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }

      setIsLoggedIn(true);
      setUserId(session.user.id);

      const [
        { data }, { data: profileData }, { data: measurementData }, { data: checkinData },
        { data: taskData }, { data: mealLogsData }, { data: activitiesData }, { data: challengesData },
        stravaStatus,
      ] = await Promise.all([
        supabase
          .from('workout_history')
          .select('completed_at, duration_minutes')
          .eq('user_id', session.user.id)
          .order('completed_at', { ascending: false })
          .limit(500),
        supabase
          .from('fitness_profile')
          .select('goals, experience_level, starting_weight_kg, goal_weight_kg')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('client_measurements')
          .select('id, weight_kg, waist_cm, chest_cm, hips_cm, logged_at')
          .eq('user_id', session.user.id)
          .order('logged_at', { ascending: false })
          .limit(2),
        supabase
          .from('daily_checkins')
          .select('id, mood, checkin_date, water_liters')
          .eq('user_id', session.user.id)
          .order('checkin_date', { ascending: false })
          .limit(7),
        supabase
          .from('client_tasks')
          .select('id, title, due_date, status, recurrence, weekdays, last_completed_date')
          .eq('client_user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('meal_logs')
          .select('log_date, meal_plan_items(meals(protein_g))')
          .eq('user_id', session.user.id)
          .eq('status', 'eaten')
          .order('log_date', { ascending: false })
          .limit(500),
        // Strava-imported (and future acp/partner-sourced) tracked activities —
        // kept separate from workout_history (strength-training sessions).
        supabase
          .from('activities')
          .select('activity_type, start_time, duration_seconds, moving_time_seconds, distance_meters')
          .eq('user_id', session.user.id)
          .order('start_time', { ascending: false })
          .limit(500),
        supabase
          .from('challenges')
          .select('id, title, description, metric, target_value, activity_types, period_start, period_end')
          .eq('is_active', true),
        getStravaStatus(),
      ]);

      if (active) setStravaConnected(stravaStatus.connected);

      if (active) setGoals(profileData?.goals ?? []);
      if (active && profileData?.experience_level) setLevel(profileData.experience_level);
      if (active) setStartingWeight(profileData?.starting_weight_kg ?? null);
      if (active) setGoalWeight(profileData?.goal_weight_kg ?? null);
      if (active) setMeasurements((measurementData as unknown as MeasurementRow[]) ?? []);
      if (active) setCheckins((checkinData as unknown as CheckinRow[]) ?? []);
      if (active) setTasks((taskData as unknown as TaskRow[]) ?? []);

      if (active) {
        const logs = (mealLogsData as any[]) ?? [];
        const { current: nutritionStreak } = computeStreak(logs.map(l => ({ completed_at: l.log_date })));
        const distinctDays = new Set(logs.map(l => l.log_date)).size || 1;
        const totalProtein = logs.reduce((sum, l) => sum + (l.meal_plan_items?.meals?.protein_g ?? 0), 0);
        const hydrationRows = (checkinData ?? []).map((r: any) => r.water_liters).filter((v: number | null): v is number => v != null);
        setNutrition({
          streak: nutritionStreak,
          mealsLogged: logs.length,
          avgProtein: Math.round(totalProtein / distinctDays),
          avgHydration: hydrationRows.length > 0 ? Math.round((hydrationRows.reduce((a, b) => a + b, 0) / hydrationRows.length) * 10) / 10 : 0,
        });
      }

      if (!active) return;
      const rows = (data as unknown as HistoryRow[]) ?? [];
      const activityRows = (activitiesData as unknown as ActivityRow[]) ?? [];

      // Streak counts a day once regardless of how many sources contributed
      // to it (gym workout + a Strava run on the same day is still one day)
      // — computeStreak already dedupes same-day entries via a Set, so
      // merging both sources before calling it is all that's needed.
      const { current, longest } = computeStreak([
        ...rows.map(r => ({ completed_at: r.completed_at })),
        ...activityRows.map(a => ({ completed_at: a.start_time })),
      ]);
      setStats({
        totalWorkouts: rows.length,
        totalMinutes:  rows.reduce((a, r) => a + (r.duration_minutes ?? 0), 0),
        streakDays:    current,
        longestStreak: longest,
      });

      const totalDistanceMeters = activityRows.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0);
      const totalActiveSeconds = activityRows.reduce((sum, a) => sum + (a.moving_time_seconds ?? a.duration_seconds ?? 0), 0);
      setOutdoorStats({
        runs: activityRows.filter(a => a.activity_type === 'run').length,
        walks: activityRows.filter(a => a.activity_type === 'walk').length,
        rides: activityRows.filter(a => a.activity_type === 'cycle').length,
        distanceKm: totalDistanceMeters / 1000,
        activeMinutes: Math.round(totalActiveSeconds / 60),
      });

      // Challenge progress is computed live from activities, not stored —
      // no participants/leaderboard table for this first pass.
      const challengeRows = (challengesData as unknown as ChallengeRow[]) ?? [];
      setChallenges(challengeRows.map(c => {
        const inWindow = activityRows.filter(a =>
          c.activity_types.includes(a.activity_type) &&
          a.start_time.slice(0, 10) >= c.period_start &&
          a.start_time.slice(0, 10) <= c.period_end,
        );
        let value = 0;
        if (c.metric === 'distance_km') value = inWindow.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0) / 1000;
        else if (c.metric === 'activity_count') value = inWindow.length;
        else if (c.metric === 'days_active') value = new Set(inWindow.map(a => a.start_time.slice(0, 10))).size;
        return { ...c, value };
      }));

      setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  const achievements = buildAchievements(stats);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const todayMood = checkins.find(c => c.checkin_date === todayDateStr())?.mood ?? null;

  // Date-only sibling of computeNextOccurrence — tasks have no time-of-day,
  // only a day granularity.
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

  const pendingTaskCount = tasks.filter(t => !isTaskDoneNow(t)).length;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        {/* ── Header ── */}
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>My Journey</ThemedText>
            <ThemedText style={s.headerSub}>Track your fitness progress</ThemedText>
          </View>
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : !isLoggedIn ? (
          <View style={s.authGate}>
            <View style={s.authIcon}>
              <Ionicons name="lock-closed-outline" size={40} color={palette.gray300} />
            </View>
            <ThemedText style={s.authTitle}>Sign in to track your journey</ThemedText>
            <ThemedText style={s.authSub}>Your workout history, streaks and achievements are saved to your account.</ThemedText>
            <TouchableOpacity style={s.signInBtn} onPress={() => router.push('/(tabs)/profile')}>
              <ThemedText style={s.signInBtnText}>Sign In / Sign Up</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {/* ── Stats grid ── */}
            <View style={s.statsGrid}>
              <StatCard value={String(stats.totalWorkouts)} label="Workouts" icon="barbell-outline" />
              <StatCard value={`${stats.totalMinutes}`} label="Minutes" icon="time-outline" />
              <StatCard value={`${stats.streakDays}d`} label="Streak" icon="flame-outline" />
              <StatCard value={`${stats.longestStreak}d`} label="Best" icon="trophy-outline" />
            </View>

            {/* ── Outdoor Activities (Strava) ── */}
            <ThemedText style={s.sectionTitle}>Outdoor Activities</ThemedText>
            {stravaConnected && (outdoorStats.runs + outdoorStats.walks + outdoorStats.rides) > 0 && (
              <>
                <View style={s.statsGrid}>
                  <StatCard value={String(outdoorStats.runs)} label="Runs" icon="walk-outline" color={STRAVA_ORANGE} />
                  <StatCard value={String(outdoorStats.walks)} label="Walks" icon="footsteps-outline" color={STRAVA_ORANGE} />
                  <StatCard value={String(outdoorStats.rides)} label="Rides" icon="bicycle-outline" color={STRAVA_ORANGE} />
                </View>
                <View style={s.statsGrid}>
                  <StatCard value={`${outdoorStats.distanceKm.toFixed(1)} km`} label="Distance" icon="map-outline" color={STRAVA_ORANGE} />
                  <StatCard value={formatActiveTime(outdoorStats.activeMinutes)} label="Active time" icon="time-outline" color={STRAVA_ORANGE} />
                </View>
              </>
            )}
            <TouchableOpacity
              style={s.goalTeaserCard}
              onPress={() => router.push('/strava-settings' as any)}
              activeOpacity={0.85}
            >
              <View style={[s.goalTeaserIcon, { backgroundColor: '#fff1eb' }]}>
                <Ionicons name={stravaConnected ? 'checkmark-circle' : 'walk'} size={20} color={STRAVA_ORANGE} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.goalTeaserTitle}>
                  {stravaConnected ? 'Strava Connected ✓' : 'Connect Strava'}
                </ThemedText>
                <ThemedText style={s.goalTeaserSub}>
                  {stravaConnected
                    ? 'Tap to sync now or manage your connection'
                    : 'Bring your runs, walks & rides into your journey'}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── Challenges ── */}
            {challenges.length > 0 && (
              <>
                <ThemedText style={s.sectionTitle}>Challenges</ThemedText>
                {challenges.map(c => {
                  const pct = Math.min(100, Math.round((c.value / c.target_value) * 100));
                  const unit = c.metric === 'distance_km' ? 'km' : c.metric === 'days_active' ? 'days' : 'activities';
                  const displayValue = c.metric === 'distance_km' ? c.value.toFixed(1) : c.value;
                  return (
                    <View key={c.id} style={s.challengeCard}>
                      <ThemedText style={s.challengeTitle}>{c.title}</ThemedText>
                      {c.description && <ThemedText style={s.challengeDesc}>{c.description}</ThemedText>}
                      <View style={s.challengeBarTrack}>
                        <View style={[s.challengeBarFill, { width: `${pct}%` }]} />
                      </View>
                      <ThemedText style={s.challengeProgressText}>
                        {displayValue} / {c.target_value} {unit}
                      </ThemedText>
                    </View>
                  );
                })}
              </>
            )}

            {/* ── Analytics ── */}
            <TouchableOpacity
              style={s.goalTeaserCard}
              onPress={() => router.push('/analytics' as any)}
              activeOpacity={0.85}
            >
              <View style={s.goalTeaserIcon}>
                <Ionicons name="stats-chart-outline" size={20} color={palette.blue500} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.goalTeaserTitle}>Analytics</ThemedText>
                <ThemedText style={s.goalTeaserSub}>Progress graphs, muscle load, weight lifted & more</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── Achievements ── */}
            <ThemedText style={s.sectionTitle}>
              Achievements · {unlockedCount}/{achievements.length}
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.achievementsRow}>
              {achievements.map(a => <AchievementBadge key={a.id} a={a} />)}
            </ScrollView>

            {/* ── Goals ── */}
            <ThemedText style={s.sectionTitle}>Goals</ThemedText>
            <TouchableOpacity
              style={s.goalTeaserCard}
              onPress={() => router.push('/fitness-goals' as any)}
              activeOpacity={0.85}
            >
              <View style={s.goalTeaserIcon}>
                <Ionicons name={(GOALS.find(g => g.key === goals[0])?.icon ?? 'flag-outline') as any} size={20} color={palette.blue500} />
              </View>
              <View style={{ flex: 1 }}>
                {goals.length > 0 ? (
                  <View style={s.goalChipsRow}>
                    {goals.map(g => (
                      <View key={g} style={s.goalChip}>
                        <ThemedText style={s.goalChipText}>{GOALS.find(x => x.key === g)?.label ?? g}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText style={s.goalTeaserTitle}>Set your goal</ThemedText>
                )}
                <ThemedText style={s.goalTeaserSub}>
                  {EXPERIENCE_LEVELS.find(lv => lv.key === level)?.label ?? 'Set your level'}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── Body Stats ── */}
            <ThemedText style={s.sectionTitle}>Body Stats</ThemedText>
            <TouchableOpacity
              style={s.bodyStatsCard}
              onPress={() => router.push('/body-stats' as any)}
              activeOpacity={0.85}
            >
              {measurements.length === 0 ? (
                <ThemedText style={s.bodyStatsEmpty}>No measurements logged yet</ThemedText>
              ) : (
                <View style={s.bodyStatsInfo}>
                  <ThemedText style={s.bodyStatsValue}>{measurements[0].weight_kg} kg</ThemedText>
                  {measurements.length > 1 && measurements[0].weight_kg != null && measurements[1].weight_kg != null && (
                    <View style={s.bodyStatsDeltaRow}>
                      <Ionicons
                        name={measurements[0].weight_kg! >= measurements[1].weight_kg! ? 'arrow-up' : 'arrow-down'}
                        size={12} color={palette.gray300}
                      />
                      <ThemedText style={s.bodyStatsDelta}>
                        {Math.abs(measurements[0].weight_kg! - measurements[1].weight_kg!).toFixed(1)} kg since last log
                      </ThemedText>
                    </View>
                  )}
                  <ThemedText style={s.bodyStatsDate}>
                    Logged {new Date(measurements[0].logged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </ThemedText>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  style={s.logMeasurementBtn}
                  onPress={() => router.push('/log-measurement' as any)}
                >
                  <Ionicons name="add" size={16} color={palette.blue500} />
                  <ThemedText style={s.logMeasurementBtnText}>Log Measurement</ThemedText>
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
              </View>
            </TouchableOpacity>

            {/* ── Nutrition ── */}
            <ThemedText style={s.sectionTitle}>Nutrition</ThemedText>
            <View style={s.statsGrid}>
              <StatCard value={`${nutrition.streak}d`} label="Streak" icon="flame-outline" color={palette.success700} />
              <StatCard value={String(nutrition.mealsLogged)} label="Meals Logged" icon="restaurant-outline" color={palette.success700} />
              <StatCard value={`${nutrition.avgProtein}g`} label="Avg Protein" icon="fitness-outline" color={palette.success700} />
              <StatCard value={`${nutrition.avgHydration}L`} label="Avg Hydration" icon="water-outline" color={palette.success700} />
            </View>

            {(startingWeight || goalWeight || measurements[0]?.weight_kg) && (
              <View style={s.weightProgressCard}>
                <View style={s.weightProgressRow}>
                  <View style={s.weightProgressItem}>
                    <ThemedText style={s.weightProgressLabel}>Starting</ThemedText>
                    <ThemedText style={s.weightProgressVal}>{startingWeight ? `${startingWeight}kg` : '—'}</ThemedText>
                  </View>
                  <View style={s.weightProgressItem}>
                    <ThemedText style={s.weightProgressLabel}>Current</ThemedText>
                    <ThemedText style={[s.weightProgressVal, { color: palette.success700 }]}>
                      {measurements[0]?.weight_kg ? `${measurements[0].weight_kg}kg` : '—'}
                    </ThemedText>
                  </View>
                  <View style={s.weightProgressItem}>
                    <ThemedText style={s.weightProgressLabel}>Goal</ThemedText>
                    <ThemedText style={s.weightProgressVal}>{goalWeight ? `${goalWeight}kg` : '—'}</ThemedText>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={s.hubCta}
              onPress={() => router.push('/nutrition-hub' as any)}
              activeOpacity={0.85}
            >
              <View style={[s.hubCtaIcon, { backgroundColor: palette.success50 }]}>
                <ThemedText style={{ fontSize: 20 }}>🥗</ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.hubCtaTitle}>Nutrition Hub</ThemedText>
                <ThemedText style={s.hubCtaSub}>Meal library, meal plans &amp; today's plan</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── Mood ── */}
            <ThemedText style={s.sectionTitle}>How are you feeling?</ThemedText>
            <TouchableOpacity
              style={s.moodTeaserCard}
              onPress={() => router.push('/mood-checkin' as any)}
              activeOpacity={0.85}
            >
              <ThemedText style={s.moodTeaserEmoji}>
                {todayMood ? MOODS.find(m => m.value === todayMood)?.emoji : '🙂'}
              </ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.moodTeaserTitle}>
                  {todayMood ? 'Logged for today' : 'Tap to check in'}
                </ThemedText>
                <ThemedText style={s.moodTeaserSub}>See your mood history</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── Tasks ── */}
            {tasks.length > 0 && (
              <>
                <ThemedText style={s.sectionTitle}>Tasks from your trainer</ThemedText>
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
                      {pendingTaskCount > 0 ? `${pendingTaskCount} to do` : 'All caught up'}
                    </ThemedText>
                    <ThemedText style={s.taskTeaserSub}>{tasks.length} total</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                </TouchableOpacity>
              </>
            )}

            {/* ── Browse Fitness Hub CTA ── */}
            <TouchableOpacity
              style={s.hubCta}
              onPress={() => router.push('/(tabs)/fitness')}
              activeOpacity={0.85}
            >
              <View style={s.hubCtaIcon}>
                <Ionicons name="barbell-outline" size={22} color={palette.blue500} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.hubCtaTitle}>Browse Exercises & Workouts</ThemedText>
                <ThemedText style={s.hubCtaSub}>Explore the Fitness Hub for new workouts to try</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
            </TouchableOpacity>

            {/* ── My Trainers ── */}
            <TouchableOpacity
              style={s.hubCta}
              onPress={() => router.push('/my-trainers' as any)}
              activeOpacity={0.85}
            >
              <View style={s.hubCtaIcon}>
                <Ionicons name="people-outline" size={22} color={palette.blue500} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.hubCtaTitle}>My Trainers</ThemedText>
                <ThemedText style={s.hubCtaSub}>Manage which trainers can see your workout progress</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
            </TouchableOpacity>

            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

  // Browse Fitness Hub CTA
  hubCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.xl, borderWidth: 1,
    borderColor: palette.hairline, backgroundColor: palette.white,
    padding: 14, marginBottom: 24, ...shadows.sm,
  },
  hubCtaIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  hubCtaTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  hubCtaSub: { fontSize: 12, color: palette.gray300, marginTop: 2 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14, alignItems: 'center', gap: 6, ...shadows.sm,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: palette.ink900, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Body stats
  bodyStatsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 24, ...shadows.sm,
  },
  bodyStatsEmpty: { fontSize: 13, color: palette.gray300 },
  bodyStatsInfo: { gap: 2 },
  bodyStatsValue: { fontSize: 22, fontWeight: '900', color: palette.ink900, letterSpacing: -0.5 },
  bodyStatsDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bodyStatsDelta: { fontSize: 12, fontWeight: '600', color: palette.gray450 },
  bodyStatsDate: { fontSize: 11, color: palette.gray300, marginTop: 2 },

  // Nutrition weight progress
  weightProgressCard: {
    backgroundColor: palette.success50, borderRadius: radii.lg,
    padding: 16, marginBottom: 24,
  },
  weightProgressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weightProgressItem: { alignItems: 'center' },
  weightProgressLabel: { fontSize: 10.5, fontWeight: '700', color: palette.success700, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  weightProgressVal: { fontSize: 16, fontWeight: '800', color: palette.ink900 },
  logMeasurementBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.blue25, borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  logMeasurementBtnText: { fontSize: 12.5, fontWeight: '700', color: palette.blue500 },

  // Mood check-in (teaser card — full check-in lives on its own page)
  moodTeaserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 24, ...shadows.sm,
  },
  moodTeaserEmoji: { fontSize: 30 },
  moodTeaserTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  moodTeaserSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },

  // Tasks (teaser card — full list lives on its own page)
  taskTeaserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 24, ...shadows.sm,
  },
  taskTeaserIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  taskTeaserTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  taskTeaserSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14,
  },

  // Goals (teaser card — full picker lives on its own page)
  goalTeaserCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 28, ...shadows.sm,
  },
  goalTeaserIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  goalTeaserTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  goalTeaserSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },
  goalChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  goalChip: { backgroundColor: palette.blue25, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  goalChipText: { fontSize: 11.5, fontWeight: '700', color: palette.blue500 },

  // Challenges (progress computed live from activities, not stored)
  challengeCard: {
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 12, ...shadows.sm,
  },
  challengeTitle: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  challengeDesc: { fontSize: 12, color: palette.gray300, marginTop: 2, marginBottom: 10 },
  challengeBarTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden', marginTop: 10 },
  challengeBarFill: { height: 8, borderRadius: 4, backgroundColor: STRAVA_ORANGE },
  challengeProgressText: { fontSize: 12, fontWeight: '700', color: palette.gray450, marginTop: 8 },

  // Achievements
  achievementsRow: { gap: 12, paddingBottom: 24, paddingRight: 20 },
  achievement: {
    width: 110, borderRadius: radii.lg,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    padding: 12, alignItems: 'center', gap: 6, ...shadows.sm,
  },
  achievementLocked: { opacity: 0.55 },
  achievementIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  achievementTitle: { fontSize: 12, fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  achievementLockedText: { color: palette.gray300 },
  achievementSub: { fontSize: 10, color: palette.gray300, textAlign: 'center', lineHeight: 13 },
  lockOverlay: { position: 'absolute', top: 0, right: 0 },

  // Auth gate
  authGate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  authIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  authTitle: { fontSize: 20, fontWeight: '800', color: palette.ink900, marginBottom: 10, textAlign: 'center' },
  authSub: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  signInBtn: { backgroundColor: palette.blue500, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radii.xl },
  signInBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
