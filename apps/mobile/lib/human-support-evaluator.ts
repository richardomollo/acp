// ACP Intelligence™ Day 6 — deterministic human-support evaluator. Detects
// whether human expertise would likely help, from Days 3–5's own structured
// data only — never an LLM judgment call. Answers "should ACP suggest human
// support?"; PT matching (a separate concern) happens in
// services/human-support-service.ts using this evaluator's output.
import { MIN_SESSIONS_FOR_PERFORMANCE_PLATEAU } from './progress-calculations.ts';
import type {
  HumanSupportEvaluationInput, HumanSupportEvaluation, HumanSupportSignal,
} from './human-support-types.ts';

const REPEATED_DIFFICULTY_MIN = 2;
const REPEATED_LOW_ADHERENCE_ADAPTATION_MIN = 2;
const REPEATED_ADAPTATION_MIN = 3;
const PLATEAU_MIN_ADHERENCE = 0.6;
const LOW_ADHERENCE_THRESHOLD = 0.5;

// Priority order — the first signal present here becomes `primary`
// (section 9). Pain always wins; beginner support is the lowest bar since
// it's an opportunity, not a problem.
const PRIORITY: HumanSupportSignal['trigger'][] = [
  'PAIN_REPORTED', 'REPEATED_DIFFICULTY', 'REPEATED_LOW_ADHERENCE',
  'PROGRESS_PLATEAU', 'REPEATED_ADAPTATION', 'BEGINNER_TECHNIQUE_SUPPORT',
];

export function evaluateHumanSupport(input: HumanSupportEvaluationInput): HumanSupportEvaluation {
  const { progress, recentCheckIns, recentAdaptations, experienceLevel, programmeSource, hasActiveTrainerRelationship } = input;
  const trainerOwned = programmeSource === 'TRAINER_CREATED' || programmeSource === 'TRAINER_MODIFIED' || hasActiveTrainerRelationship;

  const signals: HumanSupportSignal[] = [];

  // Pain — never diagnostic, never blocks the check for anything else.
  const painCheckIns = recentCheckIns.filter(c => c.painReported);
  if (painCheckIns.length > 0) {
    signals.push({
      trigger: 'PAIN_REPORTED', severity: 'HIGH',
      reason: 'You reported pain or discomfort during training. ACP won’t increase your training automatically. Consider getting appropriate professional guidance before progressing.',
      evidence: { pain_reported_weeks: painCheckIns.map(c => c.weekNumber) },
    });
  }

  const difficultCheckIns = recentCheckIns.filter(c => c.difficulty === 'too_difficult');
  if (difficultCheckIns.length >= REPEATED_DIFFICULTY_MIN) {
    signals.push({
      trigger: 'REPEATED_DIFFICULTY', severity: 'RECOMMENDED',
      reason: 'Your recent workouts have felt difficult for more than one week. A trainer can review your programme and technique with you.',
      evidence: { difficult_weeks: difficultCheckIns.map(c => c.weekNumber) },
    });
  }

  const volumeOrRegressAdaptations = recentAdaptations.filter(a => a.decisionTypes.includes('CHANGE_VOLUME') || a.decisionTypes.includes('REGRESS'));
  if (
    progress.behavioural.adherenceRate != null && progress.behavioural.adherenceRate < LOW_ADHERENCE_THRESHOLD
    && volumeOrRegressAdaptations.length >= REPEATED_LOW_ADHERENCE_ADAPTATION_MIN
  ) {
    signals.push({
      trigger: 'REPEATED_LOW_ADHERENCE', severity: 'RECOMMENDED',
      reason: 'ACP has already adjusted your plan to make it easier to sustain, but consistency has stayed low. A trainer can add accountability and help find what fits your routine.',
      evidence: { adherence_rate: progress.behavioural.adherenceRate, adaptation_weeks: volumeOrRegressAdaptations.map(a => a.weekNumber) },
    });
  }

  const plateauExercises = progress.performance.exerciseTrends.filter(t => t.direction === 'stable' && t.sessionsCompared >= MIN_SESSIONS_FOR_PERFORMANCE_PLATEAU);
  const adherenceForPlateau = progress.behavioural.recentPlanned > 0 ? progress.behavioural.recentCompleted / progress.behavioural.recentPlanned : progress.behavioural.adherenceRate;
  if (plateauExercises.length > 0 && adherenceForPlateau != null && adherenceForPlateau >= PLATEAU_MIN_ADHERENCE) {
    signals.push({
      trigger: 'PROGRESS_PLATEAU', severity: 'RECOMMENDED',
      reason: "You've been consistent, but your performance has stayed flat across several sessions. A trainer can review your technique and programme with you.",
      evidence: { plateaued_exercises: plateauExercises.map(t => t.exerciseName), sessions_compared: plateauExercises.map(t => t.sessionsCompared) },
    });
  }

  const nonKeepAdaptations = recentAdaptations.filter(a => !a.decisionTypes.includes('KEEP') && !a.decisionTypes.includes('INSUFFICIENT_EVIDENCE'));
  if (nonKeepAdaptations.length >= REPEATED_ADAPTATION_MIN) {
    signals.push({
      trigger: 'REPEATED_ADAPTATION', severity: 'RECOMMENDED',
      reason: 'ACP has adjusted your plan several times recently. A trainer can take a closer look at what would work best for you.',
      evidence: { adaptation_weeks: nonKeepAdaptations.map(a => a.weekNumber) },
    });
  }

  // Opportunity, not a problem — lowest severity, and irrelevant once the
  // member already has expert guidance (trainer-owned programme/relationship).
  if (experienceLevel === 'beginner' && !trainerOwned) {
    signals.push({
      trigger: 'BEGINNER_TECHNIQUE_SUPPORT', severity: 'INFO',
      reason: 'A trainer can help you learn the movements and feel confident with your programme.',
      evidence: { experience_level: experienceLevel },
    });
  }

  const primaryTrigger = PRIORITY.find(t => signals.some(s => s.trigger === t));
  let primary = primaryTrigger ? signals.find(s => s.trigger === primaryTrigger) ?? null : null;

  // Trainer-owned: relabel the primary signal (if any) so the member is
  // pointed back to their existing trainer, never offered a replacement —
  // the underlying evidence/reason is unchanged, only the trigger label is.
  if (primary && trainerOwned) {
    primary = { ...primary, trigger: 'TRAINER_REVIEW_RECOMMENDED' };
  }

  return { signals, primary, trainerOwned };
}

// ── Suppression / cooldown (section 7) ──────────────────────────────────────

export const DISMISSAL_COOLDOWN_DAYS = 14;

export interface DismissalRecord { trigger: string; dismissedAt: string }

/**
 * A dismissed INFO/RECOMMENDED signal stays suppressed for
 * DISMISSAL_COOLDOWN_DAYS. HIGH severity (pain) is NEVER suppressed by a
 * dismissal — safety-relevant messaging must not be silenced indefinitely
 * (section 21). A dismissal of one trigger never suppresses a *different,
 * stronger* trigger that appears later — this only ever checks the primary
 * signal's own trigger against its own dismissal record.
 */
export function applySuppression(
  primary: HumanSupportSignal | null, dismissals: DismissalRecord[], now: Date,
): HumanSupportSignal | null {
  if (!primary || primary.severity === 'HIGH') return primary;
  const dismissal = dismissals.find(d => d.trigger === primary.trigger);
  if (!dismissal) return primary;
  const daysSince = (now.getTime() - new Date(dismissal.dismissedAt).getTime()) / 86400000;
  return daysSince < DISMISSAL_COOLDOWN_DAYS ? null : primary;
}
