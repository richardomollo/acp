// ACP Intelligence™ — Nutrition Catalogue Infrastructure V1.
//
// AUTHORING-TIME composer, NOT a runtime consumer. Turns a structured recipe
// of canonical `foods` ingredients (food id + grams) into a frozen `meals`
// catalogue row — reusing N1's exact deterministic nutrient maths
// (resolveGrams / computeLogSnapshot / sumDailyNutrition) verbatim. No new
// nutrient arithmetic exists in this file.
//
// Architectural boundary preserved (per the FoodData Central Catalogue
// Audit): FDC → foods (nutritional evidence) → this composer → meals
// (recommendation catalogue) → Lana Intelligence. FoodData Central is never
// called live here or anywhere downstream — every ingredient must already
// exist as a canonical `foods` row (offline-curated, N1).
//
// Never imported by any user-facing screen or recommendation service. The
// intended caller is a one-off authoring script that fetches the requested
// `foods` rows, calls `composeMeal`, and inserts the result into `meals`.

import {
  type CanonicalFood, type Nutrients, type FoodLogEntry,
} from './food-types.ts';
import { computeLogSnapshot, sumDailyNutrition, PortionError } from './food-nutrition.ts';

// ── Canonical domain values (mirrors the live DB CHECK constraints) ────────

/** `meals.cuisine` CHECK — 20260829000002_international_nutrition_expansion.sql. */
export const CANONICAL_MEAL_CUISINES = [
  'kenyan', 'east_african', 'mediterranean', 'south_asian', 'indian',
  'middle_eastern', 'east_asian', 'western', 'european', 'global',
] as const;
export type CanonicalMealCuisine = typeof CANONICAL_MEAL_CUISINES[number];

/** `meals.category` CHECK — 20260729000006_nutrition_hub_schema.sql. */
export const CANONICAL_MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] as const;
export type CanonicalMealCategory = typeof CANONICAL_MEAL_CATEGORIES[number];

export const CANONICAL_MEAL_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type CanonicalMealDifficulty = typeof CANONICAL_MEAL_DIFFICULTIES[number];

/**
 * `meals.composition_method` CHECK — 20260916000001_meal_catalogue_provenance.sql,
 * mirrors `foods.composition_method` (N7.5B) exactly. Only the two
 * "assembled from ingredients" values are AUTHORABLE by this composer:
 * `direct_verified` and `proxy_composition` describe a single food's own
 * evidence, not a multi-ingredient dish Lana itself assembled — a composed
 * meal must never claim either (§2 of the Catalogue Infrastructure V1 spec).
 */
export const AUTHORABLE_COMPOSITION_METHODS = ['standard_recipe_verified', 'standard_recipe_estimated'] as const;
export type AuthorableCompositionMethod = typeof AUTHORABLE_COMPOSITION_METHODS[number];

/**
 * The macro keys EVERY ingredient's food must supply, or composition fails
 * loudly rather than let a missing value silently render as 0 (§7).
 *
 * fibreG is deliberately NOT in this list — Catalogue Content V1 §1
 * (evidence-completeness review): Lana's established invariant is
 * UNKNOWN ≠ ZERO (food-nutrition.ts, meal-preference-learning.ts,
 * nutrition-history.ts's per-nutrient completeness all draw the same line).
 * The original implementation treated a missing fibreG exactly like a
 * missing energyKcal — invalidating the WHOLE recipe — which is stricter
 * than that invariant requires and stricter than necessary: fibre is
 * commonly the least-reported value in real food-composition data (several
 * of ACP's own existing `foods` rows carry a measured 0 rather than null,
 * but a future ingredient — e.g. a Branded product — legitimately could lack
 * it while still fully reporting energy/protein/carb/fat). Per "do not
 * weaken safety for core calorie/macronutrient evidence merely to increase
 * catalogue size," the four CORE macros stay a hard requirement — only
 * fibre is relaxed, and only in the correct direction: a meal missing fibre
 * evidence composes with `fibre_g: null` (honestly incomplete), never a
 * partial sum silently standing in for the true total. See
 * `composeMeal`'s fibre handling below and meal-composer.test.ts's K/L.
 */
