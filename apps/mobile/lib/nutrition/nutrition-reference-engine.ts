// ACP Intelligence™ — Nutrition N3. Pure, deterministic REFERENCE COMPARISON
// engine. No LLM, no network, no randomness — a function of (user reference
// context, N2 evidence, static reference data) → comparison results.
//
// N3 architecture (do not collapse):
//   food log → N2 evidence → user reference context → reference engine (HERE)
//   → deterministic comparison → reference view.  STOP before coaching.
//
// This module NEVER emits a recommendation ("eat more/less/add/reduce") and
// NEVER labels a state "deficient"/"excessive"/"healthy"/"unhealthy" — those
// are comparison states, not diagnoses (§17/§28/§30).

import type { NutrientKey } from './food-types.ts';
import type { DayNutrition } from './nutrition-history.ts';
import { averageKnownNutrientPerLoggedDay } from './nutrition-history.ts';
import { nutritionEvidenceTier, type NutritionEvidenceTier, type NutritionPatternEvidence } from './nutrition-patterns.ts';
import {
  NUTRIENT_REF_KEYS, POPULATION_REFERENCES, PROTEIN_PERFORMANCE_REFERENCE,
  type NutrientRefKey, type NutritionReferenceDefinition, type ReferenceSource, type Sex,
} from './nutrition-reference-data.ts';

// ── User reference context (§7/§23/§24/§25) ────────────────────────────────

export type ContextField<T> =
  | { status: 'available'; value: T }
  | { status: 'insufficient_context'; reason: string };

export interface WeightContextValue {
  kg: number;
  source: 'client_measurement' | 'health_daily_stats' | 'fitness_profile';
  /** ISO date the weight was recorded, when the source carries one. */
  recordedAt: string | null;
}

export interface UserReferenceContext {
  age: ContextField<number>;              // whole years, computed from DOB
  sex: ContextField<Sex>;                 // 'male' | 'female' only — see resolution rules
  weight: ContextField<WeightContextValue>;
}

// ── Reference resolution (§6/§7) ────────────────────────────────────────────

export type ReferenceAvailability =
  | { status: 'available'; reference: ResolvedReference }
  | { status: 'insufficient_context'; reason: string }
  | { status: 'not_applicable'; reason: string }
  | { status: 'unsupported'; reason: string };

export interface ResolvedReference {
  nutrient: NutrientRefKey;
  kind: NutritionReferenceDefinition['kind'];
  referenceType: 'exact' | 'range';
  value?: number;
  min?: number;
  max?: number;
  unit: string;
  source: ReferenceSource;
  notes?: string;
  /** true only when a personal variable (here: body weight) was actually used. */
  personalised: boolean;
}

const ADULT_MIN_AGE = 18;

/**
 * Deterministic whole-years age from a YYYY-MM-DD date of birth, as of `now`
 * (§24). Not persisted anywhere — recomputed every time. Handles the
 * birthday boundary: age only increments once the birth month/day has been
 * reached in the current year.
 */
