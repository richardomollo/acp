// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 6 (Global 2/2,
// FINAL catalogue batch).
//
// Deliberately structure-first, not quota-first (spec §6): before authoring
// anything, the full 100-meal catalogue was inspected for underused
// structures. Confirmed gaps this batch specifically targets:
//   - ZERO breakfasts anywhere in the catalogue use chicken or salmon
//     (all 28 existing breakfasts are egg/yoghurt/oat/toast-based).
//   - ZERO dinners outside the `european` cuisine use egg.
//   - ZERO meals anywhere use yoghurt as a savoury dinner sauce/marinade
//     (every yoghurt use in the catalogue is a sweet breakfast bowl).
//   - ZERO meals anywhere pair apple with a warm/savoury dinner (apple
//     appears twice total, both cold breakfast/lunch contexts).
//   - Quinoa never appears at lunch; couscous appears at dinner only once;
//     gouda never appears at breakfast or lunch; white rice never appears
//     at breakfast or lunch.
//   - No cold (raw, undressed-beyond-oil/lemon) kidney-bean or cauliflower
//     dish exists anywhere — every kidney-bean/cauliflower dish so far is a
//     warm stew or bake.
//
// Several drafted candidates were REJECTED during authoring for being too
// close to an existing dish (same protein/grain + one swapped vegetable) —
// documented in the accompanying report's rejected-proposals section, not
// silently dropped.
//
// Every ingredient is from the existing 64-food pantry — no expansion. All
// nutrition comes only from meal-composer.ts's reuse of N1's deterministic
// maths.

import type { ComposeMealInput } from '../meal-composer.ts';

export interface Batch6IngredientLine {
  foodName: string;
  grams: number;
}

