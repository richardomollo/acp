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

const ASSESSMENT_ENDPOINT = 'https://activecitypass.com/api/ai/onboarding-assessment';
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

/**
 * Never throws. Resolves to the assessment (+ its plan identifier) within
 * ~REQUEST_TIMEOUT_MS, or null if it didn't arrive/succeed/validate in time
 * — null is the signal for the caller to show the fallback plan immediately.
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
): Promise<FetchAssessmentResult | null> {
  const request = (async (): Promise<FetchAssessmentResult | null> => {
    try {
      const res = await fetchImpl(ASSESSMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!isValidAssessment(json?.assessment) || typeof json?.generatedAt !== 'string') return null;
      return { assessment: json.assessment, generatedAt: json.generatedAt };
    } catch {
      return null;
    }
  })();

  const uiTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));

  return Promise.race([request, uiTimeout]);
}
