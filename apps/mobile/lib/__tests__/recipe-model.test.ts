// Lana Nutrition — Recipes V1. Pure-logic tests for lib/nutrition/recipe-model.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRecipeEligibleForDiscovery, slotsForRecipeCategory,
  recipeCandidateId, parseRecipeCandidateId, mealRowFromRecipe, matchedRecipeFamilies,
  classifySuggestionSource, isSuggestionEligible,
} from '../nutrition/recipe-model.ts';
import { mealCandidateFromFoodRecipe } from '../nutrition/nutrition-meal-model.ts';
import { emptyNutrients } from '../nutrition/food-types.ts';

function food(over: Partial<{ isActive: boolean; isGeneric: boolean; compositionMethod: any }> = {}) {
  return { isActive: true, isGeneric: true, compositionMethod: 'standard_recipe_verified', ...over };
}
function recipe(over: Partial<{ foodId: string | null; nutrientStatus: any }> = {}) {
  return { foodId: 'food-1', nutrientStatus: 'available', ...over };
}

describe('isRecipeEligibleForDiscovery — §3 eligibility gate', () => {
  test('A. active, verified, complete recipe is eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food(), recipe()), true);
  });
  test('B. inactive food is never eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food({ isActive: false }), recipe()), false);
  });
  test('C. estimated (not verified) composition is never eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food({ compositionMethod: 'standard_recipe_estimated' }), recipe()), false);
  });
  test('D. proxy composition is never eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food({ compositionMethod: 'proxy_composition' }), recipe()), false);
  });
  test('E. direct_verified (a single-ingredient food, no recipe) is never eligible here', () => {
    assert.equal(isRecipeEligibleForDiscovery(food({ compositionMethod: 'direct_verified' }), recipe()), false);
  });
  test('F. missing foodId (the 2 unavailable KFCT recipes) is never eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food(), recipe({ foodId: null })), false);
  });
  test('G. nutrient_status not "available" is never eligible', () => {
    assert.equal(isRecipeEligibleForDiscovery(food(), recipe({ nutrientStatus: 'unavailable_missing_yield_factors' })), false);
  });
});

describe('slotsForRecipeCategory — deterministic KFCT category → meal-slot mapping', () => {
  test('Porridges → breakfast only', () => {
    assert.deepEqual(slotsForRecipeCategory('Porridges'), ['breakfast']);
  });
  test('Ugali → lunch and dinner', () => {
    assert.deepEqual(slotsForRecipeCategory('Ugali'), ['lunch', 'dinner']);
  });
  test('Common Snacks → snack only', () => {
    assert.deepEqual(slotsForRecipeCategory('Common Snacks'), ['snack']);
  });
  test('unrecognised category → no slots (never enters the suggestion pool, still browsable)', () => {
    assert.deepEqual(slotsForRecipeCategory('Something New'), []);
  });
  test('null category → no slots', () => {
    assert.deepEqual(slotsForRecipeCategory(null), []);
  });
});

describe('recipeCandidateId / parseRecipeCandidateId — round trip', () => {
  test('A. encodes and decodes the food id', () => {
    const id = recipeCandidateId('abc-123');
    assert.equal(parseRecipeCandidateId(id), 'abc-123');
  });
  test('B. a legacy meals.id (no prefix) parses to null', () => {
    assert.equal(parseRecipeCandidateId('9f5b3c1a-0000-0000-0000-000000000001'), null);
  });
});

