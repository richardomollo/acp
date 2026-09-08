// ACP Intelligence™ — Nutrition Catalogue Content V1 · Batch 4 (Mediterranean 2/2).
//
// Deterministic, reviewable SOURCE for the second 20 Mediterranean meals
// (2 breakfast / 9 lunch / 9 dinner), completing the 40-meal Mediterranean
// catalogue target (10/15/15). Every ingredient is a real, existing
// canonical `foods` row; every meal's nutrition comes ONLY from
// meal-composer.ts's reuse of N1's deterministic maths — no manually
// authored macro anywhere. No new canonical ingredient was added for this
// batch (explicit constraint) — every recipe was designed to fit the
// pantry already verified for Batch 3.
//
// Batch 3 review flagged two risks this batch deliberately corrects:
//   1. 70% vegetarian / 40% vegan — Batch 4 actively diversifies toward
//      chicken/salmon/tuna (9/20 fish-or-poultry here, vs. 6/20 in Batch 3),
//      without imposing an arbitrary quota — see the report's protein table.
//   2. Chickpeas used 5x — Batch 4 uses chickpeas ZERO times, leaning on
//      lentils and kidney beans instead for legume-anchored dishes, so the
//      combined Mediterranean-40 chickpea count stays at 5, not higher.
//
// Cross-cuisine duplication was checked by hand against all 40 European/
// Western meals AND Batch 3's 20 — several initial drafts were rejected and
// redesigned during authoring (documented in the report) because they were
// too structurally close to an existing European/Western dish (e.g. an
// early "Gouda, Courgette & Tomato Salad" draft echoed the European "Gouda,
// Courgette & Potato Bake" too closely and was reworked to use cheddar with
// no potato instead; an early tuna+rice+tomato lunch was dropped entirely
// because it echoed the existing European "Tuna, Tomato & White Rice Bowl").

import type { ComposeMealInput } from '../meal-composer.ts';

export interface Batch4IngredientLine {
  foodName: string;
  grams: number;
}

export type Batch4MealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: Batch4IngredientLine[];
};

const RECIPE_SOURCE =
  'ACP standardized recipe (ingredient nutrients: USDA FoodData Central via ACP foods catalogue; recipe ratios ACP-composed for a plausible single-person serving)';

function meal(m: Omit<Batch4MealSource, 'recipeSource' | 'compositionMethod'>): Batch4MealSource {
  return { ...m, recipeSource: RECIPE_SOURCE, compositionMethod: 'standard_recipe_estimated' };
}