const REQUIRED_MACRO_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'] as const;

// ── Input / output shapes ───────────────────────────────────────────────

export interface MealIngredientInput {
  foodId: string;
  /** Catalogue v1 constraint (§6): grams only. Must be finite and > 0. */
  grams: number;
}

export interface ComposeMealInput {
  name: string;
  cuisine: CanonicalMealCuisine;
  category: CanonicalMealCategory;
  description?: string | null;
  ingredients: MealIngredientInput[];
  tags?: string[];
  servingDescription?: string | null;
  difficulty?: CanonicalMealDifficulty | null;
  prepTimeMinutes?: number | null;
  /** Required — a composed meal is never allowed to be provenance-less (§7). */
  recipeSource: string;
  recipeReference: string;
  compositionMethod: AuthorableCompositionMethod;
}

/** A resolved ingredient's contribution — kept alongside the composed row so
 *  callers/tests can see the composition survived intact (§4/§9 — ingredient
 *  identity, and I of §9's test list). */
export interface ComposedIngredient {
  foodId: string;
  foodName: string;
  grams: number;
  nutrients: Nutrients;
}

/** A frozen, insert-ready `meals` row (snake_case — matches the DB columns
 *  the composer ultimately writes). */
export interface ComposedMeal {
  name: string;
  category: CanonicalMealCategory;
  cuisine: CanonicalMealCuisine;
  description: string | null;
  /** Display-only text[], for backwards compatibility with existing rows
   *  (§4) — never the source of the nutrient numbers below. */
  ingredients: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** `null` when ≥1 ingredient's fibre evidence is unknown — UNKNOWN ≠ ZERO
   *  (§1 of the Catalogue Content V1 evidence-completeness review). Never a
   *  partial sum standing in for the true total. */
  fibre_g: number | null;
  prep_time_minutes: number | null;
  difficulty: CanonicalMealDifficulty | null;
  tags: string[];
  serving_description: string | null;
  source: string;
  source_type: 'acp_curated';
  composition_method: AuthorableCompositionMethod;
  recipe_source: string;
  recipe_reference: string;
  is_active: boolean;
  /** Not a DB column — true when every ingredient reported fibreG, i.e.
   *  `fibre_g` above is a real total rather than `null`. */
  fibreComplete: boolean;
  /** Not a DB column — the per-ingredient breakdown, for authoring-time
   *  review and test assertions (§9 I). */
  __ingredientBreakdown: ComposedIngredient[];
}

export type ComposeMealErrorCode =
  | 'invalid_name' | 'invalid_cuisine' | 'invalid_category' | 'invalid_composition_method'
  | 'missing_recipe_metadata' | 'no_ingredients' | 'unknown_food' | 'invalid_grams'
  | 'incomplete_macro_evidence';

