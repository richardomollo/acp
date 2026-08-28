// ACP Intelligence™ Day 4 — behavioural completion tracking.
//
// PLAN vs BEHAVIOUR: this module (and plan_activity_completions, its DB
// table) is entirely separate from assessment.starting_plan — the plan
// represents "what ACP suggested"; a completion represents "what the user
// actually did." Nothing here ever writes to fitness_profile.ai_assessment.
//
// External-source matching is deliberately a suggestion, never an
// auto-complete: every candidate found here must be confirmed by the user
// before a completion record is created. No LLM, no embeddings — every
// function is pure and explainable, same discipline as lib/fulfilment.ts.
import { normalizeActivity, nextDateForWeekday, textMatchesActivityKeyword, type NormalizedActivityKey } from './fulfilment.ts';
import type { StartingPlanActivity } from './ai-assessment';

export type CompletionSource = 'manual' | 'exercise_db' | 'strava' | 'healthkit' | 'acp_session' | 'acp_experience';

export interface PlanActivityCompletion {
  id: string;
  planId: string;
  activityIndex: number;
  plannedDate: string;
  completedAt: string;
  completionSource: CompletionSource;
  sourceEntityId: string | null;
}

export interface CompletionCandidate {
  activityIndex: number;
  source: CompletionSource;
  sourceEntityId: string;
  label: string;
  occurredDate: string;
  score: number;
  reasons: string[];
}

// ── Shared date helpers ─────────────────────────────────────────────────────

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00').getTime();
  const b = new Date(bIso + 'T00:00:00').getTime();
  return Math.round(Math.abs(a - b) / 86400000);
}

/** The plan is guidance, not a punishment (Day 4 spec) — a small, documented ±1 day tolerance around the planned date. Exact-day matches still rank higher via the score. */
const DATE_TOLERANCE_DAYS = 1;

// ── Progress (Part 8 — deterministic, never AI) ─────────────────────────────

