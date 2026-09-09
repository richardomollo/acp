// LH-01 / LH-03 / LH-18 — the shared domain-validation boundary for
// onboarding health inputs.
//
// Pure and framework-free (same discipline as lib/onboarding.ts): no React
// Native, no Supabase. One place that decides whether a weight / weekly-time
// input is plausible, so onboarding screens, profile editing, goal editing,
// the persistence guard in onboarding-context, plan generation, and any
// future API/server boundary all agree — and impossible values are stopped
// at the input boundary instead of being cleaned up downstream.
//
// Nothing here clamps or "fixes" a value: an out-of-range input is rejected
// with a human-readable reason. It is a data-plausibility gate, not a
// medical judgement.

// ─────────────────────────────────────────────────────────────────────────
// Weight (kilograms — the current onboarding flow is kg-based)
// ─────────────────────────────────────────────────────────────────────────
//
// Bounds admit essentially every real adult while rejecting obviously
// impossible entries (LH-01: current weight 999 kg, goal weight 1 kg,
// negatives, non-numbers):
//
//   WEIGHT_MIN_KG = 30  — below any adult who could independently onboard
//                         to a fitness app; still well clear of any clinical
//                         threshold, so no real user is excluded.
//   WEIGHT_MAX_KG = 350 — above documented severe-obesity ranges with
//                         margin. The handful of heavier verified humans are
//                         outliers under clinical care, not the app's
//                         self-directed user.
export const WEIGHT_MIN_KG = 30;
export const WEIGHT_MAX_KG = 350;

export interface FieldValidation {
  ok: boolean;
  /** the accepted, rounded value when ok; otherwise null */
  value: number | null;
  /** a concise, user-facing reason when not ok; otherwise null */
  error: string | null;
}

