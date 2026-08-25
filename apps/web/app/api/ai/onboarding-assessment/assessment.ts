// Pure, framework-free logic for the onboarding-assessment route — no
// Next.js/Supabase/OpenAI-SDK imports here, so it can be unit tested with
// Node's built-in test runner the same way apps/mobile/lib/onboarding.ts is.
// route.ts wires this up to the actual HTTP/auth/DB layer.
//
// Day 2: the AI now generates one canonical list of weekly activities
// (`starting_plan.activities`) instead of independently generating both a
// weekly schedule AND separate session-count numbers — the old shape let
// those two drift apart (e.g. "4 strength" while only 3 were described).
// Category counts and total minutes are always derived from `activities`
// by deriveCategoryCounts()/sumDurationMinutes(), never asked of the model.
//
// Day 3: latency + resilience + time-accuracy pass. Measured baseline: 30-90s
// per call against production with the Day 2 prompt/schema and no
// reasoning_effort/token cap set. Benchmarked fix (see AI_REQUEST_CONFIG
// below): reasoning_effort:'minimal' + a max_completion_tokens cap cut a
// small-schema test call from ~5.6s to ~1.9s; `maxLength` added to every
// string field below is a hard, schema-enforced content cap (not just a
// prompt suggestion) that keeps the full 7-activity response short enough
// to generate quickly. `temperature` is deliberately never set — this model
// rejects any value other than its default (confirmed empirically: passing
// temperature:0.3 returns a 400 "Unsupported value" error).

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
}

export interface StartingPlan {
  title: string;
  rationale: string;
  activities: StartingPlanActivity[];
}

export interface WeeklyFocus {
  title: string;
  description: string;
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
    approach: 'self_directed' | 'professional_support_optional' | 'personal_trainer_support' | 'nutrition_support';
    title: string;
    reason: string;
  };
  starting_plan: StartingPlan;
  weekly_focus: WeeklyFocus;
  next_steps: string[];
}

// Single place to change the model used for onboarding assessments.
export const AI_ASSESSMENT_MODEL = 'gpt-5-mini';

// Single place to tune the model's latency/verbosity tradeoff. Benchmarked
// empirically (see comment above) — 'minimal' reasoning effort roughly
// halved latency on its own, and capping output tokens cut it further by
// bounding hidden reasoning-token generation, not just the visible answer.
// No `temperature` key here: this model only supports its default (1) and
// errors on anything else, so it's intentionally omitted rather than set.
export const AI_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 1600,
};

const MAX_ACTIVITIES = 7;
const MAX_NEXT_STEPS = 3;

// OpenAI Structured Outputs schema (response_format: json_schema, strict).
// Every property must be listed in `required` and every object must set
// `additionalProperties: false` for strict mode to accept the schema.
// `maxLength` on every string is a hard, model-enforced content cap (not
// just a prompt request) — this is the main lever keeping the full
// 7-activity response short enough to generate quickly.
export const ASSESSMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string', maxLength: 90 },       // ~12 words
    summary: { type: 'string', maxLength: 480 },        // ~70 words
    starting_point: {
      type: 'object',
      additionalProperties: false,
      properties: {
        experience: { type: 'string', maxLength: 60 },       // short phrase
        available_time: { type: 'string', maxLength: 40 },   // short phrase
        main_barriers: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 30 } },
      },
      required: ['experience', 'available_time', 'main_barriers'],
    },
    recommendation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        approach: {
          type: 'string',
          enum: ['self_directed', 'professional_support_optional', 'personal_trainer_support', 'nutrition_support'],
        },
        title: { type: 'string', maxLength: 90 },       // ~12 words
        reason: { type: 'string', maxLength: 340 },      // ~50 words
      },
      required: ['approach', 'title', 'reason'],
    },
    starting_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 60 },
        rationale: { type: 'string', maxLength: 420 },   // ~60 words
        activities: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ACTIVITIES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              day: { type: 'string', maxLength: 12 },
              category: { type: 'string', enum: ['strength', 'cardio', 'recovery', 'mobility', 'sport'] },
              activity: { type: 'string', maxLength: 40 },
              duration_minutes: { type: 'integer' },
              intensity: { type: 'string', enum: ['light', 'moderate', 'challenging'] },
              title: { type: 'string', maxLength: 50 },
              description: { type: 'string', maxLength: 170 },  // ~25 words
            },
            required: ['day', 'category', 'activity', 'duration_minutes', 'intensity', 'title', 'description'],
          },
        },
      },
      required: ['title', 'rationale', 'activities'],
    },
    weekly_focus: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 45 },        // ~6 words
        description: { type: 'string', maxLength: 280 }, // ~40 words
      },
      required: ['title', 'description'],
    },
    next_steps: { type: 'array', minItems: 1, maxItems: MAX_NEXT_STEPS, items: { type: 'string', maxLength: 110 } }, // ~15 words each
  },
  required: ['headline', 'summary', 'starting_point', 'recommendation', 'starting_plan', 'weekly_focus', 'next_steps'],
} as const;