export function computeAgeYears(dobIso: string, now: Date = new Date()): number {
  const [by, bm, bd] = dobIso.split('-').map(Number);
  let age = now.getFullYear() - by;
  const hadBirthdayThisYear =
    now.getMonth() + 1 > bm || (now.getMonth() + 1 === bm && now.getDate() >= bd);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

function ageEligibility(age: ContextField<number>): { ok: true } | { ok: false; availability: ReferenceAvailability } {
  if (age.status !== 'available') {
    return { ok: false, availability: { status: 'insufficient_context', reason: 'Your age is not on file, and adult nutrition references cannot be applied without it.' } };
  }
  if (age.value < ADULT_MIN_AGE) {
    return { ok: false, availability: { status: 'not_applicable', reason: 'These references are for adults (18+). ACP does not apply adult nutrition references to users under 18.' } };
  }
  return { ok: true };
}

/** Picks the population reference row(s) for one nutrient at the given age (population rows only, not protein). */
function resolvePopulationReference(nutrient: NutrientRefKey, context: UserReferenceContext): ReferenceAvailability {
  const ageCheck = ageEligibility(context.age);
  if (!ageCheck.ok) return ageCheck.availability;
  const age = (context.age as { status: 'available'; value: number }).value;

  const candidates = POPULATION_REFERENCES.filter(r =>
    r.nutrient === nutrient
    && age >= r.population.minAgeYears
    && (r.population.maxAgeYears == null || age <= r.population.maxAgeYears));

  if (candidates.length === 0) {
    return { status: 'not_applicable', reason: `No population reference is defined for this nutrient at age ${age}.` };
  }

  // Unisex row (population.sex === null) needs no sex context at all.
  const unisex = candidates.find(r => r.population.sex === null);
  if (unisex) return rowToAvailability(unisex, false);

  // Sex-specific: need sex context, and it must be 'male' or 'female'.
  const sexField = context.sex;
  if (sexField.status !== 'available') {
    return { status: 'insufficient_context', reason: 'This reference differs by sex, and your sex is not on file.' };
  }
  const sex = sexField.value;
  const row = candidates.find(r => r.population.sex === sex);
  if (!row) return { status: 'not_applicable', reason: `No reference is defined for this nutrient for ${sex} adults in this age range.` };
  return rowToAvailability(row, false);
}

function rowToAvailability(row: NutritionReferenceDefinition, personalised: boolean): ReferenceAvailability {
  if (row.unsupportedReason) return { status: 'unsupported', reason: row.unsupportedReason };
  const base = {
    nutrient: row.nutrient, kind: row.kind, referenceType: row.referenceType,
    unit: row.unit, source: row.source, notes: row.notes, personalised,
  };
  const reference: ResolvedReference = row.referenceType === 'exact'
    ? { ...base, referenceType: 'exact', value: row.value }
    : { ...base, referenceType: 'range', min: row.min, max: row.max };
  return { status: 'available', reference };
}

/** Protein: weight-based personalised performance range (§8). */
function resolveProteinReference(context: UserReferenceContext): ReferenceAvailability {
  const ageCheck = ageEligibility(context.age);
  if (!ageCheck.ok) return ageCheck.availability;

  if (context.weight.status !== 'available') {
    return { status: 'insufficient_context', reason: 'Add or update your current weight to see a protein reference — it is calculated from your body weight.' };
  }
  const kg = context.weight.value.kg;
  const def = PROTEIN_PERFORMANCE_REFERENCE;
  if (def.referenceType !== 'range') throw new Error('Protein reference definition must be a range.');
  const min = Math.round(kg * def.min * 10) / 10;
  const max = Math.round(kg * def.max * 10) / 10;
  return {
    status: 'available',
    reference: {
      nutrient: 'proteinG', kind: def.kind, referenceType: 'range', min, max, unit: 'g',
      source: def.source, notes: def.notes, personalised: true,
    },
  };
}

/** All eleven N3 references, resolved against one user's context. Deterministic; no I/O. */
export function getNutritionReferences(context: UserReferenceContext): Record<NutrientRefKey, ReferenceAvailability> {
  const out = {} as Record<NutrientRefKey, ReferenceAvailability>;
  for (const nutrient of NUTRIENT_REF_KEYS) {
    out[nutrient] = nutrient === 'proteinG'
      ? resolveProteinReference(context)
      : resolvePopulationReference(nutrient, context);
  }
  return out;
}

// ── Comparison (§16/§17/§37) ────────────────────────────────────────────────

export type ComparisonState =
  | 'below_reference' | 'meets_or_exceeds_reference'   // referenceType 'exact'
  | 'below_range' | 'within_range' | 'above_range'      // referenceType 'range'
  | 'insufficient_days' | 'insufficient_data'
  | 'insufficient_context' | 'not_applicable' | 'unsupported';

export type ReferenceReadiness = 'high' | 'moderate' | 'limited' | 'unavailable';

export interface ActualEvidence {
  /** average logged value across logged days in the window; null when no day knew this nutrient */
  value: number | null;
  basis: 'average_logged_day';
  loggedDays: number;
  windowDays: number;
  /** entry-level coverage ratio across the window's food entries (N2 §11), null if no food entries */
  coverage: number | null;
}

export interface NutritionReferenceComparison {
  nutrient: NutrientRefKey;
  actual: ActualEvidence;
  reference: ReferenceAvailability;
  state: ComparisonState;
  readiness: ReferenceReadiness;
}

// §11: coverage gate. §12: logged-day gate (reuses N2's own evidence tiers).
const MIN_LOGGED_DAYS_FOR_COMPARISON = 2;   // below this: no average-based comparison at all
const COVERAGE_INSUFFICIENT = 0.5;          // below this: comparison suppressed
const COVERAGE_HIGH = 0.8;                  // at/above this: unqualified-strength comparison

const LEVEL_ORDER: Record<ReferenceReadiness, number> = { unavailable: 0, limited: 1, moderate: 2, high: 3 };
function weaker(a: ReferenceReadiness, b: ReferenceReadiness): ReferenceReadiness {
  return LEVEL_ORDER[a] <= LEVEL_ORDER[b] ? a : b;
}
function dayReadiness(tier: NutritionEvidenceTier): ReferenceReadiness {
  switch (tier) {
    case 'recent_pattern': return 'high';
    case 'emerging_pattern': return 'moderate';
    case 'early_observation': return 'limited';
    default: return 'unavailable';
  }
}
function coverageReadiness(coverage: number): ReferenceReadiness {
  if (coverage >= COVERAGE_HIGH) return 'high';
  if (coverage >= COVERAGE_INSUFFICIENT) return 'limited';
  return 'unavailable';
}

function relationForExact(actual: number, value: number): ComparisonState {
  return actual >= value ? 'meets_or_exceeds_reference' : 'below_reference';
}
function relationForRange(actual: number, min: number, max: number): ComparisonState {
  if (actual < min) return 'below_range';
  if (actual > max) return 'above_range';
  return 'within_range';
}

/**
 * One nutrient's full comparison. Pure. `days` is the N2 history window
 * (frozen snapshots only); `patternCoverage` is that nutrient's window
 * coverage from N2's buildNutritionPatterns (nutrientCoverage[nutrient]).
 */
export function compareNutritionEvidence(
  nutrient: NutrientRefKey,
  days: DayNutrition[],
  patterns: NutritionPatternEvidence,
  referenceAvailability: ReferenceAvailability,
): NutritionReferenceComparison {
  const loggedDays = patterns.loggedDayCount;
  const windowDays = patterns.windowDays;
  const coverageEntry = patterns.nutrientCoverage[nutrient as unknown as NutrientKey];
  const coverage = coverageEntry && coverageEntry.totalEntryCount > 0 ? coverageEntry.coverageRatio : null;

  const value = nutrient === 'proteinG' || nutrient === 'fibreG'
    // macros: already coerced to 0-per-day-if-unknown at the DayNutrition level (N1/N2 convention).
    ? (loggedDays > 0 ? patterns.averagesPerLoggedDay[nutrient] : null)
    // micronutrients: NULL-aware multi-day average (§34/§35) — unknown days excluded, never 0.
    : averageKnownNutrientPerLoggedDay(days, nutrient as unknown as NutrientKey).average;

  const actual: ActualEvidence = { value, basis: 'average_logged_day', loggedDays, windowDays, coverage };

  // Reference-availability short-circuits (never reached the data gates below).
  if (referenceAvailability.status !== 'available') {
    return { nutrient, actual, reference: referenceAvailability, state: referenceAvailability.status, readiness: 'unavailable' };
  }

  if (loggedDays < MIN_LOGGED_DAYS_FOR_COMPARISON) {
    return { nutrient, actual, reference: referenceAvailability, state: 'insufficient_days', readiness: 'unavailable' };
  }
  if (coverage == null || coverage < COVERAGE_INSUFFICIENT) {
    return { nutrient, actual, reference: referenceAvailability, state: 'insufficient_data', readiness: 'unavailable' };
  }
  if (value == null) {
    return { nutrient, actual, reference: referenceAvailability, state: 'insufficient_data', readiness: 'unavailable' };
  }

  const tier = nutritionEvidenceTier(loggedDays);
  const readiness = weaker(dayReadiness(tier), coverageReadiness(coverage));

  const ref = referenceAvailability.reference;
  const state = ref.referenceType === 'exact'
    ? relationForExact(value, ref.value as number)
    : relationForRange(value, ref.min as number, ref.max as number);

  return { nutrient, actual, reference: referenceAvailability, state, readiness };
}

/** All N3 comparisons for one user, in NUTRIENT_REF_KEYS order. */
export function buildNutritionReferenceComparisons(
  context: UserReferenceContext,
  days: DayNutrition[],
  patterns: NutritionPatternEvidence,
): NutritionReferenceComparison[] {
  const references = getNutritionReferences(context);
  return NUTRIENT_REF_KEYS.map(n => compareNutritionEvidence(n, days, patterns, references[n]));
}

export { NUTRIENT_REF_KEYS };
export type { NutrientRefKey };
