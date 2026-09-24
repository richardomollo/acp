// Client for the /api/ai/onboarding-assessment web route.
// Deliberately isolated from React/Supabase so the "never throws, always
// resolves to null on any failure" contract is unit-testable in isolation —
// null is the signal for the calling screen to fall back to buildPlanSummary().
//
// Day 2: the AI generates one canonical weekly activity list
// (starting_plan.activities); all category counts/totals shown in the UI
// must be derived from it via deriveCategoryCounts()/sumDurationMinutes(),
// never read from any separately-generated count field — that's what
// caused Day 1's "4 strength" vs 3-listed-sessions inconsistency.
import type { OnboardingAnswers } from './onboarding';
import { toCalendarDate } from './calendar-date.ts';

export type ActivityCategory = 'strength' | 'cardio' | 'recovery' | 'mobility' | 'sport';
export type ActivityIntensity = 'light' | 'moderate' | 'challenging';

export interface StartingPlanActivity {
  day: string;
  category: ActivityCategory;
  activity: string;
  duration_minutes: number;
  intensity: ActivityIntensity;
  title: string;
  description: string;
  // Day 5 — plan dating fix. Always code-injected server-side, never asked
  // of the model. The one absolute, historically-stable date for this
  // activity — prefer this over recomputing "next occurrence of this
  // weekday from today" (lib/fulfilment.ts's nextDateForWeekday), which is
  // what silently turned last week's Monday into next week's Monday.
  // Optional so an already-saved pre-Day-5 plan still satisfies this type.
  planned_date?: string;
}

export interface StartingPlan {
  title: string;
  rationale: string;
  activities: StartingPlanActivity[];
  week_start_date?: string;
  week_end_date?: string;
}

export interface WeeklyFocus {
  title: string;
  description: string;
}

// Support-recommendation fix: "approach" (how independently the user can
// execute the plan) and "support_opportunities" (which forms of professional
// support could materially help) are two separate, independent questions —
// never mutually exclusive with each other. See the "Support Recommendation
// Logic Fix" report for the full rationale.
export type SupportType = 'personal_trainer' | 'nutrition';
export type SupportRelevance = 'high' | 'medium';

export interface SupportOpportunity {
  type: SupportType;
  relevance: SupportRelevance;
  reason: string;
}

// Day 5 — nutrition intelligence. ACP Intelligence™ decides only the
// INTENT; real foods and any nutrient numbers always come from ACP's own
// meals data (see lib/nutrition-matching.ts), never the model. Only 4
// types — the only ones the real meals-table tags reliably support (see
// the Day 5 report's nutrition-architecture inspection).
export type NutritionFocusType = 'protein_consistency' | 'fibre' | 'pre_training_energy' | 'post_training_recovery';

export interface NutritionFocus {
  type: NutritionFocusType;
  title: string;
  reason: string;
}

// Present only on an assessment produced by the weekly-adaptation route —
// null for the original onboarding plan and anything from before Day 5.
export interface WeeklyReview {
  headline: string;
  summary: string;
  wins: string[];
  focus_next_week: string;
}

export interface AIAssessment {
  headline: string;
  summary: string;
  starting_point: {
    experience: string;
    available_time: string;
    main_barriers: string[];
  };
  recommendation: {
    approach: 'self_directed' | 'guided';
    title: string;
    reason: string;
  };
  // Never includes 'low' relevance — omitted entirely if not useful enough
  // to surface. Max 2 entries (one per type); empty is common and valid.
  support_opportunities: SupportOpportunity[];
  starting_plan: StartingPlan;
  weekly_focus: WeeklyFocus;
  next_steps: string[];
  assessment_version?: number;
  nutrition_focus?: NutritionFocus | null;
  review?: WeeklyReview | null;
}

const SUPPORT_RELEVANCE_RANK: Record<SupportRelevance, number> = { high: 0, medium: 1 };

/**
 * Stable sort by relevance (HIGH before MEDIUM) — never by provider count,
 * revenue, commission, inventory, or sponsorship, none of which this type
 * even carries a field for.
 */
export function sortSupportOpportunities(opportunities: SupportOpportunity[]): SupportOpportunity[] {
  return [...opportunities].sort((a, b) => SUPPORT_RELEVANCE_RANK[a.relevance] - SUPPORT_RELEVANCE_RANK[b.relevance]);
}

