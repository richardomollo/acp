// ACP Intelligence™ — Nutrition N4. Deterministic COACHING ELIGIBILITY,
// OPPORTUNITY construction, PRIORITISATION and FALLBACK COPY.
//
// Everything the language model is later allowed to talk about is decided
// HERE, deterministically (§2/§5/§15). The LLM never decides eligibility,
// never invents a food or number, never diagnoses. If the LLM is disabled or
// fails, `deterministicSuggestion` + `why` alone make a complete, safe
// coaching card (§24/§36).

import type { NutrientKey, FoodLogEntry, MealSlot } from './food-types.ts';
import type { DayNutrition } from './nutrition-history.ts';
import type { NutritionPatternEvidence } from './nutrition-patterns.ts';
import type {
  NutritionReferenceComparison, ComparisonState, ReferenceReadiness,
} from './nutrition-reference-engine.ts';
import type { NutrientRefKey } from './nutrition-reference-data.ts';
import { NUTRIENT_LABEL, NUTRIENT_UNIT, formatNutrientAmount } from './nutrient-display.ts';
import { getFrequentlyLoggedFoods, getNutrientContributors, type LoggedFoodObservation } from './nutrition-coaching-foods.ts';

// ── Eligibility (§5/§6/§19) ────────────────────────────────────────────────

export type CoachingEligibilityState =
  | 'eligible'
  | 'insufficient_evidence'   // not enough logged days / nutrient coverage / readiness for this nutrient class
  | 'insufficient_context'    // N3 could not resolve the reference (e.g. no weight, sex not on file)
  | 'unsupported'             // reference not applicable (age) or deliberately withheld (female iron, zinc)
  | 'no_action_needed';       // within range, or at/above a population floor — N4 never coaches "reduce"

/** Macro-domain nutrients tolerate MODERATE readiness (qualified). Micros require HIGH (§19). */
export const COACHING_MACRO_NUTRIENTS: readonly NutrientRefKey[] = ['proteinG', 'fibreG'];

/** Comparison states that represent a below-reference gap N4 may coach on (§6). */
const COACHABLE_GAP_STATES: ReadonlySet<ComparisonState> = new Set(['below_range', 'below_reference']);
/** States that explicitly must NOT trigger a "reduce" recommendation (§6). */
const NO_ACTION_STATES: ReadonlySet<ComparisonState> = new Set(['within_range', 'meets_or_exceeds_reference', 'above_range']);

export function getNutritionCoachingEligibility(c: NutritionReferenceComparison): CoachingEligibilityState {
  if (c.reference.status === 'unsupported' || c.reference.status === 'not_applicable') return 'unsupported';
  if (c.reference.status === 'insufficient_context') return 'insufficient_context';

  if (c.state === 'insufficient_days' || c.state === 'insufficient_data') return 'insufficient_evidence';
  if (NO_ACTION_STATES.has(c.state)) return 'no_action_needed';
  if (!COACHABLE_GAP_STATES.has(c.state)) return 'insufficient_evidence';

  const isMacro = (COACHING_MACRO_NUTRIENTS as readonly string[]).includes(c.nutrient);
  if (isMacro) {
    return c.readiness === 'high' || c.readiness === 'moderate' ? 'eligible' : 'insufficient_evidence';
  }
  // Micronutrients: conservative — HIGH readiness only (strong evidence + high coverage).
  return c.readiness === 'high' ? 'eligible' : 'insufficient_evidence';
}

// ── Opportunity object (§36) ───────────────────────────────────────────────

export interface CoachingEligibleFood {
  name: string;
  mealSlots: MealSlot[];
  occurrenceDays: number;
  /** share (0–1) of the window's known intake of this nutrient that this food supplied */
  nutrientShare: number;
}

export interface NutritionCoachingOpportunity {
  id: string;                       // `${nutrient}-${state}` — stable, used as the LLM allowlist key
  nutrient: NutrientRefKey;
  nutrientLabel: string;
  comparison: ComparisonState;
  readiness: ReferenceReadiness;
  eligibility: CoachingEligibilityState;
  domain: 'macro' | 'micronutrient';
  evidenceSummary: {
    averageLogged: number | null;
    averageLoggedLabel: string;     // "108 g/day"
    referenceLabel: string;         // "115–165 g/day" or "25 g/day"
    loggedDays: number;
    windowDays: number;
    coverageBand: 'high' | 'moderate';
  };
  /** foods that are BOTH frequently logged AND meaningful contributors to this nutrient */
  eligibleFoods: CoachingEligibleFood[];
  /** deterministic, evidence-only explanation for "Why am I seeing this?" (§29) */
  why: string;
  /** complete, safe fallback coaching copy when the LLM is off/failed (§24) */
  deterministicTitle: string;
  deterministicSuggestion: string;
  /** the practical in-app action (§28) */
  action: { label: string; route: string };
}

function coverageBand(coverage: number | null): 'high' | 'moderate' {
  return coverage != null && coverage >= 0.8 ? 'high' : 'moderate';
}

function referenceLabel(c: NutritionReferenceComparison): string {
  if (c.reference.status !== 'available') return '';
  const r = c.reference.reference;
  const unit = r.unit;
  return r.referenceType === 'exact'
    ? `${formatNutrientAmount(r.value as number, unit as any)} ${unit}/day`
    : `${r.min}–${r.max} ${unit}/day`;
}

function actionFor(nutrient: NutrientRefKey): { label: string; route: string } {
  // Reuse existing screens only — never a marketplace CTA as the default (§28).
  if (nutrient === 'proteinG' || nutrient === 'fibreG') {
    return { label: 'Review recent nutrition', route: '/nutrition-history' };
  }
  return { label: 'Review recent nutrition', route: '/nutrition-history' };
}

