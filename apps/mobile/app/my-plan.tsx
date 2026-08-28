// The persistent, revisitable "My Plan" screen — shows the Day 2 ACP
// Intelligence™ output (assessment + one canonical first-week plan) sourced
// from the saved fitness_profile row, or the rule-based fallback if no AI
// assessment exists yet (in which case one is generated on this visit).
// Reachable any time via the "My Plan" CTA on the My Goals page, and via
// "See my detailed plan" at the end of onboarding.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, Alert, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { getStravaStatus } from '@/services/strava';
import { buildPlanSummary, buildFallbackWeekPlan, EMPTY_ANSWERS, type OnboardingAnswers, type PlanSummary } from '@/lib/onboarding';
import {
  fetchOnboardingAssessment, deriveCategoryCounts, isValidAssessment, sortSupportOpportunities,
  CATEGORY_LABEL, type AIAssessment,
} from '@/lib/ai-assessment';
import { getFulfilmentForActivity, nextDateForWeekday, type PlanActivityFulfilment, type MarketplaceInventoryItem } from '@/lib/fulfilment';
import {
  getCompletionProgress, findStravaCandidates, findExerciseDbCandidates, findAcpBookingCandidates, findHealthKitCandidates,
  type PlanActivityCompletion, type CompletionCandidate, type StravaActivityRow, type WorkoutHistoryRow, type AcpCheckedInRow, type HealthKitWorkoutRow,
} from '@/lib/completion';
import { matchProfessionalProviders, type ProviderMatch } from '@/lib/professional-support';
import { isPlanReadyForReview, buildWeeklyBehaviourSummary, fetchWeeklyAdaptation, fetchPlanDateUpgrade } from '@/lib/weekly-review';
import { findFoodsForNutritionFocus, type FoodCandidate, type FoodSuggestion } from '@/lib/nutrition-matching';
import { formatOverallProgress, selectTopInsights, formatEvidenceLine, selectOutcomeInsights, formatOutcomeEvidenceLine, type CoachingMemoryRow } from '@/lib/coaching-memory';
import { palette, radii, fontSize } from '@/constants/theme';

const APPROACH_ICON: Record<string, string> = {
  Strength: 'barbell-outline',
  Cardio: 'heart-outline',
  Movement: 'walk-outline',
  Nutrition: 'nutrition-outline',
  Community: 'people-outline',
  Consistency: 'repeat-outline',
};

