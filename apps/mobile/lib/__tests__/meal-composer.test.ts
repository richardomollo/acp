import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeMeal, ComposeMealError,
  type ComposeMealInput,
} from '../nutrition/meal-composer.ts';
import { emptyNutrients, type CanonicalFood } from '../nutrition/food-types.ts';

// ── fixtures (same USDA-shaped convention as saved-meal.test.ts) ─────────

function food(overrides: Partial<CanonicalFood> & { id: string; name: string }): CanonicalFood {
  const n = emptyNutrients();
  return {
    source: 'USDA FoodData Central', externalId: null, fdcId: null,
    sourceType: 'trusted_food_database', sourceUrl: null,
    brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null,
    servings: [], defaultServingGrams: null, defaultServingLabel: null,
    isGeneric: true, countryCode: null,
    compositionMethod: 'direct_verified', recipeSource: null, recipeReference: null,
    nutrients: n,
    ...overrides,
  };
}

function chickenBreast(): CanonicalFood {
  return food({
    id: 'chicken', name: 'Chicken breast, roasted, skinless',
    nutrients: { ...emptyNutrients(), energyKcal: 165, proteinG: 31.02, carbohydrateG: 0, fatG: 3.57, fibreG: 0 },
  });
}
function tomato(): CanonicalFood {
  return food({
    id: 'tomato', name: 'Tomato, raw',
    nutrients: { ...emptyNutrients(), energyKcal: 18, proteinG: 0.88, carbohydrateG: 3.89, fatG: 0.2, fibreG: 1.2 },
  });
}
function oliveOil(): CanonicalFood {
  return food({
    id: 'oil', name: 'Olive oil',
    nutrients: { ...emptyNutrients(), energyKcal: 884, proteinG: 0, carbohydrateG: 0, fatG: 100, fibreG: 0 },
  });
}
/** Missing a CORE macro (proteinG) — must still fail loudly (§1 keeps core evidence strict). */
function incompleteFood(): CanonicalFood {
  return food({
    id: 'incomplete', name: 'Mystery ingredient',
    nutrients: { ...emptyNutrients(), energyKcal: 100, proteinG: null, carbohydrateG: 10, fatG: 2, fibreG: 1 },
  });
}
/** Missing ONLY fibreG — core macros fully known. A real, realistic case
 *  (e.g. a Branded product with no reported fibre) — §1's relaxed path. */
function noFibreEvidenceFood(): CanonicalFood {
  return food({
    id: 'no-fibre', name: 'Branded protein bar',
    nutrients: { ...emptyNutrients(), energyKcal: 200, proteinG: 20, carbohydrateG: 15, fatG: 6, fibreG: null },
  });
}

function baseInput(overrides: Partial<ComposeMealInput> = {}): ComposeMealInput {
  return {
    name: 'Grilled Chicken & Tomato Salad',
    cuisine: 'mediterranean',
    category: 'lunch',
    ingredients: [
      { foodId: 'chicken', grams: 150 },
      { foodId: 'tomato', grams: 150 },
      { foodId: 'oil', grams: 15 },
    ],
    recipeSource: 'ACP standardized recipe (ingredient nutrients: USDA FoodData Central)',
    recipeReference: 'acp-recipe:proof-mediterranean-lunch-v1',
    compositionMethod: 'standard_recipe_estimated',
    ...overrides,
  };
}

function foodsMap(...foods: CanonicalFood[]): Map<string, CanonicalFood> {
  return new Map(foods.map(f => [f.id, f]));
}

const FOODS = foodsMap(chickenBreast(), tomato(), oliveOil(), incompleteFood(), noFibreEvidenceFood());

