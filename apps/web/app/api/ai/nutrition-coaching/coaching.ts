// ACP Intelligence™ — Nutrition N4 route helpers. Mirrors the structure of
// onboarding-assessment/assessment.ts: model + request config, a strict
// Structured-Outputs schema, a pure prompt builder, and a pure validator —
// all unit-testable without a network call.
//
// The LLM here is ONLY a communication layer. Every fact (nutrient, average,
// reference, allowed foods) is supplied by the deterministic mobile pipeline
// and is authoritative; the model may not add, change or diagnose anything.

export const NUTRITION_COACHING_MODEL = 'gpt-5-mini';

export const NUTRITION_COACHING_REQUEST_CONFIG = {
  reasoning_effort: 'minimal' as const,
  max_completion_tokens: 900,
};

const MAX_OPPORTUNITIES = 3;

// ── Request payload (privacy-minimised, §39) ───────────────────────────────
// No body weight, name, email, raw food history or health data. Only the
// already-computed, already-safe coaching facts.
export interface CoachingRequestFood {
  name: string;
  mealSlot: string | null;
}
export interface CoachingRequestOpportunity {
  id: string;
  nutrientLabel: string;             // "Protein"
  comparisonLabel: string;           // "below your reference range" | "below the reference"
  averageLoggedLabel: string;        // "108 g/day"
  referenceLabel: string;            // "115–165 g/day"
  loggedDays: number;
  coverageBand: 'high' | 'moderate';
  eligibleFoods: CoachingRequestFood[];
}
export interface CoachingRequestBody {
  userId?: string;
  accessToken?: string;
  opportunities?: CoachingRequestOpportunity[];
}

export function sanitiseOpportunities(input: unknown): CoachingRequestOpportunity[] {
  if (!Array.isArray(input)) return [];
  const out: CoachingRequestOpportunity[] = [];
  for (const raw of input.slice(0, MAX_OPPORTUNITIES)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.nutrientLabel !== 'string') continue;
    out.push({
      id: o.id,
      nutrientLabel: o.nutrientLabel,
      comparisonLabel: typeof o.comparisonLabel === 'string' ? o.comparisonLabel : 'below the reference',
      averageLoggedLabel: typeof o.averageLoggedLabel === 'string' ? o.averageLoggedLabel : '',
      referenceLabel: typeof o.referenceLabel === 'string' ? o.referenceLabel : '',
      loggedDays: Number.isFinite(o.loggedDays) ? Number(o.loggedDays) : 0,
      coverageBand: o.coverageBand === 'high' ? 'high' : 'moderate',
      eligibleFoods: Array.isArray(o.eligibleFoods)
        ? o.eligibleFoods.slice(0, 3).flatMap(f => {
            if (!f || typeof f !== 'object') return [];
            const ff = f as Record<string, unknown>;
            return typeof ff.name === 'string'
              ? [{ name: ff.name, mealSlot: typeof ff.mealSlot === 'string' ? ff.mealSlot : null }]
              : [];
          })
        : [],
    });
  }
  return out;
}

// ── Structured output schema (response_format: json_schema, strict) ────────
export const NUTRITION_COACHING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', maxLength: 320 },
    opportunities: {
      type: 'array',
      maxItems: MAX_OPPORTUNITIES,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', maxLength: 60 },
          explanation: { type: 'string', maxLength: 240 },
          suggestion: { type: 'string', maxLength: 240 },
        },
        required: ['id', 'explanation', 'suggestion'],
      },
    },
  },
  required: ['summary', 'opportunities'],
} as const;

// ── Prompt ────────────────────────────────────────────────────────────────
export const NUTRITION_COACHING_SYSTEM_PROMPT = `You are ACP Intelligence™, a nutrition coaching communication layer.

You do NOT calculate nutrition facts. All supplied evidence is authoritative and complete for this response.

Do not invent or change: foods, quantities, habits, diagnoses, deficiencies, goals, nutrient values, reference ranges, or the number of logged days.

Only discuss the eligible opportunities supplied below, referenced by their exact "id". If you cannot say something useful and safe about an opportunity, still return it with a brief, neutral explanation and a gentle general suggestion — never drop the id.

For each opportunity:
- "explanation": one or two calm sentences stating that recent logged intake of the named nutrient has been below the reference. You may restate the supplied average and reference labels verbatim; do not compute new numbers.
- "suggestion": one practical, food-first next step. If "eligibleFoods" are supplied, ground the suggestion in one of them (a food the user already logs) and, if given, its meal slot. If no eligibleFoods are supplied, suggest increasing that nutrient's contribution in one meal the user already eats — do NOT name a food.

"summary": one short sentence framing these as small, optional adjustments based on recent logs.

Hard rules:
- No medical advice, no diagnosis, no "deficient"/"deficiency".
- No supplements of any kind (including protein powder or multivitamins).
- No calories, calorie targets, calorie deficits, TDEE/BMR, or "eat back" exercise energy.
- No extreme or restrictive dieting, no fasting instructions, no cutting foods out.
- Do not moralise food: no "good food", "bad food", "clean eating", "cheat meal", "healthy/unhealthy diet".
- Tone: coach-like, professional, calm, specific, non-judgemental. Use "could", "consider", "one option", "a practical place to start", "based on your recent logs". Never "you should", "you must", "you failed", "poor diet", "perfect", "optimal".
- No markdown, no bullet characters, no internal jargon (no "N1"/"N2"/"evidence tier"/"coverage"/"comparison state"/"readiness").
- Return only the required structured fields.`;