export function validateWeightKg(
  raw: number | null | undefined,
  label: 'current weight' | 'goal weight' | 'weight' = 'weight',
): FieldValidation {
  if (raw == null) return { ok: false, value: null, error: `Enter your ${label} in kg.` };
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw)) {
    return { ok: false, value: null, error: `Enter a valid ${label} in kg.` };
  }
  if (raw < WEIGHT_MIN_KG || raw > WEIGHT_MAX_KG) {
    return { ok: false, value: null, error: `Enter a ${label} between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
  }
  return { ok: true, value: Math.round(raw * 10) / 10, error: null };
}

export const validateCurrentWeight = (kg: number | null | undefined): FieldValidation =>
  validateWeightKg(kg, 'current weight');
export const validateGoalWeight = (kg: number | null | undefined): FieldValidation =>
  validateWeightKg(kg, 'goal weight');

/** Type guard for display/summary code: true only for an in-range number. */
export function isPlausibleWeightKg(kg: number | null | undefined): kg is number {
  return validateWeightKg(kg).ok;
}

// ─────────────────────────────────────────────────────────────────────────
// Weekly time budget (LH-03)
// ─────────────────────────────────────────────────────────────────────────

export const HOURS_PER_WEEK = 168;
export const MAX_SLEEP_HOURS_PER_NIGHT = 24;

export interface WeeklyTimeBudgetInput {
  /** hours of sleep per NIGHT (multiplied by 7 for the weekly total) */
  sleepHoursPerNight: number | null;
  workHoursPerWeek: number | null;
  sportHoursPerWeek: number | null;
  /** any other explicitly-committed weekly hours; 0 in the flow today, here
   *  so the model extends without a signature change */
  otherHoursPerWeek?: number | null;
}

export interface WeeklyTimeBudgetResult {
  ok: boolean;
  /** sleep*7 + work + sport + other, when every contributing field is a
   *  valid number; otherwise null */
  committedHours: number | null;
  /** 168 − committed. NOT clamped — may be negative (that is the LH-03 signal). */
  remainingHours: number | null;
  /** max(0, committed − 168) */
  overageHours: number;
  fieldErrors: {
    sleep: string | null;
    work: string | null;
    sport: string | null;
    other: string | null;
  };
  /** the blocking whole-week error naming the overage, or null */
  error: string | null;
}

function coerce(v: number | null | undefined): number | null {
  return v == null || typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v) ? null : v;
}

function perFieldError(
  present: boolean,
  n: number | null,
  max: number,
  maxReason: string,
): string | null {
  if (!present) return null;         // blank — a required-state, handled by the screen
  if (n == null) return 'Enter a number.';
  if (n < 0) return 'Hours can’t be negative.';
  if (n > max) return maxReason;
  return null;
}

export function validateWeeklyTimeBudget(input: WeeklyTimeBudgetInput): WeeklyTimeBudgetResult {
  const sleep = coerce(input.sleepHoursPerNight);
  const work = coerce(input.workHoursPerWeek);
  const sport = coerce(input.sportHoursPerWeek);
  const other = coerce(input.otherHoursPerWeek);

  const fieldErrors = {
    sleep: perFieldError(
      input.sleepHoursPerNight != null, sleep, MAX_SLEEP_HOURS_PER_NIGHT,
      `There are only ${MAX_SLEEP_HOURS_PER_NIGHT} hours in a day.`,
    ),
    work: perFieldError(
      input.workHoursPerWeek != null, work, HOURS_PER_WEEK,
      `There are only ${HOURS_PER_WEEK} hours in a week.`,
    ),
    sport: perFieldError(
      input.sportHoursPerWeek != null, sport, HOURS_PER_WEEK,
      `There are only ${HOURS_PER_WEEK} hours in a week.`,
    ),
    other: perFieldError(
      input.otherHoursPerWeek != null, other, HOURS_PER_WEEK,
      `There are only ${HOURS_PER_WEEK} hours in a week.`,
    ),
  };
  const anyFieldError = Object.values(fieldErrors).some(Boolean);

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const computable = sleep != null && work != null && sport != null;
  const committedHours = computable
    ? round1(sleep * 7 + work + sport + (other ?? 0))
    : null;
  const remainingHours = committedHours == null ? null : round1(HOURS_PER_WEEK - committedHours);
  const overageHours = committedHours == null ? 0 : Math.max(0, round1(committedHours - HOURS_PER_WEEK));

  const error = overageHours > 0
    ? `Your schedule exceeds ${HOURS_PER_WEEK} hours by ${overageHours} ${overageHours === 1 ? 'hour' : 'hours'}. `
      + 'Adjust sleep, work or other commitments before continuing.'
    : null;

  return {
    ok: !anyFieldError && !error,
    committedHours,
    remainingHours,
    overageHours,
    fieldErrors,
    error,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Goal direction (LH-04) — semantic consistency between the stated goal and
// the direction the entered weights imply.
// ─────────────────────────────────────────────────────────────────────────
//
// Goal taxonomy (PrimaryGoal in lib/onboarding.ts, unchanged here):
//   • lose_weight     — displayed "Lose weight"            → WEIGHT-LOSS (directional)
//   • build_muscle    — displayed "Build strength"         → PERFORMANCE  (no required direction)
//   • maintain_weight — displayed "Maintain a healthy weight" → WEIGHT-NEUTRAL (no direction block)
//   • reduce_stress   — wellbeing; collects no weight       → not applicable
//
// There is NO explicit "gain weight" goal in the taxonomy. `build_muscle`
// ("Build strength") is a performance goal — the system must NOT infer that
// it means "gain weight". The `weight_gain` branch below is kept only so the
// rule is complete if such a goal is ever added.

export type GoalDirectionClass = 'weight_loss' | 'weight_gain' | 'performance' | 'weight_neutral';

export function goalDirectionClass(goal: string | null | undefined): GoalDirectionClass {
  switch (goal) {
    case 'lose_weight': return 'weight_loss';
    case 'build_muscle': return 'performance';
    case 'maintain_weight': return 'weight_neutral';
    default: return 'performance'; // reduce_stress / unknown — no weight direction imposed
  }
}

export interface GoalDirectionResult {
  ok: boolean;
  /** the direction the entered weights actually imply */
  weightDirection: 'loss' | 'gain' | 'none' | 'unknown';
  /** inline message for the goal-weight field when a directional goal is
   *  contradicted; otherwise null */
  error: string | null;
}

/**
 * A directional goal (lose / gain) must agree with the sign of
 * goalWeight − currentWeight. A performance or neutral goal imposes no
 * direction. Presence and plausible range are LH-01's job — when either
 * weight is missing/out-of-range this returns `ok: true` (nothing to check
 * yet) and lets those validators speak.
 */
export function validateGoalDirection(args: {
  goal: string | null | undefined;
  currentWeightKg: number | null | undefined;
  goalWeightKg: number | null | undefined;
}): GoalDirectionResult {
  const cw = validateWeightKg(args.currentWeightKg).value;
  const gw = validateWeightKg(args.goalWeightKg).value;
  if (cw == null || gw == null) return { ok: true, weightDirection: 'unknown', error: null };

  const delta = Math.round((gw - cw) * 10) / 10;
  const weightDirection: GoalDirectionResult['weightDirection'] =
    delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'none';
  const cls = goalDirectionClass(args.goal);

  if (cls === 'weight_loss') {
    if (weightDirection === 'gain') {
      return { ok: false, weightDirection, error: 'Your goal weight is above your current weight. Choose a lower goal weight, or change your goal.' };
    }
    if (weightDirection === 'none') {
      return { ok: false, weightDirection, error: 'Your goal weight is the same as your current weight. Choose a lower goal weight, or change your goal.' };
    }
    return { ok: true, weightDirection, error: null };
  }

  if (cls === 'weight_gain') {
    if (weightDirection === 'loss') {
      return { ok: false, weightDirection, error: 'Your goal weight is below your current weight. Choose a higher goal weight, or change your goal.' };
    }
    if (weightDirection === 'none') {
      return { ok: false, weightDirection, error: 'Your goal weight is the same as your current weight. Choose a higher goal weight, or change your goal.' };
    }
    return { ok: true, weightDirection, error: null };
  }

  // performance / weight_neutral — any scale direction is the user's own intent
  return { ok: true, weightDirection, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Aggregate — the persistence / generation guard (LH-18)
// ─────────────────────────────────────────────────────────────────────────

export interface OnboardingHealthValidation {
  ok: boolean;
  /** every failure, human-readable — for a controlled error / logging */
  errors: string[];
  weight: { current: FieldValidation; goal: FieldValidation };
  weeklyTime: WeeklyTimeBudgetResult | null;
  goalDirection: GoalDirectionResult;
}

const WEIGHT_GOALS = new Set(['lose_weight', 'build_muscle', 'maintain_weight']);

export function validateOnboardingHealthInputs(args: {
  goal: string | null | undefined;
  startingWeightKg: number | null | undefined;
  goalWeightKg: number | null | undefined;
  /** omit when the caller has no weekly-time inputs to check (e.g. a
   *  weight-only edit); the whole-week rule then isn't evaluated */
  weeklyTime?: WeeklyTimeBudgetInput | null;
}): OnboardingHealthValidation {
  const isWeightGoal = !!args.goal && WEIGHT_GOALS.has(args.goal);
  const current = validateCurrentWeight(args.startingWeightKg);
  const goal = validateGoalWeight(args.goalWeightKg);
  const weeklyTime = args.weeklyTime ? validateWeeklyTimeBudget(args.weeklyTime) : null;
  const goalDirection = validateGoalDirection({
    goal: args.goal,
    currentWeightKg: args.startingWeightKg,
    goalWeightKg: args.goalWeightKg,
  });

  const errors: string[] = [];
  if (isWeightGoal) {
    if (!current.ok && current.error) errors.push(`Current weight — ${current.error}`);
    if (!goal.ok && goal.error) errors.push(`Goal weight — ${goal.error}`);
    // LH-04 — only meaningful once both weights are in range (otherwise
    // goalDirection is a no-op); a directional goal contradicted by the
    // entered weights is rejected here too.
    if (!goalDirection.ok && goalDirection.error) errors.push(`Goal direction — ${goalDirection.error}`);
  }
  if (weeklyTime && !weeklyTime.ok) {
    if (weeklyTime.error) errors.push(weeklyTime.error);
    for (const fe of Object.values(weeklyTime.fieldErrors)) if (fe) errors.push(fe);
  }

  return { ok: errors.length === 0, errors, weight: { current, goal }, weeklyTime, goalDirection };
}

/** Thrown by the persistence / generation guard when invalid onboarding data
 *  reaches a write boundary. Carries the individual reasons. */
export class OnboardingValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Onboarding data failed validation: ${errors.join('; ')}`);
    this.name = 'OnboardingValidationError';
    this.errors = errors;
  }
}
