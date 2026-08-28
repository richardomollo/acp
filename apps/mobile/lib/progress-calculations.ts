// ACP Intelligence™ Day 4 — Progress Intelligence: pure calculation layer.
// Zero Supabase/React — every threshold below is a documented, deliberate
// choice (not an arbitrary default), so future days can rely on them without
// re-deriving. Nothing here computes a single "progress score" — behavioural,
// performance and outcome stay independent per the product spec.
import { daysBetweenLocal, parseLocalDateOnly } from './workout-execution.ts';
import type {
  BehaviouralProgress, WorkoutCompletionBucket, ExercisePerformanceTrend, TrendDirection,
  ActivityTrend, ActivityTrendDirection, MetricTrend, OutcomeDirection,
} from './progress-types.ts';

// A workout counts as "completed" at >= this prescribed-work percentage,
// "partial" between 1% and this, and "missed" otherwise — reuses Day 3's own
// completion_percentage rather than inventing a second definition of done.
export const COMPLETED_THRESHOLD_PCT = 80;

// "5 of your last 6 planned workouts" (product copy) — the recent-consistency
// window shown alongside the full since-programme-start adherence rate.
export const RECENT_WINDOW = 6;

// A measurement older than this is still shown, but flagged for the member
// to refresh — matches the existing coaching cadence (weekly check-ins).
export const STALE_MEASUREMENT_DAYS = 14;

// Below this many comparable sessions/measurements, no direction claim is
// made at all (section 12) — "insufficient_data" instead.
export const MIN_SESSIONS_FOR_EXERCISE_TREND = 2;
export const MIN_MEASUREMENTS_FOR_OUTCOME_TREND = 2;

// Plateau requires *more* evidence than a bare trend claim (section 15) — a
// trend needs 2 comparable points, but calling it a plateau (no change) needs
// enough repetition that the "no change" reading isn't just noise.
export const MIN_SESSIONS_FOR_PERFORMANCE_PLATEAU = 3;
export const MIN_MEASUREMENTS_FOR_OUTCOME_PLATEAU = 3;
export const PLATEAU_MIN_SPAN_DAYS = 14;

// A body-measurement change smaller than this (in percent) reads as noise,
// not a real trend, regardless of direction — body weight commonly
// fluctuates day to day by more than the scale's precision.
export const STABLE_PERCENT_THRESHOLD = 1;

// ── Behavioural ──────────────────────────────────────────────────────────────

export interface EligibleWorkout { id: string; date: string }
export interface HistoryOutcome { status: string; completionPercentage: number | null }

export function classifyWorkout(history: HistoryOutcome | undefined): WorkoutCompletionBucket {
  if (history?.status !== 'completed') return 'missed';
  const pct = history.completionPercentage ?? 0;
  if (pct >= COMPLETED_THRESHOLD_PCT) return 'completed';
  if (pct > 0) return 'partial';
  return 'missed';
}

/**
 * `eligibleWorkouts` must already be filtered to scheduled programme
 * workouts whose day has fully elapsed (date < today) — today's own workout
 * is deliberately excluded here (it's still being decided, and section 5
 * forbids counting a future/undecided day as missed). Sorted ascending by
 * date; `recentCompleted/recentPlanned` looks at the last RECENT_WINDOW only.
 *
 * Adherence rate uses the simpler of the two documented models (section 6,
 * Option A): a partial workout counts toward `partialWorkouts` for display,
 * but not toward the adherence numerator — "adherence" means the member
 * showed up and finished, an unambiguous yes/no per session.
 */
export function calculateBehaviouralProgress(
  eligibleWorkouts: EligibleWorkout[],
  historyByWorkoutId: Map<string, HistoryOutcome>,
  currentStreak: number,
): BehaviouralProgress {
  const sorted = [...eligibleWorkouts].sort((a, b) => a.date.localeCompare(b.date));
  const buckets = sorted.map(w => classifyWorkout(historyByWorkoutId.get(w.id)));

  const completedWorkouts = buckets.filter(b => b === 'completed').length;
  const partialWorkouts = buckets.filter(b => b === 'partial').length;
  const missedWorkouts = buckets.filter(b => b === 'missed').length;
  const plannedWorkouts = sorted.length;

  const recentBuckets = buckets.slice(-RECENT_WINDOW);
  const recentCompleted = recentBuckets.filter(b => b === 'completed').length;

  return {
    plannedWorkouts, completedWorkouts, partialWorkouts, missedWorkouts,
    adherenceRate: plannedWorkouts > 0 ? completedWorkouts / plannedWorkouts : null,
    recentCompleted, recentPlanned: recentBuckets.length, currentStreak,
  };
}

