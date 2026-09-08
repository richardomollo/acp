// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 3 (Mediterranean 1/2).
//
// Deterministic, reviewable SOURCE for the first 20 Mediterranean meals
// (8 breakfast / 6 lunch / 6 dinner) — the first of two Mediterranean
// batches (Batch 4 completes coverage to 10/15/15). Every ingredient is a
// real, existing canonical `foods` row; every meal's nutrition comes ONLY
// from meal-composer.ts's reuse of N1's deterministic maths — no manually
// authored macro anywhere.
//
// Deliberately avoids reducing "Mediterranean" to feta+cucumber+tomato on
// everything (spec §3): the batch draws on legumes (chickpeas, lentils,
// kidney beans), grains (couscous, quinoa, wholewheat pasta), vegetables
// (aubergine, courgette, bell pepper, cauliflower, spinach, mushroom),
// yoghurt, eggs, and fish/poultry, alongside the olive oil/lemon/garlic/
// basil base every meal below actually uses. No traditional dish name is
// claimed unless the composition genuinely supports it (e.g. "Cucumber,
// Tomato & Feta Salad" rather than "Greek salad" — no olives in the
// canonical pantry); several use descriptive names for exactly this reason.
//
// Every ingredient set below was checked against all 40 European/Western
// meals (Batch 1+2) for exact-match duplication — none collide. Genuine
// "family" overlaps (a stew or pasta dish sharing a base pattern with
// another Batch-3 entry) are disclosed in the accompanying report rather
// than hidden.

import type { ComposeMealInput } from '../meal-composer.ts';

export interface Batch3IngredientLine {
  foodName: string;
  grams: number;
}

export type Batch3MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch3IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch3MealSource, 'recipeSource' | 'compositionMethod'>): Batch3MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH3_MEDITERRANEAN: Batch3MealSource[] = [
  // ── Breakfast (8) ──────────────────────────────────────────────────────
  meal({
    name: 'Savoury Greek Yoghurt with Cucumber & Garlic',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'A tzatziki-style savoury yoghurt dip with cucumber and garlic, served with bread.',
    ingredients: [
      { foodName: 'Greek yoghurt, plain, whole milk', grams: 170 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 3 },
      { foodName: 'Wholegrain bread', grams: 40 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl + bread',
    recipeReference: 'acp-recipe:batch3-breakfast-01-v1',
  }),
  meal({
    name: 'Tomato & Pepper Baked Eggs',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'Eggs baked in a tomato, pepper and onion base with garlic.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Bell pepper (red), raw', grams: 60 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 3 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-breakfast-02-v1',
  }),
  meal({
    name: 'Feta & Avocado on Wholegrain Toast',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'Wholegrain toast with feta and avocado, finished with lemon.',
    ingredients: [
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-breakfast-03-v1',
  }),
  meal({
    name: 'Chickpea & Tomato Breakfast Bowl',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'A savoury legume-forward breakfast bowl of chickpeas, tomato and cucumber.',
    ingredients: [
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Cucumber, with peel, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 10 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-breakfast-04-v1',
  }),
  meal({
    name: 'Tomato, Basil & Cheese Toast',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'Wholegrain toast with cheddar, fresh tomato and basil.',
    ingredients: [
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Basil, fresh', grams: 3 },
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-breakfast-05-v1',
  }),
  meal({
    name: 'Quinoa Breakfast Bowl with Tomato & Cucumber',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'A savoury quinoa breakfast bowl with fresh tomato and cucumber.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Cucumber, with peel, raw', grams: 80 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-breakfast-06-v1',
  }),
  meal({
    name: 'Mushroom & Tomato on Toast',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'Garlicky mushroom and tomato on wholegrain toast.',
    ingredients: [
      { foodName: 'Mushroom, white, raw', grams: 100 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Garlic, raw', grams: 3 },
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-breakfast-07-v1',
  }),
  meal({
    name: 'Avocado & Egg Breakfast Plate',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'A simple plate of egg and avocado with wholegrain bread and lemon.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Avocado, raw', grams: 80 },
      { foodName: 'Wholegrain bread', grams: 40 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-breakfast-08-v1',
  }),

  // ── Lunch (6) ──────────────────────────────────────────────────────────
  meal({
    name: 'Grilled Chicken with Chickpeas & Cucumber Salad',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Roasted chicken breast with chickpeas and cucumber, dressed with lemon and olive oil.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 130 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 120 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 3 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-lunch-01-v1',
  }),
  meal({
    name: 'Salmon with Lentils & Spinach',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Cooked salmon with lentils and spinach, finished with lemon.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 140 },
      { foodName: 'Lentils, cooked', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-lunch-02-v1',
  }),
  meal({
    name: 'Aubergine & Chickpea Stew',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A vegan stew of aubergine, chickpeas, tomato, onion and garlic.',
    ingredients: [
      { foodName: 'Aubergine (eggplant), raw', grams: 150 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-lunch-03-v1',
  }),
  meal({
    name: 'Cucumber, Tomato & Feta Salad',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A cold salad of cucumber, tomato, bell pepper and feta, dressed with olive oil and lemon.',
    ingredients: [
      { foodName: 'Cucumber, with peel, raw', grams: 120 },
      { foodName: 'Tomato, raw', grams: 120 },
      { foodName: 'Bell pepper (red), raw', grams: 60 },
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Olive oil', grams: 10 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch3-lunch-04-v1',
  }),
  meal({
    name: 'Wholewheat Pasta with Tomato, Garlic & Basil',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A simple wholewheat pasta with fresh tomato, garlic and basil.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 200 },
      { foodName: 'Tomato, raw', grams: 150 },
      { foodName: 'Garlic, raw', grams: 6 },
      { foodName: 'Basil, fresh', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-lunch-05-v1',
  }),
  meal({
    name: 'Tuna, Kidney Bean & Tomato Salad',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A cold tuna and kidney bean salad with tomato, onion, lemon and olive oil.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch3-lunch-06-v1',
  }),

  // ── Dinner (6) ─────────────────────────────────────────────────────────
  meal({
    name: 'Baked Chicken with Couscous & Green Beans',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Roasted chicken breast with couscous and green beans.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'Couscous, cooked', grams: 150 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-dinner-01-v1',
  }),
  meal({
    name: 'Baked Salmon with Chickpeas & Spinach',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Cooked salmon with chickpeas and spinach, finished with lemon.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-dinner-02-v1',
  }),
  meal({
    name: 'Quinoa & Roasted Vegetable Bowl',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'A vegan bowl of quinoa with aubergine, bell pepper and courgette.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Aubergine (eggplant), raw', grams: 100 },
      { foodName: 'Bell pepper (red), raw', grams: 100 },
      { foodName: 'Courgette (zucchini), raw', grams: 100 },
      { foodName: 'Olive oil', grams: 10 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-dinner-03-v1',
  }),
  meal({
    name: 'Chickpea, Cauliflower & Tomato Stew',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'A vegan stew of chickpeas, cauliflower, tomato, onion and garlic.',
    ingredients: [
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 200 },
      { foodName: 'Cauliflower, raw', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-dinner-04-v1',
  }),
  meal({
    name: 'Kidney Bean & Tomato Wholewheat Pasta',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Wholewheat pasta with kidney beans, tomato, onion and garlic.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 180 },
      { foodName: 'Kidney beans, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch3-dinner-05-v1',
  }),
  meal({
    name: 'Grilled Chicken with Aubergine & Tomato',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Roasted chicken breast with aubergine and tomato.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'Aubergine (eggplant), raw', grams: 120 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch3-dinner-06-v1',
  }),
];