function buildWhy(c: NutritionReferenceComparison): string {
  const unit = NUTRIENT_UNIT[c.nutrient as keyof typeof NUTRIENT_UNIT] ?? '';
  const avg = c.actual.value != null ? `${formatNutrientAmount(c.actual.value, unit as any)} ${unit}/day` : 'not enough data';
  const ref = referenceLabel(c);
  const label = NUTRIENT_LABEL[c.nutrient].toLowerCase();
  const basis = c.reference.status === 'available' && c.reference.reference.personalised
    ? ', based on your recorded body weight'
    : '';
  return `Across ${c.actual.loggedDays} logged ${c.actual.loggedDays === 1 ? 'day' : 'days'}, your average logged ${label} was ${avg}. Your current reference is ${ref}${basis}.`;
}

function buildDeterministicCopy(
  nutrient: NutrientRefKey, eligibleFoods: CoachingEligibleFood[],
): { title: string; suggestion: string } {
  const label = NUTRIENT_LABEL[nutrient];
  const title = `A small ${label.toLowerCase()} opportunity`;
  if (eligibleFoods.length > 0) {
    const f = eligibleFoods[0];
    const slot = f.mealSlots[0];
    const where = slot ? ` at ${slot}` : '';
    return {
      title,
      suggestion: `Your recent logs have been below your ${label.toLowerCase()} reference. ${f.name} already appears regularly in your logs${where}, so that could be a practical place to increase the ${label.toLowerCase()} contribution of a meal you already eat.`,
    };
  }
  return {
    title,
    suggestion: `Your recent logs have been below your ${label.toLowerCase()} reference. One practical place to start is choosing a single meal you already eat regularly and increasing its ${label.toLowerCase()} contribution.`,
  };
}

/**
 * Turns one eligible NutritionReferenceComparison into a full opportunity,
 * grounding it in the user's actual logged foods. Returns null if the
 * comparison is not `eligible`.
 */
export function buildOpportunity(
  c: NutritionReferenceComparison,
  entries: FoodLogEntry[],
  frequentFoods: LoggedFoodObservation[],
): NutritionCoachingOpportunity | null {
  if (getNutritionCoachingEligibility(c) !== 'eligible') return null;

  const contributors = getNutrientContributors(entries, c.nutrient as unknown as NutrientKey);
  const frequentKeys = new Set(frequentFoods.filter(f => f.level === 'frequently_logged').map(f => f.key));
  const eligibleFoods: CoachingEligibleFood[] = contributors
    .filter(ct => frequentKeys.has(ct.key))
    .slice(0, 3)
    .map(ct => ({
      name: ct.name, mealSlots: ct.mealSlots, occurrenceDays: ct.occurrenceDays, nutrientShare: ct.shareOfKnownTotal,
    }));

  const unit = NUTRIENT_UNIT[c.nutrient as keyof typeof NUTRIENT_UNIT] ?? '';
  const copy = buildDeterministicCopy(c.nutrient, eligibleFoods);

  return {
    id: `${c.nutrient}-${c.state}`,
    nutrient: c.nutrient,
    nutrientLabel: NUTRIENT_LABEL[c.nutrient],
    comparison: c.state,
    readiness: c.readiness,
    eligibility: 'eligible',
    domain: (COACHING_MACRO_NUTRIENTS as readonly string[]).includes(c.nutrient) ? 'macro' : 'micronutrient',
    evidenceSummary: {
      averageLogged: c.actual.value,
      averageLoggedLabel: c.actual.value != null ? `${formatNutrientAmount(c.actual.value, unit as any)} ${unit}/day` : '—',
      referenceLabel: referenceLabel(c),
      loggedDays: c.actual.loggedDays,
      windowDays: c.actual.windowDays,
      coverageBand: coverageBand(c.actual.coverage),
    },
    eligibleFoods,
    why: buildWhy(c),
    deterministicTitle: copy.title,
    deterministicSuggestion: copy.suggestion,
    action: actionFor(c.nutrient),
  };
}

// ── Prioritisation (§7) ────────────────────────────────────────────────────

export const MAX_COACHING_OPPORTUNITIES = 3;

const READINESS_RANK: Record<ReferenceReadiness, number> = { high: 0, moderate: 1, limited: 2, unavailable: 3 };

/**
 * Deterministic ordering. NOT influenced by any commercial signal — there is
 * no marketplace/provider/commission input anywhere in this module.
 *   1. stronger evidence first (readiness)
 *   2. macros before micronutrients (more food-groundable, safer)
 *   3. opportunities that CAN be grounded in an existing food first
 *   4. stable tiebreak by nutrient key
 */
export function prioritiseOpportunities(list: NutritionCoachingOpportunity[]): NutritionCoachingOpportunity[] {
  return [...list].sort((a, b) =>
    READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness]
    || (a.domain === b.domain ? 0 : a.domain === 'macro' ? -1 : 1)
    || (Number(b.eligibleFoods.length > 0) - Number(a.eligibleFoods.length > 0))
    || a.nutrient.localeCompare(b.nutrient),
  ).slice(0, MAX_COACHING_OPPORTUNITIES);
}

/** The full deterministic pipeline: comparisons → prioritised, grounded opportunities. */
export function buildNutritionCoachingOpportunities(
  comparisons: NutritionReferenceComparison[],
  entries: FoodLogEntry[],
  _days?: DayNutrition[],
  _patterns?: NutritionPatternEvidence,
): NutritionCoachingOpportunity[] {
  const frequentFoods = getFrequentlyLoggedFoods(entries);
  const built = comparisons
    .map(c => buildOpportunity(c, entries, frequentFoods))
    .filter((o): o is NutritionCoachingOpportunity => o !== null);
  return prioritiseOpportunities(built);
}