// ── Available-time budget ───────────────────────────────────────────────────
// starting-point.tsx already collects the user's own stated weekly
// sport/training hours and persists it to health_profile.hours_exercising_per_week
// — a direct, explicit signal of realistic weekly time commitment. When it's
// available, it IS the canonical budget; activityLevel (a coarser bucket
// describing current behaviour, not stated availability) is no longer used
// for the budget in that case.
//
// deriveTemporaryWeeklyTimeBudgetFromActivityLevel() below is the fallback
// used only when the raw hours value isn't available (e.g. accounts that
// completed onboarding before health_profile existed, or a client that
// hasn't been updated to send it yet) — it's a deliberately conservative
// proxy, not a true availability figure, hence the explicit name.
// TODO(onboarding): there's still no dedicated "how much time can you
// realistically dedicate to training?" question distinct from "how much do
// you currently train" — see the Day 3 report for the proposed question and
// where it would go (a new field alongside sport hours on starting-point.tsx).
const ACTIVITY_LEVEL_MINUTES_BUDGET: Record<string, number> = {
  inactive: 90,        // ~1-2 short sessions
  occasional: 120,     // ~2 sessions
  active_2_3: 180,     // ~3 sessions
  active_4_plus: 240,  // ~4 sessions
  serious: 300,        // capped conservatively rather than matching "serious" literally
};
const DEFAULT_MINUTES_BUDGET = 120; // unset/unknown activityLevel — same as "occasional"

function deriveTemporaryWeeklyTimeBudgetFromActivityLevel(activityLevel: unknown): number {
  if (typeof activityLevel === 'string' && activityLevel in ACTIVITY_LEVEL_MINUTES_BUDGET) {
    return ACTIVITY_LEVEL_MINUTES_BUDGET[activityLevel];
  }
  return DEFAULT_MINUTES_BUDGET;
}

/**
 * Canonical weekly time budget, in minutes. Prefers the user's own stated
 * weekly training hours (health_profile.hours_exercising_per_week) when
 * given; otherwise falls back to the activityLevel-based proxy.
 */
export function getWeeklyMinutesBudget(activityLevel: unknown, sportHoursPerWeek?: unknown): number {
  if (typeof sportHoursPerWeek === 'number' && Number.isFinite(sportHoursPerWeek) && sportHoursPerWeek >= 0) {
    return Math.round(sportHoursPerWeek * 60);
  }
  return deriveTemporaryWeeklyTimeBudgetFromActivityLevel(activityLevel);
}

export function sumDurationMinutes(activities: { duration_minutes: number }[]): number {
  return activities.reduce((sum, a) => sum + (Number.isFinite(a.duration_minutes) ? a.duration_minutes : 0), 0);
}

