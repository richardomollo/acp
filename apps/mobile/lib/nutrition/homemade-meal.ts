// ACP Intelligence™ — Nutrition N6.5 (Beta Feedback #018). Universal
// cooked-meal logging: the PURE layer.
//
// The problem: a user cooks fried rice / beef stew / a curry / pasta / a
// homemade soup / rice and beans / a casserole, searches for it, and gets
// "No exact match". They must still be able to log it truthfully.
//
// The rule that shapes everything here: an LLM never invents a nutrition
// number, and an unknown dish is never turned into a verified canonical food.
// There are exactly three honest routes, all built from mechanisms that
// already exist:
//
//   1. BUILD FROM INGREDIENTS — the user lists canonical-food components and
//      confirmed portions; N6 sums the frozen per-component snapshots. Fully
//      deterministic. Stored as a reusable `saved_meals` row with provenance
//      `user_recipe_from_components`.
//
//   2. QUICK ESTIMATE — the user picks a standard estimated composition that
//      ACP already carries (N7.5 `foods` rows, source_type 'estimated',
//      composition_method 'standard_recipe_estimated'). The estimate is
//      disclosed; it is never a `direct_verified` fact.
//
//   3. ENTER THE NUMBERS — for a packaged or takeaway item with a label, or a
//      rough homemade estimate: the user types the macro totals for the
//      portion they ate. Logged as an N1 row with food_id null,
//      source_type 'user_custom' and userProvidedNutrition true. Blank
//      nutrients stay `null` (unknown) — never 0. Micronutrients are always
//      left unknown (a label rarely lists them; we do not guess).
//
// This module owns only the deterministic string/number helpers for routes
// 2–3. No network, no model, no randomness. Every function is a pure function
// of its arguments and unit-tested with `node --test`.

import {
  NUTRIENT_KEYS, emptyNutrients,
  type Nutrients, type NutrientKey, type FoodLogInput, type MealSlot, type SavedMealProvenance,
} from './food-types.ts';

/** The macro totals a user may type for a homemade / packaged / takeaway
 *  portion. Deliberately just the five N1 surfaces — a food label lists these
 *  and little else reliably. Everything outside this set stays `null`. */
export const MANUAL_MACRO_FIELDS = [
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fibreG',
] as const satisfies readonly NutrientKey[];

export type ManualMacroField = (typeof MANUAL_MACRO_FIELDS)[number];

export const MANUAL_MACRO_LABEL: Record<ManualMacroField, string> = {
  energyKcal: 'Calories (kcal)',
  proteinG: 'Protein (g)',
  carbohydrateG: 'Carbs (g)',
  fatG: 'Fat (g)',
  fibreG: 'Fibre (g)',
};

export const HOMEMADE_MEAL_SOURCE = 'User provided';

/** One-line disclosure shown wherever a user-entered homemade/packaged meal
 *  is displayed — history, day detail, the log confirmation. */
export const USER_PROVIDED_NUTRITION_DISCLOSURE =
  'These numbers are yours, not from a verified food database. Vitamins and minerals are left unknown, not zero.';

/** One-line disclosure for a saved meal, keyed on its provenance. */
export function savedMealProvenanceDisclosure(p: SavedMealProvenance): string | null {
  switch (p) {
    case 'user_recipe_from_components':
      return null; // an ingredient sum needs no caveat beyond each component's own
    case 'user_meal_estimated':
      return 'Estimated meal — the totals are approximate and can vary by how it’s made.';
    default:
      return null;
  }
}

/** Very short tag for a "My meals" row. */
export function savedMealProvenanceTag(p: SavedMealProvenance): string | null {
  return p === 'user_meal_estimated' ? 'estimate' : null;
}

export interface ParsedManualNutrition {
  /** true only when every non-blank field parsed to a finite value >= 0 */
  ok: boolean;
  /** a full nutrient vector: parsed macros set, everything else `null` (unknown, never 0) */
  nutrients: Nutrients;
  /** which macro fields the user actually filled in (a blank field is not "0") */
  filled: ManualMacroField[];
  /** per-field message for anything that could not be parsed */
  errors: Partial<Record<ManualMacroField, string>>;
}

/**
 * Parse the raw text inputs of the "enter the numbers" form.
 *
 *   • blank / whitespace            → `null` (UNKNOWN — the field is omitted
 *                                     from `filled`, and stays null in the
 *                                     snapshot; it is never treated as 0).
 *   • a finite number >= 0          → that number (an explicit "0" is a
 *                                     measured zero and is kept).
 *   • anything else (NaN, negative) → an error for that field; `ok` is false.
 *
 * Never fabricates a value and never cross-fills (e.g. it will not derive
 * kcal from macros — that would be inventing a number the user didn't give).
 */
