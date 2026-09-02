import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import {
  getFrequentlyLoggedFoods, getNutrientContributors, getMealSlotPattern,
} from '../nutrition/nutrition-coaching-foods.ts';

let seq = 0;
function entry(opts: {
  localDate: string; foodId: string | null; name: string; slot?: MealSlot | null;
  nutrients?: Partial<Nutrients>; custom?: boolean;
}): FoodLogEntry {
  const n = emptyNutrients();
  if (opts.nutrients) for (const [k, v] of Object.entries(opts.nutrients)) (n as any)[k] = v;
  return {
    id: `e${++seq}`, userId: 'u1', loggedAt: `${opts.localDate}T12:00:00Z`, localDate: opts.localDate,
    timezone: 'Africa/Nairobi', mealSlot: opts.slot ?? null,
    foodId: opts.custom ? null : opts.foodId, displayName: opts.name, brand: null,
    quantity: 100, unit: 'g', servingLabel: null, quantityGrams: opts.custom ? null : 100,
    captureMethod: 'search', source: 'USDA FoodData Central', sourceType: 'trusted_food_database', note: null, nutrients: n,
  };
}

describe('getFrequentlyLoggedFoods — observation-level thresholds (§35)', () => {
  test('one distinct-day occurrence = "single" (never called a habit)', () => {
    const foods = getFrequentlyLoggedFoods([entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast' })]);
    assert.equal(foods[0].level, 'single');
    assert.equal(foods[0].occurrenceDays, 1);
  });
  test('two distinct days = "observed_more_than_once"', () => {
    const foods = getFrequentlyLoggedFoods([
      entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt' }),
      entry({ localDate: '2026-09-02', foodId: 'gy', name: 'Greek yoghurt' }),
    ]);
    assert.equal(foods[0].level, 'observed_more_than_once');
  });
  test('three+ distinct days = "frequently_logged"', () => {
    const foods = getFrequentlyLoggedFoods([
      entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast' }),
      entry({ localDate: '2026-09-02', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast' }),
      entry({ localDate: '2026-09-04', foodId: 'gy', name: 'Greek yoghurt', slot: 'snack' }),
    ]);
    assert.equal(foods[0].level, 'frequently_logged');
    assert.equal(foods[0].occurrenceDays, 3);
    assert.deepEqual(foods[0].mealSlots, ['breakfast', 'snack']); // most-frequent first
  });
  test('two entries on the SAME day is still only one distinct day', () => {
    const foods = getFrequentlyLoggedFoods([
      entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt' }),
      entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt' }),
    ]);
    assert.equal(foods[0].occurrenceDays, 1);
    assert.equal(foods[0].level, 'single');
  });
  test('name-only custom entries are ignored (no snapshot to reason about)', () => {
    const foods = getFrequentlyLoggedFoods([
      entry({ localDate: '2026-09-01', foodId: null, name: 'Chapati', custom: true }),
      entry({ localDate: '2026-09-02', foodId: null, name: 'Chapati', custom: true }),
    ]);
    assert.equal(foods.length, 0);
  });
});

describe('getNutrientContributors — from frozen snapshots only (§10)', () => {
  const entries = [
    entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast', nutrients: { proteinG: 25 } }),
    entry({ localDate: '2026-09-02', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast', nutrients: { proteinG: 25 } }),
    entry({ localDate: '2026-09-03', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast', nutrients: { proteinG: 25 } }),
    entry({ localDate: '2026-09-01', foodId: 'ap', name: 'Apple', slot: 'snack', nutrients: { proteinG: 0.3 } }),   // negligible share
    entry({ localDate: '2026-09-02', foodId: 'ap', name: 'Apple', slot: 'snack', nutrients: { proteinG: 0.3 } }),
    entry({ localDate: '2026-09-02', foodId: 'sa', name: 'Salmon', slot: 'dinner', nutrients: { proteinG: 40 } }),  // big but one-off day
  ];

  test('identifies the food that supplied a meaningful protein share, appearing on 2+ days', () => {
    const c = getNutrientContributors(entries, 'proteinG');
    const names = c.map(x => x.name);
    assert.ok(names.includes('Greek yoghurt'));
    assert.ok(!names.includes('Apple'), 'negligible-share food excluded');
    assert.ok(!names.includes('Salmon'), 'one-off-day food excluded (MIN_CONTRIBUTOR_DAYS)');
  });
  test('a nutrient no logged food supplied → no contributors, not a zero-filled list', () => {
    assert.deepEqual(getNutrientContributors(entries, 'vitaminDUg'), []);
  });
  test('NULL snapshot value is skipped, never counted as 0', () => {
    const mixed = [
      entry({ localDate: '2026-09-01', foodId: 'x', name: 'X', nutrients: { ironMg: 3 } }),
      entry({ localDate: '2026-09-02', foodId: 'x', name: 'X', nutrients: { ironMg: 3 } }),
      entry({ localDate: '2026-09-03', foodId: 'y', name: 'Y' }), // Y has no iron snapshot
    ];
    const c = getNutrientContributors(mixed, 'ironMg');
    assert.deepEqual(c.map(x => x.name), ['X']);
    assert.equal(c[0].shareOfKnownTotal, 1); // 6 of 6 known iron came from X, Y contributed nothing (unknown ≠ 0)
  });
});

describe('getMealSlotPattern', () => {
  test('returns a specific food\'s slots, most-frequent first', () => {
    const entries = [
      entry({ localDate: '2026-09-01', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast' }),
      entry({ localDate: '2026-09-02', foodId: 'gy', name: 'Greek yoghurt', slot: 'breakfast' }),
      entry({ localDate: '2026-09-03', foodId: 'gy', name: 'Greek yoghurt', slot: 'snack' }),
    ];
    assert.deepEqual(getMealSlotPattern(entries, 'gy'), ['breakfast', 'snack']);
  });
});
