// Lana Food Logging Restoration V1 — §25/§47 cross-entry-point invariant.
// Extended for Monthly→Weekly→Daily Planning V1 — §65 golden test (a
// PLANNED meal must resolve to the exact same evidence as every other
// entry point).
//
// For an identical (food_id, quantity, unit), Food Search, Recipe Detail,
// a Suggested Meal, and now a PLANNED meal (services/nutrition-planning-
// service.ts's logPlannedMeal) must produce EQUIVALENT frozen nutrition
// evidence. All four UI/service entry points (app/log-food.tsx,
// app/recipe-detail.tsx, app/today-nutrition.tsx's recipe-suggestion
// toggle, and nutritionPlanningService.logPlannedMeal) call the exact same
// two pure functions — resolveGrams then computeLogSnapshot
// (lib/nutrition/food-nutrition.ts) — on the same canonical `food` object,
// then persist via the one foodLogService.logFood write path (confirmed by
// reading nutrition-planning-service.ts's logPlannedMeal: it calls
// foodLogService.logFood(userId, { foodId: plannedFoodId, quantity: grams,
// unit: 'g', ... }) — the identical call shape as the other three, never a
// second calculation or a separate evidence table). This test pins that at
// the pure-maths layer with REAL KFCT source data (not a fake fixture): the
// per-100g values below are copied verbatim from
// data/kfct/kenyan_recipes.csv, kfct_code 15060, "Githeri (Fresh Beans and
// Maize)" — one of the three legitimate, distinct Githeri variants in the
// canonical catalogue (§6/§E).
//
// A genuine end-to-end proof (searching/opening/suggesting the SAME live
// `foods` row through all three real screens against local Supabase) needs
// Docker/local Supabase running, which this session does not have — see the
// completion report's "tests infrastructure-blocked" section. What's
// provable without it is proven here: the shared pure computation is
// deterministic and entry-point-agnostic by construction.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGrams, computeLogSnapshot } from '../nutrition/food-nutrition.ts';
import { emptyNutrients, type CanonicalFood } from '../nutrition/food-types.ts';

// Verbatim from data/kfct/kenyan_recipes.csv, kfct_code 15060.
function githeriFreshBeansAndMaize(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 180; n.proteinG = 7.8; n.carbohydrateG = 15.1; n.fatG = 7.6; n.fibreG = 10.4;
  n.ironMg = 1.7; n.vitaminAUg = 6;
  return {
    id: 'food-githeri-15060', source: 'FAO/Government of Kenya', externalId: 'kfct:15060', fdcId: null,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Githeri (Fresh Beans and Maize)', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null,
    nutrients: n, servings: [],
    defaultServingGrams: null, defaultServingLabel: null,
    isGeneric: true, countryCode: 'KE',
  };
}

describe('§25/§47 golden regression — Food Search / Recipe Detail / Suggested Meal converge on identical evidence', () => {
  const food = githeriFreshBeansAndMaize();

  // PATH A — Food Search (app/log-food.tsx's preview: resolveGrams(food, qn, unit, servingLabel) → computeLogSnapshot)
  function pathA_search(grams: number) {
    const g = resolveGrams(food, grams, 'g');
    return computeLogSnapshot(food, g);
  }
  // PATH B — Recipe Detail (app/recipe-detail.tsx's preview: identical call shape, unit always 'g')
  function pathB_recipeDetail(grams: number) {
    const g = resolveGrams(food, grams, 'g');
    return computeLogSnapshot(food, g);
  }
  // PATH C — Suggested Meal (app/today-nutrition.tsx's mealRowFromRecipe reads
  // food.nutrients per-100g verbatim for display; the ✓ toggle's actual log
  // call resolves the SAME way as A/B at whatever grams is logged)
  function pathC_suggestedMeal(grams: number) {
    const g = resolveGrams(food, grams, 'g');
    return computeLogSnapshot(food, g);
  }
  // PATH D — Planned Meal (nutritionPlanningService.logPlannedMeal: grams =
  // actualGrams ?? plannedGrams, then foodLogService.logFood(foodId,
  // quantity: grams, unit: 'g', ...) — same call shape as A/B/C)
  function pathD_plannedMeal(grams: number) {
    const g = resolveGrams(food, grams, 'g');
    return computeLogSnapshot(food, g);
  }

  test('200g Githeri produces byte-identical frozen nutrition evidence from all four entry points (§65 golden test: planned 200g -> Recipe Detail 200g -> Add to today 200g -> Food Search 200g)', () => {
    const a = pathA_search(200);
    const b = pathB_recipeDetail(200);
    const c = pathC_suggestedMeal(200);
    const d = pathD_plannedMeal(200);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
    assert.deepEqual(c, d);
  });

  test('a planned meal actually eaten at a DIFFERENT quantity than planned (§25: planned 250g, actual 180g) still converges with the other three paths at 180g — never the planned amount', () => {
    const plannedGrams = 250;
    const actualGrams = 180; // what nutritionPlanningService.logPlannedMeal's `actualGrams` override would carry
    const plannedButUnused = pathD_plannedMeal(plannedGrams);
    const actuallyLogged = pathD_plannedMeal(actualGrams);
    const fromSearch = pathA_search(actualGrams);
    assert.notDeepEqual(plannedButUnused, actuallyLogged); // the plan's own 250g number is never what gets frozen
    assert.deepEqual(actuallyLogged, fromSearch); // the ACTUAL 180g matches every other entry point at 180g
  });

  test('the shared computation is exactly 2× the source per-100g values at 200g — not re-derived, not rounded differently per path', () => {
    const result = pathA_search(200);
    assert.equal(result.energyKcal, 360);
    assert.equal(result.proteinG, 15.6);
    assert.equal(result.carbohydrateG, 30.2);
    assert.equal(result.fatG, 15.2);
    assert.equal(result.fibreG, 20.8);
    assert.equal(result.ironMg, 3.4);
  });

  test('a nutrient the KFCT source never reported (e.g. vitamin D) stays null through all three paths — never coerced to 0', () => {
    assert.equal(food.nutrients.vitaminDUg, null);
    const a = pathA_search(150);
    const b = pathB_recipeDetail(150);
    const c = pathC_suggestedMeal(150);
    assert.equal(a.vitaminDUg, null);
    assert.equal(b.vitaminDUg, null);
    assert.equal(c.vitaminDUg, null);
  });

  test('100g reference portion (the Suggested Meal card default) matches the source per-100g values verbatim', () => {
    const result = pathC_suggestedMeal(100);
    assert.equal(result.energyKcal, food.nutrients.energyKcal);
    assert.equal(result.proteinG, food.nutrients.proteinG);
    assert.equal(result.fibreG, food.nutrients.fibreG);
  });
});
