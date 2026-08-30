import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { useOnboarding } from '@/contexts/onboarding-context';
import { buildPlanSummary, buildFallbackWeekPlan } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { fetchOnboardingAssessment, isValidAssessment, deriveCategoryCounts, sortSupportOpportunities, type AIAssessment } from '@/lib/ai-assessment';
import { palette, radii, fontSize } from '@/constants/theme';

const APPROACH_ICON: Record<string, string> = {
  Strength: 'barbell-outline',
  Cardio: 'heart-outline',
  Movement: 'walk-outline',
  Nutrition: 'nutrition-outline',
  Community: 'people-outline',
  Consistency: 'repeat-outline',
};

export default function OnboardingPlanScreen() {
  const router = useRouter();
  const { answers, redirectTo, completeOnboarding, userName } = useOnboarding();
  const firstName = userName.split(' ')[0];
  const [status, setStatus] = useState<'saving' | 'saved' | 'failed'>('saving');
  const [starting, setStarting] = useState(false);
  // completeOnboarding() (above) is the source of truth for onboarding being
  // done — this is purely about what to display on top of it. 'fallback'
  // covers both "haven't started the AI call yet" and "AI call didn't work
  // out", so the rule-based summary card is always the safe default render.
  const [assessmentPhase, setAssessmentPhase] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  // Mirrors assessmentPhase for a synchronous "already started?" guard —
  // state alone can't be read reliably mid-async-flow since it only updates
  // on the next render, and runAssessment can only ever be entered once
  // anyway (called directly from save(), not from an effect), so a plain
  // ref is enough to prevent a rare double-invocation from starting twice.
  const assessmentPhaseRef = useRef<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  // Populated by checkReusableAssessment() (called from save(), before
  // completeOnboarding() overwrites the row) when a valid saved assessment
  // already exists AND was generated from these exact same answers — lets
  // runAssessment skip a redundant OpenAI call on a re-run with unchanged
  // answers, without ever risking a stale plan when answers did change.
  const reusableAssessmentRef = useRef<AIAssessment | null>(null);
  const [showIntelligenceInfo, setShowIntelligenceInfo] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const summary = buildPlanSummary(answers);
  const fallbackWeekPlan = buildFallbackWeekPlan(summary.approach);
  // Source of truth for whether the support section shows at all is
  // support_opportunities.length, never recommendation.approach — a
  // self_directed user may still have a genuine medium-relevance
  // opportunity, and a guided user may have none the model actually found.
  const supportOpportunities = sortSupportOpportunities(assessment?.support_opportunities ?? []);
  // 'ready' (AI-built plan) and 'fallback' (deterministic plan, AI call
  // failed/timed out) are both a genuinely complete, displayable plan —
  // 'idle'/'loading' are still in progress, so the tick/"ready" copy is
  // reserved for the two states that actually have something to show.
  const planReady = assessmentPhase === 'ready' || assessmentPhase === 'fallback';

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called from save() BEFORE completeOnboarding() overwrites the row —
  // reads the profile as it stood coming in. If it already carries a valid,
  // successfully-generated assessment AND every answer-bearing field
  // matches what's about to be submitted, the existing assessment is reused
  // instead of paying for another OpenAI call. Any real change (different
  // goal, barriers, weight target, etc.) fails this match and falls through
  // to a fresh generation, so a redo with new answers is never stale.
  const checkReusableAssessment = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from('fitness_profile')
        .select('goal, starting_weight_kg, goal_weight_kg, goal_target_date, activity_level, experience_level, goal_details, barriers, preferred_activities, preferred_training_days, ai_assessment, ai_assessment_generated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data?.ai_assessment || !data.ai_assessment_generated_at || !isValidAssessment(data.ai_assessment)) return;

      // completeOnboarding() always adds a derived support_style on top of
      // the raw answers, so the saved goal_details has one extra key vs.
      // answers.goalDetails — strip it before comparing, it's not itself a
      // user answer, and it's already fully determined by barriers anyway.
      const { support_style: _supportStyle, ...savedGoalDetails } = (data.goal_details ?? {}) as Record<string, unknown>;
      const sameArray = (a: unknown, b: unknown[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

      const unchanged =
        (data.goal ?? null) === (answers.goal ?? null) &&
        (data.starting_weight_kg ?? null) === (answers.startingWeightKg ?? null) &&
        (data.goal_weight_kg ?? null) === (answers.goalWeightKg ?? null) &&
        (data.goal_target_date ?? null) === (answers.goalTargetDate ?? null) &&
        (data.activity_level ?? null) === (answers.activityLevel ?? null) &&
        (data.experience_level ?? null) === (answers.strengthExperience ?? null) &&
        JSON.stringify(savedGoalDetails) === JSON.stringify(answers.goalDetails ?? {}) &&
        sameArray(data.barriers, answers.barriers) &&
        sameArray(data.preferred_activities, answers.preferredActivities) &&
        sameArray(data.preferred_training_days, answers.preferredTrainingDays);

      if (unchanged) {
        reusableAssessmentRef.current = data.ai_assessment as AIAssessment;
      }
    } catch {
      // Best-effort optimization only — any failure here just means a
      // fresh assessment gets generated, same as before this existed.
    }
  };

  // Plain sequential call after a successful save — deliberately NOT a
  // useEffect keyed on assessmentPhase. An effect that both reads and sets
  // its own dependency causes React to run its cleanup (which marked the
  // in-flight request "settled") and re-invoke itself before the request or
  // even a backstop timer ever got a real chance to finish, permanently
  // stranding the UI on "loading" — that was the actual endless-loading bug.
  const runAssessment = async () => {
    if (assessmentPhaseRef.current !== 'idle') return;

    if (reusableAssessmentRef.current) {
      setAssessment(reusableAssessmentRef.current);
      assessmentPhaseRef.current = 'ready';
      setAssessmentPhase('ready');
      return;
    }

    assessmentPhaseRef.current = 'loading';
    setAssessmentPhase('loading');
    let settled = false;

    // fetchOnboardingAssessment now self-bounds at ~15s (a race, not a
    // cancellation — see lib/ai-assessment.ts), so this backstop only needs
    // to cover what comes before it (session + a fast health_profile read),
    // which should normally be near-instant. Kept as a last-resort in case
    // either ever hangs on a bad connection.
    const backstop = setTimeout(() => {
      if (settled) return;
      settled = true;
      assessmentPhaseRef.current = 'fallback';
      setAssessmentPhase('fallback');
    }, 20000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const accessToken = session?.access_token;
      if (!userId || !accessToken) throw new Error('No session');

      // The user's own stated weekly training hours — the canonical time
      // budget when available (see assessment.ts's getWeeklyMinutesBudget).
      const { data: healthData } = await supabase
        .from('health_profile')
        .select('hours_exercising_per_week')
        .eq('user_id', userId)
        .maybeSingle();

      const result = await fetchOnboardingAssessment({
        userId, onboardingAnswers: answers, accessToken,
        sportHoursPerWeek: healthData?.hours_exercising_per_week ?? null,
      });
      if (settled) return;
      settled = true;
      clearTimeout(backstop);
      if (result) {
        setAssessment(result.assessment);
        assessmentPhaseRef.current = 'ready';
        setAssessmentPhase('ready');
      } else {
        assessmentPhaseRef.current = 'fallback';
        setAssessmentPhase('fallback');
      }
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(backstop);
        assessmentPhaseRef.current = 'fallback';
        setAssessmentPhase('fallback');
      }
    }
  };

  const save = async (): Promise<boolean> => {
    setStatus('saving');
    try {
      await checkReusableAssessment();
      await completeOnboarding();
      setStatus('saved');
      runAssessment();
      return true;
    } catch {
      setStatus('failed');
      return false;
    }
  };

  const handleStart = async () => {
    if (status === 'failed') {
      setStarting(true);
      const ok = await save();
      setStarting(false);
      if (!ok) return;
    }
    router.replace(redirectTo as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={{ paddingTop: 24 }}>
          <Animated.View style={{ opacity: fade }}>
            {planReady && (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={28} color={palette.white} />
              </View>
            )}
            <ThemedText style={styles.headline}>
              {planReady
                ? (firstName ? `Your plan is ready, ${firstName}.` : 'Your plan is ready.')
                : (firstName ? `Creating your plan, ${firstName}…` : 'Creating your plan…')}
            </ThemedText>
            {assessmentPhase === 'ready' && (
              <TouchableOpacity
                style={styles.intelligenceRow}
                onPress={() => setShowIntelligenceInfo(true)}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.intelligenceText}>Recommended by ACP Intelligence™</ThemedText>
                <Ionicons name="information-circle-outline" size={16} color={palette.gray450} />
              </TouchableOpacity>
            )}
          </Animated.View>
        </SafeAreaView>

        {assessmentPhase === 'loading' && (
          <Animated.View style={[styles.card, styles.loadingCard, { opacity: fade }]}>
            <ActivityIndicator color={palette.ink700} />
            <ThemedText style={styles.loadingText}>Building your plan, powered by ACP Intelligence™</ThemedText>
          </Animated.View>
        )}

        {assessmentPhase === 'ready' && assessment && (
          <Animated.View style={[styles.card, { opacity: fade }]}>
            <ThemedText style={styles.aiHeadline}>{assessment.headline}</ThemedText>

            <View style={styles.divider} />

            <ThemedText style={styles.rowLabel}>Your goal</ThemedText>
            <ThemedText style={styles.rowValue}>{summary.goalLine}</ThemedText>

            <View style={styles.divider} />

            <ThemedText style={styles.rowLabel}>Where you are starting</ThemedText>
            <ThemedText style={styles.aiBody}>{assessment.summary}</ThemedText>

            <View style={styles.divider} />

            <ThemedText style={styles.rowLabel}>
              {assessment.recommendation.approach === 'self_directed' ? 'What we recommend' : 'Optional support'}
            </ThemedText>
            <ThemedText style={styles.rowValue}>{assessment.recommendation.title}</ThemedText>
            <ThemedText style={styles.aiBody}>{assessment.recommendation.reason}</ThemedText>

            {deriveCategoryCounts(assessment.starting_plan.activities).length > 0 && (
              <>
                <View style={styles.divider} />
                <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Your starting week</ThemedText>
                <View style={styles.weeklyPlanRow}>
                  {deriveCategoryCounts(assessment.starting_plan.activities).map(c => (
                    <View key={c.category} style={styles.weeklyPlanItem}>
                      <ThemedText style={styles.weeklyPlanNumber}>{c.count}</ThemedText>
                      <ThemedText style={styles.weeklyPlanLabel}>{c.label}</ThemedText>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.divider} />

            <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Your next steps</ThemedText>
            {assessment.next_steps.map((step, i) => (
              <View key={i} style={styles.nextStepRow}>
                <View style={styles.nextStepBullet} />
                <ThemedText style={styles.nextStepText}>{step}</ThemedText>
              </View>
            ))}

            {/* Independent of recommendation.approach (a self_directed user
                may still have a real medium opportunity, and vice versa) —
                omitted entirely when empty, never a placeholder/empty state.
                Never fetches providers here; "Explore" hands off to My
                Plan's existing Day 4 explicit-tap-then-match flow. */}
            {supportOpportunities.length > 0 && (
              <>
                <View style={styles.divider} />
                <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Support that could help</ThemedText>
                {supportOpportunities.map(o => (
                  <View key={o.type} style={styles.supportItem}>
                    <View style={styles.supportItemHeader}>
                      <ThemedText style={styles.rowValue}>
                        {o.type === 'personal_trainer' ? 'Personal training' : 'Nutrition support'}
                      </ThemedText>
                      <ThemedText style={o.relevance === 'high' ? styles.supportRelevanceHigh : styles.supportRelevanceMedium}>
                        {o.relevance === 'high' ? 'High relevance' : 'Medium relevance'}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.aiBody}>{o.reason}</ThemedText>
                    <TouchableOpacity onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7}>
                      <ThemedText style={styles.supportCtaText}>
                        {o.type === 'personal_trainer' ? 'Explore trainers →' : 'Explore nutrition support →'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </Animated.View>
        )}

        {(assessmentPhase === 'idle' || assessmentPhase === 'fallback') && (
          <Animated.View style={[styles.card, { opacity: fade }]}>
            <ThemedText style={styles.cardEyebrow}>Your active plan</ThemedText>

            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>Goal</ThemedText>
              <ThemedText style={styles.rowValue}>{summary.goalLine}</ThemedText>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>Starting point</ThemedText>
              <ThemedText style={styles.rowValue}>{summary.startingPointLine}</ThemedText>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <ThemedText style={styles.rowLabel}>Focus</ThemedText>
              <ThemedText style={styles.rowValue}>{summary.focusLine}</ThemedText>
            </View>

            <View style={styles.divider} />

            <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>Recommended approach</ThemedText>
            <View style={styles.approachWrap}>
              {summary.approach.map(a => (
                <View key={a} style={styles.approachChip}>
                  <Ionicons name={(APPROACH_ICON[a] ?? 'ellipse-outline') as any} size={14} color={palette.ink700} />
                  <ThemedText style={styles.approachText}>{a}</ThemedText>
                </View>
              ))}
            </View>

            {fallbackWeekPlan.length > 0 && (
              <>
                <View style={styles.divider} />
                <ThemedText style={[styles.rowLabel, { marginBottom: 10 }]}>This week</ThemedText>
                {fallbackWeekPlan.map((item, i) => (
                  <ThemedText key={i} style={styles.fallbackWeekLine}>{item.day} · {item.label}</ThemedText>
                ))}
              </>
            )}
          </Animated.View>
        )}

        <ThemedText style={styles.adaptNote}>Your plan will adapt as you progress.</ThemedText>

        <TouchableOpacity
          style={styles.viewPlanLink}
          onPress={() => router.push('/my-plan' as any)}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.viewPlanLinkText}>See my detailed plan</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={palette.ink700} />
        </TouchableOpacity>

        {status === 'failed' && (
          <ThemedText style={styles.errorNote}>Couldn’t save your plan — check your connection. You can still continue.</ThemedText>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85} disabled={starting}>
          <ThemedText style={styles.startBtnText}>Start my journey</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>

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
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.success700,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.5,
    marginBottom: 24,
    paddingTop: 12,
  },

  intelligenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
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

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginBottom: 20,
  },
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

  loadingCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray450,
    textAlign: 'center',
  },

  aiHeadline: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.3,
  },
  aiBody: {
    fontSize: fontSize.sm,
    color: palette.ink600,
    marginTop: 6,
    lineHeight: 20,
  },

  weeklyPlanRow: {
    flexDirection: 'row',
    gap: 10,
  },
  weeklyPlanItem: {
    flex: 1,
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

  // Support that could help — same row/label/body language as the other
  // sections in this card (rowValue/aiBody), just with a relevance tag and
  // a text link, never a new card/tile/gradient treatment.
  supportItem: { marginBottom: 14 },
  supportItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  supportRelevanceHigh: { fontSize: fontSize.xs, fontWeight: '700', color: palette.success700, textTransform: 'uppercase', letterSpacing: 0.5 },
  supportRelevanceMedium: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray450, textTransform: 'uppercase', letterSpacing: 0.5 },
  supportCtaText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700, marginTop: 8 },

  adaptNote: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  viewPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 16,
  },
  viewPlanLinkText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  errorNote: {
    fontSize: fontSize.xs,
    color: palette.danger600,
    textAlign: 'center',
    marginTop: 12,
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
