// A single shared profile screen for both the Fitness Hub and Nutrition
// Hub — fitness and nutrition goals go hand in hand, so there's one goal
// (fitness_profile.goal) instead of two that could drift out of sync.
// Experience level / preferred location are fitness-specific; cuisine
// preference / weight goals are nutrition-specific — all live on the same
// fitness_profile row.
//
// ACP Intelligence™ evolution: this screen is the user's compact "what I'm
// working with" home — primary goal, starting point, progress, and the
// preferences ACP personalises around. It deliberately stays distinct from
// My Plan (what ACP recommends) and coaching_memory (what ACP has learned) —
// it may surface at most one insight from the latter, never the full
// longitudinal picture.
import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import Svg, { Path, Circle, Line as SvgLine } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BARRIER_OPTIONS, ACTIVITY_OPTIONS, MAX_BARRIERS,
  TRAINING_DAY_OPTIONS, MIN_TRAINING_DAYS, MAX_TRAINING_DAYS,
  sanitizeTrainingDays, formatTrainingDaysLabel, describeTrainingFrequency,
  type OnboardingAnswers, type CanonicalWeekday,
} from '@/lib/onboarding';
import { fetchOnboardingAssessment, type AIAssessment } from '@/lib/ai-assessment';
import { getScheduledNextPlan, scheduledPlanNeedsScheduleUpdate, type ScheduledNextPlan } from '@/lib/weekly-review';
import { getCompletionProgress, type PlanActivityCompletion } from '@/lib/completion';
import { pickHomeInsight, pickOutcomeInsight, type CoachingMemoryRow, type HomeCoachingInsight } from '@/lib/coaching-memory';
import { computeWeightProgress } from '@/lib/weight-progress';
import { CANONICAL_CUISINES, CUISINE_LABEL, type CanonicalCuisine } from '@/lib/nutrition-cuisine';

const CUISINE_PICKER_OPTIONS: { key: CanonicalCuisine | 'mixed'; label: string }[] = [
  ...CANONICAL_CUISINES.map(key => ({ key, label: CUISINE_LABEL[key] })),
  { key: 'mixed', label: 'No preference / Mixed' },
];

interface FitnessGoal {
  key: 'lose_weight' | 'build_muscle' | 'maintain_weight' | 'reduce_stress';
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

// Display copy kept consistent with the onboarding goal picker (Day 6.5
// copy pass) — same canonical keys, no new goal values.
const GOALS: FitnessGoal[] = [
  { key: 'build_muscle',     label: 'Build Strength',           desc: 'Get stronger and build muscle',                icon: 'barbell-outline',     color: '#1d4ed8' },
  { key: 'lose_weight',      label: 'Lose Weight',               desc: 'Build sustainable habits for fat loss',        icon: 'flame-outline',       color: '#ef4444' },
  { key: 'maintain_weight',  label: 'Maintain a Healthy Weight', desc: 'Stay active, strong and healthy',              icon: 'trending-up-outline', color: '#0891b2' },
  { key: 'reduce_stress',    label: 'Reduce Stress',             desc: 'Move more, recover better and feel your best', icon: 'happy-outline',       color: '#9333ea' },
];

const GOAL_LABEL: Record<string, string> = Object.fromEntries(GOALS.map(g => [g.key, g.label]));

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { key: 'beginner',     label: 'Beginner',     desc: 'New to working out', icon: 'leaf-outline'    },
  { key: 'intermediate', label: 'Intermediate', desc: 'Training 6+ months', icon: 'barbell-outline' },
  { key: 'advanced',     label: 'Advanced',     desc: 'Serious athlete',    icon: 'trophy-outline'  },
];

// A measurement update older than this no longer counts as "current" for
// the weekly check-in nudge — elapsed time since the latest legitimate
// entry, not a calendar-week assumption.
const CHECK_IN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function monthYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Dark, standalone visual treatment for the weight-trend card — a
// deliberate one-off departure from the rest of the (light) My Goals
// design, matching a specific reference style requested for this card only.
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

