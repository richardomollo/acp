// LANA PRO — CLIENT PROGRESS V1 (factual progress layer only).
//
// Answers "how is this client doing against their plan and goal?" from real,
// authorized data only. NO Lana Insights, NO coaching suggestions, NO
// narrative interpretation, NO generated observations — those are a later
// task. Every number here is a direct, explained computation over rows the
// logged-in professional is genuinely allowed to see.
//
// PRIVACY (identical discipline to lib/lana-pro-intelligence/aggregator.ts):
//   • Relationship is resolved FIRST (pt_clients | gym_trainer_clients).
//   • consented = status === 'active' && share_progress === true.
//   • Consent-gated tables (fitness_profile, client_measurements,
//     workout_history, workouts) are queried ONLY inside `if (consented)` —
//     never fetched-then-filtered.
//   • NEVER queried, any consent state: plan_activity_completions,
//     plan_activity_execution, health_*, coaching_memory, fitness_plans,
//     meal_plans, saved_meals, nutrition internals.
//   • The "plan" for a Lana Pro client is what THIS professional scheduled
//     (workout_schedules.assigned_by) — NOT the consumer AI plan
//     (plan_activity_completions), which the Phase-6 inspection confirmed is
//     not professionally visible.
//
// The DB dependency is the same tiny structural interface the aggregator
// uses, so this module is fully unit-tested with a fake (node --test).

import type { SupabaseLike } from '../lana-pro-intelligence/aggregator.ts';
import { addDays, relationshipWeeks } from '../lana-pro-intelligence/signals.ts';
import { humanGoal, humaniseLevel } from '../lana-pro-intelligence/labels.ts';

export interface ProgressContext {
  workspace: 'independent' | 'employed';
  /** personal_trainers.id (independent) OR gym_trainers.id (employed) */
  professionalId: string;
  clientUserId: string;
  /** canonical local calendar date, 'YYYY-MM-DD' (page passes the request's today) */
  todayLocalDate: string;
}

// ── the V1 contract ───────────────────────────────────────────────────────

export interface ClientProgressV1 {
  /**
   *  'no_relationship' — this professional does not coach this client.
   *  'not_shared'      — active relationship, but the client hasn't shared
   *                      progress: only the header + the count of sessions
   *                      THIS professional scheduled is available.
   *  'ok'              — consented; the full factual picture.
   */
  state: 'no_relationship' | 'not_shared' | 'ok';
  client: {
    name: string;
    goalLabel: string | null;
    experienceLevel: string | null;
    /** pt_clients / gym_trainer_clients status — factual header context */
    relationshipStatus: 'active' | 'inactive' | 'none';
    /** whole weeks since the relationship was created; null when < 1 week */
    relationshipWeeks: number | null;
  };
  /** the professional's own next booking with this client — a fact, not
   *  consent-gated (the professional made it). null when none upcoming. */
  nextSession: { atIso: string; serviceName: string | null } | null;
  /** null until consented and a fitness_profile row exists */
  goal: GoalProgress | null;
  /** null until consented; `points` is empty when there is < 2 real weigh-ins */
  bodyProgress: BodyProgress | null;
  /** always present: `planned` is known without consent; the rest is null
   *  until consented */
  trainingProgress: TrainingProgress;
  /**
   * FACT LAYER ONLY — the client's own verbatim workout comments, newest
   * first. Consented only; [] when the client has never left feedback (or is
   * not sharing). This is EVIDENCE: it is never summarised, scored, classified
   * or interpreted here. Lana's derived signals and any coaching suggestion
   * are separate, later layers (see the report's §K).
   */
  workoutFeedback: WorkoutFeedbackItem[];
  /** consented only; newest first; [] when nothing is proven */
  recentActivity: ActivityEvent[];
  /** consented only; null when there is no proven activity at all */
  lastActive: { date: string; source: LastActiveSource } | null;
  /**
   * FACT LAYER — planned dated occurrences vs actual completions over the most
   * recent whole, elapsed weeks. Consented only (completion evidence is
   * `share_progress`-gated); null when not shared or there is nothing to
   * compare. Counts only — the "consistency has dropped" judgement is a later
   * layer (L3/L4), never here.
   */
  adherence: AdherenceFacts | null;
}

export interface GoalProgress {
  /** fitness_profile.initial_weight_kg (frozen first weigh-in) ?? starting_weight_kg */
  startingWeightKg: number | null;
  /** latest client_measurements.weight_kg if any, else fitness_profile.starting_weight_kg */
  currentWeightKg: number | null;
  currentWeightSource: 'measurement' | 'profile' | null;
  goalWeightKg: number | null;
  /** fitness_profile.goal_target_date ('YYYY-MM-DD') */
  targetDate: string | null;
  /** currentWeightKg - startingWeightKg, 1 dp; null if either side unknown */
  changeSinceStartKg: number | null;
  /** goalWeightKg - currentWeightKg, 1 dp; null if either side unknown */
  toGoalKg: number | null;
}

export interface BodyProgress {
  hasHistory: boolean; // >= 2 real weigh-ins
  /** ascending by date; one point per weigh-in that has a numeric weight */
  points: { date: string; weightKg: number }[];
}

export interface TrainingSession {
  date: string; // 'YYYY-MM-DD'
  workoutTitle: string;
  /**
   *  completed — a completion exists (trainer: workout_history match; lana:
   *              the consumer app's authoritative completion via the RPC)
   *  missed    — past date, no completion
   *  upcoming  — today or later, no completion
   */
  status: 'completed' | 'missed' | 'upcoming';
  /** where the occurrence came from — a fact, preserved end-to-end */
  source: 'trainer_plan' | 'lana_plan';
}

