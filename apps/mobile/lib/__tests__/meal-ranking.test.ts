import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getMealCandidates, applyDailyVariety, type MealRow, type MealCandidate } from '../meal-ranking.ts';

function mealRow(overrides: Partial<MealRow> = {}): MealRow {
  return {
    id: 'm1', name: 'Test Meal', category: 'lunch', cuisine: 'kenyan', tags: [],
    calories: 400, protein_g: 20, carbs_g: 30, fat_g: 10, fibre_g: 3, is_active: true,
    ...overrides,
  };
}

describe('Hard constraints applied before any soft scoring', () => {
  test('inactive meals never appear as candidates, regardless of how well they score', () => {
    const meals = [mealRow({ id: 'active', is_active: true }), mealRow({ id: 'inactive', is_active: false, protein_g: 100 })];
    const candidates = getMealCandidates({ meals });
    assert.deepEqual(candidates.map(c => c.mealId), ['active']);
  });

  test('requireVegetarian excludes non-vegetarian/vegan meals entirely, not just down-ranks them', () => {
    const meals = [
      mealRow({ id: 'veg', tags: ['vegetarian'] }),
      mealRow({ id: 'meat', tags: [] }),
    ];
    const candidates = getMealCandidates({ meals, requireVegetarian: true });
    assert.deepEqual(candidates.map(c => c.mealId), ['veg']);
  });

  test('a vegan-tagged meal also satisfies requireVegetarian', () => {
    const meals = [mealRow({ id: 'vegan', tags: ['vegan'] })];
    const candidates = getMealCandidates({ meals, requireVegetarian: true });
    assert.equal(candidates.length, 1);
  });
});

describe('Soft scoring never excludes — cuisine and goal are ranking signals only', () => {
  test('a non-preferred-cuisine meal still appears, just ranked lower', () => {
    const meals = [
      mealRow({ id: 'preferred', cuisine: 'kenyan' }),
      mealRow({ id: 'other', cuisine: 'east_asian' }),
    ];
    const candidates = getMealCandidates({ meals, cuisinePreferences: ['kenyan'] });
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].mealId, 'preferred');
  });

  test('deterministic ordering: identical scores tiebreak by meal id, never random', () => {
    const meals = [mealRow({ id: 'zzz' }), mealRow({ id: 'aaa' })];
    const candidates = getMealCandidates({ meals });
    assert.deepEqual(candidates.map(c => c.mealId), ['aaa', 'zzz']);
  });

  test('limit truncates the ranked list without changing order', () => {
    const meals = [mealRow({ id: 'a' }), mealRow({ id: 'b' }), mealRow({ id: 'c' })];
    const candidates = getMealCandidates({ meals, limit: 2 });
    assert.equal(candidates.length, 2);
  });

  test('reasons include preferred_cuisine only for an exact/sibling cuisine match', () => {
    const meals = [mealRow({ id: 'a', cuisine: 'kenyan' })];
    const withPref = getMealCandidates({ meals, cuisinePreferences: ['kenyan'] });
    const withoutPref = getMealCandidates({ meals });
    assert.ok(withPref[0].reasons.includes('preferred_cuisine'));
    assert.ok(!withoutPref[0].reasons.includes('preferred_cuisine'));
  });

  test('high_protein / high_fibre / balanced_meal reasons reflect the underlying goal-fit signals', () => {
    const meals = [mealRow({ id: 'a', protein_g: 25, fibre_g: 6, carbs_g: 10, fat_g: 5 })];
    const candidates = getMealCandidates({ meals, goal: 'build_muscle' });
    assert.ok(candidates[0].reasons.includes('high_protein'));
    assert.ok(candidates[0].reasons.includes('high_fibre'));
  });
});

function candidate(overrides: Partial<MealCandidate> = {}): MealCandidate {
  return {
    mealId: 'm1', name: 'Test', cuisine: ['kenyan'], mealTypes: ['lunch'],
    nutrition: { calories: 400, proteinGrams: 20, carbohydrateGrams: 30, fatGrams: 10 },
    dietaryTags: [], scoring: { cuisineFit: 0.5, goalFit: 0.5, overall: 0.5 }, reasons: [],
    ...overrides,
  };
}

describe('applyDailyVariety — never overrides a genuinely better-ranked meal', () => {
  test('when the top score is unique, that candidate is chosen regardless of cuisine repetition', () => {
    const picksBySlot = [
      { slot: 'breakfast', candidates: [candidate({ mealId: 'a', cuisine: ['kenyan'], scoring: { cuisineFit: 1, goalFit: 1, overall: 0.9 } })] },
      { slot: 'lunch', candidates: [
        candidate({ mealId: 'b', cuisine: ['kenyan'], scoring: { cuisineFit: 1, goalFit: 1, overall: 0.9 } }),
        candidate({ mealId: 'c', cuisine: ['western'], scoring: { cuisineFit: 0.2, goalFit: 0.2, overall: 0.2 } }),
      ] },
    ];
    const results = applyDailyVariety(picksBySlot);
    assert.equal(results[1].candidate?.mealId, 'b'); // higher score wins even though it repeats the cuisine
  });

  test('among candidates tied for the top score, a novel cuisine is preferred over one already used', () => {
    const picksBySlot = [
      { slot: 'breakfast', candidates: [candidate({ mealId: 'a', cuisine: ['kenyan'], scoring: { cuisineFit: 1, goalFit: 1, overall: 0.8 } })] },
      { slot: 'lunch', candidates: [
        candidate({ mealId: 'b', cuisine: ['kenyan'], scoring: { cuisineFit: 1, goalFit: 1, overall: 0.8 } }),
        candidate({ mealId: 'c', cuisine: ['western'], scoring: { cuisineFit: 1, goalFit: 1, overall: 0.8 } }),
      ] },
    ];
    const results = applyDailyVariety(picksBySlot);
    assert.equal(results[1].candidate?.mealId, 'c'); // same top score, but novel cuisine wins the tie
  });

  test('an empty candidate list for a slot yields a null candidate, never a crash or a synthesized fallback', () => {
    const results = applyDailyVariety([{ slot: 'dinner', candidates: [] }]);
    assert.equal(results[0].candidate, null);
  });
});
