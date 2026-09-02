// ACP Intelligence™ — Nutrition N2. Deterministic, product-defined nutrient
// presentation metadata: canonical unit, human label, and the display order
// for progressive disclosure (§16/§17).
//
// This is NOT clinical guidance and NOT personalised. It is a fixed product
// choice of which nutrients to surface first. No LLM, no per-user ranking.
//
// Units are derived from the canonical key suffix so display can never drift
// from the schema: `*Kcal` → kcal, `*G` → g, `*Mg` → mg, `*Ug` → µg.

import { NUTRIENT_KEYS, MACRO_KEYS, type NutrientKey } from './food-types.ts';

export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'µg';

/** Canonical display unit for a nutrient key, from its suffix. Total function over NUTRIENT_KEYS. */
export function nutrientUnit(key: NutrientKey): NutrientUnit {
  if (key.endsWith('Kcal')) return 'kcal';
  if (key.endsWith('Ug')) return 'µg';
  if (key.endsWith('Mg')) return 'mg';
  if (key.endsWith('G')) return 'g';
  // NUTRIENT_KEYS only contains the four suffixes above; this is unreachable.
  throw new Error(`No canonical unit for nutrient key "${key}"`);
}

/** Every key → its unit. Frozen; used by the UI and asserted in tests. */
export const NUTRIENT_UNIT: Readonly<Record<NutrientKey, NutrientUnit>> =
  Object.freeze(NUTRIENT_KEYS.reduce((acc, k) => {
    acc[k] = nutrientUnit(k);
    return acc;
  }, {} as Record<NutrientKey, NutrientUnit>));

/** Human label for a nutrient. Plain, non-clinical. */
export const NUTRIENT_LABEL: Readonly<Record<NutrientKey, string>> = Object.freeze({
  energyKcal: 'Calories',
  proteinG: 'Protein',
  carbohydrateG: 'Carbohydrate',
  fatG: 'Fat',
  saturatedFatG: 'Saturated fat',
  fibreG: 'Fibre',
  sugarG: 'Sugars',
  sodiumMg: 'Sodium',
  calciumMg: 'Calcium',
  ironMg: 'Iron',
  magnesiumMg: 'Magnesium',
  phosphorusMg: 'Phosphorus',
  potassiumMg: 'Potassium',
  zincMg: 'Zinc',
  copperMg: 'Copper',
  manganeseMg: 'Manganese',
  seleniumUg: 'Selenium',
  vitaminAUg: 'Vitamin A',
  thiaminB1Mg: 'Thiamin (B1)',
  riboflavinB2Mg: 'Riboflavin (B2)',
  niacinB3Mg: 'Niacin (B3)',
  pantothenicB5Mg: 'Pantothenic acid (B5)',
  vitaminB6Mg: 'Vitamin B6',
  biotinB7Ug: 'Biotin (B7)',
  folateB9Ug: 'Folate (B9)',
  vitaminB12Ug: 'Vitamin B12',
  vitaminCMg: 'Vitamin C',
  vitaminDUg: 'Vitamin D',
  vitaminEMg: 'Vitamin E',
  vitaminKUg: 'Vitamin K',
});

/**
 * The five macros N2's "Logged today" header shows, in order. These are the
 * MACRO_KEYS from N1 — re-exported here with an explicit order for the UI.
 */
export const MACRO_DISPLAY_ORDER: readonly NutrientKey[] =
  ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fibreG'];

/**
 * "Key nutrients" — the compact list shown before "View all nutrients"
 * (§16 progressive disclosure). Product-defined order, not clinical ranking,
 * not personalised. Excludes the macros (shown separately).
 */
export const KEY_NUTRIENTS: readonly NutrientKey[] = [
  'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'zincMg',
  'vitaminCMg', 'vitaminDUg', 'vitaminB12Ug', 'folateB9Ug', 'vitaminAUg',
];

/** Everything else, revealed by "View all nutrients". */
export const SECONDARY_NUTRIENTS: readonly NutrientKey[] = [
  'saturatedFatG', 'sugarG',
  'phosphorusMg', 'copperMg', 'manganeseMg', 'seleniumUg',
  'thiaminB1Mg', 'riboflavinB2Mg', 'niacinB3Mg', 'pantothenicB5Mg', 'vitaminB6Mg',
  'biotinB7Ug', 'vitaminEMg', 'vitaminKUg',
];

// Sanity: the three display lists must partition the full nutrient set exactly.
{
  const covered = new Set<NutrientKey>([
    ...MACRO_DISPLAY_ORDER, ...KEY_NUTRIENTS, ...SECONDARY_NUTRIENTS,
  ]);
  if (covered.size !== NUTRIENT_KEYS.length) {
    throw new Error('nutrient-display lists do not partition NUTRIENT_KEYS');
  }
}

/**
 * Round a nutrient amount for display without inventing precision.
 *   kcal  → whole number
 *   g     → 1 dp under 10, else whole
 *   mg/µg → 1 dp under 10, else whole
 */
export function formatNutrientAmount(value: number, unit: NutrientUnit): string {
  if (unit === 'kcal') return String(Math.round(value));
  if (value < 10) return (Math.round(value * 10) / 10).toString();
  return String(Math.round(value));
}

// Re-export so callers get the macro set from one place.
export { MACRO_KEYS };