export interface TrainingProgress {
  weekStart: string; // Monday, 'YYYY-MM-DD'
  weekEnd: string; // Sunday
  /** count of workout_schedules occurrences (assigned by THIS professional)
   *  that fall in [weekStart, weekEnd], on/after each schedule's start_date */
  planned: number;
  /** occurrences with a matching workout_history completion — null w/o consent */
  completed: number | null;
  /** occurrences whose date < today AND no completion — null w/o consent.
   *  Today's not-yet-done session is NOT missed. */
  missed: number | null;
  /** occurrences whose date >= today AND no completion — null w/o consent */
  upcoming: number | null;
  /** round(completed / planned * 100); null when planned === 0 or no consent */
  adherencePct: number | null;
  /** per-occurrence detail, ascending by date — [] w/o consent */
  sessions: TrainingSession[];
}

/**
 * One verbatim workout comment. `comment` is the client's exact text — never
 * rewritten, trimmed only of surrounding whitespace. A session-level note
 * (workout_history.notes) has `scope:'session'`; a per-exercise note
 * (workout_history.exercise_notes[exerciseId]) has `scope:'exercise'` and, when
 * the exercise id resolves, `exerciseName`.
 */
export interface WorkoutFeedbackItem {
  /** stable synthetic id: `<workout_history.id>` (session) or
   *  `<workout_history.id>:<exercise_id>` (exercise) */
  id: string;
  scope: 'session' | 'exercise';
  /** the client's exact words */
  comment: string;
  workoutId: string;
  workoutTitle: string;
  /** workouts.category verbatim (e.g. 'full_body', 'push', 'upper_body') — the
   *  canonical structured category. Absent when the workouts row has none;
   *  NEVER inferred from the title or the comment. */
  workoutCategory?: string;
  /** present + resolved only for a per-exercise note whose id is a real exercise */
  exerciseId?: string;
  exerciseName?: string;
  /** local date ('YYYY-MM-DD') of the session this feedback is about
   *  (workout_history.completed_at) */
  scheduledDate: string;
  /** best available submission time — notes are persisted at session finish,
   *  so this is workout_history.completed_at (ISO). No independent per-comment
   *  timestamp is stored today. */
  submittedAt: string;
  /** factual completion context of the same session — never interpreted */
  completionContext: {
    status: string; // 'completed' | 'abandoned' | 'in_progress'
    completionPercentage: number | null;
    perceivedDifficulty: 'easy' | 'about_right' | 'difficult' | null;
  };
}

export type LastActiveSource = 'workout' | 'measurement' | 'session';

export interface ActivityEvent {
  date: string; // 'YYYY-MM-DD'
  label: string;
  kind: 'workout' | 'measurement' | 'session';
}

// ─────────────────────────────────────────────────────────────────────────
// pure computation (each function is independently tested)
// ─────────────────────────────────────────────────────────────────────────

/** Monday..Sunday calendar week containing `todayLocalDate`. Calendar-only
 *  string arithmetic (reuses the module's established `addDays`) — never a
 *  timezone-shifting `new Date(iso).toISOString()`. */
export function weekBounds(todayLocalDate: string): { weekStart: string; weekEnd: string } {
  const t = Date.parse(`${todayLocalDate}T00:00:00Z`);
  const dowMon0 = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = addDays(todayLocalDate, -dowMon0);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export interface ScheduleRow {
  workout_id: string;
  start_date: string; // 'YYYY-MM-DD'
  recurrence: 'once' | 'daily' | 'weekly' | string;
  weekdays: number[] | null; // 0 = Sun .. 6 = Sat
  is_active?: boolean | null;
}

/**
 * The dates in [weekStart, weekEnd] on which `schedule` fires. Mirrors the
 * mobile Fitness-tab rule (lib/fitness-empty-state.scheduleOccursOnDate):
 *   once   → start_date, if it is inside the window
 *   daily  → every date in the window that is >= start_date
 *   weekly → every date in the window that is >= start_date AND whose weekday
 *            is listed in `weekdays`
 * A schedule never fires before its own start_date (LH-30: no session dated
 * before the plan's effective start).
 */
export function scheduleOccurrencesInWeek(
  schedule: ScheduleRow,
  weekStart: string,
  weekEnd: string,
): string[] {
  if (schedule.is_active === false) return [];
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    if (date > weekEnd) break;
    if (date < schedule.start_date) continue;
    if (schedule.recurrence === 'once') {
      if (date === schedule.start_date) out.push(date);
      continue;
    }
    if (schedule.recurrence === 'daily') {
      out.push(date);
      continue;
    }
    if (schedule.recurrence === 'weekly') {
      const dow = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay(); // 0 = Sun
      if ((schedule.weekdays ?? []).includes(dow)) out.push(date);
    }
  }
  return out;
}

/**
 * The dates in [rangeStart, rangeEnd] on which `schedule` fires. Same rule as
 * `scheduleOccurrencesInWeek`, generalised to an arbitrary (bounded) span —
 * calendar-string arithmetic only, never a timezone-shifting Date. Used by the
 * adherence facts, which compare multiple whole weeks.
 */
export function scheduleOccurrencesInRange(
  schedule: ScheduleRow,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (schedule.is_active === false) return [];
  if (rangeEnd < rangeStart) return [];
  const out: string[] = [];
  for (let i = 0; i < 400; i += 1) {
    const date = addDays(rangeStart, i);
    if (date > rangeEnd) break;
    if (date < schedule.start_date) continue;
    if (schedule.recurrence === 'once') {
      if (date === schedule.start_date) out.push(date);
      continue;
    }
    if (schedule.recurrence === 'daily') {
      out.push(date);
      continue;
    }
    if (schedule.recurrence === 'weekly') {
      const dow = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay(); // 0 = Sun
      if ((schedule.weekdays ?? []).includes(dow)) out.push(date);
    }
  }
  return out;
}

