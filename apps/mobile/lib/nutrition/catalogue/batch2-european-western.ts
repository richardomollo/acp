// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 2.
//
// Deterministic, reviewable SOURCE for the second 20 European/Western meals
// (2 breakfast / 9 lunch / 9 dinner), completing the 40-meal European/
// Western catalogue target (10/15/15). Actively draws on the 19 canonically
// expanded, officially-FDC-verified ingredients — onion, garlic, bell
// pepper, mushroom, cucumber, carrot, courgette, romaine lettuce, aubergine,
// green beans, cauliflower, basil, pasta/wholewheat pasta (cooked), potato
// (boiled), couscous (cooked), quinoa (cooked), chickpeas (cooked), feta —
// deliberately avoiding Batch 1's heavy reliance on spinach/broccoli/
// tomato/rice/egg/cheese as the primary vegetable/protein palette.
//
// Same rules as Batch 1: every ingredient is a real, existing canonical
// `foods` row name (matched by exact name at authoring time); every meal's
// nutrition comes ONLY from meal-composer.ts's reuse of N1's deterministic
// maths — no manually authored macro anywhere.

import type { ComposeMealInput } from '../meal-composer.ts';

export interface Batch2IngredientLine {
  foodName: string;
  grams: number;
}

export type Batch2MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch2IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch2MealSource, 'recipeSource' | 'compositionMethod'>): Batch2MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH2_EUROPEAN_WESTERN: Batch2MealSource[] = [
  // ── Breakfast (2) ──────────────────────────────────────────────────────
  meal({
    name: 'Mushroom & Onion Omelette',
    cuisine: 'western', category: 'breakfast',
    description: 'A savoury three-egg omelette with white mushroom and onion.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Mushroom, white, raw', grams: 90 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 omelette',
    recipeReference: 'acp-recipe:batch2-breakfast-01-v1',
  }),
  meal({
    name: 'Feta & Cucumber Breakfast Plate',
    cuisine: 'european', category: 'breakfast',
    description: 'A simple cold continental plate: feta, cucumber and wholegrain bread.',
    ingredients: [
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Cucumber, with peel, raw', grams: 120 },
      { foodName: 'Wholegrain bread', grams: 60 },
      { foodName: 'Olive oil', grams: 5 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-breakfast-02-v1',
  }),

  // ── Lunch (9) ──────────────────────────────────────────────────────────
  meal({
    name: 'Chicken, Mushroom & Onion Pasta',
    cuisine: 'western', category: 'lunch',
    description: 'Cooked pasta with roasted chicken breast, mushroom and onion.',
    ingredients: [
      { foodName: 'Pasta, cooked', grams: 200 },
      { foodName: 'Chicken breast, roasted, skinless', grams: 120 },
      { foodName: 'Mushroom, white, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-lunch-01-v1',
  }),
  meal({
    name: 'Tuna, Chickpea & Cucumber Salad',
    cuisine: 'european', category: 'lunch',
    description: 'A cold salad of tuna, cooked chickpeas and cucumber with lemon.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 150 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch2-lunch-02-v1',
  }),
  meal({
    name: 'Roasted Vegetable & Feta Couscous Bowl',
    cuisine: 'western', category: 'lunch',
    description: 'Courgette, bell pepper and aubergine over couscous with feta.',
    ingredients: [
      { foodName: 'Courgette (zucchini), raw', grams: 100 },
      { foodName: 'Bell pepper (red), raw', grams: 100 },
      { foodName: 'Aubergine (eggplant), raw', grams: 100 },
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Couscous, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-lunch-03-v1',
  }),
  meal({
    name: 'Egg, Potato & Green Bean Salad',
    cuisine: 'european', category: 'lunch',
    description: 'A cold potato salad with boiled egg and green beans.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Potato, boiled (without skin)', grams: 200 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 10 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch2-lunch-04-v1',
  }),
  meal({
    name: 'Lentil, Carrot & Cauliflower Soup',
    cuisine: 'western', category: 'lunch',
    description: 'A warm vegan soup of lentils, carrot, cauliflower and onion.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 200 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Cauliflower, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-lunch-05-v1',
  }),
  meal({
    name: 'Wholewheat Pasta with Aubergine & Basil',
    cuisine: 'western', category: 'lunch',
    description: 'Wholewheat pasta with aubergine, garlic and fresh basil.',
    ingredients: [
      { foodName: 'Wholewheat pasta, cooked', grams: 200 },
      { foodName: 'Aubergine (eggplant), raw', grams: 120 },
      { foodName: 'Garlic, raw', grams: 6 },
      { foodName: 'Basil, fresh', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-lunch-06-v1',
  }),
  meal({
    name: 'Salmon, Courgette & Lemon Plate',
    cuisine: 'european', category: 'lunch',
    description: 'Cooked salmon with courgette and a lemon dressing.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 140 },
      { foodName: 'Courgette (zucchini), raw', grams: 120 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-lunch-07-v1',
  }),
  meal({
    name: 'Cheddar, Green Bean & Potato Warm Salad',
    cuisine: 'western', category: 'lunch',
    description: 'A warm salad of boiled potato, green beans and cheddar.',
    ingredients: [
      { foodName: 'Potato, boiled (without skin)', grams: 150 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-lunch-08-v1',
  }),
  meal({
    name: 'Chicken, Cucumber & Romaine Salad',
    cuisine: 'european', category: 'lunch',
    description: 'Roasted chicken breast over romaine, cucumber and bell pepper.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 130 },
      { foodName: 'Lettuce (romaine), raw', grams: 80 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Bell pepper (red), raw', grams: 60 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch2-lunch-09-v1',
  }),

  // ── Dinner (9) ─────────────────────────────────────────────────────────
  meal({
    name: 'Roast Chicken with Cauliflower & Carrot',
    cuisine: 'western', category: 'dinner',
    description: 'Roasted chicken breast with cauliflower and carrot.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 180 },
      { foodName: 'Cauliflower, raw', grams: 120 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-dinner-01-v1',
  }),
  meal({
    name: 'Baked Aubergine, Courgette & Feta',
    cuisine: 'european', category: 'dinner',
    description: 'A baked vegetarian dish of aubergine, courgette, garlic and feta.',
    ingredients: [
      { foodName: 'Aubergine (eggplant), raw', grams: 150 },
      { foodName: 'Courgette (zucchini), raw', grams: 120 },
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Garlic, raw', grams: 6 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-dinner-02-v1',
  }),
  meal({
    name: 'Salmon with Quinoa & Green Beans',
    cuisine: 'european', category: 'dinner',
    description: 'Cooked salmon with quinoa and green beans.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-dinner-03-v1',
  }),
  meal({
    name: 'Chickpea, Mushroom & Onion Stew',
    cuisine: 'western', category: 'dinner',
    description: 'A hearty vegan stew of chickpeas, mushroom, onion and carrot.',
    ingredients: [
      { foodName: 'Chickpeas (garbanzo beans), cooked', grams: 200 },
      { foodName: 'Mushroom, white, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 6 },
      { foodName: 'Carrot, raw', grams: 60 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-dinner-04-v1',
  }),
  meal({
    name: 'Potato & Onion Tortilla',
    cuisine: 'european', category: 'dinner',
    description: 'A European-style potato and onion omelette (tortilla).',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 200 },
      { foodName: 'Potato, boiled (without skin)', grams: 150 },
      { foodName: 'Onion, raw', grams: 50 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 tortilla',
    recipeReference: 'acp-recipe:batch2-dinner-05-v1',
  }),
  meal({
    name: 'Tuna, Bell Pepper & Rice Bowl',
    cuisine: 'european', category: 'dinner',
    description: 'Tuna with bell pepper over brown rice.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Bell pepper (red), raw', grams: 100 },
      { foodName: 'Brown rice, cooked', grams: 150 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-dinner-06-v1',
  }),
  meal({
    name: 'Kidney Bean, Onion & Bell Pepper Stew',
    cuisine: 'western', category: 'dinner',
    description: 'A warm vegan stew of kidney beans, onion, bell pepper and garlic.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 200 },
      { foodName: 'Onion, raw', grams: 50 },
      { foodName: 'Bell pepper (red), raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 6 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch2-dinner-07-v1',
  }),
  meal({
    name: 'Gouda, Courgette & Potato Bake',
    cuisine: 'european', category: 'dinner',
    description: 'A baked vegetarian dish of boiled potato, courgette and gouda.',
    ingredients: [
      { foodName: 'Potato, boiled (without skin)', grams: 180 },
      { foodName: 'Courgette (zucchini), raw', grams: 100 },
      { foodName: 'Gouda cheese', grams: 40 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-dinner-08-v1',
  }),
  meal({
    name: 'Chicken, Green Beans & Carrot Traybake',
    cuisine: 'western', category: 'dinner',
    description: 'Roasted chicken breast with green beans and carrot.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Carrot, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch2-dinner-09-v1',
  }),
];