// Device-QA bug (Fitness plan recovery) — this was hard-coded to production
// while nutrition-coaching.ts/lana-chat's client already respect
// EXPO_PUBLIC_API_URL for exactly this reason: a device pointed at local
// Supabase (a local-only access token) got silently 401'd by PRODUCTION's
// onboarding-assessment route, which validates against production's own
// auth — collapsed by fetchOnboardingAssessment's own null-on-any-failure
// contract into the same "not ready yet" UI state forever. Unset in any
// prod/EAS build → identical behaviour to before (activecitypass.com).
const ASSESSMENT_ENDPOINT =
  `${process.env.EXPO_PUBLIC_API_URL || 'https://activecitypass.com'}/api/ai/onboarding-assessment`;
// UX threshold, not a hard cancellation: this is how long the caller should
// wait before showing the fallback plan, not how long the underlying
// request is allowed to run. See fetchOnboardingAssessment below for why
// the request itself is never aborted at this deadline.
const REQUEST_TIMEOUT_MS = 15000;

const CATEGORY_ORDER: ActivityCategory[] = ['strength', 'cardio', 'recovery', 'mobility', 'sport'];
export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  recovery: 'Recovery',
  mobility: 'Mobility',
  sport: 'Sport',
};

/** The single source of truth for any category count shown in the UI — always computed from the actual activities, never from a separate AI-generated number. */
export function deriveCategoryCounts(activities: StartingPlanActivity[]): { category: ActivityCategory; label: string; count: number }[] {
  const counts: Partial<Record<ActivityCategory, number>> = {};
  for (const a of activities) {
    counts[a.category] = (counts[a.category] ?? 0) + 1;
  }
  return CATEGORY_ORDER
    .filter(cat => (counts[cat] ?? 0) > 0)
    .map(cat => ({ category: cat, label: CATEGORY_LABEL[cat], count: counts[cat]! }));
}

export function sumDurationMinutes(activities: StartingPlanActivity[]): number {
  return activities.reduce((sum, a) => sum + (Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0), 0);
}

export interface PlanScheduleRow {
  /** the activity's own weekday, verbatim from the canonical plan */
  day: string;
  category: ActivityCategory;
  categoryLabel: string;
  title: string;
  activity: string;
  durationMinutes: number;
  plannedDate: string | null;
}

/**
 * LH-24 — a DIRECT projection of the ONE canonical `starting_plan.activities`
 * list into rows for a read-only schedule display (the onboarding completion
 * card; usable anywhere a plain list is needed).
 *
 * It reorders NOTHING: the server emits activities in weekly order and My
 * Plan renders them in that same array order, so this keeps every surface
 * identical. It invents no days, rebalances no categories, and derives no
 * independent session count (use `activities.length` /
 * `deriveCategoryCounts`). Given `[]` it returns `[]` — never a fabricated
 * default schedule.
 */
export function projectPlanSchedule(activities: readonly StartingPlanActivity[]): PlanScheduleRow[] {
  return activities.map(a => ({
    day: a.day,
    category: a.category,
    categoryLabel: CATEGORY_LABEL[a.category] ?? a.category,
    title: a.title,
    activity: a.activity,
    durationMinutes: Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0,
    plannedDate: a.planned_date ?? null,
  }));
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}

const CATEGORY_VALUES = new Set(['strength', 'cardio', 'recovery', 'mobility', 'sport']);
const INTENSITY_VALUES = new Set(['light', 'moderate', 'challenging']);
const APPROACH_VALUES = new Set(['self_directed', 'guided']);
const SUPPORT_TYPE_VALUES = new Set(['personal_trainer', 'nutrition']);
const SUPPORT_RELEVANCE_VALUES = new Set(['high', 'medium']);

function isValidSupportOpportunity(x: unknown): x is SupportOpportunity {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === 'string' && SUPPORT_TYPE_VALUES.has(o.type)
    && typeof o.relevance === 'string' && SUPPORT_RELEVANCE_VALUES.has(o.relevance)
    && typeof o.reason === 'string';
}

