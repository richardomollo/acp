// Beta Feedback #001 — the dedicated "next week" screen.
//
// Reached only from the "Your next week" CTA on My Plan, which itself only
// appears on the last day of the current week (isSundayPlanningWindow). This
// screen never generates a *second* planning engine: "Prepare next week"
// calls the same /api/ai/weekly-adaptation route, which decides advance
// ('scheduled') vs normal generation from the target week date. Once a
// scheduled plan exists it is shown read-only (no completion controls) with
// each activity's real future planned_date and its own booking card, so the
// user can organise the week ahead. On any other day, with nothing prepared,
// the screen just points back to My Plan for the current week.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { getStravaStatus } from '@/services/strava';
import { EMPTY_ANSWERS, type OnboardingAnswers } from '@/lib/onboarding';
import {
  deriveCategoryCounts, isValidAssessment, CATEGORY_LABEL, type AIAssessment,
} from '@/lib/ai-assessment';
import { buildPlanExplanation, compareWeeklyPlans, describePlanChanges } from '@/lib/coaching';
import { getSelfDirectedSource, normalizeActivity, type PlanActivityFulfilment } from '@/lib/fulfilment';
import { getSupplyCandidates } from '@/lib/supply/orchestration';
import type { SessionCandidateRow } from '@/lib/supply/session-candidates';
import type { SupplyUserContext } from '@/lib/supply/types';
import { ActivityFulfilmentCard } from '@/components/activity-fulfilment-card';
import {
  isSundayPlanningWindow, getScheduledNextPlan, buildWeeklyBehaviourSummary,
  fetchWeeklyAdaptation, scheduledPlanNeedsScheduleUpdate, type ScheduledNextPlan,
} from '@/lib/weekly-review';
import type { PlanActivityCompletion } from '@/lib/completion';
import { palette, radii, fontSize } from '@/constants/theme';