export default function FitnessGoalsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [goal, setGoalState] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [startingWeight, setStartingWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [barriers, setBarriers] = useState<string[]>([]);
  const [preferredActivities, setPreferredActivities] = useState<string[]>([]);
  const [trainingDays, setTrainingDays] = useState<CanonicalWeekday[]>([]);
  const [scheduledNext, setScheduledNext] = useState<ScheduledNextPlan | null>(null);
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([]);
  const [goalTargetDate, setGoalTargetDate] = useState<string | null>(null);
  const [goalDetails, setGoalDetails] = useState<Record<string, unknown>>({});
  const [activityLevel, setActivityLevel] = useState<string | null>(null);
  const [hoursExercisingPerWeek, setHoursExercisingPerWeek] = useState<number | null>(null);
  const [initialWeightKg, setInitialWeightKg] = useState<number | null>(null);

  const [latestMeasurementWeight, setLatestMeasurementWeight] = useState<number | null>(null);
  const [latestMeasurementAt, setLatestMeasurementAt] = useState<string | null>(null);
  const [weightHistory, setWeightHistory] = useState<{ weight: number; loggedAt: string }[]>([]);

  const [weeklyProgress, setWeeklyProgress] = useState<{ completed: number; total: number; percent: number } | null>(null);
  const [coachingInsight, setCoachingInsight] = useState<HomeCoachingInsight | null>(null);
  const [outcomeInsight, setOutcomeInsight] = useState<HomeCoachingInsight | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Goal-change confirmation — nothing is persisted or regenerated until
  // the user explicitly confirms in the modal.
  const [pendingGoal, setPendingGoal] = useState<FitnessGoal | null>(null);
  const [changingGoal, setChangingGoal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }
    const uid = session.user.id;
    setUserId(uid);

    const [{ data: profile }, { data: healthProfile }, { data: measurements }, { data: memoryRows }, scheduled] = await Promise.all([
      supabase.from('fitness_profile')
        .select('goal, experience_level, starting_weight_kg, goal_weight_kg, initial_weight_kg, barriers, preferred_activities, preferred_training_days, cuisine_preferences, goal_target_date, goal_details, activity_level, ai_assessment, ai_assessment_generated_at')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase.from('health_profile').select('hours_exercising_per_week').eq('user_id', uid).maybeSingle(),
      supabase.from('client_measurements').select('weight_kg, logged_at').eq('user_id', uid).order('logged_at', { ascending: false }).limit(8),
      supabase.from('coaching_memory').select('memory_type, subject, confidence, evidence, user_message').eq('user_id', uid).eq('active', true),
      getScheduledNextPlan(supabase as any, uid),
    ]);
    setScheduledNext(scheduled);

    setGoalState(profile?.goal ?? null);
    setLevel(profile?.experience_level ?? null);
    setStartingWeight(profile?.starting_weight_kg != null ? String(profile.starting_weight_kg) : '');
    setGoalWeight(profile?.goal_weight_kg != null ? String(profile.goal_weight_kg) : '');
    setInitialWeightKg(profile?.initial_weight_kg ?? null);
    setBarriers(profile?.barriers ?? []);
    setPreferredActivities(profile?.preferred_activities ?? []);
    setTrainingDays(sanitizeTrainingDays(profile?.preferred_training_days));
    setCuisinePreferences(profile?.cuisine_preferences ?? []);
    setGoalTargetDate(profile?.goal_target_date ?? null);
    setGoalDetails((profile?.goal_details ?? {}) as Record<string, unknown>);
    setActivityLevel(profile?.activity_level ?? null);
    setHoursExercisingPerWeek(healthProfile?.hours_exercising_per_week ?? null);

    const latest = measurements?.[0];
    setLatestMeasurementWeight(latest?.weight_kg ?? null);
    setLatestMeasurementAt(latest?.logged_at ?? null);
    // Oldest -> newest for charting (fetched newest-first for the "limit 8
    // most recent" query, then reversed here).
    setWeightHistory(
      (measurements ?? [])
        .filter((m): m is { weight_kg: number; logged_at: string } => m.weight_kg != null)
        .map(m => ({ weight: m.weight_kg, loggedAt: m.logged_at }))
        .reverse(),
    );

    // Same plan identity, same completion semantics as Home/My Plan
    // (fitness_profile.ai_assessment_generated_at doubles as the plan_id) —
    // reusing getCompletionProgress here makes it structurally impossible
    // for this screen and My Plan to disagree on "N of M this week".
    const assessment = profile?.ai_assessment as AIAssessment | null | undefined;
    const planId = profile?.ai_assessment_generated_at as string | null | undefined;
    if (assessment?.starting_plan?.activities?.length && planId) {
      const { data: completions } = await supabase
        .from('plan_activity_completions')
        .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
        .eq('user_id', uid)
        .eq('plan_id', planId);
      const rows: PlanActivityCompletion[] = (completions ?? []).map((c: any) => ({
        id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
        completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
      }));
      setWeeklyProgress(getCompletionProgress(assessment.starting_plan.activities.length, rows));
    } else {
      setWeeklyProgress(null);
    }

    setCoachingInsight(pickHomeInsight((memoryRows ?? []) as CoachingMemoryRow[]));
    setOutcomeInsight(pickOutcomeInsight((memoryRows ?? []) as CoachingMemoryRow[]));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveProfile = async (patch: Record<string, string | number | null | string[]>) => {
    if (!userId || saving) return;
    setSaving(true);

    const { error } = await supabase.from('fitness_profile').upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

    if (error) {
      // Surface the real Postgres/PostgREST message — a bare "try again" hides
      // actionable causes (e.g. a migration not yet applied, or a CHECK
      // rejecting the value).
      console.warn('fitness_profile save failed', { patch: Object.keys(patch), error });
      Alert.alert('Couldn’t save', error.message || 'Please try again.');
    }
    setSaving(false);
  };

  const selectLevel = (key: string) => { setLevel(key); saveProfile({ experience_level: key }); };

  const toggleBarrier = (key: string) => {
    const next = barriers.includes(key)
      ? barriers.filter(b => b !== key)
      : barriers.length >= MAX_BARRIERS ? barriers : [...barriers, key];
    setBarriers(next);
    saveProfile({ barriers: next });
  };

  const toggleActivity = (key: string) => {
    const next = preferredActivities.includes(key)
      ? preferredActivities.filter(a => a !== key)
      : [...preferredActivities, key];
    setPreferredActivities(next);
    saveProfile({ preferred_activities: next });
  };

  // Beta Feedback #002 — training schedule preference. Autosaves (like every
  // other chip here), but §11/§28: it does NOT regenerate anything now —
  // the current plan stays put; the next plan ACP prepares uses the new
  // preference. Persist NULL below the valid range so it means "no
  // preference" rather than an empty structure.
  const toggleTrainingDay = (key: CanonicalWeekday) => {
    const next = trainingDays.includes(key)
      ? trainingDays.filter(d => d !== key)
      : trainingDays.length >= MAX_TRAINING_DAYS
        ? trainingDays
        : sanitizeTrainingDays([...trainingDays, key]);
    setTrainingDays(next);
    saveProfile({ preferred_training_days: next.length >= MIN_TRAINING_DAYS ? next : null });
  };

  // Day 7.2 — cuisine preference is a soft ranking signal for meal
  // suggestions (never a hard filter — see lib/nutrition-cuisine.ts), so
  // toggling it here never needs a confirmation modal the way changing the
  // primary goal does.
  const toggleCuisine = (key: string) => {
    const next = cuisinePreferences.includes(key)
      ? cuisinePreferences.filter(c => c !== key)
      : [...cuisinePreferences, key];
    setCuisinePreferences(next);
    saveProfile({ cuisine_preferences: next });
  };

  // Selecting a different primary goal never writes anything by itself —
  // it only opens the confirmation. ACP Intelligence™ doesn't own the
  // user's ambition; the modal is what makes the change (and the plan
  // regeneration it triggers) an explicit, deliberate action.
  const requestGoalChange = (g: FitnessGoal) => {
    if (g.key === goal) return;
    setPendingGoal(g);
  };

  const confirmGoalChange = async () => {
    if (!userId || !pendingGoal) return;
    const newGoal = pendingGoal.key;
    setChangingGoal(true);
    try {
      // Only the goal itself changes here — deliberately NOT resetting
      // weight/experience/barriers the way onboarding's in-flow goal picker
      // does. Those are real, already-committed answers for an existing
      // user; a goal change shouldn't wipe them (section 10 — historical
      // progress/answers survive a goal change).
      const { error } = await supabase.from('fitness_profile').upsert(
        { user_id: userId, goal: newGoal, goals: [newGoal], updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      setGoalState(newGoal);

      // Reuse the exact existing plan-generation architecture (the same
      // onboarding-assessment call onboarding/plan.tsx and My Plan's own
      // regeneration path already use) — no second AI route, no second
      // assessment implementation.
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (accessToken) {
        const onboardingAnswers: OnboardingAnswers = {
          goal: newGoal as OnboardingAnswers['goal'],
          startingWeightKg: startingWeight.trim() ? Number(startingWeight) : null,
          goalWeightKg: goalWeight.trim() ? Number(goalWeight) : null,
          goalTargetDate,
          activityLevel: activityLevel as OnboardingAnswers['activityLevel'],
          strengthExperience: level as OnboardingAnswers['strengthExperience'],
          goalDetails,
          barriers: barriers as OnboardingAnswers['barriers'],
          preferredActivities: preferredActivities as OnboardingAnswers['preferredActivities'],
          preferredTrainingDays: trainingDays,
        };
        await fetchOnboardingAssessment({
          userId, onboardingAnswers, accessToken,
          sportHoursPerWeek: hoursExercisingPerWeek,
        });
      }

      setPendingGoal(null);
      load();
    } catch {
      Alert.alert('Error', 'Failed to update your goal. Please try again.');
    } finally {
      setChangingGoal(false);
    }
  };

  const weightProgress = computeWeightProgress(
    initialWeightKg ?? (startingWeight.trim() ? Number(startingWeight) : null),
    latestMeasurementWeight ?? (startingWeight.trim() ? Number(startingWeight) : null),
    goalWeight.trim() ? Number(goalWeight) : null,
  );

  const chartPoints = weightHistory.length > 0
    ? weightHistory
    : (startingWeight.trim() ? [{ weight: Number(startingWeight), loggedAt: new Date().toISOString() }] : []);

  const daysSinceLastMeasurement = latestMeasurementAt
    ? Math.floor((Date.now() - new Date(latestMeasurementAt).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const checkInDue = latestMeasurementAt == null
    || (Date.now() - new Date(latestMeasurementAt).getTime()) >= CHECK_IN_INTERVAL_MS;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={s.topFadeBg}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>My Goals</ThemedText>
          <ThemedText style={s.headerSub}>What ACP Intelligence™ uses to personalise your plan</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <ThemedText style={s.sectionTitle}>My Primary Goal</ThemedText>
          <ThemedText style={s.sectionSub}>The main thing you want ACP Intelligence™ to help you achieve.</ThemedText>
          <View style={s.goalsGrid}>
            {GOALS.map(g => {
              const active = goal === g.key;
              return (
                <TouchableOpacity
                  key={g.key}
                  style={[s.goalCard, active && { borderColor: g.color, borderWidth: 2 }]}
                  onPress={() => requestGoalChange(g)}
                  activeOpacity={0.8}
                  disabled={saving || changingGoal}
                >
                  <View style={[s.goalIcon, { backgroundColor: active ? g.color : palette.surfaceMuted }]}>
                    <Ionicons name={g.icon as any} size={20} color={active ? '#fff' : palette.gray450} />
                  </View>
                  <ThemedText style={[s.goalLabel, active && { color: g.color }]}>{g.label}</ThemedText>
                  <ThemedText style={s.goalDesc}>{g.desc}</ThemedText>
                  {active && (
                    <View style={[s.goalCheck, { backgroundColor: g.color }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ─── MY PROGRESS ─── */}
          <View style={s.sectionTitleRow}>
            <ThemedText style={[s.sectionTitle, { marginBottom: 0 }]}>My Progress</ThemedText>
            <TouchableOpacity style={s.viewPlanLink} onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7}>
              <ThemedText style={s.viewPlanLinkText}>View my plan</ThemedText>
              <Ionicons name="chevron-forward" size={14} color={palette.blue600} />
            </TouchableOpacity>
          </View>

          {chartPoints.length > 0 ? (
            <WeightTrendCard
              points={chartPoints}
              idealWeight={goalWeight.trim() ? Number(goalWeight) : null}
              onPress={() => router.push('/log-progress' as any)}
            />
          ) : (
            <View style={s.progressCard}>
              <ThemedText style={s.emptyProgressText}>Add your first progress update</ThemedText>
              <TouchableOpacity style={s.updateProgressBtn} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.85}>
                <ThemedText style={s.updateProgressBtnText}>Update progress</ThemedText>
              </TouchableOpacity>
            </View>
          )}
          {weightProgress && (
            <View style={s.weightSummary}>
              <ThemedText style={s.weightSummaryCurrent}>{Math.round(weightProgress.currentKg)} kg</ThemedText>
              <ThemedText style={s.weightSummaryCurrentLabel}>Current weight</ThemedText>
              <View style={s.weightSummaryEndsRow}>
                <ThemedText style={s.weightSummaryEnd}>Starting {Math.round(weightProgress.startingKg)} kg</ThemedText>
                <View style={s.weightSummaryLine} />
                <ThemedText style={s.weightSummaryEnd}>Goal {Math.round(weightProgress.goalKg)} kg</ThemedText>
              </View>
              <ThemedText style={s.progressCaptionOutside}>
                {Math.round(weightProgress.remainingKg * 10) / 10} kg to goal
                {goalTargetDate ? ` · Target ${monthYear(goalTargetDate)}` : ''}
              </ThemedText>
            </View>
          )}

          <View style={s.progressCard}>
            <ThemedText style={s.weekLabel}>This Week</ThemedText>
            {!weeklyProgress ? (
              <ThemedText style={s.emptyProgressText}>Your activity progress will appear here once you start your plan.</ThemedText>
            ) : weeklyProgress.completed === 0 ? (
              <>
                <ThemedText style={s.weekCaption}>Your week is ready</ThemedText>
                <ThemedText style={s.weekSubCaption}>{weeklyProgress.total} activities planned</ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={s.weekCaption}>{weeklyProgress.completed} of {weeklyProgress.total} activities completed</ThemedText>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${weeklyProgress.percent}%`, backgroundColor: palette.success700 }]} />
                </View>
              </>
            )}
          </View>

          {checkInDue ? (
            <View style={s.progressCard}>
              <ThemedText style={s.weekLabel}>Time for your weekly check-in?</ThemedText>
              <ThemedText style={s.weekCaption}>Update your measurements so ACP Intelligence™ can track your progress over time.</ThemedText>
              <TouchableOpacity style={s.updateProgressBtn} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.85}>
                <ThemedText style={s.updateProgressBtnText}>Update progress →</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.progressCard} onPress={() => router.push('/log-progress' as any)} activeOpacity={0.85}>
              <View style={s.checkedRow}>
                <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                <ThemedText style={s.checkedText}>Progress updated this week</ThemedText>
              </View>
              {daysSinceLastMeasurement != null && (
                <ThemedText style={s.weekCaption}>
                  Last updated {daysSinceLastMeasurement === 0 ? 'today' : `${daysSinceLastMeasurement} day${daysSinceLastMeasurement === 1 ? '' : 's'} ago`}
                </ThemedText>
              )}
            </TouchableOpacity>
          )}

          {/* Day 8.4 — progress hierarchy (section 25): goal-relevant outcome
              evidence first, then the behavioural "ACP noticed" pattern. */}
          {outcomeInsight && (
            <View style={s.progressCard}>
              <ThemedText style={s.insightEyebrow}>ACP Intelligence™</ThemedText>
              <ThemedText style={s.weekLabel}>{outcomeInsight.headline}</ThemedText>
              <ThemedText style={s.weekCaption}>{outcomeInsight.body}</ThemedText>
            </View>
          )}

          {coachingInsight && (
            <View style={s.progressCard}>
              <ThemedText style={s.insightEyebrow}>ACP noticed</ThemedText>
              <ThemedText style={s.weekLabel}>{coachingInsight.headline}</ThemedText>
              <ThemedText style={s.weekCaption}>{coachingInsight.body}</ThemedText>
            </View>
          )}

          {!outcomeInsight && !coachingInsight && !!weeklyProgress && (
            <View style={s.progressCard}>
              <ThemedText style={s.insightEyebrow}>ACP Intelligence™</ThemedText>
              <ThemedText style={s.weekLabel}>Building your picture</ThemedText>
              <ThemedText style={s.weekCaption}>Keep logging your progress and completing sessions — ACP needs a little more data before identifying a clear trend.</ThemedText>
            </View>
          )}

          <ThemedText style={s.sectionTitle}>My Starting Point</ThemedText>
          <View style={s.levelRow}>
            {EXPERIENCE_LEVELS.map(lv => {
              const active = level === lv.key;
              return (
                <TouchableOpacity
                  key={lv.key}
                  style={[s.levelCard, active && s.levelCardActive]}
                  onPress={() => selectLevel(lv.key)}
                  activeOpacity={0.8}
                  disabled={saving}
                >
                  <Ionicons name={lv.icon as any} size={18} color={active ? '#fff' : palette.gray450} />
                  <ThemedText style={[s.levelLabel, active && s.levelLabelActive]}>{lv.label}</ThemedText>
                  <ThemedText style={[s.levelDesc, active && { color: 'rgba(255,255,255,0.75)' }]}>{lv.desc}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          {barriers.length > 0 && (
            <>
              <ThemedText style={[s.sectionTitle, { marginTop: 28 }]}>What I&apos;m Working Around</ThemedText>
              <ThemedText style={s.sectionSub}>ACP uses this to shape your plan and support.</ThemedText>
              <View style={s.chipWrap}>
                {BARRIER_OPTIONS.filter(b => barriers.includes(b.key)).map(b => (
                  <TouchableOpacity
                    key={b.key}
                    style={s.chip}
                    onPress={() => toggleBarrier(b.key)}
                    activeOpacity={0.7}
                    disabled={saving}
                  >
                    <Ionicons name={b.icon as any} size={14} color={palette.blue600} />
                    <ThemedText style={s.chipText}>{b.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {preferredActivities.length > 0 && (
            <>
              <ThemedText style={[s.sectionTitle, { marginTop: 28 }]}>How I Like to Move</ThemedText>
              <View style={s.chipWrap}>
                {ACTIVITY_OPTIONS.filter(a => preferredActivities.includes(a.key)).map(a => (
                  <TouchableOpacity
                    key={a.key}
                    style={s.chip}
                    onPress={() => toggleActivity(a.key)}
                    activeOpacity={0.7}
                    disabled={saving}
                  >
                    <Ionicons name={a.icon as any} size={14} color={palette.blue600} />
                    <ThemedText style={s.chipText}>{a.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Beta Feedback #002 — Training Schedule. Always shown (the answer
              to "can I change my preference?" is a visible yes). Editing it
              never touches the current plan — it applies to the next plan
              ACP prepares (§11/§28). */}
          <ThemedText style={[s.sectionTitle, { marginTop: 28 }]}>Training Schedule</ThemedText>
          <ThemedText style={s.sectionSub}>
            {trainingDays.length >= MIN_TRAINING_DAYS
              ? `${describeTrainingFrequency(trainingDays.length)} · ${formatTrainingDaysLabel(trainingDays)}`
              : 'Tell ACP which weekdays you prefer to train, and it builds your week around them.'}
          </ThemedText>
          <View style={s.dayRow}>
            {TRAINING_DAY_OPTIONS.map(d => {
              const selected = trainingDays.includes(d.key);
              const atCap = !selected && trainingDays.length >= MAX_TRAINING_DAYS;
              return (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => toggleTrainingDay(d.key)}
                  activeOpacity={0.8}
                  disabled={saving || atCap}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={d.short}
                  style={[s.dayPill, selected && s.dayPillOn, atCap && { opacity: 0.4 }]}
                >
                  <ThemedText style={[s.dayPillText, selected && s.dayPillTextOn]}>{d.letter}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={s.scheduleNote}>
            {trainingDays.length === 1
              ? `Pick at least ${MIN_TRAINING_DAYS} days, or none to let ACP decide.`
              : 'Changes apply the next time ACP prepares your plan — your current week stays as it is.'}
          </ThemedText>

          {/* Beta Feedback #003 — a future plan is already prepared and no
              longer matches the (just-changed) preference. Explicit opt-in
              only: the rebuild + confirmation live on the next-week screen. */}
          {scheduledPlanNeedsScheduleUpdate(scheduledNext, trainingDays) && (
            <TouchableOpacity
              style={s.scheduleUpdateBanner}
              onPress={() => router.push('/next-week-plan' as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Review and update next week's plan"
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={s.scheduleUpdateTitle}>Your next-week plan was prepared before this change</ThemedText>
                <ThemedText style={s.scheduleUpdateSub}>Review &amp; update →</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.blue600} />
            </TouchableOpacity>
          )}

          <ThemedText style={[s.sectionTitle, { marginTop: 28 }]}>Cuisine Preference</ThemedText>
          <ThemedText style={s.sectionSub}>ACP uses this to rank meal suggestions — it never hides a meal just for being a different cuisine.</ThemedText>
          <View style={s.chipWrap}>
            {CUISINE_PICKER_OPTIONS.map(c => {
              const selected = cuisinePreferences.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[s.chip, selected && s.chipActive]}
                  onPress={() => toggleCuisine(c.key)}
                  activeOpacity={0.7}
                  disabled={saving}
                >
                  <ThemedText style={[s.chipText, selected && s.chipTextActive]}>{c.label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      <Modal visible={!!pendingGoal} transparent animationType="fade" onRequestClose={() => setPendingGoal(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => (!changingGoal ? setPendingGoal(null) : undefined)}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
            <ThemedText style={s.modalTitle}>Change your primary goal?</ThemedText>
            {goal && pendingGoal && (
              <ThemedText style={s.modalTransition}>{GOAL_LABEL[goal] ?? goal} → {pendingGoal.label}</ThemedText>
            )}
            <ThemedText style={s.modalBody}>
              ACP Intelligence™ will use your new goal to update your plan and recommendations. Your progress so far won&apos;t be lost.
            </ThemedText>
            <TouchableOpacity
              style={[s.modalPrimaryBtn, changingGoal && { opacity: 0.7 }]}
              onPress={confirmGoalChange}
              disabled={changingGoal}
              activeOpacity={0.85}
            >
              {changingGoal
                ? <ActivityIndicator color={palette.white} />
                : <ThemedText style={s.modalPrimaryBtnText}>Change goal &amp; update my plan</ThemedText>}
            </TouchableOpacity>
            <TouchableOpacity style={s.modalSecondaryBtn} onPress={() => setPendingGoal(null)} disabled={changingGoal} activeOpacity={0.7}>
              <ThemedText style={s.modalSecondaryBtnText}>Keep current goal</ThemedText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  viewPlanLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewPlanLinkText: { fontSize: 13, fontWeight: '700', color: palette.blue600 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  sectionSub: { fontSize: 11.5, color: palette.gray300, marginBottom: 14 },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  goalCard: {
    width: '47%', borderRadius: radii.xl,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    padding: 14, gap: 6,
  },
  goalIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  goalLabel: { fontSize: 13, fontWeight: '800', color: palette.ink900, letterSpacing: -0.1 },
  goalDesc: { fontSize: 11, color: palette.gray300, lineHeight: 14 },
  goalCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  // My Progress
  progressCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    padding: 16, marginBottom: 12,
  },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: palette.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  weightSummary: { marginBottom: 12 },
  weightSummaryCurrent: { fontSize: 24, fontWeight: '800', color: palette.ink900 },
  weightSummaryCurrentLabel: { fontSize: 12, color: palette.gray300, marginTop: 1, marginBottom: 10 },
  weightSummaryEndsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightSummaryEnd: { fontSize: 12.5, fontWeight: '700', color: palette.ink700 },
  weightSummaryLine: { flex: 1, height: 1, backgroundColor: palette.border },
  progressCaptionOutside: { fontSize: 12, color: palette.gray450, marginTop: 6 },
  emptyProgressText: { fontSize: 13, color: palette.gray450, marginBottom: 12 },
  updateProgressBtn: {
    alignSelf: 'flex-start', backgroundColor: palette.ink900,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill, marginTop: 4,
  },
  updateProgressBtnText: { fontSize: 13, fontWeight: '700', color: palette.white },
  weekLabel: { fontSize: 14, fontWeight: '800', color: palette.ink900, marginBottom: 4 },
  weekCaption: { fontSize: 12.5, color: palette.gray450, marginBottom: 10 },
  weekSubCaption: { fontSize: 12, color: palette.gray300, marginTop: -6 },
  checkedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  checkedText: { fontSize: 13, fontWeight: '700', color: palette.success700 },
  insightEyebrow: { fontSize: 10, fontWeight: '700', color: palette.blue600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },

  levelRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  levelCard: {
    flex: 1, borderRadius: radii.xl, padding: 12, gap: 4, alignItems: 'center',
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
  },
  levelCardActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  levelLabel: { fontSize: 12, fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  levelLabelActive: { color: '#fff' },
  levelDesc: { fontSize: 10, color: palette.gray300, textAlign: 'center', lineHeight: 13 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipText: { fontSize: 12.5, fontWeight: '700', color: palette.ink900 },
  chipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  chipTextActive: { color: palette.white },

  // Beta Feedback #002 — Training Schedule day pills.
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  dayPill: {
    flex: 1, aspectRatio: 1, maxWidth: 44,
    borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline,
    backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center',
  },
  dayPillOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  dayPillText: { fontSize: 12.5, fontWeight: '700', color: palette.ink900 },
  dayPillTextOn: { color: palette.white },
  scheduleNote: { fontSize: 11.5, color: palette.gray300, marginBottom: 12 },
  // Beta Feedback #003 — "prepared before this change" entry point.
  scheduleUpdateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.blue50, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 28,
  },
  scheduleUpdateTitle: { fontSize: 12.5, fontWeight: '700', color: palette.ink900, lineHeight: 17 },
  scheduleUpdateSub: { fontSize: 12, fontWeight: '700', color: palette.blue600, marginTop: 3 },

  // Goal-change confirmation — same ad-hoc modal pattern used elsewhere
  // (onboarding/plan.tsx's ACP Intelligence tooltip, Home's notifications
  // modal): transparent Modal, tap-outside-to-dismiss overlay, non-
  // dismissing inner card.
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  modalCard: { backgroundColor: palette.white, borderRadius: radii.xl, padding: 22, maxWidth: 360, width: '100%' },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink700, marginBottom: 8 },
  modalTransition: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink600, marginBottom: 10 },
  modalBody: { fontSize: fontSize.sm, color: palette.ink600, lineHeight: 20, marginBottom: 18 },
  modalPrimaryBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.pill, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
  },
  modalPrimaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.white },
  modalSecondaryBtn: { alignItems: 'center', paddingVertical: 6 },
  modalSecondaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray450 },
});