function isValidActivity(x: unknown): x is StartingPlanActivity {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return typeof a.day === 'string' && !!a.day
    && typeof a.category === 'string' && CATEGORY_VALUES.has(a.category)
    && typeof a.activity === 'string'
    && typeof a.duration_minutes === 'number' && a.duration_minutes > 0
    && typeof a.intensity === 'string' && INTENSITY_VALUES.has(a.intensity)
    && typeof a.title === 'string'
    && typeof a.description === 'string';
}

export function isValidAssessment(x: unknown): x is AIAssessment {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  if (typeof a.headline !== 'string' || typeof a.summary !== 'string') return false;

  const sp = a.starting_point as Record<string, unknown> | undefined;
  if (!sp || typeof sp.experience !== 'string' || typeof sp.available_time !== 'string' || !isStringArray(sp.main_barriers)) return false;

  const rec = a.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec.title !== 'string' || typeof rec.reason !== 'string') return false;
  if (!APPROACH_VALUES.has(rec.approach as string)) return false;

  if (!Array.isArray(a.support_opportunities) || a.support_opportunities.length > 2) return false;
  if (!a.support_opportunities.every(isValidSupportOpportunity)) return false;

  const plan = a.starting_plan as Record<string, unknown> | undefined;
  if (!plan || typeof plan.title !== 'string' || typeof plan.rationale !== 'string') return false;
  if (!Array.isArray(plan.activities) || plan.activities.length === 0) return false;
  if (!plan.activities.every(isValidActivity)) return false;

  const focus = a.weekly_focus as Record<string, unknown> | undefined;
  if (!focus || typeof focus.title !== 'string' || typeof focus.description !== 'string') return false;

  if (!isStringArray(a.next_steps) || a.next_steps.length === 0) return false;

  return true;
}

/**
 * LH-19 — the ONE "the onboarding plan screen may let the user act" invariant.
 *
 * True only when generation has reached the genuine ready phase AND the
 * assessment in hand is a fully valid canonical plan (`isValidAssessment`
 * enforces a non-empty, well-formed `starting_plan.activities`). It is
 * NEVER true for: a `loading`/`idle`/`fallback` phase, an expired UX timeout,
 * visible "finishing your schedule" fallback copy, onboarding answers alone,
 * a merely-started AI request, partial assessment data, or a fabricated
 * schedule. The two completion actions ("Start my journey" /
 * "See my detailed plan") and their handler guards all read this.
 */
export function isCanonicalPlanReady(
  assessmentPhase: string,
  assessment: unknown,
): assessment is AIAssessment {
  return assessmentPhase === 'ready'
    && isValidAssessment(assessment)
    && assessment.starting_plan.activities.length > 0;
}

export interface FetchAssessmentParams {
  userId: string;
  onboardingAnswers: OnboardingAnswers;
  accessToken: string;
  /**
   * The user's own stated weekly training hours (health_profile.hours_exercising_per_week),
   * when available — the canonical time budget. Omit/null to fall back to
   * the activityLevel-based proxy server-side.
   */
  sportHoursPerWeek?: number | null;
}

export interface FetchAssessmentResult {
  assessment: AIAssessment;
  /**
   * Day 4: fitness_profile.ai_assessment_generated_at, as returned by the
   * route right after it saved this assessment — reused as the plan
   * identifier for plan_activity_completions (see lib/completion.ts). It's
   * already unique-per-generation and immutable, so no separate plan-id
   * column/table is needed.
   */
  generatedAt: string;
}

// Fitness plan recovery (device QA) — §7's "distinguish a genuine failure
// from legitimate generation-in-progress". Every non-success path used to
// collapse to a bare `null`, which the caller (my-plan.tsx) could only ever
// render as "still being prepared" — visually identical whether nothing had
// been attempted yet or a request had just been flatly rejected. `reason`
// lets the caller tell those apart and offer a real Retry only when one is
// warranted, without inventing a second readiness definition (isValidAssessment
// is still the only gate for "is there a real plan").
export type FetchAssessmentFailureReason =
  | 'unauthorized'      // 401/403 — the access token was rejected by the assessment route
  | 'server_error'      // any other non-2xx
  | 'invalid_response'  // 2xx but the body didn't validate (isValidAssessment/generatedAt)
  | 'network'           // fetch() itself threw (offline, DNS, connection refused, …)
  | 'timeout';          // the UX deadline won the race — the real request may still land later

