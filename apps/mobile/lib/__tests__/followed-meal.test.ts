// Lana Nutrition — "followed a suggested/planned meal = consumed".
// Pure-core coverage: deterministic idempotency key, undo symmetry, the
// frozen macro snapshot, slot normalisation, and LOCAL-date safety
// (Africa/Nairobi, UTC+3) so a meal followed on the 8th stays on the 8th.

process.env.TZ = 'Africa/Nairobi'; // must be set before any Date is created

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  followMealKey, followMealGroupId, normaliseFollowedSlot, buildFollowedMealLogInput,
  FOLLOWED_MEAL_CAPTURE_METHOD, FOLLOWED_MEAL_SOURCE_TYPE,
} from '../nutrition/followed-meal.ts';
import { localISODate } from '../fulfilment.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('followMealKey', () => {
  test('suggested meal is keyed by the catalogue meal id', () => {
    assert.equal(followMealKey({ suggested: true, mealId: 'm1' }), 'sug:m1');
  });
  test('plan meal is keyed by the meal_plan_items row id (not the meal id)', () => {
    assert.equal(followMealKey({ suggested: false, mealId: 'm1', mealPlanItemId: 'pi9' }), 'plan:pi9');
  });
  test('falls back to the suggested key when no plan item id is present', () => {
    assert.equal(followMealKey({ suggested: false, mealId: 'm1', mealPlanItemId: null }), 'sug:m1');
  });
});

describe('followMealGroupId — deterministic idempotency key', () => {
  test('is a syntactically valid uuid', () => {
    assert.match(followMealGroupId('u1', 'sug:m1', '2026-09-08'), UUID_RE);
  });
  test('same (user, key, date) always yields the same id — a repeated ✓ tap no-ops', () => {
    const a = followMealGroupId('u1', 'sug:m1', '2026-09-08');
    const b = followMealGroupId('u1', 'sug:m1', '2026-09-08');
    assert.equal(a, b);
  });
  test('undo targets exactly the id that check created (same inputs)', () => {
    const created = followMealGroupId('u7', 'plan:pi3', '2026-09-08');
    const toDelete = followMealGroupId('u7', 'plan:pi3', '2026-09-08');
    assert.equal(created, toDelete);
  });
  test('different user / meal / date never collide', () => {
    const ids = new Set([
      followMealGroupId('u1', 'sug:m1', '2026-09-08'),
      followMealGroupId('u2', 'sug:m1', '2026-09-08'),
      followMealGroupId('u1', 'sug:m2', '2026-09-08'),
      followMealGroupId('u1', 'sug:m1', '2026-09-09'),
    ]);
    assert.equal(ids.size, 4);
  });
});

describe('normaliseFollowedSlot', () => {
  for (const s of ['breakfast', 'lunch', 'dinner', 'snack']) {
    test(`keeps canonical slot "${s}"`, () => assert.equal(normaliseFollowedSlot(s), s));
  }
  test('drops a non-canonical slot (e.g. "smoothie") to null — never violates the meal_slot CHECK', () => {
    assert.equal(normaliseFollowedSlot('smoothie'), null);
    assert.equal(normaliseFollowedSlot(null), null);
    assert.equal(normaliseFollowedSlot(undefined), null);
  });
});

describe('buildFollowedMealLogInput — frozen catalogue snapshot', () => {
  const input = buildFollowedMealLogInput({
    mealName: 'Greek Yoghurt, Oat & Banana Bowl',
    slot: 'breakfast',
    macros: { calories: 422, proteinG: 24, carbsG: 55, fatG: 12, fibreG: 6 },
    logGroupId: 'g1',
  });

  test('is a non-canonical, truthfully-attributed catalogue entry — never "user provided"', () => {
    assert.equal(input.foodId, null);
    assert.equal(input.userProvidedNutrition, false);
    assert.equal(input.captureMethod, FOLLOWED_MEAL_CAPTURE_METHOD);
    assert.equal(input.sourceType, FOLLOWED_MEAL_SOURCE_TYPE);
  });
  test('carries the meal’s exact macros verbatim (no scaling, no invention)', () => {
    assert.deepEqual(input.nutrients, {
      energyKcal: 422, proteinG: 24, carbohydrateG: 55, fatG: 12, fibreG: 6,
    });
  });
  test('preserves an unknown fibre value as null, never 0', () => {
    const noFibre = buildFollowedMealLogInput({
      mealName: 'X', slot: 'lunch',
      macros: { calories: 300, proteinG: 10, carbsG: 40, fatG: 8, fibreG: null },
      logGroupId: 'g2',
    });
    assert.equal(noFibre.nutrients!.fibreG, null);
  });
});

describe('LOCAL date safety (Africa/Nairobi, UTC+3)', () => {
  test('a meal followed just after local midnight on the 8th is dated the 8th, not the 7th', () => {
    // 2026-09-07T22:30:00Z === 2026-09-08 01:30 in Nairobi.
    const justAfterLocalMidnight = new Date('2026-09-07T22:30:00.000Z');
    assert.equal(localISODate(justAfterLocalMidnight), '2026-09-08');
    // The pre-fix bug used toISOString().slice(0,10) — would have said the 7th:
    assert.equal(justAfterLocalMidnight.toISOString().slice(0, 10), '2026-09-07');
  });
  test('a meal followed late evening on the 8th stays the 8th', () => {
    // 2026-09-08T20:00:00Z === 2026-09-08 23:00 in Nairobi.
    assert.equal(localISODate(new Date('2026-09-08T20:00:00.000Z')), '2026-09-08');
  });
  test('the deterministic key is stable across the same local day regardless of wall-clock time', () => {
    const morning = localISODate(new Date('2026-09-08T04:00:00.000Z')); // 07:00 Nairobi
    const night = localISODate(new Date('2026-09-08T20:00:00.000Z'));   // 23:00 Nairobi
    assert.equal(morning, night);
    assert.equal(
      followMealGroupId('u1', 'sug:m1', morning),
      followMealGroupId('u1', 'sug:m1', night),
    );
  });
});