/**
 * completed  — there is completion evidence for this occurrence
 * missed     — the occurrence's date is strictly before today AND no evidence
 * upcoming   — today or later AND no evidence  (a not-yet-done session TODAY
 *              is "upcoming", never "missed")
 */
export function classifyOccurrence(
  occurrenceDate: string,
  todayLocalDate: string,
  hasCompletion: boolean,
): TrainingSession['status'] {
  if (hasCompletion) return 'completed';
  return occurrenceDate < todayLocalDate ? 'missed' : 'upcoming';
}

/**
 * A `lana_plan` occurrence's completion is AUTHORITATIVE (from the consumer
 * app via `lana_pro_shared_plan_occurrences`), so it classifies exactly like a
 * trainer occurrence — `classifyOccurrence` is reused directly.
 */

// ── consumer Lana plan — the shared occurrence, from the RPC ────────────────

/** One dated Lana-plan occurrence for a client, as the shared projection
 *  returns it. Completion is the consumer app's authoritative state. */
export interface SharedLanaPlanOccurrence {
  date: string; // 'YYYY-MM-DD', canonical local
  title: string;
  category: string | null;
  durationMinutes: number | null;
  completed: boolean;
}

/** round(completed / planned * 100); null when there is nothing to divide by. */
export function adherencePct(completed: number, planned: number): number | null {
  if (!Number.isFinite(planned) || planned <= 0) return null;
  const c = Math.max(0, Math.min(completed, planned));
  return Math.round((c / planned) * 100);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface WeightInputs {
  /** fitness_profile.initial_weight_kg */
  initialWeightKg: number | null;
  /** fitness_profile.starting_weight_kg (this is the profile "current" field —
   *  used only when there is no measurement) */
  profileWeightKg: number | null;
  goalWeightKg: number | null;
  targetDate: string | null;
  /** client_measurements, most-recent-first, weight may be null on a row */
  measurements: { weightKg: number | null; loggedDate: string }[];
}

export function computeGoalProgress(w: WeightInputs): GoalProgress {
  // The latest weigh-in by DATE (not by array position) — robust to whatever
  // order the caller passed the rows in.
  const latestMeasured = w.measurements
    .filter((m): m is { weightKg: number; loggedDate: string } => Number.isFinite(m.weightKg))
    .sort((a, b) => b.loggedDate.localeCompare(a.loggedDate))[0]?.weightKg ?? null;
  const currentWeightKg = latestMeasured != null ? latestMeasured : w.profileWeightKg;
  const currentWeightSource: GoalProgress['currentWeightSource'] =
    latestMeasured != null ? 'measurement' : w.profileWeightKg != null ? 'profile' : null;

  const startingWeightKg = w.initialWeightKg != null ? w.initialWeightKg : w.profileWeightKg;

  const changeSinceStartKg =
    currentWeightKg != null && startingWeightKg != null ? round1(currentWeightKg - startingWeightKg) : null;
  const toGoalKg =
    currentWeightKg != null && w.goalWeightKg != null ? round1(w.goalWeightKg - currentWeightKg) : null;

  return {
    startingWeightKg,
    currentWeightKg,
    currentWeightSource,
    goalWeightKg: w.goalWeightKg,
    targetDate: w.targetDate,
    changeSinceStartKg,
    toGoalKg,
  };
}

/** Ascending weigh-in points; `hasHistory` only when there are >= 2 of them
 *  (never draw a "trend" from a single dot — §5). */
export function computeBodyProgress(
  measurements: { weightKg: number | null; loggedDate: string }[],
): BodyProgress {
  const points = measurements
    .filter((m): m is { weightKg: number; loggedDate: string } => Number.isFinite(m.weightKg))
    .map((m) => ({ date: m.loggedDate, weightKg: m.weightKg }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { hasHistory: points.length >= 2, points };
}

/** Merge proven client events into one newest-first feed. */
export function buildRecentActivity(
  args: {
    workoutCompletions: { date: string; title: string }[];
    measurements: { date: string; weightKg: number | null }[];
    proSessions: { date: string; title: string }[];
  },
  limit = 12,
): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...args.workoutCompletions.map((w) => ({ date: w.date, label: `${w.title} completed`, kind: 'workout' as const })),
    ...args.proSessions.map((s) => ({ date: s.date, label: `${s.title} session completed`, kind: 'session' as const })),
    ...args.measurements.map((m) => ({
      date: m.date,
      label: m.weightKg != null ? `Weight updated to ${round1(m.weightKg)} kg` : 'Measurement updated',
      kind: 'measurement' as const,
    })),
  ];
  events.sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)));
  return events.slice(0, limit);
}

// ── workout feedback (verbatim; NO interpretation) ───────────────────────

export interface WorkoutHistoryFeedbackRow {
  id: string;
  workout_id: string;
  completed_at: string | null;
  status: string | null;
  completion_percentage: number | null;
  /** workout_history.notes — one whole-session comment */
  notes: string | null;
  /** workout_history.exercise_notes — { [exerciseId]: comment } */
  exercise_notes: Record<string, unknown> | null;
  perceived_difficulty: 'easy' | 'about_right' | 'difficult' | string | null;
}