export type FetchAssessmentOutcome =
  | ({ ok: true } & FetchAssessmentResult)
  | { ok: false; reason: FetchAssessmentFailureReason };

/**
 * Never throws. Resolves within ~REQUEST_TIMEOUT_MS to `{ok:true, assessment,
 * generatedAt}` or `{ok:false, reason}` — `reason` is diagnostic only (never
 * shown verbatim to the user); the caller decides what, if anything, to do
 * with a failure (e.g. My Plan offers Retry for `unauthorized`/`server_error`/
 * `network`, but not for `timeout`, where the request may still succeed).
 *
 * Deliberately does NOT use AbortController to cancel the underlying
 * request at the timeout: the request is raced against a timer for the
 * caller's purposes only, but is left running in the background if the
 * timer wins. The server-side route saves the assessment to
 * fitness_profile.ai_assessment as soon as it succeeds regardless of
 * whether the client is still awaiting it — so a slow-but-eventually-
 * successful generation still isn't wasted, and shows up next time the
 * user opens My Plan, without ever blocking this call past the deadline.
 */
export async function fetchOnboardingAssessment(
  params: FetchAssessmentParams,
  fetchImpl: typeof fetch = fetch,
  // Test-only override for the UX timeout (same purpose as fetchImpl above:
  // dependency injection for deterministic, fast tests) — production
  // call-sites never pass this and get REQUEST_TIMEOUT_MS.
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  // Test-only injectable "now" — production always gets the real local date.
  now: Date = new Date(),
): Promise<FetchAssessmentOutcome> {
  // LH-30 — the server has no reliable notion of the user's "today", so the
  // plan's effective start date is the user's LOCAL calendar date, computed
  // here with the LH-26 canonical helper (never a UTC slice) and sent
  // alongside every generation / regeneration request.
  const clientLocalDate = toCalendarDate(now);
  const request = (async (): Promise<FetchAssessmentOutcome> => {
    try {
      const res = await fetchImpl(ASSESSMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, clientLocalDate }),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
      if (!res.ok) return { ok: false, reason: 'server_error' };
      const json = await res.json();
      if (!isValidAssessment(json?.assessment) || typeof json?.generatedAt !== 'string') return { ok: false, reason: 'invalid_response' };
      return { ok: true, assessment: json.assessment, generatedAt: json.generatedAt };
    } catch {
      return { ok: false, reason: 'network' };
    }
  })();

  const uiTimeout = new Promise<FetchAssessmentOutcome>(resolve =>
    setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs));

  return Promise.race([request, uiTimeout]);
}

// ── My Plan view state (device QA — Fitness plan recovery, §7) ─────────────
// The single, pure, testable decision of what My Plan should render — the
// exact same inputs the screen already holds as state, just no longer
// re-derived ad hoc inside JSX. Distinguishes a genuine failure from
// legitimate "still generating"/"nothing to show yet", which is the whole
// point of this fix: a swallowed error must never render identically to an
// in-progress generation.
export type MyPlanViewState =
  | 'loading'          // initial fetch in flight
  | 'generating'       // an assessment generation attempt is in flight
  | 'ready'            // assessment is a valid canonical plan — show it
  | 'error_retryable'  // a genuine failure occurred and there's nothing ready to show — offer Retry
  | 'not_ready'        // no assessment yet, no actionable error (includes a bare timeout, which may still resolve) — the honest "still being prepared" state
  | 'no_profile';      // no plan summary either — nothing to build from yet

export interface MyPlanViewStateInput {
  loading: boolean;
  generating: boolean;
  hasAssessment: boolean;
  hasPlanSummary: boolean;
  generationError: FetchAssessmentFailureReason | null;
}

export function resolveMyPlanViewState(input: MyPlanViewStateInput): MyPlanViewState {
  if (input.loading) return 'loading';
  if (input.hasAssessment) return 'ready';
  if (input.generating) return 'generating';
  if (input.generationError && input.generationError !== 'timeout') return 'error_retryable';
  if (input.hasPlanSummary) return 'not_ready';
  return 'no_profile';
}