export function buildNutritionCoachingUserPrompt(opps: CoachingRequestOpportunity[]): string {
  const lines = opps.map(o => {
    const foods = o.eligibleFoods.length
      ? o.eligibleFoods.map(f => f.mealSlot ? `${f.name} (${f.mealSlot})` : f.name).join(', ')
      : '(none — do not name a food)';
    return [
      `- id: ${o.id}`,
      `  nutrient: ${o.nutrientLabel}`,
      `  comparison: ${o.comparisonLabel}`,
      `  average logged: ${o.averageLoggedLabel}`,
      `  reference: ${o.referenceLabel}`,
      `  logged days: ${o.loggedDays}`,
      `  eligibleFoods: ${foods}`,
    ].join('\n');
  });
  return `Eligible nutrition coaching opportunities (${opps.length}):\n${lines.join('\n')}`;
}

// ── Server-side validation of the model output ─────────────────────────────
export interface ValidatedCoaching {
  summary: string;
  opportunities: { id: string; explanation: string; suggestion: string }[];
}

const BANNED = [
  /\bdeficien\w*/i, /\bdeficit\b/i, /\bmalnutr\w*/i, /\bdiagnos\w*/i,
  /\bsupplement\w*/i, /\bprotein powder\b/i, /\bmultivitamin\b/i, /\btablet\b/i, /\bpill\b/i, /\bcapsule\b/i,
  /\btdee\b/i, /\bbmr\b/i, /\bkcal\b/i, /\bcalorie\b/i, /\beat back\b/i,
  /\bunhealthy\b/i, /\bhealthy diet\b/i, /\bclean eating\b/i, /\bcheat meal\b/i, /\bgood food\b/i, /\bbad food\b/i,
  /\byou (?:failed|must|should)\b/i, /\bcut out\b/i, /\bstop eating\b/i, /\brestrict\w*/i,
  /\bmedical\b/i, /\bdoctor\b/i, /\bN[1-5]\b/, /\breadiness\b/i, /\bcoverage ratio\b/i,
];
function clean(text: string): boolean {
  return !BANNED.some(re => re.test(text));
}

/**
 * Keeps only opportunities whose id was supplied, whose strings are clean,
 * and (when the opportunity had no eligibleFoods) that do not name a food.
 * Anything dropped is handled by the client's deterministic fallback.
 */
export function validateCoachingResponse(
  raw: unknown, allowed: CoachingRequestOpportunity[],
): ValidatedCoaching | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.summary !== 'string' || !Array.isArray(r.opportunities)) return null;

  const allowById = new Map(allowed.map(o => [o.id, o]));
  const summary = clean(r.summary) ? r.summary.trim() : '';

  const opportunities: ValidatedCoaching['opportunities'] = [];
  for (const item of r.opportunities) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    if (typeof it.id !== 'string' || typeof it.explanation !== 'string' || typeof it.suggestion !== 'string') continue;
    const src = allowById.get(it.id);
    if (!src) continue; // §16 — reject unknown ids
    const combined = `${it.explanation}\n${it.suggestion}`;
    if (!clean(combined)) continue;
    // If no eligible foods were supplied, the model must not name one.
    if (src.eligibleFoods.length === 0 && /\b[A-Z][a-z]+ [a-z]+\b/.test(it.suggestion)
        && !/\b(one meal|a meal|your meals?|recent logs?)\b/i.test(it.suggestion)) {
      // heuristic: a capitalised two-word phrase that isn't a benign stock phrase → likely an invented food
      continue;
    }
    opportunities.push({ id: it.id, explanation: it.explanation.trim(), suggestion: it.suggestion.trim() });
  }

  // A bare summary with no per-opportunity content is not worth returning —
  // the client's deterministic cards already cover every opportunity.
  if (opportunities.length === 0) return null;
  return { summary, opportunities };
}