export function deriveCategoryCounts(activities: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of activities) {
    counts[a.category] = (counts[a.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * Hard-enforces the time budget programmatically rather than only asking
 * the model nicely — trims the lowest-priority (last) activities until the
 * total fits within a 15% tolerance of the budget. Never trims below one
 * activity, so a plan is never reduced to nothing.
 */
export function enforceTimeBudget(activities: StartingPlanActivity[], budgetMinutes: number): StartingPlanActivity[] {
  const tolerance = Math.round(budgetMinutes * 1.15);
  const trimmed = [...activities];
  while (trimmed.length > 1 && sumDurationMinutes(trimmed) > tolerance) {
    trimmed.pop();
  }
  return trimmed;
}

// Compact by design (Day 3: cut from ~950 words to keep latency down) —
// every constraint below still matches Day 1/2 behaviour, just stated once
// instead of repeated across paragraphs. Length limits are enforced by
// ASSESSMENT_JSON_SCHEMA's `maxLength`, not just requested here.
export const SYSTEM_PROMPT = `You are ACP Intelligence™, the ACP fitness planning assistant. Read one user's onboarding answers and produce a personalised assessment plus one concrete first-week plan.

"starting_plan.activities" is the single source of truth for the week — the app derives all session counts and totals from it directly. Never state a session count anywhere else, and never let another field imply a different number of sessions than "activities" actually contains.

USER FIT
- Use only the given onboarding data; never invent facts.
- Respect the stated goal, experience level, and barriers.
- Available weekly time (given below as a maximum number of minutes) is a hard constraint — the sum of all activities' duration_minutes must not exceed it. Prefer fewer/shorter sessions over more.
- Strongly prefer the user's stated preferred activities. Do not introduce one they didn't mention (e.g. swimming, boxing, yoga) unless their preferences genuinely cannot support the goal at all.

BARRIERS (change the plan itself, not just the recommendation)
- time → fewer/shorter sessions, simpler schedule.
- consistency → fewer activity types, predictable structure.
- motivation → prioritise activities they enjoy; keep it clearly achievable.
- confidence → conservative intensity, simple activities.
- knowledge → clearer/more structured activity descriptions.
- accountability → structured support can be mentioned as optional, never mandatory.
- cost → prioritise self-directed, low-cost activities.
- nutrition → acknowledge as a supporting factor; never prescribe calories/macros/diets.

SAFETY
- General fitness guidance only — no diagnosis, no medical claims or treatment, no medications/supplements.
- No extreme training volumes, no unsafe rates of weight change, no guaranteed outcomes, no hype language.
- Do not invent, name, or imply any specific ACP partner, trainer, gym, or class.

COMMERCIAL NEUTRALITY
- Optimise for the user's outcome, never for generating a transaction. "self_directed" is the default whenever the data doesn't clearly point elsewhere.
- "personal_trainer_support": only when confidence, knowledge, experience, or accountability signals genuinely support it — a stated preference for "personal_training" as an activity is NOT by itself enough to choose this.
- "nutrition_support": nutrition is clearly a primary barrier to the goal.
- "professional_support_optional": some signal toward more structure exists but isn't strong/specific enough to name one type.
- Any professional support must be phrased as optional ("may be useful if you want more structure"), never required. Never name a specific ACP provider.

OUTPUT
- Concise, no repetition across fields, no restating the same point twice.
- "headline": short human coaching phrase (e.g. "Consistency matters more than doing more."), NOT a restatement of specific goal numbers.
- "weekly_focus": exactly ONE primary behavioural focus, not a list.
- "next_steps": genuinely new actions not already obvious from the weekly plan (at most ${MAX_NEXT_STEPS}).
- No markdown, no bullet characters inside strings, no generic filler.
- Return only the required structured fields.`;

/**
 * Turns the raw onboarding-answers payload into the user-message text sent
 * to the model. Kept intentionally simple: the model reads the same field
 * names the rest of the app uses (see apps/mobile/lib/onboarding.ts), so no
 * separate label-translation layer needs to be duplicated/maintained here.
 */
export function buildUserPrompt(onboardingAnswers: unknown, sportHoursPerWeek?: unknown): string {
  const activityLevel = (onboardingAnswers as Record<string, unknown> | null)?.activityLevel;
  const budget = getWeeklyMinutesBudget(activityLevel, sportHoursPerWeek);
  const budgetSource = typeof sportHoursPerWeek === 'number' && Number.isFinite(sportHoursPerWeek)
    ? `(the user's own stated ${sportHoursPerWeek} training hours/week)`
    : '(estimated from their current activity level — no explicit availability was given)';
  return `Onboarding data (JSON): goal is their primary fitness goal; startingWeightKg/goalWeightKg/goalTargetDate apply to weight-related goals; activityLevel describes current activity habits; strengthExperience describes strength-training experience; goalDetails.health_focus is what they most want to improve; barriers are what they expect to make progress difficult; preferredActivities are activities they're open to doing.

${JSON.stringify(onboardingAnswers)}

Weekly available time budget: approximately ${budget} minutes total ${budgetSource}. The sum of all "starting_plan.activities[].duration_minutes" must not exceed this.

Produce the assessment now.`;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}

const APPROACH_VALUES = new Set(['self_directed', 'professional_support_optional', 'personal_trainer_support', 'nutrition_support']);
const CATEGORY_VALUES = new Set(['strength', 'cardio', 'recovery', 'mobility', 'sport']);
const INTENSITY_VALUES = new Set(['light', 'moderate', 'challenging']);

function isValidActivity(x: unknown): x is StartingPlanActivity {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return typeof a.day === 'string' && !!a.day.trim()
    && typeof a.category === 'string' && CATEGORY_VALUES.has(a.category)
    && typeof a.activity === 'string' && !!a.activity.trim()
    && Number.isFinite(a.duration_minutes) && (a.duration_minutes as number) > 0
    && typeof a.intensity === 'string' && INTENSITY_VALUES.has(a.intensity)
    && typeof a.title === 'string' && !!a.title.trim()
    && typeof a.description === 'string';
}

/**
 * Defensive runtime check on top of the strict JSON-schema response — belt
 * and suspenders against a malformed or unexpected model response before we
 * persist or return it.
 */
export function validateAssessment(x: unknown): x is AIAssessment {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;

  if (typeof a.headline !== 'string' || !a.headline.trim()) return false;
  if (typeof a.summary !== 'string' || !a.summary.trim()) return false;

  const sp = a.starting_point as Record<string, unknown> | undefined;
  if (!sp || typeof sp !== 'object') return false;
  if (typeof sp.experience !== 'string') return false;
  if (typeof sp.available_time !== 'string') return false;
  if (!isStringArray(sp.main_barriers)) return false;

  const rec = a.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== 'object') return false;
  if (typeof rec.approach !== 'string' || !APPROACH_VALUES.has(rec.approach)) return false;
  if (typeof rec.title !== 'string' || !rec.title.trim()) return false;
  if (typeof rec.reason !== 'string' || !rec.reason.trim()) return false;

  const plan = a.starting_plan as Record<string, unknown> | undefined;
  if (!plan || typeof plan !== 'object') return false;
  if (typeof plan.title !== 'string' || !plan.title.trim()) return false;
  if (typeof plan.rationale !== 'string' || !plan.rationale.trim()) return false;
  if (!Array.isArray(plan.activities) || plan.activities.length === 0 || plan.activities.length > MAX_ACTIVITIES) return false;
  if (!plan.activities.every(isValidActivity)) return false;

  const focus = a.weekly_focus as Record<string, unknown> | undefined;
  if (!focus || typeof focus !== 'object') return false;
  if (typeof focus.title !== 'string' || !focus.title.trim()) return false;
  if (typeof focus.description !== 'string' || !focus.description.trim()) return false;

  if (!isStringArray(a.next_steps) || a.next_steps.length === 0 || a.next_steps.length > MAX_NEXT_STEPS) return false;

  return true;
}

export type AuthCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Pure authorization decision, separated from the actual Supabase token
 * verification (which stays a thin call in route.ts, matching every other
 * route in this codebase) purely so this branching logic is unit-testable
 * without mocking a network call.
 */
export function checkAuthorization(user: { id: string } | null, userId: unknown): AuthCheckResult {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (typeof userId !== 'string' || !userId) return { ok: false, status: 400, error: 'Missing userId' };
  if (user.id !== userId) return { ok: false, status: 403, error: 'User ID does not match authenticated user' };
  return { ok: true };
}
