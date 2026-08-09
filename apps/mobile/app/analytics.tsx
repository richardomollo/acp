import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import { syncHealthData } from '@/services/health';

const SCREEN_W = Dimensions.get('window').width;
const CHART_YAXIS_W = 34;
// screen padding (20*2) + card padding (16*2) + gifted-charts' y-axis label
// gutter, which renders in addition to the `width` prop rather than inside it.
const CHART_W = SCREEN_W - 20 * 2 - 32 - CHART_YAXIS_W;

// ── Types ──────────────────────────────────────────────────────────────────────

interface HistoryRow {
  id: string;
  completed_at: string;
  duration_minutes: number | null;
  workouts: { category: string } | null;
}

interface SetLogRow {
  weight_kg: number | null;
  reps: number | null;
  rest_seconds_actual: number | null;
  workout_history_id: string;
  exercises: { target_muscle: string | null } | null;
}

interface HealthDayRow {
  date: string;
  steps: number | null;
  calories_burned: number | null;
  resting_energy_kcal: number | null;
  heart_rate_avg: number | null;
  weight_kg: number | null;
}

interface HealthWorkoutRow {
  start_date: string;
  duration_seconds: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  full_body: 'Full Body', hiit: 'HIIT', mobility: 'Mobility', core: 'Core',
  push: 'Push', pull: 'Pull', legs: 'Legs', strength: 'Strength',
};

const CATEGORY_COLORS: Record<string, string> = {
  full_body: palette.blue500, hiit: '#ef4444', mobility: '#16a34a', core: '#9333ea',
  push: '#111827', pull: '#1e40af', legs: '#b45309', strength: '#000000',
};

const MUSCLE_COLORS = [
  palette.blue500, '#ef4444', '#16a34a', '#9333ea', '#f97316',
  '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ea580c',
];

function fmtShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, empty, children,
}: { title: string; subtitle?: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <ThemedText style={s.cardTitle}>{title}</ThemedText>
      {subtitle ? <ThemedText style={s.cardSubtitle}>{subtitle}</ThemedText> : null}
      <View style={s.cardChartWrap}>
        {empty ? (
          <View style={s.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={28} color={palette.gray300} />
            <ThemedText style={s.emptyText}>Not enough data yet</ThemedText>
          </View>
        ) : children}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [history, setHistory]   = useState<HistoryRow[]>([]);
  const [setLogs, setSetLogs]   = useState<SetLogRow[]>([]);
  const [healthDays, setHealthDays] = useState<HealthDayRow[]>([]);
  const [healthWorkouts, setHealthWorkouts] = useState<HealthWorkoutRow[]>([]);

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

      const [{ data: historyData }, { data: setLogData }, { data: healthData }, { data: workoutData }] = await Promise.all([
        supabase
          .from('workout_history')
          .select('id, completed_at, duration_minutes, workouts(category)')
          .eq('user_id', session.user.id)
          .order('completed_at', { ascending: true })
          .limit(30),
        supabase
          .from('workout_set_logs')
          .select('weight_kg, reps, rest_seconds_actual, workout_history_id, exercises(target_muscle)')
          .eq('user_id', session.user.id)
          .order('logged_at', { ascending: true })
          .limit(1000),
        supabase
          .from('health_daily_stats')
          .select('date, steps, calories_burned, resting_energy_kcal, heart_rate_avg, weight_kg')
          .eq('user_id', session.user.id)
          .order('date', { ascending: true })
          .limit(14),
        supabase
          .from('health_workouts')
          .select('start_date, duration_seconds')
          .eq('user_id', session.user.id)
          .order('start_date', { ascending: true })
          .limit(50),
      ]);

      if (!active) return;
      setHistory((historyData as unknown as HistoryRow[]) ?? []);
      setSetLogs((setLogData as unknown as SetLogRow[]) ?? []);
      setHealthDays((healthData as unknown as HealthDayRow[]) ?? []);
      setHealthWorkouts((workoutData as unknown as HealthWorkoutRow[]) ?? []);
      setLoading(false);

      // Opportunistic background refresh — if the user already granted Health
      // access previously, this quietly picks up new days without a manual tap.
      syncHealthData().then(async synced => {
        if (!synced || !active) return;
        const [{ data: freshHealth }, { data: freshWorkouts }] = await Promise.all([
          supabase
            .from('health_daily_stats')
            .select('date, steps, calories_burned, resting_energy_kcal, heart_rate_avg, weight_kg')
            .eq('user_id', session.user.id)
            .order('date', { ascending: true })
            .limit(14),
          supabase
            .from('health_workouts')
            .select('start_date, duration_seconds')
            .eq('user_id', session.user.id)
            .order('start_date', { ascending: true })
            .limit(50),
        ]);
        if (!active) return;
        setHealthDays((freshHealth as unknown as HealthDayRow[]) ?? []);
        setHealthWorkouts((freshWorkouts as unknown as HealthWorkoutRow[]) ?? []);
      });
    })();
    return () => { active = false; };
  }, []));

  // ── Derived chart data ────────────────────────────────────────────────────

  const durationData = useMemo(() => {
    return history
      .filter(h => h.duration_minutes != null)
      .map(h => ({ value: h.duration_minutes!, label: fmtShortDate(h.completed_at) }));
  }, [history]);

  const weightByHistoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of setLogs) {
      if (log.weight_kg == null || log.reps == null) continue;
      const vol = log.weight_kg * log.reps;
      map.set(log.workout_history_id, (map.get(log.workout_history_id) ?? 0) + vol);
    }
    return map;
  }, [setLogs]);

  const liftedWeightData = useMemo(() => {
    return history
      .filter(h => weightByHistoryId.has(h.id))
      .map(h => ({ value: Math.round(weightByHistoryId.get(h.id)!), label: fmtShortDate(h.completed_at) }));
  }, [history, weightByHistoryId]);

  const restByHistoryId = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const log of setLogs) {
      if (log.rest_seconds_actual == null) continue;
      const cur = sums.get(log.workout_history_id) ?? { total: 0, count: 0 };
      cur.total += log.rest_seconds_actual;
      cur.count += 1;
      sums.set(log.workout_history_id, cur);
    }
    return sums;
  }, [setLogs]);

  const restData = useMemo(() => {
    return history
      .filter(h => restByHistoryId.has(h.id))
      .map(h => {
        const { total, count } = restByHistoryId.get(h.id)!;
        return { value: Math.round(total / count), label: fmtShortDate(h.completed_at), frontColor: palette.blue500 };
      });
  }, [history, restByHistoryId]);

  const muscleLoadData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const log of setLogs) {
      const muscle = log.exercises?.target_muscle;
      if (!muscle) continue;
      const vol = (log.weight_kg ?? 0) * (log.reps ?? 0) || (log.reps ?? 1);
      totals.set(muscle, (totals.get(muscle) ?? 0) + vol);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const grandTotal = sorted.reduce((s, [, v]) => s + v, 0) || 1;
    return sorted.map(([muscle, value], i) => ({
      value: Math.round(value),
      color: MUSCLE_COLORS[i % MUSCLE_COLORS.length],
      text: `${Math.round((value / grandTotal) * 100)}%`,
      label: muscle,
    }));
  }, [setLogs]);

  const exerciseTypeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of history) {
      const cat = h.workouts?.category;
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()].map(([cat, value]) => ({
      value,
      color: CATEGORY_COLORS[cat] ?? palette.gray300,
      text: CATEGORY_LABELS[cat] ?? cat,
      label: CATEGORY_LABELS[cat] ?? cat,
    }));
  }, [history]);

  const stepsData = useMemo(() => {
    return healthDays
      .filter(d => d.steps != null)
      .map(d => ({ value: d.steps!, label: fmtShortDate(d.date) }));
  }, [healthDays]);

  const caloriesData = useMemo(() => {
    return healthDays
      .filter(d => d.calories_burned != null)
      .map(d => ({ value: Math.round(d.calories_burned!), label: fmtShortDate(d.date) }));
  }, [healthDays]);

  const restingEnergyData = useMemo(() => {
    return healthDays
      .filter(d => d.resting_energy_kcal != null)
      .map(d => ({ value: Math.round(d.resting_energy_kcal!), label: fmtShortDate(d.date) }));
  }, [healthDays]);

  const heartRateData = useMemo(() => {
    return healthDays
      .filter(d => d.heart_rate_avg != null)
      .map(d => ({ value: Math.round(d.heart_rate_avg!), label: fmtShortDate(d.date) }));
  }, [healthDays]);

  const weightData = useMemo(() => {
    return healthDays
      .filter(d => d.weight_kg != null)
      .map(d => ({ value: Math.round(d.weight_kg! * 10) / 10, label: fmtShortDate(d.date) }));
  }, [healthDays]);

  const workoutsData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const w of healthWorkouts) {
      if (w.duration_seconds == null) continue;
      const key = w.start_date.slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? 0) + w.duration_seconds / 60);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, minutes]) => ({ value: Math.round(minutes), label: fmtShortDate(date), frontColor: palette.success700 }));
  }, [healthWorkouts]);

  const showHealthSection = Platform.OS === 'ios';

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Analytics</ThemedText>
            <ThemedText style={s.headerSub}>Your training trends</ThemedText>
          </View>
        </SafeAreaView>

        {!isLoggedIn ? (
          <View style={s.emptyWrap}>
            <ThemedText style={s.emptyText}>Sign in to see your analytics.</ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

            {showHealthSection && stepsData.length === 0 && caloriesData.length === 0 ? (
              <TouchableOpacity
                style={s.healthBanner}
                onPress={() => router.push('/health-settings' as any)}
                activeOpacity={0.85}
              >
                <View style={s.healthBannerIcon}>
                  <Ionicons name="heart" size={20} color="#ff6b6b" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.healthBannerTitle}>Connect Apple Health</ThemedText>
                  <ThemedText style={s.healthBannerSub}>See your steps and calories burned here</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
              </TouchableOpacity>
            ) : null}

            <ChartCard title="Workout Duration" subtitle="Minutes per session" empty={durationData.length < 2}>
              <LineChart
                data={durationData}
                width={CHART_W}
                height={180}
                color={palette.blue500}
                thickness={2.5}
                dataPointsColor={palette.blue500}
                yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                noOfSections={4}
                yAxisLabelWidth={CHART_YAXIS_W}
                curved
              />
            </ChartCard>

            <ChartCard title="Lifted Weight" subtitle="Total volume (kg × reps) per session" empty={liftedWeightData.length < 2}>
              <LineChart
                data={liftedWeightData}
                width={CHART_W}
                height={180}
                color={palette.success700}
                thickness={2.5}
                dataPointsColor={palette.success700}
                yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                noOfSections={4}
                yAxisLabelWidth={CHART_YAXIS_W}
                curved
              />
            </ChartCard>

            <ChartCard title="Muscle Load" subtitle="Share of total volume by muscle group" empty={muscleLoadData.length === 0}>
              <View style={{ alignItems: 'center' }}>
                <PieChart
                  data={muscleLoadData}
                  radius={90}
                  showText
                  textColor="#fff"
                  textSize={10}
                  focusOnPress
                />
                <View style={s.legendWrap}>
                  {muscleLoadData.map((d, i) => (
                    <View key={i} style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: d.color }]} />
                      <ThemedText style={s.legendText}>{d.label}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </ChartCard>

            <ChartCard title="Exercise Type Distribution" subtitle="Completed workouts by category" empty={exerciseTypeData.length === 0}>
              <View style={{ alignItems: 'center' }}>
                <PieChart
                  data={exerciseTypeData}
                  radius={90}
                  showText
                  textColor="#fff"
                  textSize={10}
                  focusOnPress
                />
                <View style={s.legendWrap}>
                  {exerciseTypeData.map((d, i) => (
                    <View key={i} style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: d.color }]} />
                      <ThemedText style={s.legendText}>{d.label}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </ChartCard>

            <ChartCard title="Rest Between Sets" subtitle="Average actual rest per session (seconds)" empty={restData.length === 0}>
              <BarChart
                data={restData}
                width={CHART_W}
                height={180}
                barWidth={22}
                barBorderRadius={4}
                frontColor={palette.blue500}
                yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                noOfSections={4}
                yAxisLabelWidth={CHART_YAXIS_W}
              />
            </ChartCard>

            {showHealthSection ? (
              <>
                <ChartCard title="Steps" subtitle="Daily step count from Apple Health" empty={stepsData.length === 0}>
                  {stepsData.length === 0 ? (
                    <TouchableOpacity style={s.connectBtn} onPress={() => router.push('/health-settings' as any)}>
                      <Ionicons name="heart-outline" size={16} color={palette.blue500} />
                      <ThemedText style={s.connectBtnText}>Connect Apple Health</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <LineChart
                      data={stepsData}
                      width={CHART_W}
                      height={180}
                      color={palette.warning500}
                      thickness={2.5}
                      dataPointsColor={palette.warning500}
                      yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                      noOfSections={4}
                      yAxisLabelWidth={CHART_YAXIS_W}
                      curved
                    />
                  )}
                </ChartCard>

                <ChartCard title="Calories Burned" subtitle="From Apple Health" empty={caloriesData.length === 0}>
                  {caloriesData.length === 0 ? (
                    <TouchableOpacity style={s.connectBtn} onPress={() => router.push('/health-settings' as any)}>
                      <Ionicons name="heart-outline" size={16} color={palette.blue500} />
                      <ThemedText style={s.connectBtnText}>Connect Apple Health</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <LineChart
                      data={caloriesData}
                      width={CHART_W}
                      height={180}
                      color={palette.danger500}
                      thickness={2.5}
                      dataPointsColor={palette.danger500}
                      yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                      noOfSections={4}
                      yAxisLabelWidth={CHART_YAXIS_W}
                      curved
                    />
                  )}
                </ChartCard>

                <ChartCard title="Resting Energy" subtitle="Daily resting energy burned from Apple Health" empty={restingEnergyData.length === 0}>
                  <LineChart
                    data={restingEnergyData}
                    width={CHART_W}
                    height={180}
                    color={palette.warning800}
                    thickness={2.5}
                    dataPointsColor={palette.warning800}
                    yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                    noOfSections={4}
                    yAxisLabelWidth={CHART_YAXIS_W}
                    curved
                  />
                </ChartCard>

                <ChartCard title="Heart Rate" subtitle="Average daily heart rate (bpm) from Apple Health" empty={heartRateData.length === 0}>
                  <LineChart
                    data={heartRateData}
                    width={CHART_W}
                    height={180}
                    color="#ff6b6b"
                    thickness={2.5}
                    dataPointsColor="#ff6b6b"
                    yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                    noOfSections={4}
                    yAxisLabelWidth={CHART_YAXIS_W}
                    curved
                  />
                </ChartCard>

                <ChartCard title="Weight" subtitle="From Apple Health (kg)" empty={weightData.length === 0}>
                  <LineChart
                    data={weightData}
                    width={CHART_W}
                    height={180}
                    color="#7c3aed"
                    thickness={2.5}
                    dataPointsColor="#7c3aed"
                    yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                    noOfSections={4}
                    yAxisLabelWidth={CHART_YAXIS_W}
                    curved
                  />
                </ChartCard>

                <ChartCard title="Apple Health Workouts" subtitle="Minutes logged per day (any source, e.g. Apple Watch)" empty={workoutsData.length === 0}>
                  <BarChart
                    data={workoutsData}
                    width={CHART_W}
                    height={180}
                    barWidth={22}
                    barBorderRadius={4}
                    frontColor={palette.success700}
                    yAxisTextStyle={{ color: palette.gray300, fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: palette.gray300, fontSize: 9 }}
                    noOfSections={4}
                    yAxisLabelWidth={CHART_YAXIS_W}
                  />
                </ChartCard>
              </>
            ) : null}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },

  card: {
    backgroundColor: palette.white, borderRadius: radii.xl,
    padding: 16, marginBottom: 16, overflow: 'hidden',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  cardSubtitle: { fontSize: 12, color: palette.gray450, marginTop: 2, marginBottom: 12 },
  cardChartWrap: { alignItems: 'center', minHeight: 100, overflow: 'hidden' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { fontSize: 13, color: palette.gray300, textAlign: 'center' },

  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '600', color: palette.gray450, textTransform: 'capitalize' },

  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: palette.blue25, borderRadius: radii.md,
  },
  connectBtnText: { fontSize: 13, fontWeight: '700', color: palette.blue500 },

  healthBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff5f5', borderRadius: radii.xl,
    padding: 16, marginBottom: 16,
  },
  healthBannerIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffe5e5',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  healthBannerTitle: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  healthBannerSub: { fontSize: 12, color: palette.gray450, marginTop: 1 },
});
