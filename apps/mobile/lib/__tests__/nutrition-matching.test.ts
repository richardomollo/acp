import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  findFoodsForNutritionFocus, selectMealsForNutritionFocus, nutritionFocusTagLabel, selectDailyMeals,
  type FoodCandidate, type DailyMealCandidates, type GeneralMealCandidate,
} from '../nutrition-matching.ts';

function food(overrides: Partial<FoodCandidate> = {}): FoodCandidate {
  return { id: 'f1', name: 'Test Food', category: 'lunch', cuisine: 'Kenyan', tags: [], ...overrides };
}

describe('Scenario G — Kenyan cuisine preference + protein focus', () => {
  test('surfaces real foods tagged for the requested focus', () => {
    const foods = [
      food({ id: 'f1', name: 'Ugali + Sukuma Wiki + Grilled Chicken', tags: ['muscle_building', 'high_protein'] }),
      food({ id: 'f2', name: 'Fruit Salad', tags: ['fresh'] }),
    ];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'kenyan', foods);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].id, 'f1');
    assert.equal(suggestions[0].reason, 'Good source of protein');
  });

  test('the reason is always the fixed, deterministic label — never AI/food-specific prose', () => {
    const foods = [food({ tags: ['high_fibre'] })];
    const suggestions = findFoodsForNutritionFocus('fibre', 'kenyan', foods);
    assert.equal(suggestions[0].reason, 'Good source of fibre');
  });
});

describe('Scenario H — international cuisine ranks appropriately, never forcibly excluded', () => {
  test('a matching non-Kenyan food still appears when it has the right tag', () => {
    const foods = [food({ id: 'intl', cuisine: 'Italian', tags: ['high_protein'] })];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'kenyan', foods);
    assert.equal(suggestions.length, 1); // not excluded just for being a different cuisine
  });

  test('a preferred-cuisine match ranks before an equally-tagged non-preferred one', () => {
    const foods = [
      food({ id: 'intl', cuisine: 'Italian', tags: ['high_protein'] }),
      food({ id: 'local', cuisine: 'Kenyan', tags: ['high_protein'] }),
    ];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'kenyan', foods);
    assert.equal(suggestions[0].id, 'local');
  });
});

describe('Scenario I — no cuisine preference: no guessing, balanced default', () => {
  test('null cuisine preference does not exclude or specially favour anything', () => {
    const foods = [
      food({ id: 'a', cuisine: 'Kenyan', tags: ['high_protein'] }),
      food({ id: 'b', cuisine: 'Italian', tags: ['high_protein'] }),
    ];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', null, foods);
    assert.equal(suggestions.length, 2); // both included, no forced ranking
  });
});

describe('Scenario J — dietary restriction is a hard filter', () => {
  test('a vegetarian preference excludes a non-vegetarian food even if it matches the focus perfectly', () => {
    const foods = [
      food({ id: 'meat', tags: ['high_protein'] }), // no vegetarian/vegan tag
      food({ id: 'veg', tags: ['high_protein', 'vegetarian'] }),
    ];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'vegetarian', foods);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].id, 'veg');
  });

  test('a vegan-tagged food also satisfies a vegetarian restriction', () => {
    const foods = [food({ id: 'vegan-food', tags: ['high_protein', 'vegan'] })];
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'vegetarian', foods);
    assert.equal(suggestions.length, 1);
  });
});

describe('general matching behaviour', () => {
  test('a food with no relevant tag at all is never a candidate — no forced matches', () => {
    const foods = [food({ tags: ['budget_friendly', 'comfort'] })];
    assert.deepEqual(findFoodsForNutritionFocus('protein_consistency', 'kenyan', foods), []);
  });

  test('caps results at maxResults', () => {
    const foods = Array.from({ length: 10 }, (_, i) => food({ id: `f${i}`, tags: ['high_protein'] }));
    const suggestions = findFoodsForNutritionFocus('protein_consistency', 'kenyan', foods, 5);
    assert.equal(suggestions.length, 5);
  });

  test('each nutrition focus type maps to a distinct, real tag set', () => {
    const proteinFoods = [food({ id: 'p', tags: ['muscle_building'] })];
    const preWorkoutFoods = [food({ id: 'pre', tags: ['pre_workout'] })];
    const postWorkoutFoods = [food({ id: 'post', tags: ['post_workout'] })];
    assert.equal(findFoodsForNutritionFocus('protein_consistency', null, proteinFoods).length, 1);
    assert.equal(findFoodsForNutritionFocus('pre_training_energy', null, preWorkoutFoods).length, 1);
    assert.equal(findFoodsForNutritionFocus('post_training_recovery', null, postWorkoutFoods).length, 1);
  });
});

