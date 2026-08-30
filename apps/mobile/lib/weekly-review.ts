// Day 5 — LEARN + ADAPT. Client for the /api/ai/weekly-adaptation route,
// plus the pure, deterministic pieces that MUST run in code, never asked of
// the model: whether a plan is even reviewable yet, and exactly what
// happened this week. See the Day 5 report for the full architecture.
import type { AIAssessment, StartingPlanActivity } from './ai-assessment';
import type { PlanActivityCompletion, CompletionSource } from './completion';
import { sanitizeTrainingDays, normalizeWeekdayName, type CanonicalWeekday } from './onboarding.ts';

// ── Review readiness (Part 6) ────────────────────────────────────────────────
// Deliberately conservative: a plan only becomes reviewable once its week
// has fully ended. No "finish week early" flow exists anywhere in the
// product today, so that OR-branch from the spec is intentionally not
// built — see the Day 5 report's limitations section.
export function isPlanReadyForReview(
  assessment: Pick<AIAssessment, 'starting_plan'> | null | undefined,
  now: Date = new Date(),
): boolean {
  const weekEndDate = assessment?.starting_plan?.week_end_date;
  if (!weekEndDate) return false; // pre-Day-5 plan, or any other unexpected shape — not reviewable
  const today = now.toISOString().split('T')[0];
  return today > weekEndDate;
}

/** Local calendar date (YYYY-MM-DD) — the user's Sunday is what defines the
 *  planning window, so this deliberately uses the device timezone, not UTC.
 *  (See the Beta Feedback #001 completion report §D for the timezone note.) */
export function localDateIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Beta Feedback #001 — the Sunday "prepare next week" window. True only on
 * the current plan's own last day (a Sunday by construction), in the user's
 * local timezone. On Monday+ the normal review flow (isPlanReadyForReview)
 * takes over instead.
 */
export function isSundayPlanningWindow(
  assessment: Pick<AIAssessment, 'starting_plan'> | null | undefined,
  now: Date = new Date(),
): boolean {
  const weekEndDate = assessment?.starting_plan?.week_end_date;
  if (!weekEndDate) return false;
  return localDateIso(now) === weekEndDate;
}

export interface ScheduledNextPlan {
  assessment: AIAssessment;
  planId: string;
  weekStartDate: string;
  weekEndDate: string;
}

/** Minimal Supabase surface this helper needs — injectable for tests. */
type NextPlanReader = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: any[] | null; error: unknown }>;
          };
        };
      };
    };
  };
};

/**
 * Reads the user's prepared-but-not-yet-current plan (fitness_plans row with
 * status='scheduled'). Null when none exists. Never throws.
 */
export async function getScheduledNextPlan(
  supabase: NextPlanReader,
  userId: string,
): Promise<ScheduledNextPlan | null> {
  try {
    const { data } = await supabase
      .from('fitness_plans')
      .select('plan_id, assessment, week_start_date, week_end_date')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .order('week_start_date', { ascending: false })
      .limit(1);
    const row = (data ?? [])[0];
    if (!row?.assessment?.starting_plan?.activities?.length) return null;
    return {
      assessment: row.assessment as AIAssessment,
      planId: row.plan_id as string,
      weekStartDate: row.week_start_date as string,
      weekEndDate: row.week_end_date as string,
    };
  } catch {
    return null;
  }
}

// ── Deterministic weekly behaviour summary (Part 7/8/9) ─────────────────────
// Code calculates facts; the AI only ever interprets this object — it is
// never asked to count activities, calculate adherence, or derive minutes
// itself (Part 36).
export interface BehaviourSummary {
  planned_sessions: number;
  completed_sessions: number;
  planned_minutes: number;
  // Only ever incremented from sources where actual duration is genuinely
  // known (Strava, ExerciseDB) — a manual/check-in completion proves the
  // activity happened, not that it lasted exactly the planned duration
  // (Part 8/9), so it never contributes minutes here.
  completed_known_minutes: number;
  has_known_duration: boolean;
  adherence_rate: number;
  completed_by_category: Record<string, number>;
  missed_by_category: Record<string, number>;
  completion_sources: Partial<Record<CompletionSource, number>>;
}