// ── Performance: strength exercises ─────────────────────────────────────────

export interface ExerciseSessionPerformance {
  date: string;
  topLoadKg: number | null;   // the heaviest logged set for this exercise in this session
  repsAtTopLoad: number | null;
}

/**
 * Compares the first vs latest of the given sessions (chronological). Needs
 * >= MIN_SESSIONS_FOR_EXERCISE_TREND comparable sessions to claim any
 * direction at all — never infers a trend from a single logged session.
 * `weight_reps` is used whenever either endpoint has a logged load (even a
 * bodyweight exercise occasionally logs an added-weight vest, etc.);
 * `reps_only` is for when neither ever had a load, tracking reps instead.
 */
export function calculateExerciseTrend(
  exerciseId: string, exerciseName: string, sessions: ExerciseSessionPerformance[],
): ExercisePerformanceTrend {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const metric: 'weight_reps' | 'reps_only' = sorted.some(s => s.topLoadKg != null) ? 'weight_reps' : 'reps_only';

  if (sorted.length < MIN_SESSIONS_FOR_EXERCISE_TREND) {
    return {
      exerciseId, exerciseName, metric, sessionsCompared: sorted.length,
      firstDate: sorted[0]?.date ?? '', latestDate: sorted[sorted.length - 1]?.date ?? '',
      firstLoadKg: null, latestLoadKg: null, firstReps: null, latestReps: null, direction: 'insufficient_data',
    };
  }

  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  let direction: TrendDirection;
  if (metric === 'weight_reps') {
    direction = first.topLoadKg == null || latest.topLoadKg == null ? 'insufficient_data'
      : latest.topLoadKg > first.topLoadKg ? 'increased'
      : latest.topLoadKg < first.topLoadKg ? 'decreased' : 'stable';
  } else {
    direction = first.repsAtTopLoad == null || latest.repsAtTopLoad == null ? 'insufficient_data'
      : latest.repsAtTopLoad > first.repsAtTopLoad ? 'increased'
      : latest.repsAtTopLoad < first.repsAtTopLoad ? 'decreased' : 'stable';
  }

  return {
    exerciseId, exerciseName, metric, sessionsCompared: sorted.length,
    firstDate: first.date, latestDate: latest.date,
    firstLoadKg: first.topLoadKg, latestLoadKg: latest.topLoadKg,
    firstReps: first.repsAtTopLoad, latestReps: latest.repsAtTopLoad, direction,
  };
}

// ── Performance: activity blocks (run/walk/mobility/recovery) ───────────────

/**
 * Deliberately duration/frequency only (section 9) — no pace or distance
 * claim is ever made because this codebase has no pace/distance data for
 * these blocks. `planned` must only count activity-block occurrences whose
 * day has elapsed, same eligibility rule as behavioural progress.
 */
export function calculateActivityTrend(
  workoutType: string, label: string, planned: number, completed: number, actualDurationsMinutes: number[],
): ActivityTrend {
  const direction: ActivityTrendDirection = planned < 2 ? 'insufficient_data' : (completed / planned >= 0.7 ? 'consistent' : 'inconsistent');
  const avgActualDurationMinutes = actualDurationsMinutes.length > 0
    ? Math.round(actualDurationsMinutes.reduce((a, b) => a + b, 0) / actualDurationsMinutes.length) : null;
  return { workoutType, label, plannedCount: planned, completedCount: completed, avgActualDurationMinutes, direction };
}

export interface RawSetLog { workoutHistoryId: string; exerciseId: string; weightKg: number | null; reps: number | null }

/**
 * Raw logged sets (one row per set) -> one ExerciseSessionPerformance per
 * (session, exercise) pair, keyed by exercise id. The "top load" set is the
 * heaviest logged set for that exercise in that session (a session's working
 * top set is a more stable signal than an average across warm-up/backoff
 * sets); reps-only exercises fall back to the set with the most reps.
 */
