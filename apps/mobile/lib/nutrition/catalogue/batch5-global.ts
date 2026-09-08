// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 5 (Global 1/2).
//
// Deterministic, reviewable SOURCE for the first 20 Global meals (8
// breakfast / 6 lunch / 6 dinner). 'global' is the existing catalogue's
// explicit non-regional tag (see daily-nutrition-plan.ts's
// broadSuitabilityScore) — these meals are broadly recognisable,
// internationally common patterns rather than a fourth regional cuisine
// identity, so no specific regional culinary fidelity is claimed for them.
//
// Every ingredient is a real, existing canonical `foods` row from the same
// 64-food pantry already used for Batches 1-4 — no new ingredient expansion.
// Every meal's nutrition comes ONLY from meal-composer.ts's reuse of N1's
// deterministic maths — no manually authored macro anywhere.
//
// Checked by hand against all 80 existing European/Western + Mediterranean
// meals during authoring; several early drafts were rejected/reworked
// because they were too close to an existing dish (documented in the
// report) — e.g. an early "Grilled Chicken with Broccoli & White Rice"
// echoed the existing "Grilled Chicken, Broccoli & Brown Rice Bowl" almost
// exactly (only the rice colour differed) and was replaced with a salmon
// dish instead; an early "Salmon, Broccoli & White Rice" was dropped
// entirely because it was the existing "Baked Salmon with Brown Rice &
// Broccoli" with the rice colour changed.

import type { ComposeMealInput } from '../meal-composer.ts';

export interface Batch5IngredientLine {
  foodName: string;
  grams: number;
}