export default function MyPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  // Always computed, regardless of whether the AI assessment is present —
  // "Your goal" is deterministic and reused as-is on both the AI and
  // fallback renders (see planSummary.goalLine below), while the fallback
  // card (approach chips etc.) only shows when there's no AI assessment.
  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null);
  const [showIntelligenceInfo, setShowIntelligenceInfo] = useState(false);
  // Day 3 fulfilment layer — populated AFTER the canonical plan is already
  // rendered (see the effect below), never blocking it. Empty by default;
  // per-activity entries are added only once genuinely available, and any
  // fetch failure here simply leaves this empty rather than surfacing an
  // error — the plan itself is always fully usable on its own.
  const [fulfilments, setFulfilments] = useState<PlanActivityFulfilment[]>([]);
  // Day 4: plan identification (Part 4) — fitness_profile.ai_assessment_generated_at,
  // already unique-per-generation and immutable, reused as-is rather than
  // introducing a dedicated plan-id column. A regenerated plan gets a new
  // generatedAt, so completions never silently carry over from an unrelated
  // earlier plan (they just stop matching by planId).
  const [planId, setPlanId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Day 7 — reconciles "My Plan" (this screen: general active-life guidance,
  // nutrition, support) with "My Programme" (workout_programs: the actual
  // day-by-day structured training schedule) so they never read as two
  // competing workout plans. Independent/isolated from the rest of this
  // screen's data loading on purpose — a failure here must never affect the
  // plan itself.
  const [hasWorkoutProgramme, setHasWorkoutProgramme] = useState(false);
  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      if (!session?.user.id) return;
      const { data } = await supabase.from('workout_programs').select('id').eq('user_id', session.user.id).eq('status', 'active').maybeSingle();
      setHasWorkoutProgramme(!!data);
    })();
  }, []);
  // Kept only for professional-support matching (goal/preferredActivities) —
  // the plan/summary rendering itself never needs the full answers object.
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  // Behavioural data — deliberately NOT part of assessment/ai_assessment.
  // "What ACP suggested" (assessment) vs "what the user actually did"
  // (completions) are two separate concerns; see plan_activity_completions.
  const [completions, setCompletions] = useState<PlanActivityCompletion[]>([]);
  const [candidates, setCandidates] = useState<CompletionCandidate[]>([]);
  // Session-only: a candidate the user dismissed ("Not this one") shouldn't
  // reappear on this same visit — no need to persist a dismissal record.
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<Set<string>>(new Set());
  // Professional support (Part 19-21) — deliberately lazy: provider data is
  // only fetched after the user taps "Explore support", never preloaded.
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMatches, setSupportMatches] = useState<ProviderMatch[] | null>(null);
  // Day 5 — weekly review + adaptation. generatingReview guards the explicit,
  // user-initiated "See my weekly review" tap; foodSuggestions is populated
  // by a separate, non-blocking effect only when the current plan actually
  // has a nutrition_focus (never fetched otherwise).
  const [generatingReview, setGeneratingReview] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<FoodSuggestion[]>([]);
  const [cuisinePreference, setCuisinePreference] = useState<string | null>(null);
  // Day 6 — already-computed longitudinal coaching evidence (see
  // lib/coaching-memory.ts). A plain read of the coaching_memory table;
  // this screen never aggregates history itself.
  const [coachingMemory, setCoachingMemory] = useState<CoachingMemoryRow[]>([]);
  // Guards against a second concurrent load() — e.g. the user backgrounds
  // the app mid-generation and useFocusEffect re-fires on return — and backs
  // the independent timeout below, since authService.getSession() and the
  // fitness_profile query have no timeout of their own: only
  // fetchOnboardingAssessment's internal fetch does. Without this, either of
  // those hanging (bad network, stalled connection) could leave "loading" /
  // "generating" stuck forever with nothing to recover them.
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    let settled = false;
    // Covers only the fast part (session + DB fetch) — replaced with a
    // longer one below once generation actually starts, so a hang here
    // still recovers quickly instead of waiting on the AI-generation budget.
    let backstop = setTimeout(() => {
      if (settled) return;
      settled = true;
      inFlightRef.current = false;
      setLoading(false);
      setGenerating(false);
    }, 18000);

    try {
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (settled) return;
        settled = true; clearTimeout(backstop); inFlightRef.current = false;
        setLoading(false);
        return;
      }
      setUserId(session.user.id);

      const [{ data }, { data: healthData }] = await Promise.all([
        supabase
          .from('fitness_profile')
          .select(`
            goal, starting_weight_kg, goal_weight_kg, goal_target_date,
            activity_level, experience_level, goal_details, barriers, preferred_activities,
            cuisine_preference, ai_assessment, ai_assessment_generated_at
          `)
          .eq('user_id', session.user.id)
          .maybeSingle(),
        // The user's own stated weekly training hours — the canonical time
        // budget when available (see assessment.ts's getWeeklyMinutesBudget).
        supabase
          .from('health_profile')
          .select('hours_exercising_per_week')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ]);
      if (settled) return;

      const answers: OnboardingAnswers = {
        ...EMPTY_ANSWERS,
        goal: data?.goal ?? null,
        startingWeightKg: data?.starting_weight_kg ?? null,
        goalWeightKg: data?.goal_weight_kg ?? null,
        goalTargetDate: data?.goal_target_date ?? null,
        activityLevel: data?.activity_level ?? null,
        strengthExperience: data?.experience_level ?? null,
        goalDetails: data?.goal_details ?? {},
        barriers: data?.barriers ?? [],
        preferredActivities: data?.preferred_activities ?? [],
      };
      setPlanSummary(buildPlanSummary(answers));
      setOnboardingAnswers(answers);
      setCuisinePreference(data?.cuisine_preference ?? null);

      // Validate before trusting a saved row — accounts that generated an
      // assessment before the Day 2 schema change have an old-shaped object
      // saved (no starting_plan.activities), which would crash this
      // screen's JSX if rendered directly. Treat it the same as "nothing
      // saved yet" so it regenerates in the current shape below.
      if (data?.ai_assessment && isValidAssessment(data.ai_assessment) && data.ai_assessment_generated_at) {
        settled = true; clearTimeout(backstop); inFlightRef.current = false;
        setAssessment(data.ai_assessment);
        setPlanId(data.ai_assessment_generated_at);
        setLoading(false);

        // Day 5.5 Problem C — an otherwise-valid current plan from before
        // Day 5 has no week_end_date yet, so it can never become reviewable.
        // Opportunistic, lazy upgrade (no OpenAI call): never blocks this
        // render, and a failure just leaves the plan exactly as it already
        // rendered above — no crash, no "migrating" message.
        if (!data.ai_assessment.starting_plan?.week_end_date && session.access_token) {
          fetchPlanDateUpgrade({ userId: session.user.id, accessToken: session.access_token }).then(result => {
            if (result.upgraded && result.assessment) {
              setAssessment(result.assessment);
            }
          });
        }

        // Day 6 — coaching memory is already fully computed server-side
        // (weekly-adaptation route); this is a plain read, never a
        // recomputation. Non-blocking, same pattern as the date upgrade
        // above — the plan itself has already rendered by the time this
        // resolves either way.
        supabase
          .from('coaching_memory')
          .select('memory_type, subject, confidence, evidence, user_message')
          .eq('user_id', session.user.id)
          .eq('active', true)
          .then(({ data: memoryRows }) => setCoachingMemory((memoryRows ?? []) as CoachingMemoryRow[]));

        return;
      }

      setAssessment(null);
      setLoading(false);

      // No AI assessment saved yet — most commonly because this account
      // completed onboarding before ACP Intelligence existed, or the AI call
      // didn't succeed at the time. Generate one now instead of only ever
      // showing the static rule-based plan; the route persists the result to
      // fitness_profile.ai_assessment, so this only needs to happen once.
      if (!data?.goal || !session.access_token) {
        settled = true; clearTimeout(backstop); inFlightRef.current = false;
        return;
      }
      setGenerating(true);
      // fetchOnboardingAssessment now self-bounds at ~15s (a race, not a
      // cancellation — see lib/ai-assessment.ts), so this just needs a
      // little slack on top of that, not the old 50s margin.
      clearTimeout(backstop);
      backstop = setTimeout(() => {
        if (settled) return;
        settled = true;
        inFlightRef.current = false;
        setGenerating(false);
      }, 20000);
      const result = await fetchOnboardingAssessment({
        userId: session.user.id,
        onboardingAnswers: answers,
        accessToken: session.access_token,
        sportHoursPerWeek: healthData?.hours_exercising_per_week ?? null,
      });
      if (settled) return;
      settled = true; clearTimeout(backstop); inFlightRef.current = false;
      setGenerating(false);
      if (result) {
        setAssessment(result.assessment);
        setPlanId(result.generatedAt);
      }
    } catch {
      if (!settled) {
        settled = true; clearTimeout(backstop); inFlightRef.current = false;
        setLoading(false);
        setGenerating(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Fulfilment + completion enhancement — runs only after the canonical
  // plan (and its planId) exist, fetches each source exactly once per
  // screen visit (not once per activity — avoids N+1), and matches purely
  // client-side via lib/fulfilment.ts / lib/completion.ts. Any failure here
  // (ExerciseDB/Strava/marketplace/completions) just leaves that piece
  // empty; none of it can remove or alter the plan itself, which has
  // already rendered by the time this runs. Progressive enhancement, never
  // a blocking dependency.
  useEffect(() => {
    if (!assessment || !planId || !userId) return;
    let cancelled = false;

    (async () => {
      const todayIso = new Date().toISOString().split('T')[0];
      const tenDaysAgoIso = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

      const [
        sessionsRes, experiencesRes, stravaStatus,
        completionsRes, stravaActivitiesRes, healthWorkoutsRes, workoutHistoryRes, checkedInBookingsRes, checkedInExperiencesRes,
      ] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, name, category, date, time, duration_minutes, is_active, spots_left, image_url, drop_in_price, gyms(name)')
          .gte('date', todayIso)
          .eq('is_active', true),
        supabase
          .from('experiences')
          .select('id, name, category, date, start_time, price_kes, is_active, spots_left, image_url, gyms(name)')
          .gte('date', todayIso)
          .eq('is_active', true),
        getStravaStatus(), // never throws — resolves { connected: false } on failure
        supabase
          .from('plan_activity_completions')
          .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
          .eq('user_id', userId)
          .eq('plan_id', planId),
        supabase
          .from('activities')
          .select('id, activity_type, start_time, duration_seconds')
          .eq('user_id', userId)
          .gte('start_time', tenDaysAgoIso),
        supabase
          .from('health_workouts')
          .select('id, activity_type, start_date, duration_seconds')
          .eq('user_id', userId)
          .gte('start_date', tenDaysAgoIso),
        supabase
          .from('workout_history')
          .select('id, completed_at, workouts(category)')
          .eq('user_id', userId)
          .gte('completed_at', tenDaysAgoIso),
        // Booking without check-in is NOT evidence of attendance (Day 4 Part
        // 15) — only rows the user has actually checked into count as a
        // completion candidate signal at all.
        supabase
          .from('bookings')
          .select('id, checked_in, check_in_time, sessions(name, category)')
          .eq('user_id', userId)
          .eq('checked_in', true)
          .gte('check_in_time', tenDaysAgoIso),
        supabase
          .from('experience_bookings')
          .select('id, updated_at, experiences(name, category)')
          .eq('user_id', userId)
          .eq('status', 'checked_in')
          .gte('updated_at', tenDaysAgoIso),
      ]);
      if (cancelled) return;

      const inventory: MarketplaceInventoryItem[] = [
        ...((sessionsRes?.data ?? []) as any[]).map(s => ({
          id: s.id, type: 'session' as const, name: s.name, category: s.category ?? null,
          date: s.date ?? null, startTime: s.time ?? null, durationMinutes: s.duration_minutes ?? null,
          gymName: s.gyms?.name ?? null, isActive: !!s.is_active, spotsLeft: s.spots_left ?? null,
          imageUrl: s.image_url ?? null, priceKes: s.drop_in_price ?? null,
        })),
        ...((experiencesRes?.data ?? []) as any[]).map(e => ({
          id: e.id, type: 'experience' as const, name: e.name, category: e.category ?? null,
          date: e.date ?? null, startTime: e.start_time ?? null, durationMinutes: null,
          gymName: e.gyms?.name ?? null, isActive: !!e.is_active, spotsLeft: e.spots_left ?? null,
          imageUrl: e.image_url ?? null, priceKes: e.price_kes ?? null,
        })),
      ];

      const anchor = new Date();
      setFulfilments(
        assessment.starting_plan.activities.map((a, i) => getFulfilmentForActivity(a, i, inventory, stravaStatus.connected, anchor)),
      );

      const loadedCompletions: PlanActivityCompletion[] = ((completionsRes?.data ?? []) as any[]).map(c => ({
        id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
        completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
      }));
      setCompletions(loadedCompletions);

      const completedIndexes = new Set(loadedCompletions.map(c => c.activityIndex));
      const usedSourceEntityIds = new Set(loadedCompletions.map(c => c.sourceEntityId).filter((id): id is string => !!id));

      const stravaRows: StravaActivityRow[] = ((stravaActivitiesRes?.data ?? []) as any[]).map(a => ({
        id: a.id, activityType: a.activity_type, startTime: a.start_time, durationSeconds: a.duration_seconds ?? 0,
      }));
      const healthKitRows: HealthKitWorkoutRow[] = ((healthWorkoutsRes?.data ?? []) as any[]).map(w => ({
        id: w.id, activityType: w.activity_type, startDate: w.start_date, durationSeconds: Math.round(w.duration_seconds ?? 0),
      }));
      const workoutRows: WorkoutHistoryRow[] = ((workoutHistoryRes?.data ?? []) as any[]).map(w => ({
        id: w.id, workoutCategory: w.workouts?.category ?? null, completedAt: w.completed_at,
      }));
      const checkedInRows: AcpCheckedInRow[] = [
        ...((checkedInBookingsRes?.data ?? []) as any[]).map(b => ({
          id: b.id, type: 'acp_session' as const, name: b.sessions?.name ?? '', category: b.sessions?.category ?? null,
          checkedInDate: (b.check_in_time ?? '').split('T')[0],
        })),
        ...((checkedInExperiencesRes?.data ?? []) as any[]).map(e => ({
          id: e.id, type: 'acp_experience' as const, name: e.experiences?.name ?? '', category: e.experiences?.category ?? null,
          checkedInDate: (e.updated_at ?? '').split('T')[0],
        })),
      ];

      // Strava + Apple Health are device/OS-verified signals — auto-counted
      // rather than requiring a confirm tap, unlike ExerciseDB/ACP-booking
      // matches below, which stay suggestion-only.
      const autoMatches = [
        ...findStravaCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, stravaRows, anchor),
        ...findHealthKitCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, healthKitRows, anchor),
      ];

      if (autoMatches.length > 0) {
        const inserts = autoMatches.map(m => {
          const day = assessment.starting_plan.activities[m.activityIndex]?.day;
          const plannedDate = day ? nextDateForWeekday(day, anchor) : todayIso;
          return {
            user_id: userId, plan_id: planId, activity_index: m.activityIndex, planned_date: plannedDate,
            completion_source: m.source, source_entity_id: m.sourceEntityId,
          };
        });
        const { data: insertedRows } = await supabase
          .from('plan_activity_completions')
          .insert(inserts)
          .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id');
        if (cancelled) return;
        if (insertedRows && insertedRows.length > 0) {
          const newCompletions: PlanActivityCompletion[] = insertedRows.map(c => ({
            id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
            completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
          }));
          setCompletions(prev => [...prev, ...newCompletions]);
          newCompletions.forEach(c => {
            completedIndexes.add(c.activityIndex);
            if (c.sourceEntityId) usedSourceEntityIds.add(c.sourceEntityId);
          });
        }
      }

      setCandidates([
        ...findExerciseDbCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, workoutRows, anchor),
        ...findAcpBookingCandidates(assessment.starting_plan.activities, completedIndexes, usedSourceEntityIds, checkedInRows, anchor),
      ]);
    })().catch(() => { /* leave fulfilment/completion data as-is — the plan remains fully usable without it */ });

    return () => { cancelled = true; };
  }, [assessment, planId, userId]);

  // Day 5 — nutrition focus food suggestions. Only fetched when the current
  // plan actually has a nutrition_focus (i.e. a weekly-adaptation result) —
  // never on the original onboarding plan, never blocking anything else.
  // Reason text is always the fixed, deterministic label from
  // findFoodsForNutritionFocus, never generated here or by AI.
  useEffect(() => {
    if (!assessment?.nutrition_focus) { setFoodSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('meals')
        .select('id, name, category, cuisine, tags')
        .eq('is_active', true);
      if (cancelled) return;
      const foods: FoodCandidate[] = ((data ?? []) as any[]).map(m => ({
        id: m.id, name: m.name, category: m.category, cuisine: m.cuisine, tags: m.tags ?? [],
      }));
      setFoodSuggestions(findFoodsForNutritionFocus(assessment.nutrition_focus!.type, cuisinePreference, foods));
    })().catch(() => setFoodSuggestions([]));
    return () => { cancelled = true; };
  }, [assessment?.nutrition_focus, cuisinePreference]);

  // "Start my plan" — Day 2 deliberately does not introduce a programme-
  // tracking system. This is the minimal handling: a lightweight
  // acknowledgement and navigation back, nothing persisted. See the Day 2
  // report for why (no existing destination for "an active plan" to live).
  const handleStartPlan = () => {
    Alert.alert(
      "You're all set",
      'Come back to My Plan anytime to check your progress.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  const categoryCounts = assessment ? deriveCategoryCounts(assessment.starting_plan.activities) : [];
  // Day 6 — "Your Progress". Purely derived from the already-fetched
  // coaching_memory rows (selection/formatting only, see lib/coaching-memory.ts).
  const overallProgress = formatOverallProgress(coachingMemory);
  const progressInsights = selectTopInsights(coachingMemory, 3);
  const workingInsights = progressInsights.filter(r => r.memory_type.endsWith('_success'));
  const learningInsights = progressInsights.filter(r => r.memory_type.endsWith('_difficulty'));
  // Day 6.5 — Outcome Intelligence: measurement-based evidence, kept in its
  // own section so it's never confused with the behavioural evidence above.
  const outcomeInsights = selectOutcomeInsights(coachingMemory, 2);
  // "approach" (how independently the user can execute the plan) and
  // support opportunities (which forms of professional support could help)
  // are two separate questions — see the "Support Recommendation Logic Fix"
  // report. isGuidedApproach only affects this card's label; it no longer
  // gates whether the "Want extra support?" card below appears at all.
  const isGuidedApproach = assessment?.recommendation.approach === 'guided';
  const supportOpportunities = sortSupportOpportunities(assessment?.support_opportunities ?? []);
  const hasSupportOpportunities = supportOpportunities.length > 0;
  // Day 5 — the week has fully ended, so a review can be generated. Never
  // true for a plan mid-week, and never true again right after generating
  // (the new plan's own week hasn't ended yet) — see isPlanReadyForReview.
  const reviewReady = isPlanReadyForReview(assessment, new Date());

  // ── Completion actions (Part 6/7/10) ──────────────────────────────────────
  // Manual completion: one tap, no logging form. planned_date uses the same
  // "next occurrence of this weekday" convention as Day 3 fulfilment
  // matching — see lib/fulfilment.ts's nextDateForWeekday. Known limitation:
  // this resolves to a future date if the user marks an already-passed day
  // in the plan done after the fact (see Day 4 report).
  const recordCompletion = async (
    activityIndex: number,
    source: PlanActivityCompletion['completionSource'],
    sourceEntityId: string | null,
  ) => {
    if (!userId || !planId || !assessment) return;
    const day = assessment.starting_plan.activities[activityIndex]?.day;
    const plannedDate = day ? nextDateForWeekday(day, new Date()) : new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('plan_activity_completions')
      .insert({
        user_id: userId, plan_id: planId, activity_index: activityIndex,
        planned_date: plannedDate, completion_source: source, source_entity_id: sourceEntityId,
      })
      .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
      .single();
    if (error || !data) return; // best-effort — the plan stays fully usable either way
    setCompletions(prev => [...prev, {
      id: data.id, planId: data.plan_id, activityIndex: data.activity_index, plannedDate: data.planned_date,
      completedAt: data.completed_at, completionSource: data.completion_source, sourceEntityId: data.source_entity_id,
    }]);
    setCandidates(prev => prev.filter(c => c.activityIndex !== activityIndex));
  };

  const handleMarkDone = (activityIndex: number) => recordCompletion(activityIndex, 'manual', null);

  const handleConfirmCandidate = (candidate: CompletionCandidate) =>
    recordCompletion(candidate.activityIndex, candidate.source, candidate.sourceEntityId);

  const handleDismissCandidate = (candidate: CompletionCandidate) =>
    setDismissedCandidateIds(prev => new Set(prev).add(`${candidate.activityIndex}:${candidate.sourceEntityId}`));

  // Undo (Part 7): deletes the record entirely — no separate undo-history.
  const handleUndo = async (activityIndex: number) => {
    const existing = completions.find(c => c.activityIndex === activityIndex);
    if (!existing) return;
    const { error } = await supabase.from('plan_activity_completions').delete().eq('id', existing.id);
    if (error) return;
    setCompletions(prev => prev.filter(c => c.id !== existing.id));
  };

  // ── Professional support — only fetched after explicit tap. PT and
  // nutrition opportunities are independent (Support Recommendation Logic
  // Fix): both, either, or neither may be relevant, so both matching passes
  // run when both are present, instead of picking only one exclusively.
  const handleExploreSupport = async () => {
    setSupportExpanded(true);
    if (supportMatches !== null || supportLoading || !assessment) return;
    setSupportLoading(true);
    try {
      const wantsPt = supportOpportunities.some(o => o.type === 'personal_trainer');
      const wantsNutrition = supportOpportunities.some(o => o.type === 'nutrition');
      const { data } = await supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, specialisations')
        .eq('status', 'approved');
      const providers = ((data ?? []) as any[]).map(p => ({
        id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [],
      }));
      const matches = [
        ...(wantsPt ? matchProfessionalProviders(onboardingAnswers.goal, onboardingAnswers.preferredActivities, false, providers) : []),
        ...(wantsNutrition ? matchProfessionalProviders(null, [], true, providers) : []),
      ];
      const seenIds = new Set<string>();
      setSupportMatches(matches.filter(m => (seenIds.has(m.id) ? false : (seenIds.add(m.id), true))));
    } catch {
      setSupportMatches([]); // fails safe — the plan itself is unaffected
    } finally {
      setSupportLoading(false);
    }
  };

  // Day 5 — LEARN + ADAPT. Only ever triggered by an explicit tap (never
  // generated automatically on load — Part 40/42). Behaviour is computed
  // from real records fetched fresh right here, in code (Part 7/36) — the
  // AI never sees raw rows, only the already-summarised facts.
  const handleGenerateWeeklyReview = async () => {
    if (!userId || !assessment || !planId || generatingReview) return;
    setGeneratingReview(true);
    try {
      const weekStart = assessment.starting_plan.week_start_date;
      const weekEnd = assessment.starting_plan.week_end_date;
      const [{ data: compRows }, { data: stravaRows }, { data: hkRows }, { data: whRows }, { data: { session } }] = await Promise.all([
        supabase
          .from('plan_activity_completions')
          .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
          .eq('user_id', userId).eq('plan_id', planId),
        supabase.from('activities').select('id, duration_seconds')
          .eq('user_id', userId).eq('source', 'strava')
          .gte('start_time', `${weekStart}T00:00:00.000Z`).lte('start_time', `${weekEnd}T23:59:59.999Z`),
        supabase.from('health_workouts').select('id, duration_seconds')
          .eq('user_id', userId)
          .gte('start_date', `${weekStart}T00:00:00.000Z`).lte('start_date', `${weekEnd}T23:59:59.999Z`),
        supabase.from('workout_history').select('id, duration_minutes')
          .eq('user_id', userId)
          .gte('completed_at', `${weekStart}T00:00:00.000Z`).lte('completed_at', `${weekEnd}T23:59:59.999Z`),
        supabase.auth.getSession(),
      ]);

      const completions: PlanActivityCompletion[] = ((compRows ?? []) as any[]).map(c => ({
        id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
        completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
      }));
      const durationBySourceId: Record<string, number> = {};
      ((stravaRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = Math.round((r.duration_seconds ?? 0) / 60); });
      ((hkRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = Math.round((r.duration_seconds ?? 0) / 60); });
      ((whRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = r.duration_minutes ?? 0; });

      const behaviourSummary = buildWeeklyBehaviourSummary(assessment.starting_plan.activities, completions, durationBySourceId);
      if (!session?.access_token) return;

      const result = await fetchWeeklyAdaptation({ userId, accessToken: session.access_token, behaviourSummary });
      if (result) {
        setAssessment(result.assessment);
        setPlanId(result.generatedAt);
        // Session-only UI state from the old plan no longer applies to the
        // new one — the fulfilment/candidate effect above re-fetches
        // automatically since assessment/planId just changed.
        setSupportExpanded(false);
        setSupportMatches(null);
      }
    } finally {
      setGeneratingReview(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>My Plan</ThemedText>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {generating && (
            <View style={styles.generatingBanner}>
              <ActivityIndicator size="small" color={palette.ink700} />
              <ThemedText style={styles.generatingText}>Building your plan, powered by ACP Intelligence™</ThemedText>
            </View>
          )}

          {assessment && (
            <TouchableOpacity
              style={styles.intelligenceRow}
              onPress={() => setShowIntelligenceInfo(true)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.intelligenceText}>Recommended by ACP Intelligence™</ThemedText>
              <Ionicons name="information-circle-outline" size={16} color={palette.gray450} />
            </TouchableOpacity>
          )}

          {/* Day 5 — LEARN + ADAPT. Only ever generated on explicit tap
              (Part 40/42), never automatically, and only once the plan's
              week has genuinely ended (isPlanReadyForReview). */}
          {assessment && reviewReady && !generatingReview && (
            <TouchableOpacity style={styles.exploreSupportBtn} onPress={handleGenerateWeeklyReview} activeOpacity={0.85}>
              <ThemedText style={styles.exploreSupportBtnText}>See my weekly review →</ThemedText>
            </TouchableOpacity>
          )}
          {generatingReview && (
            <View style={styles.generatingBanner}>
              <ActivityIndicator size="small" color={palette.ink700} />
              <ThemedText style={styles.generatingText}>Reviewing your week, powered by ACP Intelligence™</ThemedText>
            </View>
          )}

          {assessment ? (
            <>
              <ThemedText style={styles.coachHeadline}>{assessment.headline}</ThemedText>

              {/* Distinct from "your next week" below (Part 44) — visually
                  secondary (same card language, smaller/eyebrow-only
                  heading), and only present at all on a plan that actually
                  resulted from a weekly adaptation. */}
              {assessment.review && (
                <View style={styles.card}>
                  <ThemedText style={styles.cardEyebrow}>Last week</ThemedText>
                  {assessment.review.wins.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      {assessment.review.wins.map((w, i) => (
                        <View key={i} style={styles.nextStepRow}>
                          <View style={styles.nextStepBullet} />
                          <ThemedText style={styles.nextStepText}>{w}</ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                  <ThemedText style={styles.aiBody}>{assessment.review.focus_next_week}</ThemedText>
                </View>
              )}

              <View style={styles.card}>
                <ThemedText style={styles.rowLabel}>Your goal</ThemedText>
                <ThemedText style={styles.rowValue}>{planSummary?.goalLine}</ThemedText>

                <View style={styles.divider} />

                <ThemedText style={styles.rowLabel}>Where you are starting</ThemedText>
                <ThemedText style={styles.aiBody}>{assessment.summary}</ThemedText>

                <View style={styles.divider} />

                <ThemedText style={styles.rowLabel}>
                  {isGuidedApproach ? 'Your approach' : 'What we recommend'}
                </ThemedText>
                <ThemedText style={styles.rowValue}>{assessment.recommendation.title}</ThemedText>
                <ThemedText style={styles.aiBody}>{assessment.recommendation.reason}</ThemedText>
              </View>

              {hasWorkoutProgramme && (
                <TouchableOpacity
                  style={styles.programmeBanner}
                  onPress={() => router.push('/my-programme' as any)}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.programmeBannerTitle}>You have a structured Workout Programme</ThemedText>
                    <ThemedText style={styles.programmeBannerSub}>For day-by-day exercises and sets, follow your Workout Programme — this page covers your broader goal, nutrition and support.</ThemedText>
                  </View>
                </TouchableOpacity>
              )}

              <View style={styles.card}>
                <ThemedText style={styles.cardEyebrow}>Your first week</ThemedText>

                {/* Deterministic — completedActivities / totalPlanActivities, never asked of the AI (Part 8). */}
                {(() => {
                  const progress = getCompletionProgress(assessment.starting_plan.activities.length, completions);
                  return (
                    <View style={styles.progressBlock}>
                      <ThemedText style={styles.progressLabel}>{progress.completed} of {progress.total} completed</ThemedText>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
                      </View>
                    </View>
                  );
                })()}

                {categoryCounts.length > 0 && (
                  <View style={styles.weeklyPlanRow}>
                    {categoryCounts.map(c => (
                      <View key={c.category} style={styles.weeklyPlanItem}>
                        <ThemedText style={styles.weeklyPlanNumber}>{c.count}</ThemedText>
                        <ThemedText style={styles.weeklyPlanLabel}>{c.label}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ marginTop: categoryCounts.length > 0 ? 18 : 0 }}>
                  {assessment.starting_plan.activities.map((a, i) => {
                    const doneRecord = completions.find(c => c.activityIndex === i);
                    const candidate = candidates.find(c => c.activityIndex === i && !dismissedCandidateIds.has(`${c.activityIndex}:${c.sourceEntityId}`));
                    return (
                    <View key={i} style={[styles.dayRow, i === assessment.starting_plan.activities.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                      <View style={styles.dayNameCol}>
                        <ThemedText style={styles.dayName}>{a.day}</ThemedText>
                        <View style={styles.dayCategoryPill}>
                          <ThemedText style={styles.dayCategoryText}>{CATEGORY_LABEL[a.category]}</ThemedText>
                        </View>
                      </View>
                      <View style={{ flex: 1, opacity: doneRecord ? 0.65 : 1 }}>
                        {doneRecord ? (
                          <View style={styles.completedRow}>
                            <Ionicons name="checkmark-circle" size={14} color={palette.success700} />
                            <ThemedText style={styles.completedText}>
                              COMPLETED
                              {doneRecord.completionSource === 'strava' ? ' · SYNCED FROM STRAVA'
                                : doneRecord.completionSource === 'healthkit' ? ' · SYNCED FROM APPLE HEALTH' : ''}
                            </ThemedText>
                          </View>
                        ) : null}
                        <ThemedText style={styles.dayTitle}>{a.title}</ThemedText>
                        <ThemedText style={styles.dayMeta}>{a.activity} · {a.duration_minutes} min</ThemedText>
                        <ThemedText style={styles.dayDesc}>{a.description}</ThemedText>

                        {doneRecord ? (
                          <TouchableOpacity onPress={() => handleUndo(i)} activeOpacity={0.7} style={{ marginTop: 8 }}>
                            <ThemedText style={styles.undoLink}>Undo</ThemedText>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity style={styles.markDoneBtn} onPress={() => handleMarkDone(i)} activeOpacity={0.85}>
                            <ThemedText style={styles.markDoneBtnText}>Mark as done</ThemedText>
                          </TouchableOpacity>
                        )}

                        {!doneRecord && candidate && (
                          <View style={styles.candidateBanner}>
                            <ThemedText style={styles.candidateText}>
                              We found a {candidate.label} from {candidate.source === 'strava' ? 'Strava' : candidate.source === 'exercise_db' ? 'your workout history' : 'ACP'} on {new Date(candidate.occurredDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}. Count this toward {a.day}&apos;s {a.activity.toLowerCase()}?
                            </ThemedText>
                            <View style={styles.candidateActions}>
                              <TouchableOpacity onPress={() => handleConfirmCandidate(candidate)} activeOpacity={0.85}>
                                <ThemedText style={styles.candidateConfirm}>Yes, count it</ThemedText>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDismissCandidate(candidate)} activeOpacity={0.85}>
                                <ThemedText style={styles.candidateDismiss}>Not this one</ThemedText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {fulfilments[i]?.selfDirected && (
                          <View style={styles.fulfilmentBlock}>
                            <ThemedText style={styles.fulfilmentHeader}>
                              {fulfilments[i].selfDirected!.source === 'exercise_db' ? 'DO IT YOURSELF' : 'TRACK YOUR ACTIVITY'}
                            </ThemedText>
                            <TouchableOpacity onPress={() => router.push(fulfilments[i].selfDirected!.navigationTarget as any)} activeOpacity={0.7}>
                              <ThemedText style={styles.fulfilmentLink}>{fulfilments[i].selfDirected!.title} →</ThemedText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {(fulfilments[i]?.marketplaceMatches.length ?? 0) > 0 && (
                          <View style={styles.fulfilmentBlock}>
                            <View style={styles.fulfilmentHeaderRow}>
                              <ThemedText style={[styles.fulfilmentHeader, { marginBottom: 0 }]}>DO IT WITH ACP</ThemedText>
                              <TouchableOpacity onPress={() => setShowIntelligenceInfo(true)} hitSlop={8} activeOpacity={0.7}>
                                <Ionicons name="information-circle-outline" size={12} color={palette.gray300} />
                              </TouchableOpacity>
                            </View>
                            {fulfilments[i].marketplaceMatches.map(m => (
                              <TouchableOpacity
                                key={m.id}
                                style={styles.marketplaceMatchRow}
                                onPress={() => router.push(m.navigationTarget as any)}
                                activeOpacity={0.7}
                              >
                                {m.imageUrl ? (
                                  <Image source={{ uri: m.imageUrl }} style={styles.marketplaceMatchImage} />
                                ) : (
                                  <View style={[styles.marketplaceMatchImage, styles.marketplaceMatchImageFallback]}>
                                    <Ionicons name={m.type === 'experience' ? 'sparkles-outline' : 'barbell-outline'} size={20} color={palette.gray300} />
                                  </View>
                                )}
                                <View style={{ flex: 1 }}>
                                  <ThemedText style={styles.dayTitle}>{m.title}</ThemedText>
                                  <ThemedText style={styles.dayMeta}>
                                    {m.isAlternateDay ? 'Available on ACP · ' : ''}
                                    {new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}
                                    {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ''}
                                    {m.priceKes != null ? ` · KES ${m.priceKes.toLocaleString()}` : ''}
                                  </ThemedText>
                                </View>
                                <ThemedText style={styles.fulfilmentLink}>View activity →</ThemedText>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                    );
                  })}
                </View>
              </View>

              {/* Day 6 — "Your Progress": deterministic, evidence-backed
                  longitudinal facts (see lib/coaching-memory.ts). Never a
                  large analytics dashboard — at most 3 patterns, moderate+
                  strong confidence only, each traceable to real evidence. */}
              {(overallProgress || progressInsights.length > 0 || outcomeInsights.length > 0) && (
                <View style={styles.card}>
                  <ThemedText style={styles.cardEyebrow}>Your progress</ThemedText>
                  {overallProgress ? (
                    <>
                      <ThemedText style={styles.rowLabel}>
                        {overallProgress.weeksUsed} {overallProgress.weeksUsed === 1 ? 'week' : 'weeks'} with ACP
                      </ThemedText>
                      <ThemedText style={styles.rowValue}>{overallProgress.completed} of {overallProgress.planned} activities completed</ThemedText>
                      <ThemedText style={styles.aiBody}>{Math.round(overallProgress.completionRate * 100)}% consistency</ThemedText>
                      {overallProgress.trendDirection !== 'insufficient_data' && (
                        <ThemedText style={[styles.aiBody, { marginTop: 2 }]}>
                          {overallProgress.trendDirection === 'improving' ? '↑ Improving'
                            : overallProgress.trendDirection === 'declining' ? '↓ Needs attention' : '→ Stable'}
                        </ThemedText>
                      )}
                    </>
                  ) : (
                    <ThemedText style={styles.aiBody}>Your progress will appear here once you&apos;ve completed a full week.</ThemedText>
                  )}

                  {workingInsights.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>What&apos;s working</ThemedText>
                      {workingInsights.map(insight => (
                        <View key={`${insight.memory_type}:${insight.subject}`} style={styles.nextStepRow}>
                          <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.dayTitle}>{insight.user_message}</ThemedText>
                            {formatEvidenceLine(insight) && <ThemedText style={styles.dayMeta}>{formatEvidenceLine(insight)}</ThemedText>}
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {learningInsights.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>What ACP is learning</ThemedText>
                      {learningInsights.map(insight => (
                        <View key={`${insight.memory_type}:${insight.subject}`} style={{ marginBottom: 10 }}>
                          <ThemedText style={styles.dayTitle}>{insight.user_message}</ThemedText>
                          {formatEvidenceLine(insight) && <ThemedText style={styles.dayMeta}>{formatEvidenceLine(insight)}</ThemedText>}
                        </View>
                      ))}
                    </>
                  )}

                  {/* Day 6.5 — Outcome Intelligence: measurement-based
                      evidence (weight/body-fat/muscle-mass/waist trends),
                      kept visually separate from the behavioural sections
                      above so the two evidence streams are never conflated. */}
                  {outcomeInsights.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Outcome progress</ThemedText>
                      {outcomeInsights.map(insight => (
                        <View key={`${insight.memory_type}:${insight.subject}`} style={{ marginBottom: 10 }}>
                          <ThemedText style={styles.dayTitle}>{insight.user_message}</ThemedText>
                          {formatOutcomeEvidenceLine(insight) && <ThemedText style={styles.dayMeta}>{formatOutcomeEvidenceLine(insight)}</ThemedText>}
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}

              <View style={styles.card}>
                <ThemedText style={styles.rowLabel}>Why this plan?</ThemedText>
                <ThemedText style={styles.aiBody}>{assessment.starting_plan.rationale}</ThemedText>
              </View>

              <View style={styles.card}>
                <ThemedText style={styles.rowLabel}>Your focus this week</ThemedText>
                <ThemedText style={styles.rowValue}>{assessment.weekly_focus.title}</ThemedText>
                <ThemedText style={styles.aiBody}>{assessment.weekly_focus.description}</ThemedText>
              </View>

              {/* Day 5 — nutrition intent from ACP Intelligence™, real foods
                  and reasons from ACP's own data (Part 18/27/32) — never an
                  AI-generated nutrient claim. Subordinate to the weekly
                  coaching flow, one focus only, small shortlist (Part 30/31). */}
              {assessment.nutrition_focus && (
                <View style={styles.card}>
                  <ThemedText style={styles.cardEyebrow}>Nutrition focus</ThemedText>
                  <ThemedText style={styles.rowValue}>{assessment.nutrition_focus.title}</ThemedText>
                  <ThemedText style={styles.aiBody}>{assessment.nutrition_focus.reason}</ThemedText>

                  {foodSuggestions.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Foods that fit</ThemedText>
                      {foodSuggestions.map(f => (
                        <View key={f.id} style={styles.nextStepRow}>
                          <View style={styles.nextStepBullet} />
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.dayTitle}>{f.name}</ThemedText>
                            <ThemedText style={styles.dayMeta}>{f.reason}</ThemedText>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}

              <View style={styles.card}>
                <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Next steps</ThemedText>
                {assessment.next_steps.map((step, i) => (
                  <View key={i} style={styles.nextStepRow}>
                    <View style={styles.nextStepBullet} />
                    <ThemedText style={styles.nextStepText}>{step}</ThemedText>
                  </View>
                ))}
              </View>

              {/* Secondary to tracking. Independent PT/nutrition relevance
                  (Support Recommendation Logic Fix) — both, either, or
                  neither may show, and both are always framed as optional. */}
              {hasSupportOpportunities && (
                <View style={styles.card}>
                  <ThemedText style={styles.cardEyebrow}>Want extra support?</ThemedText>
                  {supportOpportunities.map(o => (
                    <View key={o.type} style={{ marginBottom: 10 }}>
                      <ThemedText style={styles.rowValue}>
                        {o.type === 'personal_trainer' ? 'Personal training' : 'Nutrition support'}
                      </ThemedText>
                      <ThemedText style={styles.aiBody}>{o.reason}</ThemedText>
                    </View>
                  ))}

                  {!supportExpanded ? (
                    <TouchableOpacity style={styles.exploreSupportBtn} onPress={handleExploreSupport} activeOpacity={0.85}>
                      <ThemedText style={styles.exploreSupportBtnText}>Explore support →</ThemedText>
                    </TouchableOpacity>
                  ) : supportLoading ? (
                    <ActivityIndicator style={{ marginTop: 12 }} color={palette.ink700} />
                  ) : supportMatches && supportMatches.length > 0 ? (
                    <View style={{ marginTop: 12 }}>
                      {supportMatches.map(m => (
                        <TouchableOpacity key={m.id} style={styles.providerRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.dayTitle}>{m.name}</ThemedText>
                            {m.matchReasons.length > 0 && (
                              <ThemedText style={styles.dayMeta}>Good match for: {m.matchReasons.join(' · ')}</ThemedText>
                            )}
                          </View>
                          <ThemedText style={styles.fulfilmentLink}>View profile →</ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <ThemedText style={[styles.aiBody, { marginTop: 8 }]}>
                      No matching professionals were found right now.
                    </ThemedText>
                  )}
                </View>
              )}
            </>
          ) : planSummary ? (
            <View style={styles.card}>
              <ThemedText style={styles.cardEyebrow}>Your active plan</ThemedText>

              <View style={styles.row}>
                <ThemedText style={styles.rowLabel}>Goal</ThemedText>
                <ThemedText style={styles.rowValue}>{planSummary.goalLine}</ThemedText>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <ThemedText style={styles.rowLabel}>Starting point</ThemedText>
                <ThemedText style={styles.rowValue}>{planSummary.startingPointLine}</ThemedText>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <ThemedText style={styles.rowLabel}>Focus</ThemedText>
                <ThemedText style={styles.rowValue}>{planSummary.focusLine}</ThemedText>
              </View>

              <View style={styles.divider} />

              <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Recommended approach</ThemedText>
              <View style={styles.approachWrap}>
                {planSummary.approach.map(a => (
                  <View key={a} style={styles.approachChip}>
                    <Ionicons name={(APPROACH_ICON[a] ?? 'ellipse-outline') as any} size={14} color={palette.ink700} />
                    <ThemedText style={styles.approachText}>{a}</ThemedText>
                  </View>
                ))}
              </View>

              {buildFallbackWeekPlan(planSummary.approach).length > 0 && (
                <>
                  <View style={styles.divider} />
                  <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>This week</ThemedText>
                  {buildFallbackWeekPlan(planSummary.approach).map((item, i) => (
                    <ThemedText key={i} style={styles.fallbackWeekLine}>{item.day} · {item.label}</ThemedText>
                  ))}
                </>
              )}
            </View>
          ) : (
            <ThemedText style={styles.emptyText}>Complete onboarding to see your plan here.</ThemedText>
          )}

          {(assessment || planSummary) && (
            <ThemedText style={styles.adaptNote}>Your plan will adapt as you progress.</ThemedText>
          )}
        </ScrollView>
      )}

      {assessment && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity style={styles.startBtn} onPress={handleStartPlan} activeOpacity={0.85}>
            <ThemedText style={styles.startBtnText}>Start my plan</ThemedText>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      <Modal
        visible={showIntelligenceInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIntelligenceInfo(false)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowIntelligenceInfo(false)}
        >
          <View style={styles.tooltipCard}>
            <ThemedText style={styles.tooltipTitle}>ACP Intelligence™</ThemedText>
            <ThemedText style={styles.tooltipBody}>
              ACP Intelligence™ is AI that personalises your fitness and nutrition plan, learns from
              your progress, and adapts what to do next based on what works for you.
            </ThemedText>
            <TouchableOpacity style={styles.tooltipCloseBtn} onPress={() => setShowIntelligenceInfo(false)} activeOpacity={0.85}>
              <ThemedText style={styles.tooltipCloseText}>Got it</ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  emptyText: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    textAlign: 'center',
    marginTop: 40,
  },

  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 16,
  },
  generatingText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
  },

  intelligenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  intelligenceText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
  },

  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  tooltipCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: 22,
    maxWidth: 340,
  },
  tooltipTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: palette.ink700,
    marginBottom: 8,
  },
  tooltipBody: {
    fontSize: fontSize.sm,
    color: palette.ink600,
    lineHeight: 20,
  },
  tooltipCloseBtn: {
    marginTop: 18,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted,
  },
  tooltipCloseText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },

  coachHeadline: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.3,
    marginBottom: 16,
  },

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginBottom: 16,
  },
  programmeBanner: {
    backgroundColor: palette.blue25,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#d4dcff',
    padding: 14,
    marginBottom: 16,
  },
  programmeBannerTitle: { fontSize: 13.5, fontWeight: '700', color: palette.ink900 },
  programmeBannerSub: { fontSize: 12, color: palette.gray450, marginTop: 3, lineHeight: 16 },
  cardEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray300,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  row: { gap: 4 },
  rowLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray450,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
  },
  divider: {
    height: 1,
    backgroundColor: palette.hairline,
    marginVertical: 14,
  },

  approachWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  approachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  approachText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  fallbackWeekLine: {
    fontSize: fontSize.sm,
    color: palette.ink700,
    marginBottom: 6,
  },

  aiBody: {
    fontSize: fontSize.sm,
    color: palette.ink600,
    marginTop: 6,
    lineHeight: 20,
  },

  weeklyPlanRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  weeklyPlanItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    paddingVertical: 14,
  },
  weeklyPlanNumber: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: palette.ink700,
  },
  weeklyPlanLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
    marginTop: 2,
  },

  dayRow: {
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  dayNameCol: {
    width: 76,
    flexShrink: 0,
    gap: 6,
  },
  dayName: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: palette.ink700,
  },
  dayCategoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.white,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dayCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.gray450,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dayTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  dayMeta: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
    marginTop: 2,
  },
  dayDesc: {
    fontSize: fontSize.xs,
    color: palette.ink600,
    marginTop: 4,
    lineHeight: 17,
  },

  progressBlock: { marginBottom: 18 },
  progressLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.white,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.success700,
  },

  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  completedText: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.success700,
    letterSpacing: 0.5,
  },
  markDoneBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.ink900,
  },
  markDoneBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.white,
  },
  undoLink: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray450,
    textDecorationLine: 'underline',
  },

  candidateBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.blue100,
  },
  candidateText: {
    fontSize: fontSize.xs,
    color: palette.ink700,
    lineHeight: 17,
  },
  candidateActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  candidateConfirm: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.blue600,
  },
  candidateDismiss: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray450,
  },

  exploreSupportBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
  },
  exploreSupportBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },

  fulfilmentBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  fulfilmentHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.gray300,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fulfilmentHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  fulfilmentLink: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.ink700,
  },
  marketplaceMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  marketplaceMatchImage: { width: 56, height: 56, borderRadius: radii.lg, flexShrink: 0 },
  marketplaceMatchImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },

  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  nextStepBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.ink700,
    marginTop: 7,
  },
  nextStepText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: palette.ink700,
    lineHeight: 20,
  },

  adaptNote: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  startBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  startBtnText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