export function groupSetLogsBySessionAndExercise(
  logs: RawSetLog[], sessionDateByHistoryId: Map<string, string>,
): Map<string, ExerciseSessionPerformance[]> {
  const bySessionExercise = new Map<string, RawSetLog[]>();
  for (const log of logs) {
    const key = `${log.workoutHistoryId}::${log.exerciseId}`;
    if (!bySessionExercise.has(key)) bySessionExercise.set(key, []);
    bySessionExercise.get(key)!.push(log);
  }

  const result = new Map<string, ExerciseSessionPerformance[]>();
  for (const [key, setsInSession] of bySessionExercise) {
    const [historyId, exerciseId] = key.split('::');
    const date = sessionDateByHistoryId.get(historyId);
    if (!date) continue;

    let topLoadKg: number | null = null;
    let repsAtTopLoad: number | null = null;
    const withLoad = setsInSession.filter(s => s.weightKg != null);
    if (withLoad.length > 0) {
      const top = withLoad.reduce((a, b) => (b.weightKg! > a.weightKg! ? b : a));
      topLoadKg = top.weightKg;
      repsAtTopLoad = top.reps;
    } else {
      const withReps = setsInSession.filter(s => s.reps != null);
      if (withReps.length > 0) {
        const top = withReps.reduce((a, b) => (b.reps! > a.reps! ? b : a));
        repsAtTopLoad = top.reps;
      }
    }

    if (!result.has(exerciseId)) result.set(exerciseId, []);
    result.get(exerciseId)!.push({ date, topLoadKg, repsAtTopLoad });
  }
  return result;
}

// ── Outcomes ─────────────────────────────────────────────────────────────────

export interface MeasurementPoint { date: string; value: number }

/**
 * Prefers the measurement closest to (at or after) the programme start
 * date; if none exists on/after start, falls back to the closest one
 * logged before it (section 10's explicit fallback instruction) — always
 * documented via the returned point itself (its own `date` shows which rule fired).
 */
export function selectBaselineMeasurement(measurements: MeasurementPoint[], programStart: Date): MeasurementPoint | null {
  if (measurements.length === 0) return null;
  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const onOrAfterStart = sorted.filter(m => daysBetweenLocal(parseLocalDateOnly(m.date), programStart) <= 0);
  if (onOrAfterStart.length > 0) return onOrAfterStart[0];
  return sorted[sorted.length - 1];
}

/**
 * `baseline` should come from selectBaselineMeasurement; `latest` is always
 * the chronologically last measurement regardless of the programme window,
 * so outcome progress never goes stale just because the baseline logic
 * picked an older reference point.
 */
export function calculateMetricTrend(
  metric: string, allMeasurements: MeasurementPoint[], baseline: MeasurementPoint | null, today: Date,
): MetricTrend {
  const sorted = [...allMeasurements].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return { metric, baseline: null, baselineDate: null, latest: null, latestDate: null, absoluteChange: null, percentChange: null, direction: 'insufficient_data', isStale: false, measurementCount: 0 };
  }

  const latest = sorted[sorted.length - 1];
  const isStale = daysBetweenLocal(parseLocalDateOnly(latest.date), today) > STALE_MEASUREMENT_DAYS;

  if (sorted.length < MIN_MEASUREMENTS_FOR_OUTCOME_TREND || !baseline || baseline.date === latest.date) {
    return { metric, baseline: null, baselineDate: null, latest: latest.value, latestDate: latest.date, absoluteChange: null, percentChange: null, direction: 'insufficient_data', isStale, measurementCount: sorted.length };
  }

  const absoluteChange = latest.value - baseline.value;
  const percentChange = baseline.value !== 0 ? (absoluteChange / baseline.value) * 100 : null;
  const direction: OutcomeDirection = Math.abs(percentChange ?? 0) < STABLE_PERCENT_THRESHOLD
    ? 'stable' : absoluteChange < 0 ? 'down' : 'up';

  return {
    metric, baseline: baseline.value, baselineDate: baseline.date, latest: latest.value, latestDate: latest.date,
    absoluteChange, percentChange, direction, isStale, measurementCount: sorted.length,
  };
}
