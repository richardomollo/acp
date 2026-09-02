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
import { computeStreak, buildAchievements, type Stats, type Achievement } from '@/services/fitnessStats';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getProgressSnapshot } from '@/services/progress-service';
import { interpretProgress } from '@/lib/progress-interpreter';
import type { ProgressSnapshot, ProgressInterpretation } from '@/lib/progress-types';
import { getHumanSupportInsight, dismissHumanSupportInsight, type HumanSupportInsight } from '@/services/human-support-service';
import { nutritionOutcomeIntelligenceService } from '@/services/nutrition-outcome-intelligence-service';
import { NutritionWhatAcpIsLearning } from '@/components/nutrition/nutrition-what-acp-is-learning';
import type { OutcomeObservation } from '@/lib/nutrition/nutrition-outcome-intelligence';
import { localISODate } from '@/lib/fulfilment';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line as SvgLine } from 'react-native-svg';
import { computeWeightProgress } from '@/lib/weight-progress';

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface NutritionStats {
  streak: number;
  mealsLogged: number;
  avgProtein: number;
  avgHydration: number;
}

interface CommunityActivityRow {
  id: string;
  check_in_time: string | null;
  community_events: {
    id: string; title: string; date: string; community_id: string;
    communities: { name: string; logo_url: string | null } | null;
  } | null;
}