// Sources whose completion record can be cross-referenced to a real,
// externally-recorded duration (Part 8's "higher-confidence" tier, Part 9).
const DURATION_KNOWN_SOURCES: ReadonlySet<CompletionSource> = new Set(['strava', 'healthkit', 'exercise_db']);

export function buildWeeklyBehaviourSummary(
  activities: StartingPlanActivity[],
  completions: PlanActivityCompletion[],
  /** sourceEntityId -> actual minutes, built by the caller from the real Strava/health_workouts/workout_history rows it already fetched. */
  actualDurationBySourceId: Record<string, number>,
): BehaviourSummary {
  const completedIndexes = new Set(completions.map(c => c.activityIndex));
  const planned_sessions = activities.length;
  const completed_sessions = completedIndexes.size;
  const planned_minutes = activities.reduce((sum, a) => sum + (Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0), 0);

  let completed_known_minutes = 0;
  let has_known_duration = false;
  const completion_sources: Partial<Record<CompletionSource, number>> = {};
  for (const c of completions) {
    completion_sources[c.completionSource] = (completion_sources[c.completionSource] ?? 0) + 1;
    if (DURATION_KNOWN_SOURCES.has(c.completionSource) && c.sourceEntityId && actualDurationBySourceId[c.sourceEntityId] != null) {
      completed_known_minutes += actualDurationBySourceId[c.sourceEntityId];
      has_known_duration = true;
    }
  }

  const completed_by_category: Record<string, number> = {};
  const missed_by_category: Record<string, number> = {};
  activities.forEach((a, i) => {
    const bucket = completedIndexes.has(i) ? completed_by_category : missed_by_category;
    bucket[a.category] = (bucket[a.category] ?? 0) + 1;
  });

  return {
    planned_sessions,
    completed_sessions,
    planned_minutes,
    completed_known_minutes,
    has_known_duration,
    adherence_rate: planned_sessions > 0 ? Math.round((completed_sessions / planned_sessions) * 100) / 100 : 0,
    completed_by_category,
    missed_by_category,
    completion_sources,
  };
}

// ── Weekly-adaptation API client (Part 10, mirrors fetchOnboardingAssessment) ─
const WEEKLY_ADAPTATION_ENDPOINT = 'https://activecitypass.com/api/ai/weekly-adaptation';
// Weekly review is less time-critical than onboarding (Part 41), but still
// needs a responsive UX — kept generous relative to onboarding's 15s since
// this is a deliberate, user-initiated action (tapping "See my weekly
// review"), not something blocking the very first screen after signup.
const REQUEST_TIMEOUT_MS = 20000;

export interface FetchWeeklyAdaptationParams {
  userId: string;
  accessToken: string;
  behaviourSummary: BehaviourSummary;
  /** Beta Feedback #003 — explicit, user-initiated rebuild of an
   *  already-prepared FUTURE plan after a planning-preference change. Never
   *  set for a normal review/prepare call, which stays idempotent. */
  regenerateFuturePlan?: boolean;
}

export interface FetchWeeklyAdaptationResult {
  assessment: AIAssessment;
  generatedAt: string;
  /** Beta Feedback #001 — true when this plan was prepared ahead of its
   *  week and is NOT yet the user's current plan (it lives in fitness_plans
   *  as 'scheduled' until its week begins). */
  scheduled?: boolean;
  /** True when this call promoted a previously-scheduled plan to current. */
  promoted?: boolean;
  /** Beta Feedback #003 — true when this call replaced an existing scheduled
   *  future plan (as opposed to preparing one for the first time). */
  regenerated?: boolean;
}