export function parseManualNutrition(
  raw: Partial<Record<ManualMacroField, string>>,
): ParsedManualNutrition {
  const nutrients = emptyNutrients();
  const filled: ManualMacroField[] = [];
  const errors: Partial<Record<ManualMacroField, string>> = {};

  for (const field of MANUAL_MACRO_FIELDS) {
    const rawValue = (raw[field] ?? '').trim();
    if (rawValue === '') continue; // unknown — leave as null
    const n = Number(rawValue);
    if (!Number.isFinite(n)) {
      errors[field] = 'Enter a number, or leave it blank.';
      continue;
    }
    if (n < 0) {
      errors[field] = 'Can’t be negative.';
      continue;
    }
    nutrients[field] = Math.round(n * 1e4) / 1e4;
    filled.push(field);
  }

  return { ok: Object.keys(errors).length === 0, nutrients, filled, errors };
}

/** True when the parsed input carries at least one usable macro. A homemade
 *  entry with no numbers at all is a name-only entry, not this. */
export function hasAnyManualNutrient(parsed: ParsedManualNutrition): boolean {
  return parsed.filled.length > 0;
}

export interface ManualHomemadeMealSpec {
  /** what the user calls the dish, e.g. "Mum's beef stew" */
  name: string;
  /** approximate weight of the portion eaten, in grams (grams-first — §13).
   *  Required so the row is a real food entry, not a name-only one. */
  grams: number;
  /** free-text portion note kept for context, e.g. "1 big bowl". Optional. */
  portionNote?: string | null;
  macros: Partial<Record<ManualMacroField, string>>;
  mealSlot?: MealSlot | null;
}

export interface BuildManualHomemadeResult {
  ok: boolean;
  input?: FoodLogInput;
  /** form-level problems (name / grams) keyed by field */
  formErrors: { name?: string; grams?: string };
  /** per-macro parse problems */
  macroErrors: Partial<Record<ManualMacroField, string>>;
}

/**
 * Turn the "enter the numbers" form into a single N1 `FoodLogInput`:
 *   • foodId null — there is no canonical food and we will not create one;
 *   • unit 'g' with the user's approximate grams as the resolved basis;
 *   • the typed macros frozen verbatim as the snapshot TOTALS for that
 *     portion (nothing scales them — they already describe the whole portion);
 *   • captureMethod 'manual', userProvidedNutrition true.
 *
 * Pure — the service performs the write.
 */
export function buildManualHomemadeMealInput(spec: ManualHomemadeMealSpec): BuildManualHomemadeResult {
  const formErrors: BuildManualHomemadeResult['formErrors'] = {};
  const name = spec.name.trim();
  if (name.length === 0) formErrors.name = 'Give the meal a name.';
  else if (name.length > 80) formErrors.name = 'Keep the name under 80 characters.';

  if (!Number.isFinite(spec.grams) || spec.grams <= 0) {
    formErrors.grams = 'Enter about how many grams you ate.';
  }

  const parsed = parseManualNutrition(spec.macros);
  if (Object.keys(formErrors).length > 0 || !parsed.ok) {
    return { ok: false, formErrors, macroErrors: parsed.errors };
  }

  const note = spec.portionNote?.trim() || null;
  const input: FoodLogInput = {
    foodId: null,
    displayName: name,
    brand: null,
    quantity: Math.round(spec.grams * 1e4) / 1e4,
    unit: 'g',
    servingLabel: null,
    mealSlot: spec.mealSlot ?? null,
    captureMethod: 'manual',
    note,
    nutrients: pickMacros(parsed.nutrients),
    userProvidedNutrition: true,
  };
  return { ok: true, input, formErrors: {}, macroErrors: {} };
}

/** Just the macro keys that were actually set — a compact partial the service
 *  merges onto an empty (all-null) vector before persisting. */
function pickMacros(nutrients: Nutrients): Partial<Nutrients> {
  const out: Partial<Nutrients> = {};
  for (const field of MANUAL_MACRO_FIELDS) {
    if (nutrients[field] != null) out[field] = nutrients[field];
  }
  return out;
}

/** Normalise an arbitrary partial nutrient input to a full vector: listed
 *  keys copied through (finite, >= 0), everything else `null`. Used by the
 *  service so a user-provided snapshot can never smuggle in a bad value or a
 *  micronutrient guess. */
export function normaliseUserNutrients(partial: Partial<Nutrients> | null | undefined): Nutrients {
  const out = emptyNutrients();
  if (!partial) return out;
  for (const k of NUTRIENT_KEYS) {
    const v = partial[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[k] = Math.round(v * 1e4) / 1e4;
    }
  }
  return out;
}
