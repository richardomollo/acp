// Day 5 — LEARN + ADAPT. Client for the /api/ai/weekly-adaptation route,
// plus the pure, deterministic pieces that MUST run in code, never asked of
// the model: whether a plan is even reviewable yet, and exactly what
// happened this week. See the Day 5 report for the full architecture.
import type { AIAssessment, StartingPlanActivity } from './ai-assessment';
import type { PlanActivityCompletion, CompletionSource } from './completion';

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
}

export interface FetchWeeklyAdaptationResult {
  assessment: AIAssessment;
  generatedAt: string;
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
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.assessment || typeof json?.generatedAt !== 'string') return null;
      return { assessment: json.assessment, generatedAt: json.generatedAt };
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