/**
 * Beta Feedback #003 — pure dirty-state check. Answers exactly one question:
 * does the already-prepared future plan still reflect the user's CURRENT
 * preferred training days? Returns true only when a rebuild is both
 * meaningful and allowed:
 *   - a scheduled future plan exists whose week has NOT started yet;
 *   - the user has an explicit preference of >= 2 canonical days;
 *   - at least one of the plan's activity weekdays falls outside that set.
 * Visiting the preference editor without changing anything never trips this
 * (the check is structural, not "did they open the screen").
 */
export function scheduledPlanNeedsScheduleUpdate(
  scheduled: Pick<ScheduledNextPlan, 'assessment' | 'weekStartDate'> | null | undefined,
  preferredTrainingDays: unknown,
  now: Date = new Date(),
): boolean {
  if (!scheduled) return false;
  const days = sanitizeTrainingDays(preferredTrainingDays);
  if (days.length < 2) return false;
  // Week already started (edge: not yet promoted) — regeneration would be
  // rejected server-side, so never offer it.
  if (scheduled.weekStartDate && localDateIso(now) >= scheduled.weekStartDate) return false;
  const preferred = new Set<CanonicalWeekday>(days);
  const planWeekdays = (scheduled.assessment?.starting_plan?.activities ?? [])
    .map(a => normalizeWeekdayName(a.day))
    .filter((d): d is CanonicalWeekday => !!d);
  if (planWeekdays.length === 0) return false;
  return !planWeekdays.every(d => preferred.has(d));
}

/**
 * Never throws. Resolves to the new assessment (+ its plan identifier)
 * within ~REQUEST_TIMEOUT_MS, or null if it didn't arrive/succeed in time —
 * same non-cancelling race as fetchOnboardingAssessment, for the same
 * reason: the server keeps generating and saves regardless, so a slow call
 * still isn't wasted even if the caller stops waiting.
 */
export async function fetchWeeklyAdaptation(
  params: FetchWeeklyAdaptationParams,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<FetchWeeklyAdaptationResult | null> {
  const request = (async (): Promise<FetchWeeklyAdaptationResult | null> => {
    try {
      const res = await fetchImpl(WEEKLY_ADAPTATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      // A failed regeneration (Beta #003) returns 502/409 with the untouched
      // existing plan — the caller treats null as "couldn't update, old plan
      // still available", which is exactly the desired failure UX.
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.assessment || typeof json?.generatedAt !== 'string') return null;
      return {
        assessment: json.assessment, generatedAt: json.generatedAt,
        scheduled: !!json.scheduled, promoted: !!json.promoted, regenerated: !!json.regenerated,
      };
    } catch {
      return null;
    }
  })();

  const uiTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([request, uiTimeout]);
}

// ── Legacy plan date upgrade (Day 5.5 Problem C) ────────────────────────────
const PLAN_DATE_UPGRADE_ENDPOINT = 'https://activecitypass.com/api/ai/plan-date-upgrade';

export interface FetchPlanDateUpgradeResult {
  upgraded: boolean;
  assessment?: AIAssessment;
  generatedAt?: string;
}

/**
 * Opportunistic, lazy upgrade for a current plan that predates Day 5 (no
 * week_end_date yet) — called from My Plan/Home right after such a plan
 * loads, never proactively for every user (Part 21). Makes no OpenAI call.
 * Never throws; a failure just means the caller keeps showing the existing
 * (still fully usable, just not yet reviewable) plan unchanged — no crash,
 * no "migrating your plan..." message (Part 28).
 */
export async function fetchPlanDateUpgrade(
  params: { userId: string; accessToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FetchPlanDateUpgradeResult> {
  try {
    const res = await fetchImpl(PLAN_DATE_UPGRADE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { upgraded: false };
    const json = await res.json();
    if (!json?.upgraded) return { upgraded: false };
    return { upgraded: true, assessment: json.assessment, generatedAt: json.generatedAt };
  } catch {
    return { upgraded: false };
  }
}