function formatWeekOf(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

export default function NextWeekPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<AIAssessment | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [nextPlan, setNextPlan] = useState<ScheduledNextPlan | null>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [preferredLocation, setPreferredLocation] = useState<string | null>(null);
  const [preferredTrainingDays, setPreferredTrainingDays] = useState<string[] | null>(null);
  const [fulfilments, setFulfilments] = useState<PlanActivityFulfilment[]>([]);
  const [showWhyPlan, setShowWhyPlan] = useState(false);
  const [showWhatChanged, setShowWhatChanged] = useState(false);
  // Beta Feedback #003 — explicit rebuild of an already-prepared future plan.
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);
  const [justRegenerated, setJustRegenerated] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const session = await authService.getSession();
      if (!session?.user.id) { setLoading(false); return; }
      setUserId(session.user.id);

      const { data } = await supabase
        .from('fitness_profile')
        .select(`
          goal, activity_level, experience_level, goal_details, barriers, preferred_activities,
          preferred_training_days, ai_assessment, ai_assessment_generated_at, preferred_location
        `)
        .eq('user_id', session.user.id)
        .maybeSingle();

      setAnswers({
        ...EMPTY_ANSWERS,
        goal: data?.goal ?? null,
        activityLevel: data?.activity_level ?? null,
        strengthExperience: data?.experience_level ?? null,
        goalDetails: data?.goal_details ?? {},
        barriers: data?.barriers ?? [],
        preferredActivities: data?.preferred_activities ?? [],
      });
      setPreferredLocation(data?.preferred_location ?? null);
      setPreferredTrainingDays(data?.preferred_training_days ?? null);

      if (data?.ai_assessment && isValidAssessment(data.ai_assessment) && data.ai_assessment_generated_at) {
        setCurrentAssessment(data.ai_assessment);
        setCurrentPlanId(data.ai_assessment_generated_at);
      }

      const scheduled = await getScheduledNextPlan(supabase as any, session.user.id);
      setNextPlan(scheduled);
    } catch {
      /* the screen degrades to "nothing prepared yet" — never crashes */
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  // First focus: full load (spinner). Later focuses (e.g. returning from My
  // Goals after changing the schedule): silent refetch so the "prepared
  // before this change" state reflects the latest preference. Transient
  // regeneration notices are cleared on re-entry so they never linger.
  useFocusEffect(useCallback(() => {
    setRegenError(false);
    setJustRegenerated(false);
    load({ silent: loadedRef.current });
  }, [load]));

  const sundayWindow = isSundayPlanningWindow(currentAssessment, new Date());

  // Booking layer for the prepared plan — read-only, best-effort, and matched
  // against each activity's own future planned_date (session-candidates.ts
  // prefers planActivity.planned_date), so a Wednesday-next-week session
  // resolves the coming Wednesday, not this week's.
  useEffect(() => {
    if (!nextPlan || !userId) return;
    let cancelled = false;
    (async () => {
      const todayIso = new Date().toISOString().split('T')[0];
      const [{ data: sess }, { data: exps }, stravaStatus] = await Promise.all([
        supabase.from('sessions')
          .select('id, name, category, date, time, duration_minutes, is_active, spots_left, image_url, gyms(id, name, area, lat, lng)')
          .gte('date', todayIso).eq('is_active', true),
        supabase.from('experiences')
          .select('id, name, category, date, start_time, is_active, spots_left, image_url, gyms(id, name, area, lat, lng)')
          .gte('date', todayIso).eq('is_active', true),
        getStravaStatus(),
      ]);
      if (cancelled) return;
      const toVenue = (g: any) => g ? { id: g.id, name: g.name, area: g.area, lat: g.lat, lng: g.lng } : null;
      const inv: SessionCandidateRow[] = [
        ...((sess ?? []) as any[]).map((s): SessionCandidateRow => ({
          id: s.id, type: 'session', name: s.name, category: s.category ?? null, date: s.date ?? null,
          startTime: s.time ?? null, durationMinutes: s.duration_minutes ?? null, isActive: !!s.is_active,
          spotsLeft: s.spots_left ?? null, imageUrl: s.image_url ?? null, gym: toVenue(s.gyms),
        })),
        ...((exps ?? []) as any[]).map((e): SessionCandidateRow => ({
          id: e.id, type: 'experience', name: e.name, category: e.category ?? null, date: e.date ?? null,
          startTime: e.start_time ?? null, durationMinutes: null, isActive: !!e.is_active,
          spotsLeft: e.spots_left ?? null, imageUrl: e.image_url ?? null, gym: toVenue(e.gyms),
        })),
      ];
      const ctx: SupplyUserContext = {
        goal: answers.goal, experience: answers.strengthExperience,
        preferredActivities: answers.preferredActivities, barriers: answers.barriers,
        location: { text: preferredLocation },
      };
      const anchor = new Date();
      setFulfilments(nextPlan.assessment.starting_plan.activities.map((activity, i): PlanActivityFulfilment => {
        const key = normalizeActivity(activity.activity || activity.title, activity.category);
        const candidates = getSupplyCandidates({ userContext: ctx, planActivity: activity, sessionInventory: inv, anchor, limitPerType: 2, overallCap: 2 });
        return {
          planActivityIndex: i,
          selfDirected: getSelfDirectedSource(key, stravaStatus.connected),
          marketplaceMatches: candidates.map(c => ({
            id: c.id, type: c.type as 'session' | 'experience', title: c.title, activityType: c.category ?? key,
            date: (c.startsAt ?? '').split('T')[0], startTime: c.startsAt?.includes('T') ? c.startsAt.split('T')[1] : null,
            durationMinutes: c.durationMinutes ?? null, partnerName: c.venue?.name ?? null,
            score: c.scoring.overall, matchReasons: c.reasons,
            isAlternateDay: !c.reasons.includes('same_day'),
            navigationTarget: c.navigationTarget as { pathname: string; params: Record<string, string> },
            imageUrl: c.imageUrl ?? null, priceKes: null,
          })),
        };
      }));
    })().catch(() => { /* booking layer is enhancement-only */ });
    return () => { cancelled = true; };
  }, [nextPlan, userId, answers, preferredLocation]);

  const { whyPlanReasons, whatChangedLines } = useMemo(() => {
    if (!nextPlan) return { whyPlanReasons: [], whatChangedLines: null as string[] | null };
    try {
      const baseline = currentAssessment?.starting_plan.activities ?? null;
      const whyPlanReasons = buildPlanExplanation({
        assessment: nextPlan.assessment,
        goal: answers.goal ?? null,
        previousActivities: baseline,
        preferredActivities: answers.preferredActivities ?? null,
      });
      const whatChangedLines = baseline
        ? describePlanChanges(compareWeeklyPlans(baseline, nextPlan.assessment.starting_plan.activities))
        : null;
      return { whyPlanReasons, whatChangedLines };
    } catch {
      return { whyPlanReasons: [], whatChangedLines: null as string[] | null };
    }
  }, [nextPlan, currentAssessment, answers]);

  // Shared by "Prepare next week" (first time) and Beta #003 "Update next
  // week's plan" (rebuild): the review is always based on THIS week's actual
  // behaviour, which the regeneration doesn't change.
  const loadCurrentWeekBehaviour = useCallback(async () => {
    if (!userId || !currentAssessment || !currentPlanId) return null;
    const weekStart = currentAssessment.starting_plan.week_start_date;
    const weekEnd = currentAssessment.starting_plan.week_end_date;
    const [{ data: compRows }, { data: stravaRows }, { data: hkRows }, { data: whRows }, { data: { session } }] = await Promise.all([
      supabase.from('plan_activity_completions')
        .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
        .eq('user_id', userId).eq('plan_id', currentPlanId),
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
    if (!session?.access_token) return null;
    const completions: PlanActivityCompletion[] = ((compRows ?? []) as any[]).map(c => ({
      id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
      completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
    }));
    const durationBySourceId: Record<string, number> = {};
    ((stravaRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = Math.round((r.duration_seconds ?? 0) / 60); });
    ((hkRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = Math.round((r.duration_seconds ?? 0) / 60); });
    ((whRows ?? []) as any[]).forEach(r => { durationBySourceId[r.id] = r.duration_minutes ?? 0; });
    const behaviourSummary = buildWeeklyBehaviourSummary(currentAssessment.starting_plan.activities, completions, durationBySourceId);
    return { behaviourSummary, accessToken: session.access_token };
  }, [userId, currentAssessment, currentPlanId]);

  const applyAdaptationResult = (result: Awaited<ReturnType<typeof fetchWeeklyAdaptation>>): boolean => {
    if (!result) return false;
    const a = result.assessment;
    if (result.scheduled) {
      setNextPlan({
        assessment: a, planId: result.generatedAt,
        weekStartDate: a.starting_plan.week_start_date ?? '',
        weekEndDate: a.starting_plan.week_end_date ?? '',
      });
      return true;
    }
    // Not an advance generation after all (the current week already ended, or
    // the scheduled plan was promoted) — it is now the current plan.
    router.replace('/my-plan' as any);
    return true;
  };

  const handlePrepareNextWeek = async () => {
    if (preparing || !userId || !currentAssessment || !currentPlanId) return;
    setPreparing(true);
    try {
      const ctx = await loadCurrentWeekBehaviour();
      if (!ctx) return;
      const result = await fetchWeeklyAdaptation({ userId, accessToken: ctx.accessToken, behaviourSummary: ctx.behaviourSummary });
      applyAdaptationResult(result);
    } finally {
      setPreparing(false);
    }
  };

  // Beta Feedback #003 — best-effort "you already have bookings" notice for
  // the confirmation dialog. Regeneration NEVER cancels or moves a booking
  // (this screen only rewrites the plan row); the warning just sets
  // expectations. Any failure here silently yields "no bookings".
  const countFutureBookings = useCallback(async (weekStart: string, weekEnd: string): Promise<number> => {
    if (!userId) return 0;
    try {
      const [{ count: sc }, { count: ptc }] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
          .gte('booking_date', weekStart).lte('booking_date', weekEnd),
        supabase.from('pt_bookings').select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['pending', 'confirmed'])
          .gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd),
      ]);
      return (sc ?? 0) + (ptc ?? 0);
    } catch {
      return 0;
    }
  }, [userId]);

  const doRegenerate = useCallback(async () => {
    if (regenerating || !userId || !nextPlan) return;
    setRegenerating(true);
    setRegenError(false);
    setJustRegenerated(false);
    try {
      const ctx = await loadCurrentWeekBehaviour();
      if (!ctx) { setRegenError(true); return; }
      const result = await fetchWeeklyAdaptation({
        userId, accessToken: ctx.accessToken, behaviourSummary: ctx.behaviourSummary,
        regenerateFuturePlan: true,
      });
      if (!result) { setRegenError(true); return; } // old plan untouched server-side
      const handled = applyAdaptationResult(result);
      if (handled && result.scheduled) setJustRegenerated(true);
    } finally {
      setRegenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerating, userId, nextPlan, loadCurrentWeekBehaviour]);

  const confirmRegenerate = useCallback(async () => {
    if (regenerating || !nextPlan) return;
    const bookingCount = await countFutureBookings(nextPlan.weekStartDate, nextPlan.weekEndDate);
    const bookingLine = bookingCount > 0
      ? `\n\nYou already have ${bookingCount === 1 ? 'a booking' : `${bookingCount} bookings`} for next week. Updating your plan won't cancel ${bookingCount === 1 ? 'it' : 'them'}.`
      : '';
    Alert.alert(
      "Update next week's plan?",
      `We'll rebuild your upcoming plan using your new training preferences. Your current week won't change.${bookingLine}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Update plan', onPress: () => { void doRegenerate(); } },
      ],
    );
  }, [regenerating, nextPlan, countFutureBookings, doRegenerate]);

  const needsScheduleUpdate = scheduledPlanNeedsScheduleUpdate(nextPlan, preferredTrainingDays);

  const shown = nextPlan?.assessment ?? null;
  const categoryCounts = shown ? deriveCategoryCounts(shown.starting_plan.activities) : [];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Next week</ThemedText>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {shown ? (
            <>
              <ThemedText style={styles.eyebrow}>
                WEEK OF {formatWeekOf(nextPlan?.weekStartDate).toUpperCase()}
              </ThemedText>
              <ThemedText style={styles.coachHeadline}>{shown.headline}</ThemedText>
              <ThemedText style={styles.aiBody}>{shown.summary}</ThemedText>

              {/* Beta Feedback #003 — explicit, user-controlled rebuild of
                  this already-prepared future plan after a preference change.
                  Never automatic; the current week is never affected. */}
              {regenerating ? (
                <View style={[styles.card, styles.noticeCard]}>
                  <ActivityIndicator size="small" color={palette.ink700} />
                  <ThemedText style={styles.noticeText}>Updating next week&apos;s plan…</ThemedText>
                </View>
              ) : regenError ? (
                <View style={[styles.card, styles.noticeCard]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.noticeText}>
                      We couldn&apos;t update next week&apos;s plan. Your existing plan is still available.
                    </ThemedText>
                    <TouchableOpacity onPress={confirmRegenerate} activeOpacity={0.7} style={{ marginTop: 8 }}>
                      <ThemedText style={styles.noticeAction}>Try again</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : justRegenerated ? (
                <View style={[styles.card, styles.noticeCard]}>
                  <Ionicons name="checkmark-circle" size={18} color={palette.success700} />
                  <ThemedText style={styles.noticeText}>Next week&apos;s plan has been updated.</ThemedText>
                </View>
              ) : needsScheduleUpdate ? (
                <View style={[styles.card, styles.updateCard]}>
                  <ThemedText style={styles.cardEyebrow}>Preference changed</ThemedText>
                  <ThemedText style={styles.aiBody}>
                    Your next-week plan was prepared before this change.
                  </ThemedText>
                  <TouchableOpacity style={styles.primaryBtn} onPress={confirmRegenerate} activeOpacity={0.85}>
                    <ThemedText style={styles.primaryBtnText}>Update next week&apos;s plan</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.card}>
                <ThemedText style={styles.cardEyebrow}>Your week ahead</ThemedText>

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
                  {shown.starting_plan.activities.map((a, i) => (
                    <View key={i} style={[styles.dayRow, i === shown.starting_plan.activities.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                      <View style={styles.dayNameCol}>
                        <ThemedText style={styles.dayName}>{a.day}</ThemedText>
                        <View style={styles.dayCategoryPill}>
                          <ThemedText style={styles.dayCategoryText}>{CATEGORY_LABEL[a.category]}</ThemedText>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.dayTitle}>{a.title}</ThemedText>
                        <ThemedText style={styles.dayMeta}>
                          {a.activity} · {a.duration_minutes} min{a.planned_date ? ` · ${a.planned_date}` : ''}
                        </ThemedText>
                        <ThemedText style={styles.dayDesc}>{a.description}</ThemedText>
                        <ActivityFulfilmentCard
                          userId={userId}
                          activity={a}
                          fulfilment={fulfilments[i]}
                          onInfoPress={() => {}}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <TouchableOpacity
                  onPress={() => setShowWhyPlan(v => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showWhyPlan }}
                  accessibilityLabel="Why this plan"
                  style={styles.rowBetween}
                >
                  <ThemedText style={styles.rowLabel}>Why this plan?</ThemedText>
                  <Ionicons name={showWhyPlan ? 'chevron-up' : 'chevron-down'} size={18} color={palette.gray450} />
                </TouchableOpacity>
                {showWhyPlan && (
                  whyPlanReasons.length > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      {whyPlanReasons.map(r => (
                        <View key={r.type} style={{ marginBottom: 10 }}>
                          <ThemedText style={styles.dayTitle}>{r.title}</ThemedText>
                          <ThemedText style={styles.dayMeta}>{r.explanation}</ThemedText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ThemedText style={[styles.aiBody, { marginTop: 8 }]}>{shown.starting_plan.rationale}</ThemedText>
                  )
                )}
              </View>

              {whatChangedLines && whatChangedLines.length > 0 && (
                <View style={styles.card}>
                  <TouchableOpacity
                    onPress={() => setShowWhatChanged(v => !v)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showWhatChanged }}
                    accessibilityLabel="What changed versus this week"
                    style={styles.rowBetween}
                  >
                    <ThemedText style={styles.rowLabel}>What changed vs this week?</ThemedText>
                    <Ionicons name={showWhatChanged ? 'chevron-up' : 'chevron-down'} size={18} color={palette.gray450} />
                  </TouchableOpacity>
                  {showWhatChanged && (
                    <View style={{ marginTop: 8 }}>
                      {whatChangedLines.map((line, i) => (
                        <ThemedText key={i} style={[styles.dayMeta, { marginBottom: 4 }]}>{`• ${line}`}</ThemedText>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.card}>
                <ThemedText style={styles.rowLabel}>Your focus next week</ThemedText>
                <ThemedText style={styles.rowValue}>{shown.weekly_focus.title}</ThemedText>
                <ThemedText style={styles.aiBody}>{shown.weekly_focus.description}</ThemedText>
              </View>

              {shown.nutrition_focus && (
                <View style={styles.card}>
                  <ThemedText style={styles.cardEyebrow}>Nutrition focus</ThemedText>
                  <ThemedText style={styles.rowValue}>{shown.nutrition_focus.title}</ThemedText>
                  <ThemedText style={styles.aiBody}>{shown.nutrition_focus.reason}</ThemedText>
                </View>
              )}

              <ThemedText style={styles.adaptNote}>
                This becomes your active plan automatically when next week starts.
              </ThemedText>
            </>
          ) : sundayWindow ? (
            <View style={styles.card}>
              <ThemedText style={styles.cardEyebrow}>Your next week</ThemedText>
              <ThemedText style={styles.aiBody}>
                Today is the last day of your current week. Prepare next week&apos;s plan now so
                you can organise your week and book any sessions you need ahead of time.
              </ThemedText>
              {preparing ? (
                <View style={styles.generatingBanner}>
                  <ActivityIndicator size="small" color={palette.ink700} />
                  <ThemedText style={styles.generatingText}>Lana is preparing next week</ThemedText>
                </View>
              ) : (
                <TouchableOpacity style={styles.primaryBtn} onPress={handlePrepareNextWeek} activeOpacity={0.85}>
                  <ThemedText style={styles.primaryBtnText}>Prepare next week</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <ThemedText style={styles.cardEyebrow}>Not ready yet</ThemedText>
              <ThemedText style={styles.aiBody}>
                {currentAssessment?.starting_plan.week_end_date
                  ? `Your next week opens on ${formatWeekOf(currentAssessment.starting_plan.week_end_date)}, the last day of your current week. Until then, follow this week's plan.`
                  : "Your next week isn't available yet. Follow this week's plan for now."}
              </ThemedText>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/my-plan' as any)} activeOpacity={0.85}>
                <ThemedText style={styles.primaryBtnText}>See this week&apos;s plan →</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
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

  eyebrow: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.blue600,
    letterSpacing: 1, marginBottom: 6,
  },
  coachHeadline: {
    fontSize: fontSize.xl, fontWeight: '800', color: palette.ink700,
    letterSpacing: -0.3, marginBottom: 8,
  },

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginTop: 16,
  },
  cardEyebrow: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray450,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  rowValue: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700 },
  aiBody: { fontSize: fontSize.sm, color: palette.ink600, marginTop: 6, lineHeight: 20 },

  weeklyPlanRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  weeklyPlanItem: {
    flex: 1, minWidth: 70, alignItems: 'center',
    backgroundColor: palette.white, borderRadius: radii.xl, paddingVertical: 14,
  },
  weeklyPlanNumber: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink700 },
  weeklyPlanLabel: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },

  dayRow: {
    flexDirection: 'row', gap: 14, paddingBottom: 16, marginBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  dayNameCol: { width: 76, flexShrink: 0, gap: 6 },
  dayName: { fontSize: fontSize.sm, fontWeight: '800', color: palette.ink700 },
  dayCategoryPill: {
    alignSelf: 'flex-start', backgroundColor: palette.white,
    borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  dayCategoryText: {
    fontSize: 10, fontWeight: '700', color: palette.gray450,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  dayTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  dayMeta: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },
  dayDesc: { fontSize: fontSize.xs, color: palette.ink600, marginTop: 4, lineHeight: 17 },

  generatingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.white, borderRadius: radii.xl, padding: 14, marginTop: 14,
  },
  generatingText: { flex: 1, fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450 },

  primaryBtn: {
    alignSelf: 'flex-start', marginTop: 16,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: radii.pill, backgroundColor: palette.ink900,
  },
  primaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.white },

  // Beta Feedback #003 — preference-change / regeneration notices.
  noticeCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeText: { flex: 1, fontSize: fontSize.sm, color: palette.ink700, lineHeight: 19 },
  noticeAction: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue600 },
  updateCard: { borderWidth: 1, borderColor: palette.blue100 },

  adaptNote: {
    fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center',
    fontStyle: 'italic', marginTop: 20,
  },
});