/**
 * Flattens completed workout_history rows into verbatim `WorkoutFeedbackItem`s,
 * newest first. The comment text is passed through untouched (whitespace-trim
 * only). Exercise ids that don't resolve in `exerciseNameById` are still shown
 * as an exercise-scoped note, just without a name — never dropped, never
 * guessed.
 */
export function buildWorkoutFeedback(
  rows: WorkoutHistoryFeedbackRow[],
  titleById: Map<string, string>,
  exerciseNameById: Map<string, string>,
  categoryById: Map<string, string> = new Map(),
  limit = 15,
): WorkoutFeedbackItem[] {
  const items: WorkoutFeedbackItem[] = [];
  for (const r of rows) {
    if (!r.completed_at) continue;
    const scheduledDate = r.completed_at.slice(0, 10);
    const ctx = {
      status: String(r.status ?? 'completed'),
      completionPercentage: Number.isFinite(Number(r.completion_percentage)) ? Number(r.completion_percentage) : null,
      perceivedDifficulty: (['easy', 'about_right', 'difficult'] as const).includes(r.perceived_difficulty as never)
        ? (r.perceived_difficulty as 'easy' | 'about_right' | 'difficult')
        : null,
    };
    const category = categoryById.get(r.workout_id);
    const base = {
      workoutId: r.workout_id,
      workoutTitle: titleById.get(r.workout_id) ?? 'Workout',
      ...(category ? { workoutCategory: category } : {}),
      scheduledDate,
      submittedAt: r.completed_at,
      completionContext: ctx,
    };

    const sessionNote = typeof r.notes === 'string' ? r.notes.trim() : '';
    if (sessionNote) {
      items.push({ id: r.id, scope: 'session', comment: sessionNote, ...base });
    }

    const exNotes = r.exercise_notes && typeof r.exercise_notes === 'object' ? r.exercise_notes : {};
    for (const [exerciseId, raw] of Object.entries(exNotes)) {
      const comment = typeof raw === 'string' ? raw.trim() : '';
      if (!comment) continue;
      const exerciseName = exerciseNameById.get(exerciseId);
      items.push({
        id: `${r.id}:${exerciseId}`,
        scope: 'exercise',
        comment,
        exerciseId,
        ...(exerciseName ? { exerciseName } : {}),
        ...base,
      });
    }
  }
  items.sort((a, b) => {
    if (a.submittedAt !== b.submittedAt) return b.submittedAt.localeCompare(a.submittedAt);
    if (a.scope !== b.scope) return a.scope === 'session' ? -1 : 1;
    return (a.exerciseName ?? a.exerciseId ?? '').localeCompare(b.exerciseName ?? b.exerciseId ?? '');
  });
  return items.slice(0, limit);
}

/** Latest proven activity date across the reliable client signals. */
export function resolveLastActive(dates: {
  lastWorkoutDate: string | null;
  lastMeasurementDate: string | null;
  lastProSessionDate: string | null;
}): { date: string; source: LastActiveSource } | null {
  const candidates: { date: string; source: LastActiveSource }[] = [];
  if (dates.lastWorkoutDate) candidates.push({ date: dates.lastWorkoutDate, source: 'workout' });
  if (dates.lastMeasurementDate) candidates.push({ date: dates.lastMeasurementDate, source: 'measurement' });
  if (dates.lastProSessionDate) candidates.push({ date: dates.lastProSessionDate, source: 'session' });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  return candidates[0];
}

// ─────────────────────────────────────────────────────────────────────────
// ADHERENCE FACTS (L1) — planned dated occurrences vs actual completions over
// the most recent WHOLE, ELAPSED weeks. Facts only: counts + the dated
// occurrence spine. No judgement, no threshold, no "why" (see the report §H).
// ─────────────────────────────────────────────────────────────────────────

/** The most recent fully-elapsed ISO week is `recent`; the two ISO weeks
 *  before it are `baseline`. Only whole past weeks — never today, never a
 *  partial current week (§4). */
const ADHERENCE_RECENT_WEEKS = 1;
const ADHERENCE_BASELINE_WEEKS = 2;
/** a completion up to this many days after a planned occurrence still credits
 *  it — captures a session moved by a day or two. The data model has no
 *  occurrence↔completion link, so this is a bounded heuristic on the SAME
 *  workout_id, never on title (see the report §E). */
export const ADHERENCE_RESCHEDULE_GRACE_DAYS = 2;

export interface AdherenceOccurrence {
  date: string; // 'YYYY-MM-DD' — canonical local calendar date
  workoutId: string;
  workoutTitle: string;
  /** every occurrence in an elapsed period resolves to exactly one of these */
  status: 'completed' | 'missed';
  period: 'recent' | 'baseline';
  /** where the occurrence came from */
  source: 'trainer_plan' | 'lana_plan';
  /** workout_history.id that satisfied it (present iff completed, trainer only) */
  completionId?: string;
}

export interface AdherencePeriod {
  start: string;
  end: string;
  scheduled: number;
  completed: number;
  missed: number;
  /** completed / scheduled, 2 dp; null when nothing was scheduled */
  rate: number | null;
}

export interface AdherenceFacts {
  recent: AdherencePeriod;
  baseline: AdherencePeriod;
  /** every dated occurrence used in the two periods, ascending — the
   *  traceability spine for L4's "why Lana noticed this" (§8/§20) */
  occurrences: AdherenceOccurrence[];
}

export interface AdherenceInputs {
  schedules: ScheduleRow[];
  /** completed workout_history rows within (at least) the lookback window */
  completions: { id: string; workoutId: string; date: string }[];
  titleById: Map<string, string>;
  todayLocalDate: string;
  /**
   * The client's Lana-generated plan occurrences over (at least) the lookback
   * window, from `lana_pro_shared_plan_occurrences` — completion is
   * AUTHORITATIVE (§20). Already dated; no matching needed. Optional.
   */
  lanaOccurrences?: readonly SharedLanaPlanOccurrence[];
}