describe('selectMealsForNutritionFocus (Home Nutrition Integration — one meal per slot)', () => {
  test('picks a focus-matching meal per slot when one exists', () => {
    const mealsBySlot = [
      { category: 'breakfast', foods: [food({ id: 'b1', category: 'breakfast', tags: ['comfort'] }), food({ id: 'b2', category: 'breakfast', tags: ['high_protein'] })] },
      { category: 'lunch', foods: [food({ id: 'l1', category: 'lunch', tags: ['high_protein'] })] },
      { category: 'dinner', foods: [food({ id: 'd1', category: 'dinner', tags: ['high_protein'] })] },
    ];
    const result = selectMealsForNutritionFocus('protein_consistency', null, mealsBySlot);
    assert.equal(result.length, 3);
    assert.equal(result.find(r => r.category === 'breakfast')?.food.id, 'b2');
    assert.ok(result.every(r => r.matchesFocus));
  });

  test('Section 13 — falls back to a generic meal in a slot with no focus-tagged option, rather than dropping the slot', () => {
    const mealsBySlot = [
      { category: 'lunch', foods: [food({ id: 'l1', category: 'lunch', tags: ['comfort'] }), food({ id: 'l2', category: 'lunch', tags: ['budget_friendly'] })] },
    ];
    const result = selectMealsForNutritionFocus('pre_training_energy', null, mealsBySlot);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchesFocus, false); // no pre_workout/energy tag existed in this slot's candidates
  });

  test('omits a slot entirely if there are no candidates at all', () => {
    const mealsBySlot = [{ category: 'lunch', foods: [] }];
    assert.deepEqual(selectMealsForNutritionFocus('protein_consistency', null, mealsBySlot), []);
  });

  test('dietary restriction is a hard filter even in the no-focus-match fallback — never shown just because nothing else qualifies', () => {
    const mealsBySlot = [
      { category: 'dinner', foods: [food({ id: 'meat', category: 'dinner', tags: ['comfort'] })] }, // not vegetarian/vegan, doesn't match focus either
    ];
    const result = selectMealsForNutritionFocus('protein_consistency', 'vegetarian', mealsBySlot);
    assert.deepEqual(result, []); // omitted, never shown despite being the only candidate
  });

  test('a vegetarian-safe, focus-matching meal is preferred over a vegetarian-safe non-matching one', () => {
    const mealsBySlot = [{
      category: 'lunch',
      foods: [
        food({ id: 'veg-nomatch', category: 'lunch', tags: ['vegetarian', 'comfort'] }),
        food({ id: 'veg-match', category: 'lunch', tags: ['vegetarian', 'high_protein'] }),
      ],
    }];
    const result = selectMealsForNutritionFocus('protein_consistency', 'vegetarian', mealsBySlot);
    assert.equal(result[0].food.id, 'veg-match');
  });

  test('Kenyan cuisine preference ranks a matching Kenyan meal first among equally-focus-matched options', () => {
    const mealsBySlot = [{
      category: 'lunch',
      foods: [
        food({ id: 'intl', category: 'lunch', cuisine: 'Italian', tags: ['high_protein'] }),
        food({ id: 'local', category: 'lunch', cuisine: 'Kenyan', tags: ['high_protein'] }),
      ],
    }];
    const result = selectMealsForNutritionFocus('protein_consistency', 'kenyan', mealsBySlot);
    assert.equal(result[0].food.id, 'local');
  });

  test('is fully deterministic — same input always produces the same output (never random)', () => {
    const mealsBySlot = [{ category: 'lunch', foods: [food({ id: 'a', category: 'lunch', tags: ['high_protein'] }), food({ id: 'b', category: 'lunch', tags: ['high_protein'] })] }];
    const first = selectMealsForNutritionFocus('protein_consistency', null, mealsBySlot);
    const second = selectMealsForNutritionFocus('protein_consistency', null, mealsBySlot);
    assert.deepEqual(first, second);
  });
});