interface ActivityRow {
  activity_type: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility' | 'class' | 'other';
  start_time: string;
  duration_seconds: number | null;
  moving_time_seconds: number | null;
  distance_meters: number | null;
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

function monthYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Dark, standalone visual treatment for the weight-trend card — ported
// verbatim from fitness-goals.tsx's "My Progress" section so both screens
// show the exact same card.
const TREND_BG = '#17181d';
const TREND_ACCENT = '#d7f24e';
const TREND_ICON_BG = '#5b3fae';
const TREND_CHART_W = 300;
const TREND_CHART_H = 90;

function WeightTrendCard({
  points, idealWeight, onPress,
}: {
  points: { weight: number; loggedAt: string }[];
  idealWeight: number | null;
  onPress: () => void;
}) {
  const weights = points.map(p => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 10;
  const yMin = minW - range * 0.25;
  const yMax = maxW + range * 0.25;
  const axisTop = Math.ceil(yMax / 10) * 10;
  const axisBottom = Math.floor(yMin / 10) * 10;

  const coords = points.map((p, i) => ({
    x: points.length > 1 ? (i / (points.length - 1)) * TREND_CHART_W : TREND_CHART_W / 2,
    y: TREND_CHART_H - ((p.weight - yMin) / (yMax - yMin)) * TREND_CHART_H,
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const current = coords[coords.length - 1];

  return (
    <TouchableOpacity style={ts.card} onPress={onPress} activeOpacity={0.85}>
      <View style={ts.headerRow}>
        <View style={ts.headerLeft}>
          <View style={ts.iconCircle}>
            <Ionicons name="body-outline" size={18} color={TREND_ACCENT} />
          </View>
          <View>
            <ThemedText style={ts.title}>Weight</ThemedText>
            <ThemedText style={ts.subtitle}>The range of healthy</ThemedText>
          </View>
        </View>
        {idealWeight != null && (
          <View style={{ alignItems: 'flex-end' }}>
            <ThemedText style={ts.idealLabel}>Ideal weight</ThemedText>
            <ThemedText style={ts.idealValue}>{Math.round(idealWeight)} <ThemedText style={ts.idealUnit}>kg</ThemedText></ThemedText>
          </View>
        )}
      </View>

      <View style={ts.chartRow}>
        <View style={ts.axisCol}>
          <ThemedText style={ts.axisText}>{axisTop}</ThemedText>
          <ThemedText style={ts.axisText}>{axisBottom}</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <Svg width="100%" height={TREND_CHART_H} viewBox={`0 0 ${TREND_CHART_W} ${TREND_CHART_H}`} preserveAspectRatio="none">
            {current && (
              <SvgLine
                x1={current.x} y1={0} x2={current.x} y2={TREND_CHART_H}
                stroke={TREND_ACCENT} strokeOpacity={0.25} strokeWidth={10}
              />
            )}
            <Path d={pathD} stroke={TREND_ACCENT} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((c, i) => (
              <Circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 5 : 4} fill={TREND_ACCENT} />
            ))}
          </Svg>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const ts = StyleSheet.create({
  card: { backgroundColor: TREND_BG, borderRadius: radii.xl, padding: 18, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: TREND_ICON_BG,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  idealLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  idealValue: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  idealUnit: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  chartRow: { flexDirection: 'row', alignItems: 'stretch' },
  axisCol: { justifyContent: 'space-between', paddingRight: 10, paddingBottom: 4 },
  axisText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
});

// ── Day 6 — human-support insight copy ──────────────────────────────────────
// Never phrased as ACP failing — a trainer is framed as an expert layer on
// top of ACP, and this card only ever renders when a real signal fired.
const HUMAN_SUPPORT_HEADLINE: Record<string, string> = {
  PAIN_REPORTED: 'Consider getting professional guidance',
  REPEATED_DIFFICULTY: 'A trainer could help you progress further',
  REPEATED_LOW_ADHERENCE: 'A trainer could help you stay on track',
  PROGRESS_PLATEAU: 'A trainer could help you progress further',
  REPEATED_ADAPTATION: 'A trainer could take a closer look',
  BEGINNER_TECHNIQUE_SUPPORT: 'Want help getting started?',
  TRAINER_REVIEW_RECOMMENDED: 'Something to review with your trainer',
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FitnessJourneyScreen() {
  const router = useRouter();

  const [loading, setLoading]       = useState(true);
  const [stats, setStats]           = useState<Stats>({ totalWorkouts: 0, totalMinutes: 0, streakDays: 0, longestStreak: 0 });
  const [userId, setUserId]         = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
  const [initialWeightKg, setInitialWeightKg] = useState<number | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [goalTargetDate, setGoalTargetDate] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<NutritionStats>({ streak: 0, mealsLogged: 0, avgProtein: 0, avgHydration: 0 });
  const [communityActivity, setCommunityActivity] = useState<CommunityActivityRow[]>([]);
  const [progressInsight, setProgressInsight] = useState<ProgressInterpretation | null>(null);
  const [progressSnapshot, setProgressSnapshot] = useState<ProgressSnapshot | null>(null);
  const [humanSupport, setHumanSupport] = useState<HumanSupportInsight | null>(null);
  const [dismissingSupport, setDismissingSupport] = useState(false);
  const [outcomeObservations, setOutcomeObservations] = useState<OutcomeObservation[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
      const session = await authService.getSession();
      if (!active) return;

      if (!session?.user.id) {
        setIsLoggedIn(false);
        return;
      }

      // Day 4 — ACP Progress Intelligence. Read-only: derives its insight
      // from the same persisted programme/workout/measurement data this
      // screen already reads elsewhere; never modifies anything.
      getProgressSnapshot(session.user.id).then(snapshot => {
        if (!active || !snapshot) return;
        setProgressSnapshot(snapshot);
        setProgressInsight(interpretProgress(snapshot));
      }).catch(() => { /* insight is enhancement-only — never blocks the page */ });

      // Day 6 — human-support detection. Context-driven only: this card
      // renders nothing at all unless a real signal fires (never a generic
      // "book a trainer" promotion).
      getHumanSupportInsight(session.user.id).then(insight => {
        if (active) setHumanSupport(insight);
      }).catch(() => { /* enhancement-only */ });

      // Nutrition N9 — outcome intelligence. Read-only + non-blocking:
      // replays N8 coaching episodes + plan completions longitudinally and
      // surfaces only REPEATED, OBSERVATIONAL patterns. Never causal, never
      // adapts anything.
      nutritionOutcomeIntelligenceService.getObservations(session.user.id, localISODate(new Date())).then(res => {
        if (active) setOutcomeObservations(res.observations);
      }).catch(() => { /* enhancement-only — never blocks the page */ });

      setIsLoggedIn(true);
      setUserId(session.user.id);

      const [
        { data }, { data: profileData }, { data: measurementData }, { data: checkinData },
        { data: mealLogsData }, { data: activitiesData }, { data: communityActivityData },
      ] = await Promise.all([
        supabase
          .from('workout_history')
          .select('completed_at, duration_minutes')
          .eq('user_id', session.user.id)
          .order('completed_at', { ascending: false })
          .limit(500),
        supabase
          .from('fitness_profile')
          .select('starting_weight_kg, goal_weight_kg, initial_weight_kg, goal_target_date')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('client_measurements')
          .select('id, weight_kg, waist_cm, chest_cm, hips_cm, logged_at')
          .eq('user_id', session.user.id)
          .order('logged_at', { ascending: false })
          .limit(8),
        supabase
          .from('daily_checkins')
          .select('id, mood, checkin_date, water_liters')
          .eq('user_id', session.user.id)
          .order('checkin_date', { ascending: false })
          .limit(7),
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
          .from('community_event_attendees')
          .select('id, check_in_time, community_events(id, title, date, community_id, communities(name, logo_url))')
          .eq('user_id', session.user.id).eq('checked_in', true)
          .order('check_in_time', { ascending: false })
          .limit(10),
      ]);

      if (active) setStartingWeight(profileData?.starting_weight_kg ?? null);
      if (active) setGoalWeight(profileData?.goal_weight_kg ?? null);
      if (active) setInitialWeightKg(profileData?.initial_weight_kg ?? null);
      if (active) setGoalTargetDate(profileData?.goal_target_date ?? null);
      if (active) setMeasurements((measurementData as unknown as MeasurementRow[]) ?? []);
      if (active) setCommunityActivity((communityActivityData as unknown as CommunityActivityRow[]) ?? []);

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
      } catch (err) {
        // Never strand the screen on an endless spinner — show whatever
        // loaded (stats/goals/measurements default to empty state).
        console.warn('[fitness-journey] load failed', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const achievements = buildAchievements(stats);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  // My Progress (ported from fitness-goals.tsx) — measurements is fetched
  // newest-first (limit 8) for this exact purpose: [0] is "current", the
  // reversed list is oldest→newest for the chart.
  const latestMeasurementWeight = measurements[0]?.weight_kg ?? null;
  const weightHistoryPoints = [...measurements].reverse()
    .filter((m): m is MeasurementRow & { weight_kg: number } => m.weight_kg != null)
    .map(m => ({ weight: m.weight_kg, loggedAt: m.logged_at }));
  const chartPoints = weightHistoryPoints.length > 0
    ? weightHistoryPoints
    : (startingWeight != null ? [{ weight: startingWeight, loggedAt: new Date().toISOString() }] : []);
  const weightProgress = computeWeightProgress(initialWeightKg, latestMeasurementWeight, goalWeight);


  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <LinearGradient
          colors={[palette.blue100, 'rgba(208,224,255,0)']}
          style={s.topFadeBg}
          pointerEvents="none"
        />
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
            {/* ── My Progress (ported from fitness-goals.tsx) ── */}
            <View style={s.mpSectionRow}>
              <ThemedText style={s.mpSectionTitle}>My Progress</ThemedText>
              <TouchableOpacity style={s.mpViewPlanLink} onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7}>
                <ThemedText style={s.mpViewPlanLinkText}>View my plan</ThemedText>
                <Ionicons name="chevron-forward" size={14} color={palette.blue600} />
              </TouchableOpacity>
            </View>

            {chartPoints.length > 0 ? (
              <WeightTrendCard
                points={chartPoints}
                idealWeight={goalWeight}
                onPress={() => router.push('/log-progress' as any)}
              />
            ) : (
              <View style={s.mpCard}>
                <ThemedText style={s.mpEmptyText}>Add your first progress update</ThemedText>
                <TouchableOpacity style={s.mpUpdateBtn} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.85}>
                  <ThemedText style={s.mpUpdateBtnText}>Update progress</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            {weightProgress && (
              <View style={s.mpWeightSummary}>
                <ThemedText style={s.mpWeightCurrent}>{Math.round(weightProgress.currentKg)} kg</ThemedText>
                <ThemedText style={s.mpWeightCurrentLabel}>Current weight</ThemedText>
                <View style={s.mpWeightEndsRow}>
                  <ThemedText style={s.mpWeightEnd}>Starting {Math.round(weightProgress.startingKg)} kg</ThemedText>
                  <View style={s.mpWeightLine} />
                  <ThemedText style={s.mpWeightEnd}>Goal {Math.round(weightProgress.goalKg)} kg</ThemedText>
                </View>
                <ThemedText style={s.mpCaptionOutside}>
                  {Math.round(weightProgress.remainingKg * 10) / 10} kg to goal
                  {goalTargetDate ? ` · Target ${monthYear(goalTargetDate)}` : ''}
                </ThemedText>
              </View>
            )}

            {/* ── ACP Progress Intelligence (Day 4) — leads the screen, ── */}
            {/* charts/stats stay below as supporting detail. ── */}
            {progressInsight && progressSnapshot && (
              <View style={s.progressCard}>
                <ThemedText style={s.progressEyebrow}>ACP INTELLIGENCE™</ThemedText>
                <ThemedText style={s.progressHeadline}>{progressInsight.headline}</ThemedText>
                {progressInsight.supporting.map((line, i) => (
                  <ThemedText key={i} style={s.progressSupporting}>{line}</ThemedText>
                ))}

                <View style={s.progressDivider} />

                <View style={s.progressRow}>
                  <ThemedText style={s.progressRowLabel}>Consistency</ThemedText>
                  <ThemedText style={s.progressRowValue}>
                    {progressSnapshot.behavioural.plannedWorkouts > 0
                      ? `${progressSnapshot.behavioural.completedWorkouts} / ${progressSnapshot.behavioural.plannedWorkouts} workouts · ${Math.round((progressSnapshot.behavioural.adherenceRate ?? 0) * 100)}% adherence`
                      : 'Not enough data yet'}
                  </ThemedText>
                </View>

                {progressSnapshot.performance.exerciseTrends.filter(t => t.direction !== 'insufficient_data').slice(0, 2).map(t => (
                  <View key={t.exerciseId} style={s.progressRow}>
                    <ThemedText style={s.progressRowLabel}>{t.exerciseName}</ThemedText>
                    <ThemedText style={s.progressRowValue}>
                      {t.metric === 'weight_reps' ? `${t.firstLoadKg}kg → ${t.latestLoadKg}kg` : `${t.firstReps} → ${t.latestReps} reps`}
                    </ThemedText>
                  </View>
                ))}

                {(['weight', 'waist', 'bodyFat'] as const).map(key => {
                  const trend = progressSnapshot.outcomes[key];
                  if (!trend || trend.direction === 'insufficient_data') return null;
                  const unit = key === 'waist' ? 'cm' : key === 'bodyFat' ? '%' : 'kg';
                  const label = key === 'weight' ? 'Weight' : key === 'waist' ? 'Waist' : 'Body fat';
                  return (
                    <View key={key} style={s.progressRow}>
                      <ThemedText style={s.progressRowLabel}>{label}</ThemedText>
                      <ThemedText style={s.progressRowValue}>{trend.baseline}{unit} → {trend.latest}{unit}</ThemedText>
                    </View>
                  );
                })}

                {(!progressSnapshot.outcomes.weight || progressSnapshot.outcomes.weight.isStale) && (
                  <TouchableOpacity style={s.progressCta} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.8}>
                    <ThemedText style={s.progressCtaText}>Update progress</ThemedText>
                    <Ionicons name="arrow-forward" size={14} color={palette.blue500} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Human-support insight (Day 6) — context-driven only, never a generic marketplace promotion ── */}
            {humanSupport?.primary && (
              <View style={s.supportCard}>
                <ThemedText style={s.supportHeadline}>{HUMAN_SUPPORT_HEADLINE[humanSupport.primary.trigger] ?? 'A trainer could help'}</ThemedText>
                <ThemedText style={s.supportReason}>{humanSupport.primary.reason}</ThemedText>

                {humanSupport.trainerOwned ? null : humanSupport.ptRecommendations[0] ? (
                  <TouchableOpacity
                    style={s.supportCta}
                    onPress={() => router.push({ pathname: '/trainer-profile', params: { id: humanSupport.ptRecommendations[0].id } } as any)}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={s.supportCtaText}>See trainers for your goal</ThemedText>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <ThemedText style={s.supportEmptyText}>We couldn&apos;t find a trainer matching this need right now.</ThemedText>
                )}

                {humanSupport.primary.severity !== 'HIGH' && (
                  <TouchableOpacity
                    style={s.supportDismiss}
                    disabled={dismissingSupport}
                    onPress={async () => {
                      if (!userId || !humanSupport.primary) return;
                      setDismissingSupport(true);
                      await dismissHumanSupportInsight(userId, humanSupport.primary.trigger);
                      setDismissingSupport(false);
                      setHumanSupport(prev => prev ? { ...prev, primary: null } : prev);
                    }}
                  >
                    <ThemedText style={s.supportDismissText}>Not now</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Stats grid ── */}
            <View style={s.statsGrid}>
              <StatCard value={String(stats.totalWorkouts)} label="Workouts" icon="barbell-outline" />
              <StatCard value={`${stats.totalMinutes}`} label="Minutes" icon="time-outline" />
              <StatCard value={`${stats.streakDays}d`} label="Streak" icon="flame-outline" />
              <StatCard value={`${stats.longestStreak}d`} label="Best" icon="trophy-outline" />
            </View>

            {/* ── Achievements ── */}
            <ThemedText style={s.sectionTitle}>
              Achievements · {unlockedCount}/{achievements.length}
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.achievementsRow}>
              {achievements.map(a => <AchievementBadge key={a.id} a={a} />)}
            </ScrollView>

            {/* ── Nutrition ── */}
            <ThemedText style={s.sectionTitle}>Nutrition</ThemedText>
            <View style={s.statsGrid}>
              <StatCard value={`${nutrition.streak}d`} label="Streak" icon="flame-outline" color={palette.success700} />
              <StatCard value={String(nutrition.mealsLogged)} label="Meals Logged" icon="restaurant-outline" color={palette.success700} />
              <StatCard value={`${nutrition.avgProtein}g`} label="Avg Protein" icon="fitness-outline" color={palette.success700} />
              <StatCard value={`${nutrition.avgHydration}L`} label="Avg Hydration" icon="water-outline" color={palette.success700} />
            </View>

            {/* ── What ACP is learning (Nutrition N9) — longitudinal, observational ── */}
            <NutritionWhatAcpIsLearning observations={outcomeObservations} />

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

            {/* ── Community Activity ── */}
            {communityActivity.length > 0 && (
              <>
                <ThemedText style={s.sectionTitle}>
                  Community Activity · {communityActivity.filter(c => (c.check_in_time ?? '').slice(0, 7) === new Date().toISOString().slice(0, 7)).length} this month
                </ThemedText>
                {communityActivity.slice(0, 3).map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={s.goalTeaserCard}
                    activeOpacity={0.85}
                    onPress={() => c.community_events?.community_id && router.push({ pathname: '/community/[id]', params: { id: c.community_events.community_id } } as any)}
                  >
                    <View style={s.goalTeaserIcon}>
                      <Ionicons name="people-outline" size={20} color={palette.blue500} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.goalTeaserTitle}>{c.community_events?.title ?? 'Community event'}</ThemedText>
                      <ThemedText style={s.goalTeaserSub}>
                        {c.community_events?.communities?.name ?? 'Community'}
                        {c.community_events?.date ? ` · ${new Date(`${c.community_events.date}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}` : ''}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </>
            )}

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
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  // My Progress (ported from fitness-goals.tsx — prefixed "mp" to avoid
  // colliding with this screen's own pre-existing progressCard/progressRow
  // styles, which style a completely different card).
  mpSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  mpSectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  mpViewPlanLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mpViewPlanLinkText: { fontSize: 13, fontWeight: '700', color: palette.blue600 },
  mpCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    padding: 16, marginBottom: 12,
  },
  mpWeightSummary: { marginBottom: 12 },
  mpWeightCurrent: { fontSize: 24, fontWeight: '800', color: palette.ink900 },
  mpWeightCurrentLabel: { fontSize: 12, color: palette.gray300, marginTop: 1, marginBottom: 10 },
  mpWeightEndsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mpWeightEnd: { fontSize: 12.5, fontWeight: '700', color: palette.ink700 },
  mpWeightLine: { flex: 1, height: 1, backgroundColor: palette.border },
  mpCaptionOutside: { fontSize: 12, color: palette.gray450, marginTop: 6 },
  mpEmptyText: { fontSize: 13, color: palette.gray450, marginBottom: 12 },
  mpUpdateBtn: {
    alignSelf: 'flex-start', backgroundColor: palette.ink900,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill, marginTop: 4,
  },
  mpUpdateBtnText: { fontSize: 13, fontWeight: '700', color: palette.white },

  progressCard: {
    borderRadius: radii.xl, backgroundColor: palette.ink900,
    padding: 18, marginBottom: 20,
  },
  progressEyebrow: {
    fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  progressHeadline: { fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 6 },
  progressSupporting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18, marginBottom: 2 },
  progressDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 14 },
  progressRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  progressRowLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.65)', flexShrink: 1, marginRight: 8 },
  progressRowValue: { fontSize: 13, fontWeight: '700', color: '#fff' },
  progressCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 10, borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressCtaText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  supportCard: {
    borderRadius: radii.xl, backgroundColor: palette.surfaceMuted,
    borderWidth: 1, borderColor: palette.hairline, padding: 16, marginBottom: 20,
  },
  supportHeadline: { fontSize: 15.5, fontWeight: '800', color: palette.ink900, marginBottom: 4 },
  supportReason: { fontSize: 13, color: palette.gray450, lineHeight: 18 },
  supportCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 12, paddingVertical: 11, borderRadius: radii.pill, backgroundColor: palette.ink900,
  },
  supportCtaText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  supportEmptyText: { fontSize: 12, color: palette.gray300, marginTop: 10, fontStyle: 'italic' },
  supportDismiss: { alignSelf: 'center', marginTop: 8, paddingVertical: 6 },
  supportDismissText: { fontSize: 12.5, fontWeight: '600', color: palette.gray300 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
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


  // Stats
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14, alignItems: 'center', gap: 6, ...shadows.sm,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: palette.ink900, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Nutrition weight progress
  weightProgressCard: {
    backgroundColor: palette.success50, borderRadius: radii.lg,
    padding: 16, marginBottom: 24,
  },
  weightProgressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weightProgressItem: { alignItems: 'center' },
  weightProgressLabel: { fontSize: 10.5, fontWeight: '700', color: palette.success700, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  weightProgressVal: { fontSize: 16, fontWeight: '800', color: palette.ink900 },

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
  signInBtn: { backgroundColor: palette.ink900, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radii.xl },
  signInBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