export type Batch6MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch6IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch6MealSource, 'recipeSource' | 'compositionMethod'>): Batch6MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH6_GLOBAL: Batch6MealSource[] = [
  // ── Breakfast (2) — fills the "zero chicken/salmon breakfasts" gap ─────
  meal({
    name: 'Chicken & Avocado Breakfast Plate',
    cuisine: 'global', category: 'breakfast',
    description: 'A protein-forward breakfast of roasted chicken breast and avocado on toast.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 100 },
      { foodName: 'Avocado, raw', grams: 60 },
      { foodName: 'Wholegrain bread', grams: 40 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch6-breakfast-01-v1',
  }),
  meal({
    name: 'Quinoa & Salmon Breakfast Bowl',
    cuisine: 'global', category: 'breakfast',
    description: 'A savoury fish-and-grain breakfast bowl, no bread or dairy.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 100 },
      { foodName: 'Salmon, Atlantic, cooked', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-breakfast-02-v1',
  }),

  // ── Lunch (9) ──────────────────────────────────────────────────────────
  meal({
    name: 'Quinoa, Chicken & Spinach Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'Quinoa never previously paired with chicken — a protein-grain-greens bowl.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Chicken breast, roasted, skinless', grams: 120 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-01-v1',
  }),
  meal({
    name: 'Egg, Avocado & Tomato Salad',
    cuisine: 'global', category: 'lunch',
    description: 'A cold egg salad with avocado and tomato — no potato or spinach.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch6-lunch-02-v1',
  }),
  meal({
    name: 'Gouda, Apple & Romaine Salad',
    cuisine: 'global', category: 'lunch',
    description: 'Gouda has never appeared at lunch before — a cheese-and-fruit salad, no meat.',
    ingredients: [
      { foodName: 'Gouda cheese', grams: 30 },
      { foodName: 'Apple, raw, with skin', grams: 100 },
      { foodName: 'Lettuce (romaine), raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch6-lunch-03-v1',
  }),
  meal({
    name: 'Couscous, Egg & Spinach Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'Couscous has never previously been paired with egg.',
    ingredients: [
      { foodName: 'Couscous, cooked', grams: 150 },
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-04-v1',
  }),
  meal({
    name: 'White Rice, Kidney Bean & Carrot Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'White rice has never previously appeared at lunch.',
    ingredients: [
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-05-v1',
  }),
  meal({
    name: 'Cauliflower & Chickpea Salad',
    cuisine: 'global', category: 'lunch',
    description: 'A cold, raw cauliflower salad — every existing cauliflower dish in the catalogue is warm.',
    ingredients: [
      { foodName: 'Cauliflower, raw', grams: 150 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch6-lunch-06-v1',
  }),
  meal({
    name: 'Brown Rice, Chickpea & Spinach Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'A vegan legume-and-grain bowl.',
    ingredients: [
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-07-v1',
  }),
  meal({
    name: 'Salmon, White Rice & Spinach Bowl',
    cuisine: 'global', category: 'lunch',
    description: 'Salmon has never previously been paired with white rice.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 140 },
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-08-v1',
  }),
  meal({
    name: 'Wholewheat Pasta with Chicken & Spinach',
    cuisine: 'global', category: 'lunch',
    description: 'The first protein-forward (meat) wholewheat pasta dish in the catalogue.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 200 },
      { foodName: 'Chicken breast, roasted, skinless', grams: 120 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-lunch-09-v1',
  }),

  // ── Dinner (9) ─────────────────────────────────────────────────────────
  meal({
    name: 'Yoghurt-Marinated Chicken with Spinach',
    cuisine: 'global', category: 'dinner',
    description: 'Yoghurt used as a savoury marinade/sauce — every other yoghurt dish in the catalogue is a sweet breakfast bowl.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 150 },
      { foodName: 'Greek yoghurt, plain, whole milk', grams: 100 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Garlic, raw', grams: 5 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch6-dinner-01-v1',
  }),
  meal({
    name: 'Egg, Potato & Spinach Bake',
    cuisine: 'global', category: 'dinner',
    description: 'The first non-European egg dinner in the catalogue.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 200 },
      { foodName: 'Potato, boiled (without skin)', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bake',
    recipeReference: 'acp-recipe:batch6-dinner-02-v1',
  }),
  meal({
    name: 'Couscous, Tuna & Tomato Bowl',
    cuisine: 'global', category: 'dinner',
    description: 'Tuna has never previously been paired with couscous.',
    ingredients: [
      { foodName: 'Couscous, cooked', grams: 150 },
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-dinner-03-v1',
  }),
  meal({
    name: 'Apple, Chicken & Spinach Bake',
    cuisine: 'global', category: 'dinner',
    description: 'Apple has never previously appeared in a warm dinner dish.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 150 },
      { foodName: 'Apple, raw, with skin', grams: 100 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch6-dinner-04-v1',
  }),
  meal({
    name: 'Cauliflower, Kidney Bean & Cheddar Bake',
    cuisine: 'global', category: 'dinner',
    description: 'A new cauliflower/legume/cheese combination not tried elsewhere.',
    ingredients: [
      { foodName: 'Cauliflower, raw', grams: 200 },
      { foodName: 'Kidney beans, cooked', grams: 100 },
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bake',
    recipeReference: 'acp-recipe:batch6-dinner-05-v1',
  }),
  meal({
    name: 'White Rice, Egg & Broccoli Bowl',
    cuisine: 'global', category: 'dinner',
    description: 'White rice has never previously appeared at dinner outside a fish/chicken bowl, and never with egg.',
    ingredients: [
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Broccoli, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-dinner-06-v1',
  }),
  meal({
    name: 'Wholewheat Pasta with Salmon & Spinach',
    cuisine: 'global', category: 'dinner',
    description: 'The first fish wholewheat-pasta dish in the catalogue.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 180 },
      { foodName: 'Salmon, Atlantic, cooked', grams: 130 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-dinner-07-v1',
  }),
  meal({
    name: 'Kidney Bean, Apple & Romaine Salad',
    cuisine: 'global', category: 'dinner',
    description: 'The first cold kidney-bean salad in the catalogue — every other kidney-bean dish is a warm stew or bowl.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Apple, raw, with skin', grams: 80 },
      { foodName: 'Lettuce (romaine), raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch6-dinner-08-v1',
  }),
  meal({
    name: 'Quinoa, Tuna & Bell Pepper Bowl',
    cuisine: 'global', category: 'dinner',
    description: 'Quinoa has never previously been paired with tuna.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Bell pepper (red), raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch6-dinner-09-v1',
  }),
];