/**
 * PURE. Projects the PT's `workout_schedules` AND the client's Lana-generated
 * plan onto the recent + baseline weeks. Trainer occurrences match
 * `workout_history` completions (exact date first, then a ≤GRACE-day slip on
 * the same workout_id); Lana occurrences carry an authoritative `completed`
 * boolean. Returns null when there is NOTHING to compare — the L3 detector
 * decides whether there is ENOUGH to compare (thresholds unchanged, §21).
 */
export function computeAdherenceFacts(inp: AdherenceInputs): AdherenceFacts | null {
  const { schedules, completions, titleById, todayLocalDate } = inp;
  const lanaOccurrences = inp.lanaOccurrences ?? [];
  const { weekStart: thisWeekStart } = weekBounds(todayLocalDate);
  const recentEnd = addDays(thisWeekStart, -1); // last Sunday
  const recentStart = addDays(recentEnd, -(7 * ADHERENCE_RECENT_WEEKS - 1));
  const baselineEnd = addDays(recentStart, -1);
  const baselineStart = addDays(baselineEnd, -(7 * ADHERENCE_BASELINE_WEEKS - 1));
  const periodOf = (date: string): 'recent' | 'baseline' | null => {
    if (date >= recentStart && date <= recentEnd) return 'recent';
    if (date >= baselineStart && date <= baselineEnd) return 'baseline';
    return null;
  };

  const project = (start: string, end: string, period: 'recent' | 'baseline') =>
    schedules.flatMap((s) =>
      scheduleOccurrencesInRange(s, start, end).map((date) => ({
        date,
        workoutId: s.workout_id,
        workoutTitle: titleById.get(s.workout_id) ?? 'Scheduled workout',
        period,
        source: 'trainer_plan' as const,
      })),
    );

  const raw = [
    ...project(baselineStart, baselineEnd, 'baseline'),
    ...project(recentStart, recentEnd, 'recent'),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));

  // Lana occurrences that fall in an elapsed period — completion is authoritative
  const lanaInPeriod = lanaOccurrences
    .map((o) => ({ o, period: periodOf(o.date) }))
    .filter((x): x is { o: SharedLanaPlanOccurrence; period: 'recent' | 'baseline' } => x.period !== null);

  if (raw.length === 0 && lanaInPeriod.length === 0) return null;

  // completions per workout, date-ascending, each consumed at most once
  const queue = new Map<string, { id: string; date: string }[]>();
  for (const c of [...completions].sort((a, b) => a.date.localeCompare(b.date))) {
    (queue.get(c.workoutId) ?? queue.set(c.workoutId, []).get(c.workoutId)!).push({ id: c.id, date: c.date });
  }
  const take = (workoutId: string, pred: (d: string) => boolean): string | null => {
    const q = queue.get(workoutId);
    if (!q) return null;
    const idx = q.findIndex((c) => pred(c.date));
    if (idx < 0) return null;
    return q.splice(idx, 1)[0].id;
  };

  const occurrences: AdherenceOccurrence[] = raw.map((o) => ({ ...o, status: 'missed' as const }));
  // pass 1 — exact date
  for (const o of occurrences) {
    const hit = take(o.workoutId, (d) => d === o.date);
    if (hit) {
      o.status = 'completed';
      o.completionId = hit;
    }
  }
  // pass 2 — a ≤GRACE-day slip, earliest occurrence first
  for (const o of occurrences) {
    if (o.status === 'completed') continue;
    const limit = addDays(o.date, ADHERENCE_RESCHEDULE_GRACE_DAYS);
    const hit = take(o.workoutId, (d) => d > o.date && d <= limit);
    if (hit) {
      o.status = 'completed';
      o.completionId = hit;
    }
  }
  // Lana occurrences — authoritative completion, one plan_activity_completion
  // → one occurrence already (the RPC's boolean is per occurrence). No
  // cross-source dedup: identity between a Lana activity and a trainer
  // schedule can't be established, so both are kept (§19/§39).
  for (const { o, period } of lanaInPeriod) {
    occurrences.push({
      date: o.date,
      workoutId: `lana:${o.date}:${o.title}`,
      workoutTitle: o.title,
      status: o.completed ? 'completed' : 'missed',
      period,
      source: 'lana_plan',
    });
  }
  occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));

  const periodStat = (period: 'recent' | 'baseline', start: string, end: string): AdherencePeriod => {
    const os = occurrences.filter((o) => o.period === period);
    const completed = os.filter((o) => o.status === 'completed').length;
    return {
      start,
      end,
      scheduled: os.length,
      completed,
      missed: os.length - completed,
      rate: os.length > 0 ? Math.round((completed / os.length) * 100) / 100 : null,
    };
  };

  return {
    recent: periodStat('recent', recentStart, recentEnd),
    baseline: periodStat('baseline', baselineStart, baselineEnd),
    occurrences,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// DB orchestration — consent-aware, bounded, parallel where possible
// ─────────────────────────────────────────────────────────────────────────

const RECENT_ACTIVITY_DAYS = 28;
const MEASUREMENT_LOOKBACK = 30; // rows

type Row = Record<string, unknown>;
const iso10 = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function buildClientProgress(
  db: SupabaseLike,
  ctx: ProgressContext,
  /**
   * The client's Lana-generated plan occurrences (planned + AUTHORITATIVE
   * completion) over AT LEAST [adherence baseline start .. this week's end],
   * fetched by the caller via `getSharedLanaPlanOccurrences` (the one RPC
   * access boundary). Empty when the client has no Lana plan, or when not
   * consented (the RPC returns nothing), or before the RPC is deployed.
   */
  sharedLanaOccurrences: readonly SharedLanaPlanOccurrence[] = [],
): Promise<ClientProgressV1> {
  const isEmployed = ctx.workspace === 'employed';
  const relTable = isEmployed ? 'gym_trainer_clients' : 'pt_clients';
  const proCol = isEmployed ? 'gym_trainer_id' : 'pt_id';
  const scheduleAssignedCol = 'assigned_by'; // personal_trainers.id — employed scheduling isn't modelled yet

  const emptyTraining = (): TrainingProgress => {
    const { weekStart, weekEnd } = weekBounds(ctx.todayLocalDate);
    return {
      weekStart,
      weekEnd,
      planned: 0,
      completed: null,
      missed: null,
      upcoming: null,
      adherencePct: null,
      sessions: [],
    };
  };

  // ── 1. RELATIONSHIP FIRST ──
  const { data: relRaw } = await db
    .from(relTable)
    .select('status, share_progress, created_at')
    .eq(proCol, ctx.professionalId)
    .eq('client_user_id', ctx.clientUserId)
    .maybeSingle();
  const rel = relRaw as { status: string | null; share_progress: boolean | null; created_at: string | null } | null;
  if (!rel) {
    return {
      state: 'no_relationship',
      client: { name: 'Client', goalLabel: null, experienceLevel: null, relationshipStatus: 'none', relationshipWeeks: null },
      nextSession: null,
      goal: null,
      bodyProgress: null,
      trainingProgress: emptyTraining(),
      workoutFeedback: [],
      recentActivity: [],
      lastActive: null,
      adherence: null,
    };
  }
  const consented = rel.status === 'active' && rel.share_progress === true;
  const relationshipStatus: 'active' | 'inactive' | 'none' = rel.status === 'active' || rel.status === 'inactive' ? rel.status : 'none';
  const relWeeks = relationshipWeeks(rel.created_at, ctx.todayLocalDate);

  // ── 2. NON-GATED: client name + the schedules + the next booking THIS
  //    professional set (all PT-owned — never consent-gated). ──
  const [{ data: userRaw }, { data: schedRaw }, { data: nextBookingRaw }] = await Promise.all([
    db.from('users').select('name, email').eq('id', ctx.clientUserId).maybeSingle(),
    // workout_schedules RLS "Trainers view schedules they created" is NOT
    // consent-gated — a professional always sees what they themselves planned.
    db
      .from('workout_schedules')
      .select('workout_id, start_date, recurrence, weekdays, is_active')
      .eq(scheduleAssignedCol, ctx.professionalId)
      .eq('user_id', ctx.clientUserId)
      .eq('is_active', true)
      .limit(100),
    isEmployed
      ? db
          .from('gym_service_bookings')
          .select('starts_at, gym_services(name)')
          .eq('gym_trainer_id', ctx.professionalId)
          .eq('client_user_id', ctx.clientUserId)
          .in('status', ['pending', 'confirmed'])
          .gte('starts_at', `${ctx.todayLocalDate}T00:00:00`)
          .order('starts_at', { ascending: true })
          .limit(1)
      : db
          .from('pt_bookings')
          .select('scheduled_date, scheduled_time, pt_offerings(title)')
          .eq('pt_id', ctx.professionalId)
          .eq('user_id', ctx.clientUserId)
          .in('status', ['pending', 'confirmed'])
          .gte('scheduled_date', ctx.todayLocalDate)
          .order('scheduled_date', { ascending: true })
          .order('scheduled_time', { ascending: true })
          .limit(1),
  ]);
  const u = userRaw as { name: string | null; email: string | null } | null;
  const name = (u?.name || u?.email || 'Client').trim();

  const nextSession = ((): ClientProgressV1['nextSession'] => {
    const row = (nextBookingRaw as Row[] | null)?.[0];
    if (!row) return null;
    if (isEmployed) {
      if (!row.starts_at) return null;
      const svc = Array.isArray(row.gym_services) ? row.gym_services[0] : row.gym_services;
      return { atIso: String(row.starts_at), serviceName: (svc as { name?: string | null } | null)?.name ?? null };
    }
    if (!row.scheduled_date) return null;
    const off = Array.isArray(row.pt_offerings) ? row.pt_offerings[0] : row.pt_offerings;
    const time = String(row.scheduled_time ?? '00:00').slice(0, 5);
    return { atIso: `${row.scheduled_date}T${time}:00`, serviceName: (off as { title?: string | null } | null)?.title ?? null };
  })();

  const { weekStart, weekEnd } = weekBounds(ctx.todayLocalDate);
  const schedules = ((schedRaw as Row[] | null) ?? []).map((r): ScheduleRow => ({
    workout_id: String(r.workout_id),
    start_date: iso10(r.start_date) ?? '9999-12-31',
    recurrence: String(r.recurrence ?? 'once'),
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [],
    is_active: r.is_active !== false,
  }));

  // { workoutId, date } for every scheduled occurrence this week
  const occ: { workoutId: string; date: string }[] = [];
  for (const s of schedules) {
    for (const d of scheduleOccurrencesInWeek(s, weekStart, weekEnd)) occ.push({ workoutId: s.workout_id, date: d });
  }
  const planned = occ.length;

  if (!consented) {
    return {
      state: 'not_shared',
      client: { name, goalLabel: null, experienceLevel: null, relationshipStatus, relationshipWeeks: relWeeks },
      nextSession,
      goal: null,
      bodyProgress: null,
      trainingProgress: { weekStart, weekEnd, planned, completed: null, missed: null, upcoming: null, adherencePct: null, sessions: [] },
      workoutFeedback: [],
      recentActivity: [],
      lastActive: null,
      adherence: null,
    };
  }

  // ── 3. CONSENT-GATED evidence — ONLY reached when consented ──
  const activitySince = addDays(ctx.todayLocalDate, -RECENT_ACTIVITY_DAYS);
  const workoutIds = Array.from(new Set(occ.map((o) => o.workoutId)));

  const [
    { data: fpRaw },
    { data: measRaw },
    { data: titleRaw },
    { data: histRaw },
    { data: recentHistRaw },
    { data: sessRaw },
  ] = await Promise.all([
    db
      .from('fitness_profile')
      .select('goal, experience_level, initial_weight_kg, starting_weight_kg, goal_weight_kg, goal_target_date')
      .eq('user_id', ctx.clientUserId)
      .maybeSingle(),
    db
      .from('client_measurements')
      .select('weight_kg, logged_at')
      .eq('user_id', ctx.clientUserId)
      .order('logged_at', { ascending: false })
      .limit(MEASUREMENT_LOOKBACK),
    workoutIds.length > 0
      ? db.from('workouts').select('id, title, category').in('id', workoutIds).limit(workoutIds.length)
      : Promise.resolve({ data: [] as Row[], error: null }),
    // completions that match THIS week's scheduled occurrences
    workoutIds.length > 0
      ? db
          .from('workout_history')
          .select('workout_id, completed_at')
          .eq('user_id', ctx.clientUserId)
          .eq('status', 'completed')
          .in('workout_id', workoutIds)
          .limit(200)
      : Promise.resolve({ data: [] as Row[], error: null }),
    // recent completions of ANY workout — powers the activity feed,
    // last-active AND the verbatim workout-feedback list (notes/exercise_notes
    // ride along on the same bounded read; no per-workout query).
    db
      .from('workout_history')
      .select('id, workout_id, completed_at, status, completion_percentage, perceived_difficulty, notes, exercise_notes')
      .eq('user_id', ctx.clientUserId)
      .eq('status', 'completed')
      .gte('completed_at', `${activitySince}T00:00:00Z`)
      .order('completed_at', { ascending: false })
      .limit(50),
    db
      .from('professional_session_records')
      .select('service_type, completed_at')
      .eq('personal_trainer_id', ctx.professionalId)
      .eq('client_user_id', ctx.clientUserId)
      .eq('session_status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20),
  ]);

  const fp = fpRaw as {
    goal: string | null;
    experience_level: string | null;
    initial_weight_kg: number | string | null;
    starting_weight_kg: number | string | null;
    goal_weight_kg: number | string | null;
    goal_target_date: string | null;
  } | null;

  const measurements = ((measRaw as Row[] | null) ?? [])
    .map((r) => ({ weightKg: num(r.weight_kg), loggedDate: iso10(r.logged_at) }))
    .filter((m): m is { weightKg: number | null; loggedDate: string } => m.loggedDate != null);

  const titleById = new Map<string, string>(
    ((titleRaw as Row[] | null) ?? []).map((r) => [String(r.id), String(r.title ?? 'Workout')]),
  );
  const categoryById = new Map<string, string>();
  for (const r of (titleRaw as Row[] | null) ?? []) {
    const c = typeof r.category === 'string' ? r.category.trim() : '';
    if (c) categoryById.set(String(r.id), c);
  }

  // Rows from the recent-completions read that carry a verbatim comment.
  const feedbackRows = ((recentHistRaw as Row[] | null) ?? [])
    .map((r): WorkoutHistoryFeedbackRow => ({
      id: String(r.id),
      workout_id: String(r.workout_id),
      completed_at: iso10(r.completed_at) ? String(r.completed_at) : null,
      status: (r.status as string | null) ?? null,
      completion_percentage: num(r.completion_percentage),
      notes: typeof r.notes === 'string' ? r.notes : null,
      exercise_notes: r.exercise_notes && typeof r.exercise_notes === 'object' ? (r.exercise_notes as Record<string, unknown>) : null,
      perceived_difficulty: (r.perceived_difficulty as string | null) ?? null,
    }))
    .filter((r) => (r.notes && r.notes.trim()) || (r.exercise_notes && Object.values(r.exercise_notes).some((v) => typeof v === 'string' && v.trim())));

  // ── one bounded follow-up read: titles for any feedback/recent workout not
  //    already known + names for the exercises referenced in exercise_notes ──
  const feedbackWorkoutIds = feedbackRows.map((r) => r.workout_id);
  const recentWorkoutIds = ((recentHistRaw as Row[] | null) ?? []).map((r) => String(r.workout_id));
  const missingTitleIds = Array.from(new Set([...feedbackWorkoutIds, ...recentWorkoutIds])).filter((id) => !titleById.has(id));
  const exerciseNoteIds = Array.from(
    new Set(feedbackRows.flatMap((r) => Object.keys(r.exercise_notes ?? {}))),
  );
  const [{ data: extraTitleRaw }, { data: exNameRaw }] = await Promise.all([
    missingTitleIds.length > 0
      ? db.from('workouts').select('id, title, category').in('id', missingTitleIds).limit(missingTitleIds.length)
      : Promise.resolve({ data: [] as Row[], error: null }),
    exerciseNoteIds.length > 0
      ? db.from('exercises').select('id, name').in('id', exerciseNoteIds).limit(exerciseNoteIds.length)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);
  for (const r of (extraTitleRaw as Row[] | null) ?? []) {
    titleById.set(String(r.id), String(r.title ?? 'Workout'));
    const c = typeof r.category === 'string' ? r.category.trim() : '';
    if (c) categoryById.set(String(r.id), c);
  }
  const exerciseNameById = new Map<string, string>(
    ((exNameRaw as Row[] | null) ?? []).map((r) => [String(r.id), String(r.name ?? 'Exercise')]),
  );

  const workoutFeedback = buildWorkoutFeedback(feedbackRows, titleById, exerciseNameById, categoryById);

  // occurrence → completed if a completion exists for that workout on that
  // local date (one completion satisfies at most one occurrence of that
  // workout, so a single mid-week extra session can't inflate adherence).
  const completionDates = new Map<string, string[]>();
  for (const r of (histRaw as Row[] | null) ?? []) {
    const wid = String(r.workout_id);
    const d = iso10(r.completed_at);
    if (!d) continue;
    (completionDates.get(wid) ?? completionDates.set(wid, []).get(wid)!).push(d);
  }
  const used = new Set<string>(); // "workoutId|date" already credited
  const trainerSessions: TrainingSession[] = occ
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => {
      const key = `${o.workoutId}|${o.date}`;
      const hit = !used.has(key) && (completionDates.get(o.workoutId) ?? []).includes(o.date);
      if (hit) used.add(key);
      return {
        date: o.date,
        workoutTitle: titleById.get(o.workoutId) ?? 'Scheduled workout',
        status: classifyOccurrence(o.date, ctx.todayLocalDate, hit),
        source: 'trainer_plan' as const,
      };
    });

  // ── MERGE: the client's Lana-generated plan for THIS week (§18). Occurrences
  //    + AUTHORITATIVE completion come from `sharedLanaOccurrences` (the RPC).
  //    No cross-source dedup — identity between a Lana activity and a trainer
  //    schedule can't be established, so both are kept (§19). ──
  const lanaSessions: TrainingSession[] = sharedLanaOccurrences
    .filter((o) => o.date >= weekStart && o.date <= weekEnd)
    .map((o) => ({
      date: o.date,
      workoutTitle: o.title,
      status: classifyOccurrence(o.date, ctx.todayLocalDate, o.completed),
      source: 'lana_plan' as const,
    }));

  const sessions: TrainingSession[] = [...trainerSessions, ...lanaSessions].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.source === b.source ? 0 : a.source === 'trainer_plan' ? -1 : 1),
  );
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const missed = sessions.filter((s) => s.status === 'missed').length;
  const upcoming = sessions.filter((s) => s.status === 'upcoming').length;

  const goal = fp
    ? computeGoalProgress({
        initialWeightKg: num(fp.initial_weight_kg),
        profileWeightKg: num(fp.starting_weight_kg),
        goalWeightKg: num(fp.goal_weight_kg),
        targetDate: iso10(fp.goal_target_date),
        measurements,
      })
    : null;

  const bodyProgress = computeBodyProgress(measurements);

  const recentCompletions = ((recentHistRaw as Row[] | null) ?? [])
    .map((r) => ({ date: iso10(r.completed_at), title: titleById.get(String(r.workout_id)) ?? 'Workout' }))
    .filter((x): x is { date: string; title: string } => x.date != null);
  const proSessions = ((sessRaw as Row[] | null) ?? [])
    .map((r) => ({ date: iso10(r.completed_at), title: String(r.service_type ?? 'Session') }))
    .filter((x): x is { date: string; title: string } => x.date != null);

  const recentActivity = buildRecentActivity({
    workoutCompletions: recentCompletions,
    measurements: measurements.map((m) => ({ date: m.loggedDate, weightKg: m.weightKg })),
    proSessions,
  });

  // ── ADHERENCE FACTS — reuses `schedules` (already fetched) + the recent
  //    completions read (already fetched); NO new query. ──
  const adherenceCompletions = ((recentHistRaw as Row[] | null) ?? [])
    .map((r) => ({ id: String(r.id), workoutId: String(r.workout_id), date: iso10(r.completed_at) }))
    .filter((c): c is { id: string; workoutId: string; date: string } => c.date != null);
  const adherence = computeAdherenceFacts({
    schedules,
    completions: adherenceCompletions,
    titleById,
    todayLocalDate: ctx.todayLocalDate,
    // the SAME merged occurrence spine — trainer plan + Lana plan (§18/§20)
    lanaOccurrences: sharedLanaOccurrences,
  });

  const maxDate = (ds: (string | null | undefined)[]): string | null =>
    ds.filter((d): d is string => !!d).sort((a, b) => b.localeCompare(a))[0] ?? null;
  const lastActive = resolveLastActive({
    lastWorkoutDate: maxDate(recentCompletions.map((c) => c.date)),
    lastMeasurementDate: maxDate(measurements.map((m) => m.loggedDate)),
    lastProSessionDate: maxDate(proSessions.map((s) => s.date)),
  });

  return {
    state: 'ok',
    client: {
      name,
      goalLabel: fp?.goal ? humanGoal(fp.goal) : null,
      experienceLevel: fp?.experience_level ? humaniseLevel(fp.experience_level) : null,
      relationshipStatus,
      relationshipWeeks: relWeeks,
    },
    nextSession,
    goal,
    bodyProgress,
    trainingProgress: {
      weekStart,
      weekEnd,
      // merged dated occurrences: trainer plan + consumer Lana plan (§16)
      planned: sessions.length,
      completed,
      missed,
      upcoming,
      adherencePct: adherencePct(completed, sessions.length),
      sessions,
    },
    workoutFeedback,
    recentActivity,
    lastActive,
    adherence,
  };
}
