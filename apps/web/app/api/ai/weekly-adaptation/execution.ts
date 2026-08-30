// ACP Intelligence™ Day 9 — closed-loop execution intelligence (server).
//
// Pure, deterministic. No LLM, no RAG, no network. Turns raw per-activity
// execution records (plan_activity_execution) + binary completions
// (plan_activity_completions) + linked guided-workout signals
// (workout_history.perceived_difficulty / completion_percentage) into:
//   - a bounded WeeklyExecutionSummary (planned vs actual), and
//   - a compact "EXECUTION EVIDENCE" prompt block, and
//   - repeated execution patterns for coaching_memory.
//
// Boundary: execution feedback is EVIDENCE, never an autonomous action.
// Nothing here regenerates a plan, calls a model, or embeds anything.

import type { StartingPlanActivity, ActivityCategory } from '../onboarding-assessment/assessment.ts';

export type ExecutionStatus = 'planned' | 'completed' | 'partial' | 'skipped';
export type DifficultyFeedback = 'too_easy' | 'about_right' | 'too_hard';
export type SkipReason =
  | 'no_time' | 'low_energy' | 'too_difficult'
  | 'schedule_changed' | 'equipment_unavailable' | 'not_in_mood' | 'other';

/** One plan_activity_execution row, already scoped to a single plan. */
export interface ExecutionRecordInput {
  activityIndex: number;
  executionStatus: ExecutionStatus;
  difficulty?: DifficultyFeedback | null;
  skipReason?: SkipReason | null;
  actualDurationMinutes?: number | null;
}

/** Signal derived from a guided workout_history session linked to this activity. */
export interface WorkoutExecutionSignal {
  activityIndex: number;
  /** workout_history.perceived_difficulty: 'easy' | 'about_right' | 'difficult'. */
  perceivedDifficulty?: 'easy' | 'about_right' | 'difficult' | null;
  /** workout_history.completion_percentage (0-100). */
  completionPercentage?: number | null;
  durationMinutes?: number | null;
}

export interface ActivityExecutionEvidence {
  activityIndex: number;
  category: ActivityCategory;
  status: ExecutionStatus;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  difficulty?: DifficultyFeedback;
  skipReason?: SkipReason;
  source: 'execution_record' | 'workout' | 'completion' | 'none';
}

export interface WeeklyExecutionSummary {
  plannedActivities: number;
  completedActivities: number;
  partialActivities: number;
  skippedActivities: number;

  plannedMinutes: number;
  /** Present only when actual duration is known for at least one activity. */
  actualMinutes?: number;
  knownDurationActivities: number;

  difficultyCounts: Record<DifficultyFeedback, number>;
  skipReasonCounts: Partial<Record<SkipReason, number>>;

  categoryEvidence: Record<string, {
    planned: number; completed: number; partial: number; skipped: number;
    tooHard: number; tooEasy: number;
  }>;

  /** True when there is no Day 9 execution evidence at all — legacy binary-only week. */
  hasNoExecutionEvidence: boolean;
}

// completion_percentage at/above this but below 100 → treat a completion as
// 'partial'. Below this a completion still counts fully (a session logged at
// 5% is a mis-tap, not a partial). Duration difference ALONE never implies
// partial (section 6).
const PARTIAL_MIN_PERCENT = 30;
const PARTIAL_MAX_PERCENT = 99.999;

const WORKOUT_DIFFICULTY_MAP: Record<'easy' | 'about_right' | 'difficult', DifficultyFeedback> = {
  easy: 'too_easy',
  about_right: 'about_right',
  difficult: 'too_hard',
};

/**
 * Reconciles the three evidence layers for ONE activity. Precedence
 * (section 18): an explicit user execution record wins for status/skip
 * reason and for difficulty (a deliberate tap is the most direct signal);
 * a linked guided-workout signal fills gaps; binary completion is the
 * floor. A missing field is 'unknown', never negative evidence (section 54).
 */
