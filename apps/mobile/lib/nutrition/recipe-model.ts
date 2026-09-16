// Lana Nutrition — Recipes V1. Pure, deterministic recipe-domain logic.
//
// Recipes are a PRESENTATION / DISCOVERY / SUGGESTION / LOGGING layer over
// canonical food evidence (food_recipes + food_recipe_ingredients joined to
// foods) — never a second nutrition engine. Nothing here computes a
// nutrient value; that stays exactly where N1 already puts it
// (lib/nutrition/food-nutrition.ts). This module only decides WHICH recipes
// are eligible for discovery/suggestion, and adapts a (food, recipe) pair
// into the shapes the EXISTING deterministic systems already consume:
//   • lib/meal-ranking.ts's MealRow — the live today-nutrition.tsx ranker.
//   • lib/nutrition/nutrition-meal-model.ts's MealCandidate — the flagged-off
//     adaptive-nutrition ranker (Beta #022), for when that ships.
//
// No LLM anywhere in this file, and none should ever be added to it.

import type { CanonicalFood, MealSlot } from './food-types.ts';
import type { ParsedRecipeInstructions } from './recipe-instructions.ts';

export type RecipeNutrientStatus =
  | 'available' | 'unavailable_missing_yield_factors' | 'unavailable_missing_ingredient_composition';

// ── Legacy-meal ↔ KFCT-recipe family matching ──────────────────────────────
//
// The ONE deterministic, reviewable keyword matcher for "does this dish name
// belong to a KFCT-covered family" — used both by
// scripts/canonicalise-legacy-kenyan-meals.ts (which family of legacy `meals`
// rows to deactivate) and by app/meal-detail.tsx (surfacing a "verified
// recipe available" link on an OLD meal's page). One implementation, never
// duplicated — never fuzzy string distance.
const FAMILY_KEYWORDS = ['ugali', 'githeri', 'chapati', 'mukimo', 'pilau', 'uji', 'sukuma', 'mandazi', 'matoke'] as const;
const BEAN_KEYWORDS = ['bean', 'maharagwe', 'ndengu', 'lentil', 'mbaazi', 'njahi'];
const PORRIDGE_KEYWORDS = ['uji', 'porridge'];

/** Every KFCT dish family a name (a legacy meal's or a KFCT food's own)
 *  belongs to, by deliberate substring match — never fuzzy. */
export function matchedRecipeFamilies(name: string): string[] {
  const n = name.toLowerCase();
  const hit: string[] = [];
  for (const kw of FAMILY_KEYWORDS) if (n.includes(kw)) hit.push(kw);
  if (BEAN_KEYWORDS.some(kw => n.includes(kw))) hit.push('bean');
  if (PORRIDGE_KEYWORDS.some(kw => n.includes(kw)) && !hit.includes('uji')) hit.push('uji');
  return [...new Set(hit)];
}

/** A `food_recipes` row, mapped 1:1 (never re-derived). */
export interface RecipeRecord {
  id: string;
  foodId: string | null;
  name: string;
  category: string | null;
  source: string;
  sourceReference: string;
  sourceUrl: string | null;
  serves: number | null;
  preparationTimeText: string | null;
  cookingTimeText: string | null;
  /** Source-authored KFCT/FAO ordered preparation method, structured into
   *  sections/steps (see lib/nutrition/recipe-instructions.ts). NULL when no
   *  reliable method could be extracted from source (REVIEW_REQUIRED) or the
   *  recipe genuinely has none in the source — never LLM-generated. */
  instructions: ParsedRecipeInstructions | null;
  nutrientStatus: RecipeNutrientStatus;
  nutrientNote: string | null;
}

export interface RecipeIngredient {
  id: string;
  sortOrder: number;
  ingredientName: string;
  grams: number;
  householdMeasure: string | null;
  canonicalFoodId: string | null;
}

/**
 * §3 — the eligibility gate for user-facing discovery (browse/search) AND
 * for entering a suggestion pool. Deliberately conservative: a recipe only
 * qualifies when its linked food is active, nutritionally usable, and the
 * recipe itself reports a real composition. Every clause here is checked
 * directly against real data, never inferred.
 */
export function isRecipeEligibleForDiscovery(
  food: Pick<CanonicalFood, 'isGeneric' | 'compositionMethod'> & { isActive: boolean },
  recipe: Pick<RecipeRecord, 'foodId' | 'nutrientStatus'>,
): boolean {
  return (
    food.isActive === true &&
    recipe.nutrientStatus === 'available' &&
    recipe.foodId != null &&
    food.compositionMethod === 'standard_recipe_verified'
  );
}

// ── Suggested-meal candidate integration (§12-20) ──────────────────────────
//
// The live ranker (lib/meal-ranking.ts's getMealCandidates, consumed by
// today-nutrition.tsx) needs every candidate slotted into exactly one of
// breakfast/lunch/dinner/snack up front, at the DB-query call site (section
// 26 of that module's own header). KFCT's `food_recipes.category` groups
// dishes by DISH TYPE ("Porridges", "Legume Dishes", …), not by meal
// occasion, so there is no structured "this is a breakfast dish" field to
// read. Rather than fabricate a slot per individual dish (explicitly
// forbidden — §5), this maps at the CATEGORY level: a small, fixed,
// reviewable table encoding which occasions each KFCT category is
// genuinely eaten at in Kenyan cuisine. A category that's eaten at more
// than one occasion (e.g. Ugali/mains at both lunch and dinner) is listed
// for both — the dish itself is unchanged, it's simply eligible to be
// ranked into either slot's pool, exactly like any two-occasion legacy
// `meals` row already could be if it existed in both category queries.
const KFCT_CATEGORY_SLOTS: Record<string, MealSlot[]> = {
  'Porridges': ['breakfast'],
  'Common Snacks': ['snack'],
  'Desserts & Sauces': ['snack'],
  'Blood Dishes': ['lunch', 'dinner'],
  'Ugali': ['lunch', 'dinner'],
  'Maize Dishes': ['lunch', 'dinner'],
  'Mashed Dishes': ['lunch', 'dinner'],
  'Legume Dishes': ['lunch', 'dinner'],
  'Rice Dishes': ['lunch', 'dinner'],
  'Root & Banana Dishes': ['lunch', 'dinner'],
  'Vegetable Dishes': ['lunch', 'dinner'],
  'Meats, Fish & Eggs': ['lunch', 'dinner'],
  'Poultry': ['lunch', 'dinner'],
  'Accompaniments': ['lunch', 'dinner'],
};