describe('composeMeal (Nutrition Catalogue Infrastructure V1)', () => {
  test('A — deterministic composition: same ingredients + quantities → same macros', () => {
    const out1 = composeMeal(baseInput(), FOODS);
    const out2 = composeMeal(baseInput(), FOODS);
    assert.deepEqual(
      { calories: out1.calories, protein_g: out1.protein_g, carbs_g: out1.carbs_g, fat_g: out1.fat_g, fibre_g: out1.fibre_g },
      { calories: out2.calories, protein_g: out2.protein_g, carbs_g: out2.carbs_g, fat_g: out2.fat_g, fibre_g: out2.fibre_g },
    );
    // Hand-computed expectation: chicken 150g + tomato 150g + oil 15g.
    const expectedKcal = (165 * 1.5) + (18 * 1.5) + (884 * 0.15);
    assert.equal(out1.calories, Math.round(expectedKcal));
  });

  test('B — scaling: doubling one ingredient\'s grams doubles ITS nutrient contribution', () => {
    const single = composeMeal(baseInput({ ingredients: [{ foodId: 'chicken', grams: 100 }] }), FOODS);
    const doubled = composeMeal(baseInput({ ingredients: [{ foodId: 'chicken', grams: 200 }] }), FOODS);
    assert.equal(doubled.calories, single.calories * 2);
    assert.equal(doubled.protein_g, round1(single.protein_g * 2));
  });

  test('C — null ≠ 0: an ingredient missing a CORE macro (protein) fails loudly, never silently contributes 0', () => {
    assert.throws(
      () => composeMeal(baseInput({ ingredients: [{ foodId: 'incomplete', grams: 100 }] }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'incomplete_macro_evidence',
    );
  });

  test('K — evidence-completeness policy: missing ONLY fibre does NOT invalidate the recipe (§1)', () => {
    const out = composeMeal(baseInput({
      ingredients: [{ foodId: 'chicken', grams: 150 }, { foodId: 'no-fibre', grams: 40 }],
    }), FOODS);
    // core macros still computed as a real sum
    assert.equal(out.calories, Math.round(165 * 1.5 + 200 * 0.4));
    assert.equal(out.protein_g, round1(31.02 * 1.5 + 20 * 0.4));
    // fibre is honestly UNKNOWN — never coerced to a partial sum or to 0
    assert.equal(out.fibre_g, null);
    assert.equal(out.fibreComplete, false);
  });

  test('L — evidence-completeness policy: when every ingredient reports fibre, the total is a real number (regression)', () => {
    const out = composeMeal(baseInput(), FOODS); // chicken + tomato + oil — all report fibreG
    assert.equal(out.fibreComplete, true);
    assert.equal(typeof out.fibre_g, 'number');
    assert.equal(out.fibre_g, round1(0 * 1.5 + 1.2 * 1.5 + 0 * 0.15));
  });

  test('D — provenance: a composed meal is acp_curated / standard_recipe_*, never trusted_food_database or direct_verified', () => {
    const out = composeMeal(baseInput(), FOODS);
    assert.equal(out.source_type, 'acp_curated');
    assert.equal(out.composition_method, 'standard_recipe_estimated');
    assert.notEqual(out.source_type as string, 'trusted_food_database');
  });

  test('E — invalid food id fails', () => {
    assert.throws(
      () => composeMeal(baseInput({ ingredients: [{ foodId: 'does-not-exist', grams: 100 }] }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'unknown_food',
    );
  });

  test('F — invalid grams fail (zero, negative, NaN)', () => {
    for (const grams of [0, -50, NaN]) {
      assert.throws(
        () => composeMeal(baseInput({ ingredients: [{ foodId: 'chicken', grams }] }), FOODS),
        (e: unknown) => e instanceof ComposeMealError && e.code === 'invalid_grams',
        `grams=${grams} should throw invalid_grams`,
      );
    }
  });

  test('G — cuisine validation: only the canonical 10 are accepted', () => {
    assert.throws(
      () => composeMeal(baseInput({ cuisine: 'italian' as any }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'invalid_cuisine',
    );
    // every canonical value is accepted (does not throw)
    for (const cuisine of ['kenyan', 'east_african', 'mediterranean', 'south_asian', 'indian', 'middle_eastern', 'east_asian', 'western', 'european', 'global'] as const) {
      assert.doesNotThrow(() => composeMeal(baseInput({ cuisine }), FOODS));
    }
  });

  test('H — category validation: only breakfast/lunch/dinner/snack/smoothie are accepted', () => {
    assert.throws(
      () => composeMeal(baseInput({ category: 'brunch' as any }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'invalid_category',
    );
    for (const category of ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] as const) {
      assert.doesNotThrow(() => composeMeal(baseInput({ category }), FOODS));
    }
  });

  test('I — FDC ingredient identity survives composition (per-ingredient breakdown traceable to source foods)', () => {
    const out = composeMeal(baseInput(), FOODS);
    assert.equal(out.__ingredientBreakdown.length, 3);
    assert.deepEqual(out.__ingredientBreakdown.map(i => i.foodId).sort(), ['chicken', 'oil', 'tomato']);
    const chicken = out.__ingredientBreakdown.find(i => i.foodId === 'chicken')!;
    assert.equal(chicken.foodName, 'Chicken breast, roasted, skinless');
    assert.equal(chicken.grams, 150);
    assert.equal(chicken.nutrients.energyKcal, 165 * 1.5);
    // display-only text[] stays backwards compatible (§4) — human-readable, not a food_id.
    assert.ok(out.ingredients.includes('Chicken breast, roasted, skinless (150g)'));
  });

  test('J — output shape stays compatible with the meals row Kenyan meals already use', () => {
    const out = composeMeal(baseInput(), FOODS);
    // Every column a pre-existing (Kenyan) meals row already has, still present with a sane value —
    // the new provenance columns are ADDITIVE, nothing about the base shape changed.
    for (const key of ['name', 'category', 'description', 'ingredients', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'prep_time_minutes', 'difficulty', 'tags', 'cuisine', 'is_active']) {
      assert.ok(key in out, `missing pre-existing column: ${key}`);
    }
    assert.equal(typeof out.calories, 'number');
    assert.equal(Array.isArray(out.ingredients), true);
    assert.equal(Array.isArray(out.tags), true);
  });

  test('missing recipe metadata fails loudly (no source, no reference)', () => {
    assert.throws(
      () => composeMeal(baseInput({ recipeSource: '' }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'missing_recipe_metadata',
    );
    assert.throws(
      () => composeMeal(baseInput({ recipeReference: '   ' }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'missing_recipe_metadata',
    );
  });

  test('an invalid composition method (e.g. direct_verified — a single-food concept) is rejected for a composed meal', () => {
    assert.throws(
      () => composeMeal(baseInput({ compositionMethod: 'direct_verified' as any }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'invalid_composition_method',
    );
  });

  test('a meal with zero ingredients fails loudly', () => {
    assert.throws(
      () => composeMeal(baseInput({ ingredients: [] }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'no_ingredients',
    );
  });

  test('an empty/whitespace name fails loudly', () => {
    assert.throws(
      () => composeMeal(baseInput({ name: '   ' }), FOODS),
      (e: unknown) => e instanceof ComposeMealError && e.code === 'invalid_name',
    );
  });
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
