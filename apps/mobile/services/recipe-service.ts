// Lana Nutrition — Recipes V1. The one service boundary for the recipe
// catalogue (food_recipes + food_recipe_ingredients + foods). UI screens
// call only this; never Supabase directly for recipe data.
//
// Recipes are read-only, admin/import-sourced content — this service never
// writes. Logging a recipe's portion goes through the EXISTING N1 path
// (foodLogService.getFood/logFood), never a second nutrient calculation —
// see app/recipe-detail.tsx.

import { supabase } from '@/lib/supabase';
import { FOOD_SELECT, mapDbFoodRow } from '@/services/providers/food-provider';
import type { CanonicalFood } from '@/lib/nutrition/food-types';
import type { RecipeRecord, RecipeIngredient, RecipeNutrientStatus } from '@/lib/nutrition/recipe-model';
import type { ParsedRecipeInstructions } from '@/lib/nutrition/recipe-instructions';

const RECIPE_SELECT = [
  'id', 'food_id', 'name', 'category', 'source', 'source_reference', 'source_url',
  'serves', 'preparation_time_text', 'cooking_time_text', 'instructions',
  'nutrient_status', 'nutrient_note',
].join(', ');

/** `food_recipes.instructions` is jsonb — supabase-js already hands back a
 *  parsed object, never a string to re-parse. Shape-checked defensively
 *  (never trusted blindly) so a malformed row degrades to the honest "not
 *  available" fallback in the UI rather than throwing. */
function mapInstructions(value: unknown): ParsedRecipeInstructions | null {
  if (!value || typeof value !== 'object') return null;
  const sections = (value as any).sections;
  if (!Array.isArray(sections)) return null;
  return value as ParsedRecipeInstructions;
}

function mapRecipeRow(row: Record<string, any>): RecipeRecord {
  return {
    id: String(row.id),
    foodId: row.food_id ?? null,
    name: String(row.name),
    category: row.category ?? null,
    source: String(row.source),
    sourceReference: String(row.source_reference),
    sourceUrl: row.source_url ?? null,
    serves: row.serves == null ? null : Number(row.serves),
    preparationTimeText: row.preparation_time_text ?? null,
    cookingTimeText: row.cooking_time_text ?? null,
    instructions: mapInstructions(row.instructions),
    nutrientStatus: row.nutrient_status as RecipeNutrientStatus,
    nutrientNote: row.nutrient_note ?? null,
  };
}

/** Compact row for the Recipes browse/search list — one query, no N+1
 *  (§25): a single select joining `food_recipes` to its linked `foods` row
 *  for the macro/status fields the card needs, nothing per-row after. */
export interface RecipeSummary {
  recipeId: string;
  foodId: string;
  name: string;
  category: string | null;
  cuisineBadge: 'Kenyan' | null;
  energyKcalPer100g: number | null;
  proteinGPer100g: number | null;
  verified: boolean;
}

const SUMMARY_SELECT = [
  'id', 'food_id', 'name', 'category', 'nutrient_status',
  'foods!food_recipes_food_id_fkey(is_active, composition_method, country_code, energy_kcal, protein_g)',
].join(', ');

function mapSummaryRow(row: Record<string, any>): RecipeSummary | null {
  const food = Array.isArray(row.foods) ? row.foods[0] : row.foods;
  if (!food || food.is_active !== true || food.composition_method !== 'standard_recipe_verified') return null;
  if (row.nutrient_status !== 'available' || !row.food_id) return null;
  return {
    recipeId: String(row.id),
    foodId: String(row.food_id),
    name: String(row.name),
    category: row.category ?? null,
    cuisineBadge: food.country_code === 'KE' ? 'Kenyan' : null,
    energyKcalPer100g: food.energy_kcal == null ? null : Number(food.energy_kcal),
    proteinGPer100g: food.protein_g == null ? null : Number(food.protein_g),
    verified: true,
  };
}

