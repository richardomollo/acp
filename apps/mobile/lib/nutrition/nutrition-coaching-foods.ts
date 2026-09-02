// ACP Intelligence™ — Nutrition N4. Deterministic FOOD-GROUNDING evidence.
//
// N4 becomes practical by grounding coaching in what the user ACTUALLY eats
// — never by inferring it. Every helper here is a pure function of the
// user's own frozen food-log entries (§9/§10/§35). No LLM, no name-based
// guessing ("high-protein food"), no invented habits.
//
//   • getFrequentlyLoggedFoods — a food is "frequently logged" only when it
//     appears on ≥3 distinct logged days. 1 day = single; 2 days = observed
//     more than once. Coaching only ever grounds on "frequently_logged".
//   • getNutrientContributors — foods whose FROZEN snapshots actually
//     supplied a non-negligible share of a nutrient across the window.
//   • getMealSlotPattern — the meal slot(s) a food most often appears in.

import type { FoodLogEntry, NutrientKey, MealSlot } from './food-types.ts';

export type FoodObservationLevel = 'single' | 'observed_more_than_once' | 'frequently_logged';

/** Occurrences of one food (keyed by foodId, or display name for name-only entries). */
export interface LoggedFoodObservation {
  key: string;
  name: string;
  foodId: string | null;
  /** number of DISTINCT local dates this food was logged on */
  occurrenceDays: number;
  /** total number of log entries for this food in the window */
  occurrenceEntries: number;
  level: FoodObservationLevel;
  /** meal slots this food appeared in, most-frequent first */
  mealSlots: MealSlot[];
}

function foodEntries(entries: FoodLogEntry[]): FoodLogEntry[] {
  // only real foods carry a snapshot we can reason about
  return entries.filter(e => e.quantityGrams != null && e.foodId != null);
}

function observationLevel(occurrenceDays: number): FoodObservationLevel {
  if (occurrenceDays >= 3) return 'frequently_logged';
  if (occurrenceDays === 2) return 'observed_more_than_once';
  return 'single';
}

function slotsByFrequency(entries: FoodLogEntry[]): MealSlot[] {
  const counts = new Map<MealSlot, number>();
  for (const e of entries) {
    if (e.mealSlot) counts.set(e.mealSlot, (counts.get(e.mealSlot) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

/** All logged foods with their observation level + meal-slot pattern, most-logged first. */
export function getFrequentlyLoggedFoods(entries: FoodLogEntry[]): LoggedFoodObservation[] {
  const byKey = new Map<string, FoodLogEntry[]>();
  for (const e of foodEntries(entries)) {
    const key = e.foodId as string;
    const list = byKey.get(key);
    if (list) list.push(e); else byKey.set(key, [e]);
  }
  const out: LoggedFoodObservation[] = [];
  for (const [key, es] of byKey) {
    const occurrenceDays = new Set(es.map(e => e.localDate)).size;
    out.push({
      key,
      name: es[0].displayName,
      foodId: es[0].foodId,
      occurrenceDays,
      occurrenceEntries: es.length,
      level: observationLevel(occurrenceDays),
      mealSlots: slotsByFrequency(es),
    });
  }
  return out.sort((a, b) => b.occurrenceDays - a.occurrenceDays || b.occurrenceEntries - a.occurrenceEntries || a.name.localeCompare(b.name));
}

export interface NutrientContributor {
  key: string;
  name: string;
  foodId: string | null;
  /** total known contribution of this nutrient by this food across the window */
  totalContribution: number;
  /** this food's share of the window's total KNOWN contribution to the nutrient (0–1) */
  shareOfKnownTotal: number;
  occurrenceDays: number;
  mealSlots: MealSlot[];
}

// A food counts as a meaningful contributor when it supplied at least this
// share of everything the user logged for that nutrient in the window, AND
// it appeared on at least 2 distinct days (not a one-off spike). Relative,
// so it needs no per-nutrient magic numbers.
const MIN_CONTRIBUTION_SHARE = 0.1;
const MIN_CONTRIBUTOR_DAYS = 2;

/**
 * Foods that actually supplied a non-negligible share of `nutrient` across
 * the window, from FROZEN snapshots only. A `null` snapshot value means the
 * source didn't supply that nutrient — it is skipped, never counted as 0.
 */
export function getNutrientContributors(entries: FoodLogEntry[], nutrient: NutrientKey): NutrientContributor[] {
  const byKey = new Map<string, { es: FoodLogEntry[]; total: number }>();
  let windowTotal = 0;
  for (const e of foodEntries(entries)) {
    const v = e.nutrients[nutrient];
    if (v == null) continue; // unknown ≠ zero
    windowTotal += v;
    const key = e.foodId as string;
    const acc = byKey.get(key);
    if (acc) { acc.es.push(e); acc.total += v; }
    else byKey.set(key, { es: [e], total: v });
  }
  if (windowTotal <= 0) return [];
  const out: NutrientContributor[] = [];
  for (const [key, { es, total }] of byKey) {
    const occurrenceDays = new Set(es.map(e => e.localDate)).size;
    const share = total / windowTotal;
    if (occurrenceDays < MIN_CONTRIBUTOR_DAYS || share < MIN_CONTRIBUTION_SHARE) continue;
    out.push({
      key, name: es[0].displayName, foodId: es[0].foodId,
      totalContribution: Math.round(total * 100) / 100,
      shareOfKnownTotal: Math.round(share * 100) / 100,
      occurrenceDays,
      mealSlots: slotsByFrequency(es),
    });
  }
  return out.sort((a, b) => b.shareOfKnownTotal - a.shareOfKnownTotal || a.name.localeCompare(b.name));
}

/** The meal slot(s) a specific food most often appears in (most-frequent first). */
export function getMealSlotPattern(entries: FoodLogEntry[], foodId: string): MealSlot[] {
  return slotsByFrequency(foodEntries(entries).filter(e => e.foodId === foodId));
}
