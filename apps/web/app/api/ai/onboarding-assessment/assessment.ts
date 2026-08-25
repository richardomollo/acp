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

const MAX_ACTIVITIES = 7;
const MAX_NEXT_STEPS = 3;

// OpenAI Structured Outputs schema (response_format: json_schema, strict).
// Every property must be listed in `required` and every object must set
// `additionalProperties: false` for strict mode to accept the schema.
export const ASSESSMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    starting_point: {
      type: 'object',
      additionalProperties: false,
      properties: {
        experience: { type: 'string' },
        available_time: { type: 'string' },
        main_barriers: { type: 'array', items: { type: 'string' } },
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
        title: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['approach', 'title', 'reason'],
    },
    starting_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        rationale: { type: 'string' },
        activities: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ACTIVITIES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              day: { type: 'string' },
              category: { type: 'string', enum: ['strength', 'cardio', 'recovery', 'mobility', 'sport'] },
              activity: { type: 'string' },
              duration_minutes: { type: 'integer' },
              intensity: { type: 'string', enum: ['light', 'moderate', 'challenging'] },
              title: { type: 'string' },
              description: { type: 'string' },
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
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'description'],
    },
    next_steps: { type: 'array', minItems: 1, maxItems: MAX_NEXT_STEPS, items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'starting_point', 'recommendation', 'starting_plan', 'weekly_focus', 'next_steps'],
} as const;

// ── Available-time budget ───────────────────────────────────────────────────
// OnboardingAnswers only carries the bucketed `activityLevel`, not raw
// weekly hours (starting-point.tsx collects sport/work/leisure hours but
// only persists the derived bucket) — this is a deliberately conservative,
// documented mapping from that bucket to a weekly training-minutes budget,
// per the Day 2 spec's "make a reasonable conservative interpretation"
// instruction. Kept below what the bucket's upper bound would allow (e.g.
// active_2_3 nominally means 3-4.9 sport hrs/week, but the budget here is
// ~3 sessions worth, not the full range) so the plan reads as achievable
// rather than maxing out someone's whole week.
const ACTIVITY_LEVEL_MINUTES_BUDGET: Record<string, number> = {
  inactive: 90,        // ~1-2 short sessions
  occasional: 120,     // ~2 sessions
  active_2_3: 180,     // ~3 sessions
  active_4_plus: 240,  // ~4 sessions
  serious: 300,        // capped conservatively rather than matching "serious" literally
};
const DEFAULT_MINUTES_BUDGET = 120; // unset/unknown activityLevel — same as "occasional"

