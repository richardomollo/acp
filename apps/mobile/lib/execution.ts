// ACP Intelligence™ Day 9 — closed-loop execution intelligence (mobile).
//
// Pure helpers + thin persistence for the per-activity execution record
// (plan_activity_execution). This is EVIDENCE capture only: nothing here
// calls an LLM, embeds anything, or regenerates a plan. A feedback tap is
// one small upsert; the next scheduled/explicit weekly adaptation consumes
// it. Execution feedback is fully optional — a missing field is 'unknown',
// never negative evidence (section 9/13/54).
import type { StartingPlanActivity, ActivityCategory } from './ai-assessment';
import type { PlanActivityCompletion } from './completion';

export type ExecutionStatus = 'planned' | 'completed' | 'partial' | 'skipped';
export type DifficultyFeedback = 'too_easy' | 'about_right' | 'too_hard';
export type SkipReason =
  | 'no_time' | 'low_energy' | 'too_difficult'
  | 'schedule_changed' | 'equipment_unavailable' | 'not_in_mood' | 'other';

export interface PlanActivityExecutionRow {
  activityIndex: number;
  executionStatus: ExecutionStatus;
  difficulty: DifficultyFeedback | null;
  skipReason: SkipReason | null;
  actualDurationMinutes: number | null;
}

// ── UI option lists (stable machine values + neutral, non-shaming labels) ────

export const DIFFICULTY_OPTIONS: { value: DifficultyFeedback; label: string }[] = [
  { value: 'too_easy', label: 'Too easy' },
  { value: 'about_right', label: 'About right' },
  { value: 'too_hard', label: 'Too hard' },
];

export const SKIP_REASON_OPTIONS: { value: SkipReason; label: string }[] = [
  { value: 'no_time', label: 'No time' },
  { value: 'low_energy', label: 'Low energy' },
  { value: 'too_difficult', label: 'Felt too difficult' },
  { value: 'schedule_changed', label: 'Schedule changed' },
  { value: 'equipment_unavailable', label: 'Equipment unavailable' },
  { value: 'not_in_mood', label: 'Not in the mood' },
  { value: 'other', label: 'Something else' },
];

// Which categories get a "How did that feel?" prompt (section 10) — execution
// difficulty is only meaningful for something you actually performed.
const FEEDBACK_ELIGIBLE_CATEGORIES = new Set<ActivityCategory>(['strength', 'cardio', 'sport', 'mobility']);
export function isFeedbackEligible(activity: Pick<StartingPlanActivity, 'category'>): boolean {
  return FEEDBACK_ELIGIBLE_CATEGORIES.has(activity.category);
}

// ── Deterministic weekly reconciliation (planned vs actual) ─────────────────

export interface ActivityExecutionEvidence {
  activityIndex: number;
  category: ActivityCategory;
  status: ExecutionStatus;
  difficulty?: DifficultyFeedback;
  skipReason?: SkipReason;
}

export interface WeeklyExecutionSummary {
  planned: number;
  completed: number;
  partial: number;
  skipped: number;
  difficultyCounts: Record<DifficultyFeedback, number>;
  skipReasonCounts: Partial<Record<SkipReason, number>>;
  hasExecutionEvidence: boolean;
}

/**
 * Reconciles binary completion + the Day 9 execution row for one activity.
 * An explicit execution record wins for status/skip/difficulty; binary
 * completion is the floor; missing = unknown.
 */
export function reconcileActivityExecution(
  activity: StartingPlanActivity,
  activityIndex: number,
  isCompleted: boolean,
  row: PlanActivityExecutionRow | undefined,
): ActivityExecutionEvidence {
  let status: ExecutionStatus;
  if (row?.executionStatus === 'skipped' && !isCompleted) status = 'skipped';
  else if (isCompleted) status = row?.executionStatus === 'partial' ? 'partial' : 'completed';
  else status = 'planned';

  return {
    activityIndex,
    category: activity.category,
    status,
    ...(row?.difficulty ? { difficulty: row.difficulty } : {}),
    ...(status === 'skipped' && row?.skipReason ? { skipReason: row.skipReason } : {}),
  };
}

export function summarizeWeekExecution(
  activities: StartingPlanActivity[],
  completions: PlanActivityCompletion[],
  executionRows: PlanActivityExecutionRow[],
): WeeklyExecutionSummary {
  const completedIndexes = new Set(completions.map(c => c.activityIndex));
  const rowByIndex = new Map(executionRows.map(r => [r.activityIndex, r]));
  const difficultyCounts: Record<DifficultyFeedback, number> = { too_easy: 0, about_right: 0, too_hard: 0 };
  const skipReasonCounts: Partial<Record<SkipReason, number>> = {};
  let completed = 0, partial = 0, skipped = 0;

  activities.forEach((activity, i) => {
    const ev = reconcileActivityExecution(activity, i, completedIndexes.has(i), rowByIndex.get(i));
    if (ev.status === 'completed') completed++;
    else if (ev.status === 'partial') partial++;
    else if (ev.status === 'skipped') skipped++;
    if (ev.difficulty) difficultyCounts[ev.difficulty]++;
    if (ev.status === 'skipped' && ev.skipReason) {
      skipReasonCounts[ev.skipReason] = (skipReasonCounts[ev.skipReason] ?? 0) + 1;
    }
  });

  return {
    planned: activities.length,
    completed, partial, skipped,
    difficultyCounts, skipReasonCounts,
    hasExecutionEvidence: executionRows.length > 0,
  };
}

// ── Thin persistence (idempotent upsert on (user_id, plan_id, activity_index)) ─

export interface ExecutionWriteContext {
  userId: string;
  planId: string;
  activityIndex: number;
}

type MinimalSupabase = {
  from: (t: string) => {
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: unknown }>;
    delete: () => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> } } };
  };
};

/** Records a difficulty tap for a completed/partial activity. Never blocks completion (section 9/70). */
export async function recordActivityFeedback(
  supabase: MinimalSupabase,
  ctx: ExecutionWriteContext,
  difficulty: DifficultyFeedback,
  opts: { partial?: boolean } = {},
): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('plan_activity_execution').upsert(
    {
      user_id: ctx.userId, plan_id: ctx.planId, activity_index: ctx.activityIndex,
      execution_status: opts.partial ? 'partial' : 'completed',
      difficulty,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plan_id,activity_index' },
  );
  return { ok: !error };
}

/** Records optional context for a skipped activity. */
export async function recordActivitySkip(
  supabase: MinimalSupabase,
  ctx: ExecutionWriteContext,
  skipReason: SkipReason,
): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('plan_activity_execution').upsert(
    {
      user_id: ctx.userId, plan_id: ctx.planId, activity_index: ctx.activityIndex,
      execution_status: 'skipped',
      skip_reason: skipReason,
      source: 'manual',
      first_skipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plan_id,activity_index' },
  );
  return { ok: !error };
}

/**
 * Undo/reset: when a completion is undone (section 47), its execution record
 * must not linger as `status=planned, difficulty=too_hard`. Simplest coherent
 * model — delete the row entirely.
 */
export async function clearActivityExecution(
  supabase: MinimalSupabase,
  ctx: ExecutionWriteContext,
): Promise<{ ok: boolean }> {
  const { error } = await supabase.from('plan_activity_execution').delete()
    .eq('user_id', ctx.userId).eq('plan_id', ctx.planId).eq('activity_index', ctx.activityIndex);
  return { ok: !error };
}