export const BATCH4_MEDITERRANEAN: Batch4MealSource[] = [
  // ── Breakfast (2) ──────────────────────────────────────────────────────
  meal({
    name: 'Boiled Eggs with Cucumber & Tomato',
    cuisine: 'mediterranean', category: 'breakfast',
    description: 'Boiled eggs with fresh cucumber and tomato, dressed with lemon and olive oil.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 100 },
      { foodName: 'Cucumber, with peel, raw', grams: 80 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-breakfast-01-v1',
  }),
  meal({
    name: 'Lentil, Cucumber & Lemon Breakfast Bowl',
    cuisine: 'mediterranean', category: 'breakfast',
    // Deliberately cucumber + lemon, not tomato + onion — an earlier draft
    // shared too much of its ingredient base with this same batch's own
    // "Lentil, Courgette & Tomato Soup" (lunch) on manual cross-check; this
    // version keeps lentil as the anchor but pairs it with a genuinely
    // different, breakfast-appropriate (cold, fresh) vegetable instead.
    description: 'A savoury vegan lentil breakfast bowl with cucumber and lemon.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 150 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-breakfast-02-v1',
  }),

  // ── Lunch (9) ──────────────────────────────────────────────────────────
  meal({
    name: 'Chicken & Potato Traybake with Green Beans',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Roasted chicken breast with boiled potato and green beans.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 150 },
      { foodName: 'Potato, boiled (without skin)', grams: 180 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-lunch-01-v1',
  }),
  meal({
    name: 'Salmon with Couscous & Cucumber',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Cooked salmon with couscous and fresh cucumber.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 140 },
      { foodName: 'Couscous, cooked', grams: 150 },
      { foodName: 'Cucumber, with peel, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-lunch-02-v1',
  }),
  meal({
    name: 'Tuna, Courgette & Lemon Bake',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Baked tuna with courgette, garlic and lemon.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Courgette (zucchini), raw', grams: 120 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-lunch-03-v1',
  }),
  meal({
    name: 'Baked Eggs with Spinach & Tomato',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Eggs baked with spinach, tomato and garlic.',
    ingredients: [
      { foodName: 'Egg, whole, raw', grams: 150 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Garlic, raw', grams: 3 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-lunch-04-v1',
  }),
  meal({
    name: 'Lentil, Courgette & Tomato Soup',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A warm vegan lentil soup with courgette, tomato and onion.',
    ingredients: [
      { foodName: 'Lentils, cooked', grams: 200 },
      { foodName: 'Courgette (zucchini), raw', grams: 80 },
      { foodName: 'Tomato, raw', grams: 80 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-lunch-05-v1',
  }),
  meal({
    name: 'Kidney Bean & Tomato Soup with Onion',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A warm vegan kidney bean and tomato soup with onion and garlic.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 200 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-lunch-06-v1',
  }),
  meal({
    name: 'Grilled Chicken with Cauliflower & Tomato',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Roasted chicken breast with cauliflower and tomato.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 150 },
      { foodName: 'Cauliflower, raw', grams: 120 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-lunch-07-v1',
  }),
  meal({
    name: 'Pasta with Courgette & Mushroom',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'Cooked pasta with courgette, mushroom and garlic.',
    ingredients: [
      { foodName: 'Pasta, cooked', grams: 200 },
      { foodName: 'Courgette (zucchini), raw', grams: 120 },
      { foodName: 'Mushroom, white, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-lunch-08-v1',
  }),
  meal({
    name: 'Cheddar, Courgette & Tomato Salad',
    cuisine: 'mediterranean', category: 'lunch',
    description: 'A cold salad of courgette, tomato and cheddar, dressed with olive oil and lemon.',
    ingredients: [
      { foodName: 'Cheddar cheese', grams: 30 },
      { foodName: 'Courgette (zucchini), raw', grams: 100 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Olive oil', grams: 8 },
      { foodName: 'Lemon, raw', grams: 10 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 salad',
    recipeReference: 'acp-recipe:batch4-lunch-09-v1',
  }),

  // ── Dinner (9) ─────────────────────────────────────────────────────────
  meal({
    name: 'Baked Salmon with Potato & Green Beans',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Cooked salmon with boiled potato and green beans.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Potato, boiled (without skin)', grams: 180 },
      { foodName: 'Green beans, raw', grams: 100 },
      { foodName: 'Lemon, raw', grams: 10 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-01-v1',
  }),
  meal({
    name: 'Chicken with Rice, Tomato & Onion',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Roasted chicken breast with white rice, tomato and onion.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'White rice, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-02-v1',
  }),
  meal({
    name: 'Tuna & Cauliflower Bake with Tomato',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Baked tuna with cauliflower and tomato.',
    ingredients: [
      { foodName: 'Tuna, canned in water, drained', grams: 120 },
      { foodName: 'Cauliflower, raw', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-03-v1',
  }),
  meal({
    name: 'Aubergine & Lentil Stew',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'A vegan stew of aubergine, lentils, tomato, onion and garlic.',
    ingredients: [
      { foodName: 'Aubergine (eggplant), raw', grams: 150 },
      { foodName: 'Lentils, cooked', grams: 150 },
      { foodName: 'Tomato, raw', grams: 100 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-dinner-04-v1',
  }),
  meal({
    name: 'Kidney Bean & Spinach Stew',
    cuisine: 'mediterranean', category: 'dinner',
    // Manual cross-check: an earlier draft ("...with Cauliflower & Tomato")
    // was almost a strict superset of this same batch's own "Kidney Bean &
    // Tomato Soup with Onion" (lunch) — identical kidney bean/onion/garlic/
    // oil base plus one added vegetable. Reworked to swap tomato for spinach
    // and drop cauliflower entirely, so the two no longer share a base this
    // close.
    description: 'A vegan stew of kidney beans, spinach, onion and garlic.',
    ingredients: [
      { foodName: 'Kidney beans, cooked', grams: 200 },
      { foodName: 'Spinach, raw', grams: 80 },
      { foodName: 'Onion, raw', grams: 30 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 10 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-dinner-05-v1',
  }),
  meal({
    name: 'Grilled Chicken with Courgette & Basil',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Roasted chicken breast with courgette, garlic and fresh basil.',
    ingredients: [
      { foodName: 'Chicken breast, roasted, skinless', grams: 170 },
      { foodName: 'Courgette (zucchini), raw', grams: 120 },
      { foodName: 'Basil, fresh', grams: 5 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-06-v1',
  }),
  meal({
    name: 'Quinoa with Mushroom & Spinach',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'A vegan quinoa bowl with mushroom, spinach and garlic.',
    ingredients: [
      { foodName: 'Quinoa, cooked', grams: 150 },
      { foodName: 'Mushroom, white, raw', grams: 100 },
      { foodName: 'Spinach, raw', grams: 60 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian', 'vegan'],
    servingDescription: '1 bowl',
    recipeReference: 'acp-recipe:batch4-dinner-07-v1',
  }),
  meal({
    name: 'Salmon with Green Beans & Lemon',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'A simple plate of cooked salmon with green beans, garlic and lemon.',
    ingredients: [
      { foodName: 'Salmon, Atlantic, cooked', grams: 150 },
      { foodName: 'Green beans, raw', grams: 120 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Lemon, raw', grams: 15 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: [],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-08-v1',
  }),
  meal({
    name: 'Baked Feta with Tomato & Onion',
    cuisine: 'mediterranean', category: 'dinner',
    description: 'Baked feta with tomato, onion and garlic.',
    ingredients: [
      { foodName: 'Feta cheese', grams: 40 },
      { foodName: 'Tomato, raw', grams: 120 },
      { foodName: 'Onion, raw', grams: 40 },
      { foodName: 'Garlic, raw', grams: 5 },
      { foodName: 'Olive oil', grams: 8 },
    ],
    tags: ['vegetarian'],
    servingDescription: '1 plate',
    recipeReference: 'acp-recipe:batch4-dinner-09-v1',
  }),
];
