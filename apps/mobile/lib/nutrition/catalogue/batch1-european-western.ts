// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 1.
//
// Deterministic, reviewable SOURCE for the first 20 European/Western meals
// (8 breakfast / 6 lunch / 6 dinner). This file is data only — no DB access,
// no nutrient arithmetic — so the catalogue can be recomposed and deployed
// reproducibly at any time via meal-composer.ts's composeMeal().
//
// Every ingredient below is a real, existing canonical `foods` row name
// (matched by exact name at authoring time — see the accompanying insertion
// script). No ingredient nutrient value is authored here; every meal's
// calories/protein/carbs/fat/fibre come ONLY from composeMeal()'s reuse of
// N1's deterministic maths over these ingredients + grams.
//
// Cuisine is explicitly 'western' or 'european' per meal (never inferred
// from foods.country_code or user location — Catalogue Content V1 §7).

import type { ComposeMealInput } from '../meal-composer.ts';

/** One ingredient line, referenced by the EXACT `foods.name` the insertion
 *  script resolves to a real food id — never a fabricated id. */
export interface Batch1IngredientLine {
  foodName: string;
  grams: number;
}

/** Same shape as ComposeMealInput, but `ingredients` reference food NAMES
 *  (resolved to ids by the insertion script against the live `foods` table)
 *  instead of ids directly — ids are an implementation detail of one
 *  database, names are the stable, reviewable source. */