/** The slots a recipe's KFCT category is eligible for. An unrecognised or
 *  absent category is eligible for NONE — it simply never enters the
 *  suggestion pool (still fully eligible for browse/search/logging). */
export function slotsForRecipeCategory(category: string | null): MealSlot[] {
  if (!category) return [];
  return KFCT_CATEGORY_SLOTS[category] ?? [];
}

/** Recipe-candidate ids are prefixed so today-nutrition.tsx can tell a
 *  canonical-recipe suggestion apart from a legacy `meals.id` without a
 *  second lookup — the prefix carries the food id directly (routing to
 *  Recipe Detail needs no extra fetch). */
const RECIPE_CANDIDATE_PREFIX = 'recipe:';

export function recipeCandidateId(foodId: string): string {
  return `${RECIPE_CANDIDATE_PREFIX}${foodId}`;
}

export function parseRecipeCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(RECIPE_CANDIDATE_PREFIX) ? candidateId.slice(RECIPE_CANDIDATE_PREFIX.length) : null;
}

/** The `lib/meal-ranking.ts` MealRow shape — deliberately duplicated (not
 *  imported) to avoid this pure model depending on that module; the two
 *  shapes are kept in lockstep by the recipe-browse/candidate test suite. */
export interface RecipeMealRow {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  tags: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number | null;
  is_active: boolean;
}

// ── Suggested-meal recipe-backing classification (§20/§21/§24) ────────────
//
// "Suggested meals must have a recipe": every suggestion the user is shown
// must be classifiable so the UI can be honest about whether it resolves to
// a canonical, openable recipe. `superseded` is included for completeness
// with the product spec's three-way classification, but is UNREACHABLE
// through the live query path today: a legacy `meals` row a KFCT import has
// superseded is set is_active=false by that import
// (scripts/import-kfct-recipes.ts step 6), and every suggestion query
// (app/today-nutrition.tsx) already filters `.eq('is_active', true)` before
// a row ever reaches this function — so a superseded row is excluded
// upstream, never merely relabelled here. It stays in the type so a future
// caller that DOESN'T pre-filter can't silently treat superseded as
// ordinary.
export type SuggestionSource = 'recipe_backed' | 'fallback_no_recipe' | 'superseded';

/**
 * §24 — classifies one suggested-meal candidate. `recipe_backed` is the
 * only classification a "View recipe" CTA / verified-recipe badge may ever
 * be shown for (§21/§25); `fallback_no_recipe` is a legacy `meals` row kept
 * only because no canonical recipe exists for that dish yet, and the UI
 * must render it in a way that is honestly distinguishable, never
 * equivalent to a verified recipe (§21).
 */
export function classifySuggestionSource(
  candidate: { recipeFoodId: string | null | undefined; isActive: boolean },
): SuggestionSource {
  if (!candidate.isActive) return 'superseded';
  return candidate.recipeFoodId ? 'recipe_backed' : 'fallback_no_recipe';
}

/**
 * Suggested Meals V1 recipe-only policy — the ONE place "is this
 * suggestion source allowed to reach a user-facing Suggested Meal" is
 * decided. Only `recipe_backed` is eligible; `fallback_no_recipe` and
 * `superseded` are excluded, never merely relabelled or hidden behind a
 * disclaimer. Applied BEFORE ranking (today-nutrition.tsx builds its
 * ranking pool exclusively from recipe candidates in the first place, so
 * this is also a defensive, explicit, testable assertion of that same
 * policy — not just an emergent property of which query ran).
 */
export function isSuggestionEligible(source: SuggestionSource): boolean {
  return source === 'recipe_backed';
}

/**
 * §14 — the smallest clean adapter into the EXISTING deterministic ranker.
 * The reference portion is 100g (§8/§19 — KFCT V1 is gram-based; no serving
 * is invented), so these are the food's own per-100g values verbatim — the
 * SAME numbers Recipe Detail's default view and a 100g food-search log
 * would show, never a second calculation.
 */
export function mealRowFromRecipe(
  food: Pick<CanonicalFood, 'id' | 'name' | 'countryCode' | 'nutrients'>,
  recipe: Pick<RecipeRecord, 'category'>,
  slot: MealSlot,
): RecipeMealRow {
  return {
    id: recipeCandidateId(food.id),
    name: food.name,
    category: slot,
    cuisine: food.countryCode === 'KE' ? 'kenyan' : 'global',
    tags: [],
    calories: food.nutrients.energyKcal ?? 0,
    protein_g: food.nutrients.proteinG ?? 0,
    carbs_g: food.nutrients.carbohydrateG ?? 0,
    fat_g: food.nutrients.fatG ?? 0,
    fibre_g: food.nutrients.fibreG,
    is_active: true,
  };
}