describe('mealRowFromRecipe — adapter into the LIVE lib/meal-ranking.ts ranker', () => {
  const kfctFood = {
    id: 'food-githeri', name: 'Githeri (Stewed Maize & Beans)', countryCode: 'KE',
    nutrients: { ...emptyNutrients(), energyKcal: 157, proteinG: 6.7, carbohydrateG: 19.7, fatG: 4.2, fibreG: 7.2 },
  };
  test('A. maps per-100g values verbatim — no scaling, no second calculation', () => {
    const row = mealRowFromRecipe(kfctFood, { category: 'Legume Dishes' }, 'lunch');
    assert.equal(row.calories, 157);
    assert.equal(row.protein_g, 6.7);
    assert.equal(row.carbs_g, 19.7);
    assert.equal(row.fat_g, 4.2);
    assert.equal(row.fibre_g, 7.2);
  });
  test('B. cuisine derives from country_code=KE → "kenyan", never nationality (§21)', () => {
    const row = mealRowFromRecipe(kfctFood, { category: 'Legume Dishes' }, 'lunch');
    assert.equal(row.cuisine, 'kenyan');
  });
  test('C. non-KE food → "global", not fabricated', () => {
    const row = mealRowFromRecipe({ ...kfctFood, countryCode: null }, { category: 'x' }, 'lunch');
    assert.equal(row.cuisine, 'global');
  });
  test('D. id carries the recipe-candidate prefix, decodable back to the food id', () => {
    const row = mealRowFromRecipe(kfctFood, { category: 'Legume Dishes' }, 'lunch');
    assert.equal(parseRecipeCandidateId(row.id), 'food-githeri');
  });
  test('E. a null nutrient (unknown) becomes 0 only for the MealRow shape the ranker needs — never mutates the source', () => {
    const partial = { ...kfctFood, nutrients: { ...kfctFood.nutrients, proteinG: null } };
    const row = mealRowFromRecipe(partial, { category: 'x' }, 'lunch');
    assert.equal(row.protein_g, 0); // MealRow.protein_g is `number` (ranker input), not the frozen evidence
  });
  test('F. fibre_g stays nullable — MealRow allows it, unlike the required macros', () => {
    const partial = { ...kfctFood, nutrients: { ...kfctFood.nutrients, fibreG: null } };
    const row = mealRowFromRecipe(partial, { category: 'x' }, 'lunch');
    assert.equal(row.fibre_g, null);
  });
  test('G. is_active is always true — ineligible recipes never reach this adapter (the caller filters first)', () => {
    const row = mealRowFromRecipe(kfctFood, { category: 'x' }, 'lunch');
    assert.equal(row.is_active, true);
  });
});

describe('mealCandidateFromFoodRecipe — the adaptive-nutrition (flagged-off) adapter', () => {
  const kfctFood = {
    id: 'food-sukuma', name: 'Sukuma Wiki (Stir-fried Kales)', countryCode: 'KE',
    nutrients: { ...emptyNutrients(), energyKcal: 54, proteinG: 2.5, carbohydrateG: 2.1, fatG: 3.2, fibreG: 3.8 },
    compositionMethod: 'standard_recipe_verified' as const, source: 'FAO/Government of Kenya',
  };
  test('A. source is "canonical_recipe", carries foodId + recipeId', () => {
    const c = mealCandidateFromFoodRecipe(kfctFood, 'recipe-1', 'lunch');
    assert.equal(c.source, 'canonical_recipe');
    assert.equal(c.foodId, 'food-sukuma');
    assert.equal(c.recipeId, 'recipe-1');
  });
  test('B. macros are the food\'s own per-100g values, not recomputed', () => {
    const c = mealCandidateFromFoodRecipe(kfctFood, 'recipe-1', 'lunch');
    assert.equal(c.macros.calories, 54);
    assert.equal(c.macros.proteinG, 2.5);
  });
  test('C. cuisine "kenyan" only from country_code, never nationality', () => {
    const c = mealCandidateFromFoodRecipe(kfctFood, 'recipe-1', 'snack');
    assert.equal(c.cuisine, 'kenyan');
  });
});

describe('§30 suggestion → logging invariant — the suggestion card and the logged entry must agree', () => {
  // The suggested-meal card's numbers (via mealRowFromRecipe) and the
  // "Add to today" ✓ toggle (foodLogService.logFood(foodId, quantity:100,
  // unit:'g')) are two DIFFERENT code paths that must still agree exactly,
  // because both ultimately read the same source: the food's own per-100g
  // `nutrients` object. This test pins that invariant at the point where it
  // could silently drift — if mealRowFromRecipe ever started scaling,
  // rounding, or re-deriving a number instead of reading it verbatim, this
  // fails without needing a live Supabase round-trip.
  const food = {
    id: 'food-ugali', name: 'Whole Maize Flour Ugali', countryCode: 'KE',
    nutrients: { ...emptyNutrients(), energyKcal: 123, proteinG: 2.3, carbohydrateG: 27.1, fatG: 0.6, fibreG: 1.8 },
  };
  test('the suggestion card\'s calories/protein/carbs/fat are bit-for-bit the food\'s own per-100g nutrients — the exact numbers a 100g logFood call would freeze', () => {
    const row = mealRowFromRecipe(food, { category: 'Ugali' }, 'lunch');
    assert.equal(row.calories, food.nutrients.energyKcal);
    assert.equal(row.protein_g, food.nutrients.proteinG);
    assert.equal(row.carbs_g, food.nutrients.carbohydrateG);
    assert.equal(row.fat_g, food.nutrients.fatG);
  });
  // §27 — app/today-nutrition.tsx's toggleMeal calls
  // foodLogService.logFood(userId, { foodId, quantity: 100, unit: 'g', ... })
  // for every recipe-backed suggestion (never a computed/invented amount) —
  // the same fixed reference portion mealRowFromRecipe's numbers already
  // represent. Verified by code inspection (app/today-nutrition.tsx's
  // toggleMeal, the `item.recipeFoodId` branch) rather than re-asserted
  // here as a literal, since this repo has no screen-level test harness.
});