describe('nutritionFocusTagLabel', () => {
  test('returns the same fixed label used by findFoodsForNutritionFocus — one canonical mapping', () => {
    assert.equal(nutritionFocusTagLabel('protein_consistency'), 'Good source of protein');
    assert.equal(nutritionFocusTagLabel('fibre'), 'Good source of fibre');
  });
});

function generalMeal(overrides: Partial<GeneralMealCandidate> = {}): GeneralMealCandidate {
  return { id: 'm1', name: 'Test Meal', image_url: null, calories: 400, ...overrides };
}

describe('selectDailyMeals (Home Nutrition Hardening, Problem B — no Math.random())', () => {
  const fiveBreakfasts: DailyMealCandidates[] = [{
    category: 'breakfast',
    foods: Array.from({ length: 5 }, (_, i) => generalMeal({ id: `b${i}`, name: `Breakfast ${i}` })),
  }];

  test('Scenario F — same user + same date + same candidates always returns the same result', () => {
    const first = selectDailyMeals('user-1', '2026-09-01', fiveBreakfasts);
    const second = selectDailyMeals('user-1', '2026-09-01', fiveBreakfasts);
    assert.deepEqual(first, second);
  });

  test('Scenario G — selection is sensitive to the calendar date (varies across a spread of dates)', () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const picks = new Set(dates.map(d => selectDailyMeals('user-1', d, fiveBreakfasts)[0].food.id));
    assert.ok(picks.size > 1, 'expected the selection to vary across at least some of 14 different dates');
  });

  test('Scenario G (same day, repeated calls) — never changes for the same date, unlike the old Math.random() behaviour', () => {
    const results = Array.from({ length: 5 }, () => selectDailyMeals('user-1', '2026-09-01', fiveBreakfasts)[0].food.id);
    assert.ok(results.every(r => r === results[0]));
  });

  test('Scenario H — selection is sensitive to the user id (varies across a spread of users)', () => {
    const users = Array.from({ length: 14 }, (_, i) => `user-${i}`);
    const picks = new Set(users.map(u => selectDailyMeals(u, '2026-09-01', fiveBreakfasts)[0].food.id));
    assert.ok(picks.size > 1, 'expected the selection to vary across at least some of 14 different users');
  });

  test('Scenario I — each slot is selected only from its own candidates', () => {
    const mealsBySlot: DailyMealCandidates[] = [
      { category: 'breakfast', foods: [generalMeal({ id: 'b1' }), generalMeal({ id: 'b2' })] },
      { category: 'lunch', foods: [generalMeal({ id: 'l1' }), generalMeal({ id: 'l2' })] },
      { category: 'dinner', foods: [generalMeal({ id: 'd1' }), generalMeal({ id: 'd2' })] },
    ];
    const result = selectDailyMeals('user-1', '2026-09-01', mealsBySlot);
    assert.ok(result.find(r => r.category === 'breakfast')!.food.id.startsWith('b'));
    assert.ok(result.find(r => r.category === 'lunch')!.food.id.startsWith('l'));
    assert.ok(result.find(r => r.category === 'dinner')!.food.id.startsWith('d'));
  });

  test('Scenario J — a single candidate in a slot is always returned, no error', () => {
    const mealsBySlot: DailyMealCandidates[] = [{ category: 'breakfast', foods: [generalMeal({ id: 'only-one' })] }];
    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      const result = selectDailyMeals('user-1', date, mealsBySlot);
      assert.equal(result[0].food.id, 'only-one');
    }
  });

  test('Scenario K — an empty slot returns no entry for it, no crash, never substituted from another slot', () => {
    const mealsBySlot: DailyMealCandidates[] = [
      { category: 'breakfast', foods: [generalMeal({ id: 'b1' })] },
      { category: 'lunch', foods: [] },
      { category: 'dinner', foods: [generalMeal({ id: 'd1' })] },
    ];
    const result = selectDailyMeals('user-1', '2026-09-01', mealsBySlot);
    assert.equal(result.length, 2);
    assert.equal(result.find(r => r.category === 'lunch'), undefined);
  });

  test('works without a user id (falls back to an "anon" seed component, still deterministic)', () => {
    const first = selectDailyMeals(null, '2026-09-01', fiveBreakfasts);
    const second = selectDailyMeals(null, '2026-09-01', fiveBreakfasts);
    assert.deepEqual(first, second);
  });
});