export function buildActivityExecutionEvidence(
  activity: StartingPlanActivity,
  activityIndex: number,
  isCompleted: boolean,
  record: ExecutionRecordInput | undefined,
  workout: WorkoutExecutionSignal | undefined,
): ActivityExecutionEvidence {
  const plannedDurationMinutes = Number.isFinite(activity.duration_minutes) ? activity.duration_minutes : 0;

  let status: ExecutionStatus;
  let source: ActivityExecutionEvidence['source'] = 'none';

  if (record?.executionStatus === 'skipped' && !isCompleted) {
    status = 'skipped';
    source = 'execution_record';
  } else if (isCompleted) {
    const explicitPartial = record?.executionStatus === 'partial';
    const workoutPartial =
      workout?.completionPercentage != null &&
      workout.completionPercentage >= PARTIAL_MIN_PERCENT &&
      workout.completionPercentage <= PARTIAL_MAX_PERCENT;
    status = explicitPartial || workoutPartial ? 'partial' : 'completed';
    source = explicitPartial ? 'execution_record' : workoutPartial ? 'workout' : record ? 'execution_record' : 'completion';
  } else {
    status = 'planned';
    source = record ? 'execution_record' : 'none';
  }

  const difficulty: DifficultyFeedback | undefined =
    record?.difficulty ??
    (workout?.perceivedDifficulty ? WORKOUT_DIFFICULTY_MAP[workout.perceivedDifficulty] : undefined);

  const actualDurationMinutes: number | undefined =
    record?.actualDurationMinutes != null && record.actualDurationMinutes >= 0
      ? record.actualDurationMinutes
      : workout?.durationMinutes != null && workout.durationMinutes >= 0
        ? workout.durationMinutes
        : undefined;

  return {
    activityIndex,
    category: activity.category,
    status,
    plannedDurationMinutes,
    ...(actualDurationMinutes != null ? { actualDurationMinutes } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(status === 'skipped' && record?.skipReason ? { skipReason: record.skipReason } : {}),
    source,
  };
}

export function buildWeeklyExecutionSummary(
  activities: StartingPlanActivity[],
  completedIndexes: Set<number>,
  executionRecords: ExecutionRecordInput[],
  workoutSignals: WorkoutExecutionSignal[] = [],
): WeeklyExecutionSummary {
  const recordByIndex = new Map(executionRecords.map(r => [r.activityIndex, r]));
  const workoutByIndex = new Map(workoutSignals.map(w => [w.activityIndex, w]));

  const difficultyCounts: Record<DifficultyFeedback, number> = { too_easy: 0, about_right: 0, too_hard: 0 };
  const skipReasonCounts: Partial<Record<SkipReason, number>> = {};
  const categoryEvidence: WeeklyExecutionSummary['categoryEvidence'] = {};

  let completedActivities = 0;
  let partialActivities = 0;
  let skippedActivities = 0;
  let actualMinutes = 0;
  let knownDurationActivities = 0;

  activities.forEach((activity, i) => {
    const ev = buildActivityExecutionEvidence(
      activity, i, completedIndexes.has(i), recordByIndex.get(i), workoutByIndex.get(i),
    );
    const cat = (categoryEvidence[activity.category] ??= { planned: 0, completed: 0, partial: 0, skipped: 0, tooHard: 0, tooEasy: 0 });
    cat.planned++;

    if (ev.status === 'completed') { completedActivities++; cat.completed++; }
    else if (ev.status === 'partial') { partialActivities++; cat.partial++; }
    else if (ev.status === 'skipped') { skippedActivities++; cat.skipped++; }

    if (ev.difficulty) {
      difficultyCounts[ev.difficulty]++;
      if (ev.difficulty === 'too_hard') cat.tooHard++;
      if (ev.difficulty === 'too_easy') cat.tooEasy++;
    }
    if (ev.status === 'skipped' && ev.skipReason) {
      skipReasonCounts[ev.skipReason] = (skipReasonCounts[ev.skipReason] ?? 0) + 1;
    }
    if (ev.actualDurationMinutes != null) {
      actualMinutes += ev.actualDurationMinutes;
      knownDurationActivities++;
    }
  });

  const hasNoExecutionEvidence =
    executionRecords.length === 0 &&
    workoutSignals.every(w => w.perceivedDifficulty == null && w.completionPercentage == null);

  return {
    plannedActivities: activities.length,
    completedActivities,
    partialActivities,
    skippedActivities,
    plannedMinutes: activities.reduce((s, a) => s + (Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0), 0),
    ...(knownDurationActivities > 0 ? { actualMinutes } : {}),
    knownDurationActivities,
    difficultyCounts,
    skipReasonCounts,
    categoryEvidence,
    hasNoExecutionEvidence,
  };
}

/**
 * Compact, bounded "EXECUTION EVIDENCE" block for the adaptation prompt
 * (section 35). No IDs, no timestamps, no raw logs. Empty string when there
 * is nothing beyond binary completion to add — so a legacy week changes
 * nothing about the prompt (section 54/61).
 */
export function buildCompactExecutionContext(summary: WeeklyExecutionSummary): string {
  if (summary.hasNoExecutionEvidence && summary.partialActivities === 0 && summary.skippedActivities === 0) {
    return '';
  }

  const lines: string[] = [
    `Planned: ${summary.plannedActivities} | Completed: ${summary.completedActivities} | Partial: ${summary.partialActivities} | Skipped: ${summary.skippedActivities}`,
  ];

  const diff = summary.difficultyCounts;
  const diffParts = (['too_easy', 'about_right', 'too_hard'] as const)
    .filter(k => diff[k] > 0)
    .map(k => `${k} ${diff[k]}`);
  if (diffParts.length > 0) lines.push(`Difficulty feedback: ${diffParts.join(', ')}`);

  const skipParts = Object.entries(summary.skipReasonCounts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${k} ${n}`);
  if (skipParts.length > 0) lines.push(`Skip reasons: ${skipParts.join(', ')}`);

  if (summary.actualMinutes != null && summary.knownDurationActivities > 0) {
    lines.push(`Actual minutes recorded: ${summary.actualMinutes} across ${summary.knownDurationActivities} of ${summary.plannedActivities} activities (planned ${summary.plannedMinutes})`);
  }

  return `EXECUTION EVIDENCE (already computed from this week — interpret, do not recompute)\n${lines.join('\n')}`;
}

// ── Repeated execution patterns → coaching_memory (section 25-32) ────────────

export type ExecutionPatternSubject = 'difficulty_fit' | 'time_fit';

export interface ExecutionPattern {
  type: 'execution_pattern';
  subject: ExecutionPatternSubject;
  confidence: 'emerging' | 'moderate' | 'strong';
  evidence: Record<string, unknown>;
  user_message: string;
}

// Reuses the Day 6 threshold philosophy: a pattern needs REPEATED evidence
// across weeks, never one tap (section 26/33). "observation weeks" = number
// of recent weeks in which the signal appeared at all.
const PATTERN_MODERATE_WEEKS = 2;
const PATTERN_STRONG_WEEKS = 3;
const TIME_SKIP_REASONS: SkipReason[] = ['no_time', 'schedule_changed'];

function patternConfidence(weeks: number): 'emerging' | 'moderate' | 'strong' | null {
  if (weeks >= PATTERN_STRONG_WEEKS) return 'strong';
  if (weeks >= PATTERN_MODERATE_WEEKS) return 'moderate';
  return null; // one isolated week — observation only, no memory row
}

/**
 * `weeklySummaries` most-recent-first, typically up to 4 weeks. Emits at
 * most one row per subject, and only at moderate/strong confidence — an
 * isolated week never produces a pattern (section 27/28/38).
 */
export function buildExecutionPatterns(weeklySummaries: WeeklyExecutionSummary[]): ExecutionPattern[] {
  const patterns: ExecutionPattern[] = [];
  const recent = weeklySummaries.slice(0, 4);
  if (recent.length < PATTERN_MODERATE_WEEKS) return patterns;

  // difficulty_fit — repeated "too hard" (executability signal) takes
  // precedence over repeated "too easy" when both somehow appear.
  const tooHardWeeks = recent.filter(w => w.difficultyCounts.too_hard > 0).length;
  const tooEasyWeeks = recent.filter(w => w.difficultyCounts.too_easy > 0 && w.difficultyCounts.too_hard === 0).length;
  const hardConf = patternConfidence(tooHardWeeks);
  const easyConf = tooHardWeeks === 0 ? patternConfidence(tooEasyWeeks) : null;
  if (hardConf) {
    patterns.push({
      type: 'execution_pattern', subject: 'difficulty_fit', confidence: hardConf,
      evidence: { direction: 'too_hard', weeks_observed: tooHardWeeks, window_weeks: recent.length },
      user_message: 'Several recent sessions have felt harder than expected.',
    });
  } else if (easyConf) {
    patterns.push({
      type: 'execution_pattern', subject: 'difficulty_fit', confidence: easyConf,
      evidence: { direction: 'too_easy', weeks_observed: tooEasyWeeks, window_weeks: recent.length },
      user_message: 'Recent sessions have mostly felt on the easy side.',
    });
  }

  // time_fit — repeated time-related skips.
  const timeSkipWeeks = recent.filter(w =>
    TIME_SKIP_REASONS.some(r => (w.skipReasonCounts[r] ?? 0) > 0),
  ).length;
  const timeConf = patternConfidence(timeSkipWeeks);
  if (timeConf) {
    patterns.push({
      type: 'execution_pattern', subject: 'time_fit', confidence: timeConf,
      evidence: { direction: 'time_barrier', weeks_observed: timeSkipWeeks, window_weeks: recent.length },
      user_message: 'Time has been the most common reason activities were hard to fit into recent weeks.',
    });
  }

  return patterns;
}
