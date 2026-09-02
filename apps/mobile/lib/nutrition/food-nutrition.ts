// ACP Intelligence™ — Nutrition N1. Pure, deterministic nutrient maths.
//
// This is the whole "LLM ≠ nutrient calculator" boundary (N1 §5): given a
// canonical food (nutrients per basis grams) and a quantity the user
// actually consumed, produce the scaled nutrient snapshot — arithmetic only,
// no model, no network, no randomness. Every function here is a pure
// function of its arguments, unit-tested with `node --test`.
//
// Missing ≠ zero is enforced at every step: a `null` nutrient stays `null`
// through scaling and summation; only a real measured `0` stays `0`.

import {
  NUTRIENT_KEYS, MACRO_KEYS, emptyNutrients,
  type Nutrients, type NutrientKey, type CanonicalFood, type FoodLogEntry, type LogUnit,
} from './food-types.ts';

// Keep a few extra decimals through intermediate maths; callers round for display.
function roundNutrient(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

export type PortionErrorCode = 'invalid_quantity' | 'unit_not_supported' | 'serving_unknown';

export class PortionError extends Error {
  code: PortionErrorCode;
  constructor(code: PortionErrorCode, message: string) {
    super(message);
    this.name = 'PortionError';
    this.code = code;
  }
}

/** A logged quantity must be a finite number strictly greater than zero (N1 §38). */
export function validateQuantity(quantity: unknown): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new PortionError('invalid_quantity', 'Quantity must be a number greater than 0.');
  }
  return quantity;
}

/**
 * Resolves a user-entered amount to GRAMS — the single deterministic scaling
 * basis. Rules (N1 §7/§8/§9):
 *   • 'g'       → the number as-is.
 *   • 'ml'      → only when the food carries a real density (densityGPerMl);
 *                 otherwise PortionError — never a fake 1 ml = 1 g assumption.
 *   • 'serving' → the grams of the named serving (from food.servings, or the
 *                 food's default serving); PortionError if the label is
 *                 unknown — servings are never invented.
 */
export function resolveGrams(
  food: Pick<CanonicalFood, 'densityGPerMl' | 'servings' | 'defaultServingGrams' | 'defaultServingLabel'>,
  quantity: number,
  unit: LogUnit,
  servingLabel?: string | null,
): number {
  validateQuantity(quantity);
  switch (unit) {
    case 'g':
      return roundNutrient(quantity);
    case 'ml': {
      if (food.densityGPerMl == null || !(food.densityGPerMl > 0)) {
        throw new PortionError('unit_not_supported', 'This food has no volume→weight conversion; log it in grams or a serving.');
      }
      return roundNutrient(quantity * food.densityGPerMl);
    }
    case 'serving': {
      const label = (servingLabel ?? '').trim();
      const match = food.servings.find(s => s.label === label);
      if (match) return roundNutrient(quantity * match.grams);
      if (label && food.defaultServingLabel === label && food.defaultServingGrams != null) {
        return roundNutrient(quantity * food.defaultServingGrams);
      }
      // No label given but the food has exactly one obvious default serving.
      if (!label && food.defaultServingGrams != null) return roundNutrient(quantity * food.defaultServingGrams);
      throw new PortionError('serving_unknown', 'Unknown serving for this food.');
    }
    default:
      throw new PortionError('unit_not_supported', `Unsupported unit "${unit as string}".`);
  }
}

/** Scales a nutrient vector by `factor`. `null` stays `null`; `0` stays `0`. */
export function scaleNutrients(nutrients: Nutrients, factor: number): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    const v = nutrients[k];
    out[k] = v == null ? null : roundNutrient(v * factor);
  }
  return out;
}

/**
 * The nutrient snapshot for one log entry: the food's per-basis-gram values
 * scaled to the consumed grams. e.g. food is per 100 g, user ate 250 g →
 * factor 2.5. Deterministic; no rounding surprises beyond 4 dp.
 */
export function computeLogSnapshot(
  food: Pick<CanonicalFood, 'basisGrams' | 'nutrients'>,
  quantityGrams: number,
): Nutrients {
  validateQuantity(quantityGrams);
  if (!(food.basisGrams > 0)) throw new PortionError('invalid_quantity', 'Food basis grams must be > 0.');
  return scaleNutrients(food.nutrients, quantityGrams / food.basisGrams);
}

/**
 * Deterministic daily totals from real log entries (N1 §21).
 *   • Macros (MACRO_KEYS): sum of known values; `0` when nothing is known
 *     (matches the nutrition_day view's COALESCE — a day with only name-only
 *     entries totals 0, not null).
 *   • Micronutrients: sum of known values, or `null` when NO entry supplied
 *     the nutrient — "unknown" is preserved, never shown as 0 (N1 §3/§32).
 */
export function sumDailyNutrition(entries: Pick<FoodLogEntry, 'nutrients'>[]): {
  macros: Record<'energyKcal' | 'proteinG' | 'carbohydrateG' | 'fatG' | 'fibreG', number>;
  micros: Partial<Record<NutrientKey, number | null>>;
} {
  const macros = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 };
  const micros: Partial<Record<NutrientKey, number | null>> = {};

  for (const k of NUTRIENT_KEYS) {
    const known = entries.map(e => e.nutrients[k]).filter((v): v is number => v != null);
    if (MACRO_KEYS.includes(k)) {
      (macros as Record<string, number>)[k] = known.length > 0 ? roundNutrient(known.reduce((a, b) => a + b, 0)) : 0;
    } else {
      micros[k] = known.length > 0 ? roundNutrient(known.reduce((a, b) => a + b, 0)) : null;
    }
  }
  return { macros, micros };
}
