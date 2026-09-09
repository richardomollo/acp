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

describe('LH-39 — weight-direction tilt (directionally compatible, never a hard filter or calorie target)', () => {
  // Three same-cuisine candidates for one slot. `leanProtein` and
  // `heartyProtein` have an IDENTICAL coarse goal fit for build_muscle (both
  // high-protein, high-fibre, balanced) — they differ mainly in how
  // substantial they are — so only the weight direction can reorder them.
  // `midBalanced` sits between.
  const leanProtein = mealRow({ id: 'leanProtein', calories: 350, protein_g: 28, carbs_g: 30, fat_g: 9, fibre_g: 6 });
  const midBalanced = mealRow({ id: 'midBalanced', calories: 520, protein_g: 22, carbs_g: 55, fat_g: 16, fibre_g: 4 });
  const heartyProtein = mealRow({ id: 'heartyProtein', calories: 720, protein_g: 34, carbs_g: 75, fat_g: 22, fibre_g: 7 });
  const pool = [leanProtein, midBalanced, heartyProtein];

  test("omitting weightDirection leaves ordering AND scores byte-identical to before", () => {
    const withNothing = getMealCandidates({ meals: pool, goal: 'build_muscle', cuisinePreferences: ['kenyan'] });
    const withUnknown = getMealCandidates({ meals: pool, goal: 'build_muscle', cuisinePreferences: ['kenyan'], weightDirection: 'unknown' });
    const withNone = getMealCandidates({ meals: pool, goal: 'build_muscle', cuisinePreferences: ['kenyan'], weightDirection: 'none' });
    assert.deepEqual(withUnknown.map(c => [c.mealId, c.scoring.overall]), withNothing.map(c => [c.mealId, c.scoring.overall]));
    assert.deepEqual(withNone.map(c => [c.mealId, c.scoring.overall]), withNothing.map(c => [c.mealId, c.scoring.overall]));
  });

  test("a gain direction ranks the more substantial protein meal above the lighter one (identical goal fit)", () => {
    const gain = getMealCandidates({ meals: pool, goal: 'build_muscle', weightDirection: 'gain' });
    const heartyRank = gain.findIndex(c => c.mealId === 'heartyProtein');
    const leanRank = gain.findIndex(c => c.mealId === 'leanProtein');
    assert.ok(heartyRank < leanRank, `heartyProtein (${heartyRank}) should rank above leanProtein (${leanRank}) for a gain direction`);
  });

  test("a loss direction ranks the lighter protein/fibre-forward meal above the more substantial one (identical goal fit)", () => {
    const loss = getMealCandidates({ meals: pool, goal: 'build_muscle', weightDirection: 'loss' });
    const leanRank = loss.findIndex(c => c.mealId === 'leanProtein');
    const heartyRank = loss.findIndex(c => c.mealId === 'heartyProtein');
    assert.ok(leanRank < heartyRank, `leanProtein (${leanRank}) should rank above heartyProtein (${heartyRank}) for a loss direction`);
  });

  test("the tilt never excludes a meal — every candidate still appears under either direction", () => {
    for (const dir of ['gain', 'loss'] as const) {
      const out = getMealCandidates({ meals: pool, goal: 'build_muscle', weightDirection: dir });
      assert.deepEqual(new Set(out.map(c => c.mealId)), new Set(['leanProtein', 'midBalanced', 'heartyProtein']));
    }
  });

  test("the tilt is bounded — it never overturns a genuinely stronger goal+cuisine match", () => {
    // 'strong' has a much better cuisine + protein fit; 'weakDense' is only energy-dense.
    const strong = mealRow({ id: 'strong', cuisine: 'kenyan', calories: 450, protein_g: 32, carbs_g: 40, fat_g: 12, fibre_g: 6, tags: [] });
    const weakDense = mealRow({ id: 'weakDense', cuisine: 'east_asian', calories: 1100, protein_g: 8, carbs_g: 120, fat_g: 40, fibre_g: 1 });
    const out = getMealCandidates({ meals: [strong, weakDense], goal: 'build_muscle', cuisinePreferences: ['kenyan'], weightDirection: 'gain' });
    assert.equal(out[0].mealId, 'strong');
  });

  test("canonical nutrition values are passed through unchanged regardless of direction", () => {
    const out = getMealCandidates({ meals: [heartyProtein], goal: 'build_muscle', weightDirection: 'gain' });
    assert.deepEqual(out[0].nutrition, { calories: 720, proteinGrams: 34, carbohydrateGrams: 75, fatGrams: 22 });
  });

  test("dietary hard filter still wins over the directional tilt", () => {
    const vegLight = mealRow({ id: 'vegLight', tags: ['vegetarian'], calories: 250, protein_g: 12 });
    const meatHearty = mealRow({ id: 'meatHearty', tags: [], calories: 900, protein_g: 45 });
    const out = getMealCandidates({ meals: [vegLight, meatHearty], goal: 'build_muscle', weightDirection: 'gain', requireVegetarian: true });
    assert.deepEqual(out.map(c => c.mealId), ['vegLight']);
  });

  test("deterministic: identical inputs (direction included) produce identical output", () => {
    const a = getMealCandidates({ meals: pool, goal: 'build_muscle', cuisinePreferences: ['kenyan'], weightDirection: 'gain' });
    const b = getMealCandidates({ meals: pool, goal: 'build_muscle', cuisinePreferences: ['kenyan'], weightDirection: 'gain' });
    assert.deepEqual(a, b);
  });
});