export type Batch1MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch1IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch1MealSource, 'recipeSource' | 'compositionMethod'>): Batch1MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH1_EUROPEAN_WESTERN: Batch1MealSource[] = [
  // ── Breakfast (8) ──────────────────────────────────────────────────────
  meal({
    name: 'Greek Yoghurt, Oat & Banana Bowl',
    cuisine: 'western', category: 'breakfast',
    description: 'Whole-milk Greek yoghurt with rolled oats and fresh banana.',
    ingredients: [
      { foodName: 'Greek yoghurt, plain, whole milk', grams: 170 },
      { foodName: 'Oats, rolled, dry', grams: 40 },
      { foodName: 'Banana, raw', grams: 118 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-breakfast-01-v1',
  }),
  meal({
    name: 'Nonfat Greek Yoghurt with Apple & Oats',
    cuisine: 'western', category: 'breakfast',
    description: 'A lighter yoghurt bowl with rolled oats and fresh apple.',
    ingredients: [
      { foodName: 'Greek yoghurt, plain, nonfat', grams: 170 },
      { foodName: 'Oats, rolled, dry', grams: 30 },
      { foodName: 'Apple, raw, with skin', grams: 150 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-breakfast-02-v1',
  }),
  meal({
    name: 'Boiled Eggs on Wholegrain Toast',
    cuisine: 'western', category: 'breakfast',
    description: 'Two boiled eggs with wholegrain toast, lightly oiled.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Wholegrain bread', grams: 70 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '2 eggs + 2 slices toast',
    recipeReference: 'acp-recipe:batch1-breakfast-03-v1',
  }),
  meal({
    name: 'Scrambled Eggs with Spinach & Cheddar',
    cuisine: 'european', category: 'breakfast',
    description: 'Scrambled eggs folded with fresh spinach and cheddar.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Cheddar cheese', grams: 20 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch1-breakfast-04-v1',
  }),
  meal({
    name: 'Porridge Oats with Milk & Banana',
    cuisine: 'western', category: 'breakfast',
    description: 'Classic milk porridge topped with sliced banana.',
    ingredients: [
      { foodName: 'Oats, rolled, dry', grams: 50 },
      { foodName: 'Semi-skimmed milk (2% fat)', grams: 200 },
      { foodName: 'Banana, raw', grams: 100 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-breakfast-05-v1',
  }),
  meal({
    name: 'Peanut Butter & Banana Wholegrain Toast',
    cuisine: 'western', category: 'breakfast',
    description: 'Wholegrain toast with peanut butter and banana slices.',
    ingredients: [
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Peanut butter, smooth', grams: 30 },
      { foodName: 'Banana, raw', grams: 100 },
    ],
    tags: ['vegetarian'],
    servingDescription: '2 slices toast',
    recipeReference: 'acp-recipe:batch1-breakfast-06-v1',
  }),
  meal({
    name: 'Cheese & Tomato Omelette',
    cuisine: 'european', category: 'breakfast',
    description: 'A simple three-egg omelette with cheddar and fresh tomato.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 omelette',
    recipeReference: 'acp-recipe:batch1-breakfast-07-v1',
  }),
  meal({
    name: 'Baked Salmon & Avocado on Wholegrain Toast',
    cuisine: 'european', category: 'breakfast',
    description: 'A savoury European brunch plate: salmon and avocado on toast with lemon.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 80 },
      { foodName: 'Avocado, raw', grams: 60 },
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch1-breakfast-08-v1',
  }),

  // ── Lunch (6) ──────────────────────────────────────────────────────────
  meal({
    name: 'Grilled Chicken, Broccoli & Brown Rice Bowl',
    cuisine: 'western', category: 'lunch',
    description: 'Roasted chicken breast with steamed broccoli over brown rice.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 150 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-lunch-01-v1',
  }),
  meal({
    name: 'Tuna, Avocado & Tomato Salad',
    cuisine: 'european', category: 'lunch',
    description: 'A cold tuna salad with avocado, tomato and lemon.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch1-lunch-02-v1',
  }),
  meal({
    name: 'Lentil & Spinach Stew Bowl',
    cuisine: 'western', category: 'lunch',
    description: 'A hearty vegetarian lentil stew with spinach and tomato.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 200 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-lunch-03-v1',
  }),
  meal({
    name: 'Wholegrain Bread, Cheddar & Apple Plate',
    cuisine: 'european', category: 'lunch',
    description: "A cold ploughman's-style plate: bread, cheddar, apple and tomato.",
    ingredients: [
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Cheddar cheese', grams: 40 },
      { foodName: 'Apple, raw, with skin', grams: 130 },
      { foodName: 'Tomato, raw', grams: 80 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch1-lunch-04-v1',
  }),
  meal({
    name: 'Kidney Bean, Rice & Cheddar Bowl',
    cuisine: 'western', category: 'lunch',
    description: 'A warm vegetarian bowl of kidney beans, brown rice and cheddar.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 180 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-lunch-05-v1',
  }),
  meal({
    name: 'Salmon & Spinach Salad with Lemon',
    cuisine: 'european', category: 'lunch',
    description: 'Cooked salmon over spinach and avocado with a lemon dressing.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 130 },
      { foodName: 'Spinach, raw', grams: 80 },
      { foodName: 'Avocado, raw', grams: 50 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch1-lunch-06-v1',
  }),

  // ── Dinner (6) ─────────────────────────────────────────────────────────
  meal({
    name: 'Baked Salmon with Brown Rice & Broccoli',
    cuisine: 'european', category: 'dinner',
    description: 'Cooked salmon with brown rice and steamed broccoli.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch1-dinner-01-v1',
  }),
  meal({
    name: 'Grilled Chicken with Spinach & White Rice',
    cuisine: 'western', category: 'dinner',
    description: 'Roasted chicken breast with spinach over white rice.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 180 },
      { foodName: 'Spinach, raw', grams: 80 },
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch1-dinner-02-v1',
  }),
  meal({
    name: 'Lentil & Kidney Bean Vegetable Stew',
    cuisine: 'western', category: 'dinner',
    description: 'A double-legume vegetarian stew with tomato and spinach.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 150 },
      { foodName: 'Kidney beans, cooked', grams: 100 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Spinach, raw', grams: 50 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-dinner-03-v1',
  }),
  meal({
    name: 'Tuna, Tomato & White Rice Bowl',
    cuisine: 'european', category: 'dinner',
    description: 'Tuna with tomato and lemon over white rice.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch1-dinner-04-v1',
  }),
  meal({
    name: 'Gouda, Avocado & Spinach Salad',
    cuisine: 'european', category: 'dinner',
    description: 'A cheese-forward vegetarian dinner salad with avocado and spinach.',
    ingredients: [
      { foodName: 'Gouda cheese', grams: 40 },
      { foodName: 'Avocado, raw', grams: 100 },
      { foodName: 'Spinach, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch1-dinner-05-v1',
  }),
  meal({
    name: 'Broccoli & Gouda Baked Frittata',
    cuisine: 'european', category: 'dinner',
    description: 'A baked egg frittata with broccoli and gouda.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 200 },
      { foodName: 'Broccoli, raw', grams: 80 },
      { foodName: 'Gouda cheese', grams: 30 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 frittata',
    recipeReference: 'acp-recipe:batch1-dinner-06-v1',
  }),
];
