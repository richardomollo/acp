// ACP Intelligence™ — Nutrition N4. Orchestrates evidence-grounded coaching.
//
// The deterministic pipeline (lib/nutrition/nutrition-coaching-*) does all the
// thinking and always produces complete, safe cards. This service optionally
// asks the shared ACP OpenAI route to REPHRASE those cards more warmly, races
// it against a short UX deadline, and validates whatever comes back against
// the exact opportunities it sent (§16/§24/§33). If anything is off, the
// deterministic card is used — the user never sees a broken or empty section.

import { isNutritionCoachingEnabled } from '../flags.ts';
import type { FoodLogEntry } from './food-types.ts';
import type { NutritionReferenceComparison } from './nutrition-reference-engine.ts';
import {
  buildNutritionCoachingOpportunities, type NutritionCoachingOpportunity,
} from './nutrition-coaching-opportunity.ts';
import {
  validateCoachingOutput, type LlmCoachingOutput, type CoachingValidationResult,
} from './nutrition-coaching-safety.ts';

const COACHING_ENDPOINT =
  `${process.env.EXPO_PUBLIC_API_URL || 'https://activecitypass.com'}/api/ai/nutrition-coaching`;

// The mobile UX only waits this long looking at the (already-rendered)
// deterministic cards before it stops expecting a warmer LLM version. The
// server keeps its own, longer bound.
const REQUEST_TIMEOUT_MS = 12_000;

function comparisonLabel(o: NutritionCoachingOpportunity): string {
  return o.comparison === 'below_range' ? 'below your reference range' : 'below the reference';
}

/** Privacy-minimised payload for the coaching route (§39) — no weight, name, email or raw logs. */
export function toRequestOpportunities(opps: NutritionCoachingOpportunity[]) {
  return opps.map(o => ({
    id: o.id,
    nutrientLabel: o.nutrientLabel,
    comparisonLabel: comparisonLabel(o),
    averageLoggedLabel: o.evidenceSummary.averageLoggedLabel,
    referenceLabel: o.evidenceSummary.referenceLabel,
    loggedDays: o.evidenceSummary.loggedDays,
    coverageBand: o.evidenceSummary.coverageBand,
    eligibleFoods: o.eligibleFoods.map(f => ({ name: f.name, mealSlot: f.mealSlots[0] ?? null })),
  }));
}

/**
 * Never throws. Resolves to the model's structured coaching within
 * REQUEST_TIMEOUT_MS, or null (timeout / disabled / any failure / invalid) —
 * null means "use the deterministic cards".
 */
export async function fetchNutritionCoaching(
  accessToken: string,
  opportunities: NutritionCoachingOpportunity[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<LlmCoachingOutput | null> {
  if (!isNutritionCoachingEnabled() || opportunities.length === 0) return null;

  const request = (async (): Promise<LlmCoachingOutput | null> => {
    try {
      const res = await fetchImpl(COACHING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, opportunities: toRequestOpportunities(opportunities) }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || typeof json.summary !== 'string' || !Array.isArray(json.opportunities)) return null;
      return json as LlmCoachingOutput;
    } catch {
      return null;
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const uiTimeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    return await Promise.race([request, uiTimeout]);
  } finally {
    if (timer) clearTimeout(timer); // don't leak the deadline timer once the race is settled
  }
}

export interface NutritionCoachingResult {
  enabled: boolean;
  opportunities: NutritionCoachingOpportunity[];
  validated: CoachingValidationResult;   // cards always present when opportunities > 0
}

/**
 * The full N4 result for a screen: builds deterministic opportunities from the
 * already-fetched N3 comparisons + N1 entries, then folds in a validated LLM
 * rephrase when available.
 */
export async function getNutritionCoaching(
  accessToken: string | null,
  comparisons: NutritionReferenceComparison[],
  entries: FoodLogEntry[],
  fetchImpl: typeof fetch = fetch,
): Promise<NutritionCoachingResult> {
  const enabled = isNutritionCoachingEnabled();
  const opportunities = enabled ? buildNutritionCoachingOpportunities(comparisons, entries) : [];

  let llm: LlmCoachingOutput | null = null;
  if (enabled && opportunities.length > 0 && accessToken) {
    llm = await fetchNutritionCoaching(accessToken, opportunities, fetchImpl);
  }
  return { enabled, opportunities, validated: validateCoachingOutput(llm, opportunities) };
}
