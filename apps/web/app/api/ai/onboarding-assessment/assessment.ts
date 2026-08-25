// Pure, framework-free logic for the onboarding-assessment route — no
// Next.js/Supabase/OpenAI-SDK imports here, so it can be unit tested with
// Node's built-in test runner the same way apps/mobile/lib/onboarding.ts is.
// route.ts wires this up to the actual HTTP/auth/DB layer.

export interface AIAssessment {
  headline: string;
  summary: string;
  starting_point: {
    experience: string;
    available_time: string;
    main_barriers: string[];
  };
  recommendation: {
    approach: 'self_directed' | 'personal_trainer' | 'nutritionist' | 'combined';
    title: string;
    reason: string;
  };
  weekly_plan: {
    strength_sessions: number;
    cardio_sessions: number;
    recovery_sessions: number;
  };
  next_steps: string[];
}

// Single place to change the model used for onboarding assessments.
export const AI_ASSESSMENT_MODEL = 'gpt-5-mini';

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
          enum: ['self_directed', 'personal_trainer', 'nutritionist', 'combined'],
        },
        title: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['approach', 'title', 'reason'],
    },
    weekly_plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        strength_sessions: { type: 'integer' },
        cardio_sessions: { type: 'integer' },
        recovery_sessions: { type: 'integer' },
      },
      required: ['strength_sessions', 'cardio_sessions', 'recovery_sessions'],
    },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'starting_point', 'recommendation', 'weekly_plan', 'next_steps'],
} as const;

export const SYSTEM_PROMPT = `You are the ACP fitness planning assistant, built into the ActiveCityPass (ACP) app.

Your job is to read one user's onboarding answers and produce a short, personalised assessment that helps them understand:
1. What they are trying to achieve.
2. Where they are starting from.
3. What is likely to make progress difficult for them specifically.
4. What the simplest appropriate starting approach is.
5. What their first week could realistically look like.
6. What they should do next.

Hard rules — follow all of them:
- Use ONLY the information given in the onboarding data. Do not invent facts about the user.
- Do not invent, name, or imply any specific ACP partners, trainers, gyms, classes, or activities — you have no knowledge of what's available near this user.
- Do not claim medical expertise, do not diagnose or reference any health condition, and do not give medical advice.
- Do not make extreme calorie, weight-loss-rate, or exercise-volume recommendations. Keep everything realistic and sustainable — this is a starting point, not a transformation program.
- Do not overpromise results or use hype language.
- If a piece of information is missing from the onboarding data, do not invent it — describe the plan in a way that doesn't depend on it.
- Prefer the simplest plan that reasonably fits the user's stated goal, time, and experience over a more complicated one.
- Respect the user's stated available time — never suggest a weekly plan that clearly exceeds it.
- Respect their preferred activities where given; don't recommend activities they didn't mention wanting to do.
- Treat their stated barriers as important signals, especially when deciding the recommended approach.

For "recommendation.approach", choose exactly one:
- "self_directed": the user has enough experience/confidence and a simple enough goal that they can reasonably execute a plan on their own.
- "personal_trainer": low confidence, low knowledge, little/no experience, or accountability is a stated barrier — personalised coaching would plausibly help them start safely and stick with it.
- "nutritionist": nutrition is clearly one of the primary barriers to their stated goal (e.g. the goal is weight-related and nutrition/diet was flagged as a barrier).
- "combined": only when there is a strong, specific reason evident in the data for both trainer AND nutrition support at once — do not default to this.
Never recommend paid support just because it exists — recommend "self_directed" whenever the data doesn't clearly point elsewhere.

Output must be concise and written to be read directly in a mobile app — short sentences, no markdown, no bullet characters inside string fields (the next_steps array itself provides the list structure).`;

/**
 * Turns the raw onboarding-answers payload into the user-message text sent
 * to the model. Kept intentionally simple: the model reads the same field
 * names the rest of the app uses (see apps/mobile/lib/onboarding.ts), so no
 * separate label-translation layer needs to be duplicated/maintained here.
 */
export function buildUserPrompt(onboardingAnswers: unknown): string {
  return `Here is this user's onboarding data, as JSON. Field meanings: goal is their primary fitness goal; startingWeightKg/goalWeightKg/goalTargetDate apply to weight-related goals; activityLevel describes their current activity habits; strengthExperience describes strength-training experience; goalDetails.health_focus is what they most want to improve (for maintain-weight/reduce-stress goals); barriers are what they expect to make progress difficult; preferredActivities are activities they're open to doing.

${JSON.stringify(onboardingAnswers, null, 2)}

Produce the assessment now, following your instructions exactly.`;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}

const APPROACH_VALUES = new Set(['self_directed', 'personal_trainer', 'nutritionist', 'combined']);

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

  const wp = a.weekly_plan as Record<string, unknown> | undefined;
  if (!wp || typeof wp !== 'object') return false;
  if (!Number.isFinite(wp.strength_sessions) || (wp.strength_sessions as number) < 0) return false;
  if (!Number.isFinite(wp.cardio_sessions) || (wp.cardio_sessions as number) < 0) return false;
  if (!Number.isFinite(wp.recovery_sessions) || (wp.recovery_sessions as number) < 0) return false;

  if (!isStringArray(a.next_steps) || a.next_steps.length === 0) return false;

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