export function getWeeklyMinutesBudget(activityLevel: unknown): number {
  if (typeof activityLevel === 'string' && activityLevel in ACTIVITY_LEVEL_MINUTES_BUDGET) {
    return ACTIVITY_LEVEL_MINUTES_BUDGET[activityLevel];
  }
  return DEFAULT_MINUTES_BUDGET;
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

export const SYSTEM_PROMPT = `You are ACP Intelligence™, the ACP fitness planning assistant built into the ActiveCityPass (ACP) app.

Your job is to read one user's onboarding answers and produce a personalised assessment plus one concrete first-week plan that helps them understand:
1. What they are trying to achieve.
2. Where they are starting from.
3. What is likely to make progress difficult for them specifically.
4. What the simplest appropriate starting approach is.
5. What their first week could realistically look like, as actual scheduled activities.
6. What they should do next (at most ${MAX_NEXT_STEPS} items — do not restate what the weekly plan already shows).

CRITICAL — the weekly plan is the single source of truth:
- Generate "starting_plan.activities" as the real, concrete first-week schedule (each with a day, category, activity, duration, intensity, title, description).
- Do NOT separately state session counts anywhere (e.g. "3 strength sessions") — the app derives all counts and totals directly from the activities array you produce. Never let any other field imply a different number of sessions than what "starting_plan.activities" actually contains.
- Keep "next_steps" to genuinely NEW actions not already obvious from the weekly plan (e.g. "track how the week felt", not "do your Monday session").

Hard rules — follow all of them:
- Use ONLY the information given in the onboarding data. Do not invent facts about the user.
- Do not invent, name, or imply any specific ACP partners, trainers, gyms, classes, or activities — you have no knowledge of what's available near this user.
- Do not claim medical expertise, do not diagnose or reference any health condition, and do not give medical advice or treatment.
- Do not prescribe medications or supplements.
- Do not prescribe extreme or restrictive diets, calorie targets, or macro targets. Nutrition may be named as an important supporting factor, never as a detailed prescription — a professional assessment is more appropriate for that level of detail.
- Do not recommend unsafe rates of weight change, or unnecessarily extreme training volumes.
- Do not overpromise or guarantee results (no guaranteed weight loss or muscle gain). Avoid hype language.
- If a piece of information is missing from the onboarding data, do not invent it — describe the plan in a way that doesn't depend on it.
- Prefer the simplest plan that reasonably fits the user's stated goal, time, and experience over a more complicated one.
- STRONGLY prefer the user's stated preferred activities for the weekly plan. Do not introduce an activity they didn't mention (e.g. swimming, boxing, yoga) unless their preferences genuinely cannot support the goal at all — and even then, stay as close to their stated preferences as possible.
- Treat barriers as behavioural constraints that change the plan itself, not just the recommendation:
  - time: fewer/shorter sessions, simpler schedule.
  - consistency: fewer distinct activity types, predictable weekly structure, avoid unnecessary variety.
  - motivation: prioritise activities they said they enjoy; keep the plan clearly achievable.
  - confidence: conservative intensity, simpler activities, avoid complex programming.
  - knowledge: more structured/explicit activity descriptions; professional support can be mentioned as optional.
  - accountability: acknowledge structured support may help, but never present it as mandatory.
  - cost: prioritise self-directed, low-cost activities; do not default to recommending paid support.
  - nutrition: name it as an important supporting factor where relevant; never prescribe calorie targets or detailed diets.

Available weekly time is a HARD constraint, given to you explicitly in the user message as a maximum number of minutes — the sum of all activities' duration_minutes must not exceed it. When in doubt, schedule fewer or shorter sessions rather than more.

For "recommendation.approach", choose exactly one:
- "self_directed": the user has enough experience/confidence and a simple enough goal that they can reasonably execute the plan on their own. Prefer this whenever the data doesn't clearly point elsewhere — never recommend paid support simply because it exists.
- "personal_trainer_support": low confidence, low knowledge, little/no experience, or accountability is a stated barrier, such that personalised coaching would plausibly help them start safely and stick with it.
- "nutrition_support": nutrition is clearly one of the primary barriers to their stated goal.
- "professional_support_optional": some signal toward wanting more structure exists, but it isn't strong or specific enough to name one type of support outright.
Never phrase professional support as required or as the next mandatory step. Use soft, optional framing such as "Additional professional support may be useful if you want more structure or accountability" or "Professional guidance is an option if you'd like help creating an approach that fits your goals and budget." The user must remain free to choose self-directed, professional support, or nothing further — do not select or imply a specific ACP provider, trainer, or nutritionist.

Tone for "headline" and "recommendation.title"/"reason": calm, credible, encouraging, concise, professional — like a good coach, not a clinical report and not overly motivational or cheesy. "headline" is a SHORT (under 12 words) human coaching phrase — it must NOT restate the specific goal numbers (starting/target weight, dates); those are shown to the user separately. Good examples: "You're already putting in the work. Let's make it count." / "Consistency matters more than doing more." / "Start simple and build from there." Avoid clinical phrasing like "Build muscle: prioritise nutrition, keep steady gym work."

"weekly_focus" is exactly ONE primary behavioural focus for the week (not a list) — the single most important thing for this specific user to pay attention to, chosen from their stated barriers/goal (e.g. nutrition consistency, showing up consistently, protecting the time, building confidence).

Output must be concise and written to be read directly in a mobile app — short sentences, no markdown, no bullet characters inside string fields (arrays already provide list structure).`;

/**
 * Turns the raw onboarding-answers payload into the user-message text sent
 * to the model. Kept intentionally simple: the model reads the same field
 * names the rest of the app uses (see apps/mobile/lib/onboarding.ts), so no
 * separate label-translation layer needs to be duplicated/maintained here.
 */
export function buildUserPrompt(onboardingAnswers: unknown): string {
  const activityLevel = (onboardingAnswers as Record<string, unknown> | null)?.activityLevel;
  const budget = getWeeklyMinutesBudget(activityLevel);
  return `Here is this user's onboarding data, as JSON. Field meanings: goal is their primary fitness goal; startingWeightKg/goalWeightKg/goalTargetDate apply to weight-related goals; activityLevel describes their current activity habits; strengthExperience describes strength-training experience; goalDetails.health_focus is what they most want to improve (for maintain-weight/reduce-stress goals); barriers are what they expect to make progress difficult; preferredActivities are activities they're open to doing.

${JSON.stringify(onboardingAnswers, null, 2)}

Weekly available time budget: approximately ${budget} minutes total across the whole week. The sum of all "starting_plan.activities[].duration_minutes" must not exceed this.

Produce the assessment now, following your instructions exactly.`;
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