export function getCompletionProgress(totalActivities: number, completions: PlanActivityCompletion[]): { completed: number; total: number; percent: number } {
  const completed = new Set(completions.map(c => c.activityIndex)).size;
  const total = totalActivities;
  return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

// ── Strava candidates (Part 11-13) ──────────────────────────────────────────

export interface StravaActivityRow {
  id: string;
  activityType: 'run' | 'walk' | 'cycle' | string;
  startTime: string; // ISO timestamp
  durationSeconds: number;
}

const NORMALIZED_TO_STRAVA_TYPE: Partial<Record<NormalizedActivityKey, string>> = {
  running: 'run',
  walking: 'walk',
  cycling: 'cycle',
};

const MIN_PLAUSIBLE_DURATION_SECONDS = 5 * 60; // filters out GPS-blip noise, not a real "minimum effort" bar

/**
 * Finds Strava activities that could plausibly complete a running/walking/
 * cycling plan activity. Activity TYPE must match exactly — a cycle ride
 * never counts toward a planned walk, regardless of duration (Day 4 spec's
 * explicit non-example). Duration is a minor scoring signal only, never a
 * hard requirement, per "do not require exact duration."
 */
export function findStravaCandidates(
  activities: StartingPlanActivity[],
  completedIndexes: Set<number>,
  usedExternalIds: Set<string>,
  stravaActivities: StravaActivityRow[],
  anchor: Date,
): CompletionCandidate[] {
  const candidates: CompletionCandidate[] = [];

  activities.forEach((activity, index) => {
    if (completedIndexes.has(index)) return;
    const key = normalizeActivity(activity.activity || activity.title, activity.category);
    const requiredType = NORMALIZED_TO_STRAVA_TYPE[key];
    if (!requiredType) return;

    const targetDate = activity.planned_date ?? nextDateForWeekday(activity.day, anchor);
    if (!targetDate) return;

    let best: CompletionCandidate | null = null;
    for (const sa of stravaActivities) {
      if (sa.activityType !== requiredType) continue; // strict type match — no cross-type matching
      if (sa.durationSeconds < MIN_PLAUSIBLE_DURATION_SECONDS) continue;
      if (usedExternalIds.has(sa.id)) continue; // one Strava activity can't complete two plan activities

      const occurredDate = sa.startTime.split('T')[0];
      const dayDiff = daysBetween(occurredDate, targetDate);
      if (dayDiff > DATE_TOLERANCE_DAYS) continue;

      const reasons = ['type_match'];
      let score = 0.6;
      if (dayDiff === 0) { score += 0.3; reasons.push('exact_day'); }
      else { score += 0.1; reasons.push(`within_${DATE_TOLERANCE_DAYS}_day`); }

      const minutes = Math.round(sa.durationSeconds / 60);
      const candidate: CompletionCandidate = {
        activityIndex: index,
        source: 'strava',
        sourceEntityId: sa.id,
        label: `${minutes}-minute ${requiredType === 'run' ? 'run' : requiredType === 'walk' ? 'walk' : 'ride'}`,
        occurredDate,
        score,
        reasons,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) candidates.push(best);
  });

  return candidates;
}

// ── Apple Health / HealthKit candidates ──────────────────────────────────────
// HealthKit workouts (synced into health_workouts by services/health.ts) are
// device/OS-verified, same trust tier as Strava's GPS-tracked activities —
// so these are eligible for auto-count, unlike ExerciseDB/ACP-booking
// candidates below, which remain suggestion-only pending user confirmation.

export interface HealthKitWorkoutRow {
  id: string; // health_workouts.hk_uuid
  activityType: string; // HealthKit.WorkoutActivityType name, e.g. 'running', 'traditionalStrengthTraining'
  startDate: string; // ISO timestamp
  durationSeconds: number;
}

const NORMALIZED_TO_HEALTHKIT_TYPES: Partial<Record<NormalizedActivityKey, string[]>> = {
  running: ['running'],
  walking: ['walking', 'hiking'],
  cycling: ['cycling'],
  gym: ['traditionalStrengthTraining', 'functionalStrengthTraining'],
};

export function findHealthKitCandidates(
  activities: StartingPlanActivity[],
  completedIndexes: Set<number>,
  usedExternalIds: Set<string>,
  workouts: HealthKitWorkoutRow[],
  anchor: Date,
): CompletionCandidate[] {
  const candidates: CompletionCandidate[] = [];

  activities.forEach((activity, index) => {
    if (completedIndexes.has(index)) return;
    const key = normalizeActivity(activity.activity || activity.title, activity.category);
    const requiredTypes = NORMALIZED_TO_HEALTHKIT_TYPES[key];
    if (!requiredTypes) return;

    const targetDate = activity.planned_date ?? nextDateForWeekday(activity.day, anchor);
    if (!targetDate) return;

    let best: CompletionCandidate | null = null;
    for (const w of workouts) {
      if (!requiredTypes.includes(w.activityType)) continue; // strict type match, same discipline as Strava
      if (w.durationSeconds < MIN_PLAUSIBLE_DURATION_SECONDS) continue;
      if (usedExternalIds.has(w.id)) continue;

      const occurredDate = w.startDate.split('T')[0];
      const dayDiff = daysBetween(occurredDate, targetDate);
      if (dayDiff > DATE_TOLERANCE_DAYS) continue;

      const reasons = ['type_match'];
      let score = 0.6;
      if (dayDiff === 0) { score += 0.3; reasons.push('exact_day'); }
      else { score += 0.1; reasons.push(`within_${DATE_TOLERANCE_DAYS}_day`); }

      const minutes = Math.round(w.durationSeconds / 60);
      const label = key === 'gym' ? 'strength workout' : `${minutes}-minute ${key === 'running' ? 'run' : key === 'walking' ? 'walk' : 'ride'}`;
      const candidate: CompletionCandidate = {
        activityIndex: index, source: 'healthkit', sourceEntityId: w.id,
        label, occurredDate, score, reasons,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) candidates.push(best);
  });

  return candidates;
}

// ── ExerciseDB / workout_history candidates (Part 14) ───────────────────────

export interface WorkoutHistoryRow {
  id: string;
  workoutCategory: string | null;
  completedAt: string; // ISO timestamp — only ever set by finishWorkout(), so its mere existence already meets ACP's own definition of "completed"
}

// Resistance-training categories from the existing workouts.category values
// (see Day 3 report) — deliberately excludes 'hiit'/'mobility'/'core', which
// aren't genuinely "strength/gym" in this narrower Day 4 sense.
const STRENGTH_WORKOUT_CATEGORIES = new Set(['strength', 'full_body', 'push', 'pull', 'legs']);

export function findExerciseDbCandidates(
  activities: StartingPlanActivity[],
  completedIndexes: Set<number>,
  usedEntityIds: Set<string>,
  workoutHistory: WorkoutHistoryRow[],
  anchor: Date,
): CompletionCandidate[] {
  const candidates: CompletionCandidate[] = [];

  activities.forEach((activity, index) => {
    if (completedIndexes.has(index)) return;
    const key = normalizeActivity(activity.activity || activity.title, activity.category);
    if (key !== 'gym') return;

    const targetDate = activity.planned_date ?? nextDateForWeekday(activity.day, anchor);
    if (!targetDate) return;

    let best: CompletionCandidate | null = null;
    for (const wh of workoutHistory) {
      if (!wh.workoutCategory || !STRENGTH_WORKOUT_CATEGORIES.has(wh.workoutCategory)) continue;
      if (usedEntityIds.has(wh.id)) continue;

      const occurredDate = wh.completedAt.split('T')[0];
      const dayDiff = daysBetween(occurredDate, targetDate);
      if (dayDiff > DATE_TOLERANCE_DAYS) continue;

      const reasons = ['category_match'];
      let score = 0.6;
      if (dayDiff === 0) { score += 0.3; reasons.push('exact_day'); }
      else { score += 0.1; reasons.push(`within_${DATE_TOLERANCE_DAYS}_day`); }

      const candidate: CompletionCandidate = {
        activityIndex: index,
        source: 'exercise_db',
        sourceEntityId: wh.id,
        label: 'strength workout',
        occurredDate,
        score,
        reasons,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) candidates.push(best);
  });

  return candidates;
}

// ── ACP session/experience candidates (Part 15) ─────────────────────────────
// Deliberately conservative: a mere booking is NOT evidence of attendance.
// Only rows the user has actually checked into (bookings.checked_in = true,
// or experience_bookings.status = 'checked_in' — both already-existing,
// self-initiated actions distinct from just booking) are treated as a
// signal at all. Anything else yields no candidate; manual completion
// remains the only path, exactly as Day 4 scenario H requires.

export interface AcpCheckedInRow {
  id: string;
  type: 'acp_session' | 'acp_experience';
  name: string;
  category: string | null;
  checkedInDate: string; // ISO date the check-in/attendance is anchored to
}

export function findAcpBookingCandidates(
  activities: StartingPlanActivity[],
  completedIndexes: Set<number>,
  usedEntityIds: Set<string>,
  checkedInRows: AcpCheckedInRow[],
  anchor: Date,
): CompletionCandidate[] {
  const candidates: CompletionCandidate[] = [];

  activities.forEach((activity, index) => {
    if (completedIndexes.has(index)) return;
    const key = normalizeActivity(activity.activity || activity.title, activity.category);
    if (key === 'other') return;

    const targetDate = activity.planned_date ?? nextDateForWeekday(activity.day, anchor);
    if (!targetDate) return;

    let best: CompletionCandidate | null = null;
    for (const row of checkedInRows) {
      if (usedEntityIds.has(row.id)) continue;
      // Strict keyword test (no category-fallback guessing) — a genuine
      // keyword relationship to the SPECIFIC activity is required, matching
      // lib/fulfilment.ts's "no forced matches" principle exactly.
      if (!textMatchesActivityKeyword(`${row.name} ${row.category ?? ''}`, key)) continue;

      const dayDiff = daysBetween(row.checkedInDate, targetDate);
      if (dayDiff > DATE_TOLERANCE_DAYS) continue;

      const reasons = ['checked_in', 'activity_match'];
      let score = 0.6;
      if (dayDiff === 0) { score += 0.3; reasons.push('exact_day'); }
      else { score += 0.1; reasons.push(`within_${DATE_TOLERANCE_DAYS}_day`); }

      const candidate: CompletionCandidate = {
        activityIndex: index,
        source: row.type,
        sourceEntityId: row.id,
        label: row.name,
        occurredDate: row.checkedInDate,
        score,
        reasons,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) candidates.push(best);
  });

  return candidates;
}
