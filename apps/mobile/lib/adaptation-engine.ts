// ACP Intelligence™ Day 5 — deterministic adaptation decision engine. Pure,
// zero dependencies beyond the existing ProgressSnapshot/adaptation types.
// Answers "what should change?" — it never mutates anything itself (that's
// services/adaptation-service.ts's job) and never touches the interpreter's
// job of answering "what is happening?" (lib/progress-interpreter.ts).
import type { AdaptationContext, AdaptationDecision, AdaptationResult } from './adaptation-types.ts';
import type { ProgressSnapshot, ExercisePerformanceTrend } from './progress-types.ts';

// Adherence below this is treated as a real adherence problem — never
// responded to by making training harder (section 8B, non-negotiable).
const ADHERENCE_LOW = 0.5;
// Adherence at/above this, combined with other positive signals, is what
// unlocks KEEP/PROGRESS (matches progress-interpreter.ts's own threshold,
// kept consistent rather than introducing a second "strong adherence" number).
const ADHERENCE_STRONG = 0.8;

function effectiveAdherenceRate(progress: ProgressSnapshot): number | null {
  const { recentPlanned, recentCompleted, adherenceRate } = progress.behavioural;
  if (recentPlanned > 0) return recentCompleted / recentPlanned;
  return adherenceRate;
}

function performanceIsImproving(progress: ProgressSnapshot): boolean {
  return progress.performance.exerciseTrends.some(t => t.direction === 'increased')
    || progress.performance.activityTrends.some(t => t.direction === 'consistent');
}

function decliningExercise(progress: ProgressSnapshot): ExercisePerformanceTrend | undefined {
  return progress.performance.exerciseTrends.find(t => t.direction === 'decreased');
}

const HOLD_REASON = 'Lana already adjusted this week — giving it more time before changing anything further.';

/**
 * Ordered, documented priority cascade (section 8). Each rule is checked in
 * order and the first match wins — decisions are deliberately NOT combined
 * (section 21's over-adaptation guard: at most one structural change per
 * week), except RESCHEDULE, which is an explicit direct request and always
 * takes priority over inferred signals.
 */
export function evaluateAdaptation(context: AdaptationContext): AdaptationResult {
  const { progress, checkIn, programme } = context;
  const canApplyAutomatically = programme.source === 'ACP_GENERATED';
  const rate = effectiveAdherenceRate(progress);
  const improving = performanceIsImproving(progress);
  const declining = decliningExercise(progress);
  const alreadyAdaptedThisWeek = programme.lastAdaptedWeek === programme.currentWeek;

  const signalsUsed = {
    adherence_rate: rate,
    difficulty: checkIn.difficulty,
    energy: checkIn.energy,
    pain_reported: checkIn.painReported,
    schedule_changed: checkIn.scheduleChanged,
    performance_state: improving ? 'IMPROVING' : declining ? 'DECLINING' : 'STABLE',
  };

  const result = (decisions: AdaptationDecision[]): AdaptationResult => ({ decisions, canApplyAutomatically, signalsUsed });

  // 1. Safety first — pain overrides everything else, unconditionally.
  // Never diagnoses the cause; never autonomously increases load this week.
  if (checkIn.painReported) {
    return result([{ type: 'KEEP', reason: "You reported pain or discomfort. Lana won't increase training load automatically this week." }]);
  }

  // 2. No usable evidence anywhere — never invent adaptation confidence.
  const hasAnyEvidence = progress.dataQuality.hasEnoughBehaviouralData || progress.dataQuality.hasEnoughPerformanceData || progress.dataQuality.hasEnoughOutcomeData;
  if (!hasAnyEvidence) {
    return result([{ type: 'INSUFFICIENT_EVIDENCE', reason: 'Lana needs a little more training data before making changes.' }]);
  }

  // 3. An explicit availability change is a direct request, not an inference
  //    — it always gets a reschedule regardless of any other signal.
  if (checkIn.scheduleChanged) {
    return result([{ type: 'RESCHEDULE', reason: "Your availability changed, so Lana adjusted which days future workouts fall on." }]);
  }

  // 4. Adherence problems before progression — never make training harder
  //    to fix a consistency problem.
  if (rate != null && rate < ADHERENCE_LOW) {
    if (alreadyAdaptedThisWeek) return result([{ type: 'KEEP', reason: HOLD_REASON }]);
    return result([{
      type: 'CHANGE_VOLUME',
      reason: `You completed only ${progress.behavioural.recentCompleted} of your last ${progress.behavioural.recentPlanned} planned workouts. Rather than making training harder, Lana reduced next week's session length to make the plan easier to sustain.`,
    }]);
  }

  // 5. Too difficult + low energy together — regress volume, the safest lever.
  if (checkIn.difficulty === 'too_difficult' && checkIn.energy === 'low') {
    if (alreadyAdaptedThisWeek) return result([{ type: 'KEEP', reason: HOLD_REASON }]);
    return result([{ type: 'REGRESS', reason: 'Your recent workouts have felt too difficult and your energy has been low, so next week reduces training volume slightly.' }]);
  }

  // 6. Too difficult alone — ease intensity guidance rather than volume.
  if (checkIn.difficulty === 'too_difficult') {
    if (alreadyAdaptedThisWeek) return result([{ type: 'KEEP', reason: HOLD_REASON }]);
    return result([{ type: 'CHANGE_INTENSITY', reason: 'Your recent workouts have felt too difficult, so next week eases the training intensity.' }]);
  }

  // 7. A specific exercise is trending down with nothing else improving —
  //    a real, evidenced substitution trigger (never random variety).
  if (declining && !improving) {
    if (alreadyAdaptedThisWeek) return result([{ type: 'KEEP', reason: HOLD_REASON }]);
    return result([{ type: 'SUBSTITUTE', reason: `Your ${declining.exerciseName} performance has been trending down, so Lana will swap in a comparable alternative next week.` }]);
  }

  const strongAdherence = rate != null && rate >= ADHERENCE_STRONG;

  // 8. Ready to progress — strong adherence + easy + real performance evidence.
  if (checkIn.difficulty === 'easy' && strongAdherence) {
    if (alreadyAdaptedThisWeek) return result([{ type: 'KEEP', reason: HOLD_REASON }]);
    if (improving) return result([{ type: 'PROGRESS', reason: 'Your adherence is strong and recent workouts are getting easier, so next week includes a small progression.' }]);
    return result([{ type: 'CHANGE_INTENSITY', reason: 'Your workouts have felt easy and your adherence is strong, so next week nudges the training intensity up slightly.' }]);
  }

  // 9. Stable and effective — don't change something that's working.
  if (checkIn.difficulty === 'about_right' && strongAdherence) {
    return result([{ type: 'KEEP', reason: "You're completing your workouts consistently and the current difficulty looks appropriate." }]);
  }

  // 10. No strong signal either way — hold steady rather than guess.
  return result([{ type: 'KEEP', reason: 'Nothing in your recent data points to a clear change, so next week stays the same.' }]);
}