export type Batch5MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch5IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch5MealSource, 'recipeSource' | 'compositionMethod'>): Batch5MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH5_GLOBAL: Batch5MealSource[] = [
  // ── Breakfast (8) ──────────────────────────────────────────────────────
  meal({
    name: 'Peanut Butter, Banana & Oat Bowl',
    cuisine: 'global', category: 'breakfast',
    description: 'A milk-based oat bowl with peanut butter and banana.',
    ingredients: [
      { foodName: 'Oats, rolled, dry', grams: 40 },
      { foodName: 'Peanut butter, smooth', grams: 20 },
      { foodName: 'Banana, raw', grams: 100 },
      { foodName: 'Semi-skimmed milk (2% fat)', grams: 100 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-breakfast-01-v1',
  }),
  meal({
    name: 'Broccoli & Cheddar Baked Eggs',
    cuisine: 'global', category: 'breakfast',
    description: 'Eggs baked with broccoli and cheddar.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Broccoli, raw', grams: 80 },
      { foodName: 'Cheddar cheese', grams: 20 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-breakfast-02-v1',
  }),
  meal({
    name: 'Greek Yoghurt with Peanut Butter & Banana',
    cuisine: 'global', category: 'breakfast',
    description: 'Nonfat Greek yoghurt with peanut butter and banana, no oats.',
    ingredients: [
      { foodName: 'Greek yoghurt, plain, nonfat', grams: 170 },
      { foodName: 'Peanut butter, smooth', grams: 15 },
      { foodName: 'Banana, raw', grams: 100 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-breakfast-03-v1',
  }),
  meal({
    name: 'Romaine, Egg & Avocado Breakfast Salad',
    cuisine: 'global', category: 'breakfast',
    description: 'A savoury breakfast salad of boiled egg, romaine lettuce and avocado.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Lettuce (romaine), raw', grams: 60 },
      { foodName: 'Avocado, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch5-breakfast-04-v1',
  }),
  meal({
    name: 'Brown Rice Breakfast Bowl with Banana & Milk',
    cuisine: 'global', category: 'breakfast',
    description: 'A rice-based breakfast bowl with banana and milk.',
    ingredients: [
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Banana, raw', grams: 100 },
      { foodName: 'Semi-skimmed milk (2% fat)', grams: 100 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-breakfast-05-v1',
  }),
  meal({
    name: 'Beans & Egg on Toast',
    cuisine: 'global', category: 'breakfast',
    description: 'Kidney beans and egg with tomato on wholegrain toast.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 60 },
      { foodName: 'Wholegrain bread', grams: 40 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-breakfast-06-v1',
  }),
  meal({
    name: 'Carrot & Oat Breakfast Bowl',
    cuisine: 'global', category: 'breakfast',
    description: 'A carrot-cake-style oat breakfast bowl with milk.',
    ingredients: [
      { foodName: 'Oats, rolled, dry', grams: 40 },
      { foodName: 'Carrot, raw', grams: 50 },
      { foodName: 'Semi-skimmed milk (2% fat)', grams: 150 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-breakfast-07-v1',
  }),
  meal({
    name: 'Tuna & Avocado Breakfast Plate',
    cuisine: 'global', category: 'breakfast',
    description: 'A light protein breakfast of tuna and avocado on toast.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 80 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Wholegrain bread', grams: 40 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-breakfast-08-v1',
  }),

  // ── Lunch (6) ──────────────────────────────────────────────────────────
  meal({
    name: 'Salmon, Carrot & Brown Rice Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'Cooked salmon with carrot and brown rice.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 140 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-lunch-01-v1',
  }),
  meal({
    name: 'Tuna, Romaine & Avocado Salad',
    cuisine: 'global', category: 'lunch',
    description: 'A cold tuna salad with romaine lettuce and avocado.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Lettuce (romaine), raw', grams: 80 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch5-lunch-02-v1',
  }),
  meal({
    name: 'Chicken, Apple & Cheddar Salad',
    cuisine: 'global', category: 'lunch',
    description: 'Roasted chicken breast with apple, cheddar and romaine lettuce.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 130 },
      { foodName: 'Apple, raw, with skin', grams: 100 },
      { foodName: 'Cheddar cheese', grams: 20 },
      { foodName: 'Lettuce (romaine), raw', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch5-lunch-03-v1',
  }),
  meal({
    name: 'Lentil, Carrot & Broccoli Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'A vegan bowl of lentils, carrot and broccoli.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 200 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-lunch-04-v1',
  }),
  meal({
    name: 'Wholewheat Pasta with Broccoli & Cheddar',
    cuisine: 'global', category: 'lunch',
    description: 'Wholewheat pasta with broccoli and cheddar, no tomato.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 200 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-lunch-05-v1',
  }),
  meal({
    name: 'Chickpea, Avocado & Romaine Salad',
    cuisine: 'global', category: 'lunch',
    description: 'A vegan salad of chickpeas, avocado and romaine lettuce.',
    ingredients: [
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Lettuce (romaine), raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch5-lunch-06-v1',
  }),

  // ── Dinner (6) ─────────────────────────────────────────────────────────
  meal({
    name: 'Chicken, Green Beans & Brown Rice',
    cuisine: 'global', category: 'dinner',
    description: 'Roasted chicken breast with green beans and brown rice.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-dinner-01-v1',
  }),
  meal({
    name: 'Tuna, Kidney Bean & Avocado Plate',
    cuisine: 'global', category: 'dinner',
    description: 'Tuna with kidney beans and avocado, dressed with lemon.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-dinner-02-v1',
  }),
  meal({
    name: 'Chickpea, Carrot & Broccoli Stew',
    cuisine: 'global', category: 'dinner',
    description: 'A vegan stew of chickpeas, carrot, broccoli, onion and garlic.',
    ingredients: [
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 200 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-dinner-03-v1',
  }),
  meal({
    name: 'Salmon, Potato & Broccoli Bake',
    cuisine: 'global', category: 'dinner',
    description: 'Cooked salmon with boiled potato and broccoli.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Potato, boiled (without skin)', grams: 150 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch5-dinner-04-v1',
  }),
  meal({
    name: 'Kidney Bean, Carrot & Spinach Stew',
    cuisine: 'global', category: 'dinner',
    description: 'A vegan stew of kidney beans, carrot, spinach, onion and garlic.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 200 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-dinner-05-v1',
  }),
  meal({
    name: 'Pasta with Chicken & Broccoli',
    cuisine: 'global', category: 'dinner',
    description: 'Cooked pasta with roasted chicken breast and broccoli.',
    ingredients: [
      { foodName: 'Pasta, cooked', grams: 200 },
      { foodName: 'Chicken breast, roasted, skinless', grams: 120 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch5-dinner-06-v1',
  }),
];