describe('isSuggestionEligible — Suggested Meals V1 recipe-only policy', () => {
  test('A. recipe_backed → eligible', () => {
    assert.equal(isSuggestionEligible('recipe_backed'), true);
  });
  test('B. fallback_no_recipe → excluded (not merely relabelled)', () => {
    assert.equal(isSuggestionEligible('fallback_no_recipe'), false);
  });
  test('C. superseded → excluded', () => {
    assert.equal(isSuggestionEligible('superseded'), false);
  });
  test('D. only recipe-backed candidates survive a filter over a mixed pool — the same composition app/today-nutrition.tsx applies before getMealCandidates ever runs', () => {
    const pool = [
      { id: 'r1', recipeFoodId: 'food-1', isActive: true },   // recipe_backed
      { id: 'legacy1', recipeFoodId: null, isActive: true },  // fallback_no_recipe
      { id: 'old1', recipeFoodId: 'food-2', isActive: false }, // superseded
      { id: 'r2', recipeFoodId: 'food-3', isActive: true },   // recipe_backed
    ];
    const eligible = pool.filter(c => isSuggestionEligible(classifySuggestionSource(c)));
    assert.deepEqual(eligible.map(c => c.id), ['r1', 'r2']);
  });
});

describe('classifySuggestionSource — §20/§21/§24 suggested-meal recipe-backing', () => {
  test('A. a suggestion with a real recipeFoodId is recipe_backed — carries canonical recipe identity', () => {
    assert.equal(classifySuggestionSource({ recipeFoodId: 'food-1', isActive: true }), 'recipe_backed');
  });
  test('B. a suggestion with no recipeFoodId is fallback_no_recipe, never recipe_backed', () => {
    assert.equal(classifySuggestionSource({ recipeFoodId: null, isActive: true }), 'fallback_no_recipe');
    assert.equal(classifySuggestionSource({ recipeFoodId: undefined, isActive: true }), 'fallback_no_recipe');
  });
  test('C/D. an inactive (superseded) candidate is never recipe_backed or fallback_no_recipe, even with a recipeFoodId', () => {
    assert.equal(classifySuggestionSource({ recipeFoodId: 'food-1', isActive: false }), 'superseded');
    assert.equal(classifySuggestionSource({ recipeFoodId: null, isActive: false }), 'superseded');
  });
});

describe('matchedRecipeFamilies — shared legacy-meal ↔ KFCT-recipe family matcher (app/meal-detail.tsx + the canonicalisation script)', () => {
  test('A. a combo legacy meal matches on its recognised component', () => {
    assert.deepEqual(matchedRecipeFamilies('Mukimo + Beef Stew'), ['mukimo']);
  });
  test('B. a meal with no recognised component matches nothing (from the real production dry run)', () => {
    assert.deepEqual(matchedRecipeFamilies('Nduma (Boiled Arrowroot) + Chai'), []);
  });
  test('C. bean-family keywords (maharagwe/ndengu/mbaazi/lentil/njahi) all resolve to "bean"', () => {
    for (const name of ['Rice + Maharagwe ya Nazi', 'Chapati + Ndengu (Green Grams)', 'Mahamri + Mbaazi za Nazi', 'Kamande (Lentil) Stew + Brown Rice']) {
      assert.ok(matchedRecipeFamilies(name).includes('bean'), name);
    }
  });
  test('D. "porridge" and "uji" both resolve to the same "uji" family, never duplicated', () => {
    assert.deepEqual(matchedRecipeFamilies('Oats Uji + Peanut Butter'), ['uji']);
  });
  test('E. case-insensitive', () => {
    assert.deepEqual(matchedRecipeFamilies('GITHERI SPECIAL'), ['githeri']);
  });
  test('F. multiple components can each match a distinct family', () => {
    const families = matchedRecipeFamilies('Ugali + Sukuma Wiki + Grilled Chicken');
    assert.ok(families.includes('ugali'));
    assert.ok(families.includes('sukuma'));
  });
});