export const recipeService = {
  /** §5/§6 — browse/search. Deterministic name-substring match (mirrors
   *  foodLogService.searchFoods's ilike pattern exactly — no fuzzy match,
   *  no legacy `meals` search). `cuisine` is an optional exact filter over
   *  the food's real `country_code`, never a fabricated tag. */
  async listRecipes(opts: { search?: string; cuisine?: 'kenyan' } = {}): Promise<RecipeSummary[]> {
    let query = supabase.from('food_recipes').select(SUMMARY_SELECT).order('name');
    const q = opts.search?.trim();
    if (q && q.length >= 2) query = query.ilike('name', `%${q}%`);
    const { data, error } = await query.limit(300);
    if (error) throw new Error(`Failed to load recipes: ${error.message}`);
    let rows = ((data as any[]) ?? []).map(mapSummaryRow).filter((r): r is RecipeSummary => r != null);
    if (opts.cuisine === 'kenyan') rows = rows.filter(r => r.cuisineBadge === 'Kenyan');
    return rows;
  },

  /** §7/§25 — full detail: the recipe row, its linked canonical food (full
   *  nutrient vector + servings), and its ingredients — three bounded
   *  queries (never all recipes' ingredients up front), no N+1. Returns
   *  null when the recipe is not eligible for discovery (§3/§24) so the
   *  screen can show an honest "not available" state rather than partial
   *  or invented data. */
  async getRecipeByFoodId(foodId: string): Promise<{ recipe: RecipeRecord; food: CanonicalFood; ingredients: RecipeIngredient[] } | null> {
    const { data: recipeRow, error: recErr } = await supabase
      .from('food_recipes').select(RECIPE_SELECT).eq('food_id', foodId).maybeSingle();
    if (recErr) throw new Error(`Failed to load recipe: ${recErr.message}`);
    if (!recipeRow) return null;
    const recipe = mapRecipeRow(recipeRow);
    if (recipe.nutrientStatus !== 'available' || !recipe.foodId) return null;

    const [{ data: foodRow, error: foodErr }, { data: servingRows }, { data: ingredientRows, error: ingErr }] = await Promise.all([
      supabase.from('foods').select(FOOD_SELECT).eq('id', foodId).maybeSingle(),
      supabase.from('food_servings').select('label, grams, sort_order').eq('food_id', foodId).order('sort_order'),
      supabase.from('food_recipe_ingredients')
        .select('id, sort_order, ingredient_name, grams, household_measure, canonical_food_id')
        .eq('recipe_id', recipe.id).order('sort_order'),
    ]);
    if (foodErr) throw new Error(`Failed to load food: ${foodErr.message}`);
    if (ingErr) throw new Error(`Failed to load ingredients: ${ingErr.message}`);
    const foodRecord = foodRow as unknown as Record<string, any> | null;
    // is_active is deliberately NOT in FOOD_SELECT (services/providers/
    // food-provider.ts) — the app's existing convention relies on RLS itself
    // to guarantee it (foods' SELECT policy is `USING (is_active = true)`),
    // so any row returned here is already active by construction. A local
    // `foodRecord.is_active !== true` check would read a column never
    // selected (always undefined) and reject every real row — exactly the
    // "This recipe is not available right now." bug this fixes.
    if (!foodRecord || foodRecord.composition_method !== 'standard_recipe_verified') return null;

    const food = mapDbFoodRow(foodRecord, (servingRows as any[]) ?? []);
    const ingredients: RecipeIngredient[] = ((ingredientRows as any[]) ?? []).map(r => ({
      id: String(r.id),
      sortOrder: Number(r.sort_order),
      ingredientName: String(r.ingredient_name),
      grams: Number(r.grams),
      householdMeasure: r.household_measure ?? null,
      canonicalFoodId: r.canonical_food_id ?? null,
    }));
    return { recipe, food, ingredients };
  },

  /**
   * §15/§20/§25 — every eligible recipe's (food, recipe) pair, for the
   * suggested-meal candidate pool. ONE query (not per-slot, not per-
   * candidate) — the caller (app/today-nutrition.tsx) slots each row into
   * its eligible occasion(s) in memory via
   * lib/nutrition/recipe-model.ts's slotsForRecipeCategory.
   */
  async listActiveForSuggestions(): Promise<{ food: CanonicalFood; recipe: RecipeRecord }[]> {
    const { data, error } = await supabase
      .from('food_recipes')
      .select(`${RECIPE_SELECT}, foods!food_recipes_food_id_fkey(${FOOD_SELECT})`)
      .eq('nutrient_status', 'available')
      .not('food_id', 'is', null)
      .limit(300);
    if (error) throw new Error(`Failed to load suggestion candidates: ${error.message}`);
    const out: { food: CanonicalFood; recipe: RecipeRecord }[] = [];
    for (const row of (data as any[]) ?? []) {
      const foodRow = Array.isArray(row.foods) ? row.foods[0] : row.foods;
      // is_active not checked here — not selected by FOOD_SELECT, RLS
      // already guarantees it (see getRecipeByFoodId's comment above).
      if (!foodRow || foodRow.composition_method !== 'standard_recipe_verified') continue;
      out.push({ food: mapDbFoodRow(foodRow), recipe: mapRecipeRow(row) });
    }
    return out;
  },
};