export class ComposeMealError extends Error {
  code: ComposeMealErrorCode;
  detail?: string;
  constructor(code: ComposeMealErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'ComposeMealError';
    this.code = code;
    this.detail = detail;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Composes a `meals` row from canonical `foods` ingredients + gram
 * quantities. Deterministic and pure: same inputs (including the same
 * `foodsById` snapshot) always produce the same output (§9 A).
 *
 * `foodsById` must already be loaded by the caller (a thin authoring script
 * — this function makes no network/DB call itself, keeping FDC/foods
 * strictly an offline, curated source per the architecture audit).
 */
export function composeMeal(input: ComposeMealInput, foodsById: Map<string, CanonicalFood>): ComposedMeal {
  const name = input.name.trim();
  if (!name) throw new ComposeMealError('invalid_name', 'A meal must have a non-empty name.');

  if (!CANONICAL_MEAL_CUISINES.includes(input.cuisine)) {
    throw new ComposeMealError('invalid_cuisine', `"${input.cuisine}" is not a canonical meal cuisine.`, input.cuisine);
  }
  if (!CANONICAL_MEAL_CATEGORIES.includes(input.category)) {
    throw new ComposeMealError('invalid_category', `"${input.category}" is not a canonical meal category.`, input.category);
  }
  if (!AUTHORABLE_COMPOSITION_METHODS.includes(input.compositionMethod)) {
    throw new ComposeMealError(
      'invalid_composition_method',
      `A composed meal must be "standard_recipe_verified" or "standard_recipe_estimated", not "${input.compositionMethod}".`,
      input.compositionMethod,
    );
  }
  if (!input.recipeSource?.trim() || !input.recipeReference?.trim()) {
    throw new ComposeMealError('missing_recipe_metadata', 'A composed meal must carry a recipe source and a stable recipe reference.');
  }
  if (!input.ingredients || input.ingredients.length === 0) {
    throw new ComposeMealError('no_ingredients', 'A meal must have at least one ingredient.');
  }

  const breakdown: ComposedIngredient[] = [];
  const displayIngredients: string[] = [];
  const synthetic: Pick<FoodLogEntry, 'nutrients'>[] = [];

  for (const ing of input.ingredients) {
    const food = foodsById.get(ing.foodId);
    if (!food) throw new ComposeMealError('unknown_food', `No canonical food found for id "${ing.foodId}".`, ing.foodId);

    if (typeof ing.grams !== 'number' || !Number.isFinite(ing.grams) || ing.grams <= 0) {
      throw new ComposeMealError('invalid_grams', `"${food.name}" has an invalid gram quantity (${String(ing.grams)}).`, ing.foodId);
    }

    // Fail loudly rather than let a missing ingredient nutrient silently
    // render as 0 in the composed total (§7/§9 C) — every REQUIRED macro
    // key must be real evidence, not absence coerced into a number.
    for (const key of REQUIRED_MACRO_KEYS) {
      if (food.nutrients[key] == null) {
        throw new ComposeMealError(
          'incomplete_macro_evidence',
          `"${food.name}" is missing ${key} — cannot compose a meal from incomplete macro evidence.`,
          `${ing.foodId}:${key}`,
        );
      }
    }

    let snap: Nutrients;
    try {
      snap = computeLogSnapshot(food, ing.grams);
    } catch (e) {
      if (e instanceof PortionError) throw new ComposeMealError('invalid_grams', e.message, ing.foodId);
      throw e;
    }

    breakdown.push({ foodId: ing.foodId, foodName: food.name, grams: ing.grams, nutrients: snap });
    displayIngredients.push(`${food.name} (${ing.grams}g)`);
    synthetic.push({ nutrients: snap });
  }

  // The exact same null-aware summation N1/N2/N6 already use — no parallel
  // maths (§3). The four CORE macros are always a real sum (every ingredient
  // was required to supply them above). Fibre is different: sumDailyNutrition
  // sums whatever's known and would silently treat "nothing known" as 0 —
  // exactly the coercion UNKNOWN ≠ ZERO forbids for a value we're about to
  // present as this meal's total. So fibre completeness is checked
  // explicitly, and only a genuinely complete fibre total is ever reported.
  const { macros } = sumDailyNutrition(synthetic as FoodLogEntry[]);
  const fibreComplete = breakdown.every(i => i.nutrients.fibreG != null);

  return {
    name,
    category: input.category,
    cuisine: input.cuisine,
    description: input.description?.trim() || null,
    ingredients: displayIngredients,
    calories: Math.round(macros.energyKcal),
    protein_g: round1(macros.proteinG),
    carbs_g: round1(macros.carbohydrateG),
    fat_g: round1(macros.fatG),
    fibre_g: fibreComplete ? round1(macros.fibreG) : null,
    prep_time_minutes: input.prepTimeMinutes ?? null,
    difficulty: input.difficulty ?? null,
    tags: input.tags ?? [],
    serving_description: input.servingDescription?.trim() || null,
    source: 'ACP curated recipe (FoodData Central-grounded ingredients)',
    source_type: 'acp_curated',
    composition_method: input.compositionMethod,
    recipe_source: input.recipeSource.trim(),
    recipe_reference: input.recipeReference.trim(),
    is_active: true,
    fibreComplete,
    __ingredientBreakdown: breakdown,
  };
}
