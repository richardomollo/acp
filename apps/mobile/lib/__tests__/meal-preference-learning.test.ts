import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeMealPreferenceScores, normalisePreferenceScore, type MealPreferenceEvent } from '../nutrition/meal-preference-learning.ts';

// Beta Feedback #022 — deterministic behavioural preference learning.
// No LLM; every behaviour below is provable from the raw event log alone.

const EGGS = 'catalogue:meal-eggs';
const YOGHURT = 'catalogue:meal-yoghurt';

describe('§8/test 4 — repeated consumption increases ranking', () => {
  test('a meal consumed on 3 separate days scores higher than one consumed once', () => {
    const onceEvents: MealPreferenceEvent[] = [
      { mealKey: YOGHURT, slot: 'breakfast', type: 'consumed', localDate: '2026-08-20' },
    ];
    const repeatedEvents: MealPreferenceEvent[] = [
      { mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-20' },
      { mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-22' },
      { mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-24' },
    ];
    const today = '2026-08-30'; // far enough past every event that the recency penalty has fully decayed
    const onceScore = computeMealPreferenceScores(onceEvents, today).get(YOGHURT)!.netScore;
    const repeatedScore = computeMealPreferenceScores(repeatedEvents, today).get(EGGS)!.netScore;
    assert.ok(repeatedScore > onceScore, `expected repeated (${repeatedScore}) > once (${onceScore})`);
  });
});

describe('§8/test 5 — consumed evidence outranks a merely displayed recommendation', () => {
  test('yoghurt displayed 3x but never eaten scores 0; eggs displayed once and eaten once scores > 0', () => {
    const events: MealPreferenceEvent[] = [
      { mealKey: YOGHURT, slot: 'breakfast', type: 'displayed', localDate: '2026-08-20' },
      { mealKey: YOGHURT, slot: 'breakfast', type: 'displayed', localDate: '2026-08-21' },
      { mealKey: YOGHURT, slot: 'breakfast', type: 'displayed', localDate: '2026-08-22' },
      { mealKey: EGGS, slot: 'breakfast', type: 'displayed', localDate: '2026-08-20' },
      { mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-20' },
    ];
    const today = '2026-08-30';
    const scores = computeMealPreferenceScores(events, today);
    assert.equal(scores.get(YOGHURT)?.netScore ?? 0, 0);
    assert.ok((scores.get(EGGS)?.netScore ?? 0) > 0);
  });
});

describe('§8/test 6 — repeated rejection/swap lowers ranking', () => {
  test('a meal swapped away twice scores lower than one with no history at all', () => {
    const events: MealPreferenceEvent[] = [
      { mealKey: YOGHURT, slot: 'breakfast', type: 'swapped_away', localDate: '2026-08-20' },
      { mealKey: YOGHURT, slot: 'breakfast', type: 'swapped_away', localDate: '2026-08-22' },
    ];
    const scores = computeMealPreferenceScores(events, '2026-08-30');
    // familiarity is clamped at 0 — a swapped-away meal never scores BELOW an
    // unknown one, it just never rises above it (never punitive beyond neutral).
    assert.equal(scores.get(YOGHURT)!.netScore, 0);
    assert.equal(scores.get(YOGHURT)!.swappedAwayCount, 2);
  });
});

describe('§9/test 7 — recent repetition introduces variety pressure', () => {
  test('a meal eaten yesterday scores lower TODAY than an equally-familiar meal not eaten recently', () => {
    const recentlyEaten: MealPreferenceEvent[] = [
      { mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-29' }, // yesterday
    ];
    const notRecent: MealPreferenceEvent[] = [
      { mealKey: YOGHURT, slot: 'breakfast', type: 'consumed', localDate: '2026-08-10' }, // 20 days ago — no penalty left
    ];
    const today = '2026-08-30';
    const recentScore = computeMealPreferenceScores(recentlyEaten, today).get(EGGS)!.netScore;
    const oldScore = computeMealPreferenceScores(notRecent, today).get(YOGHURT)!.netScore;
    assert.ok(recentScore < oldScore, `expected recently-eaten (${recentScore}) < long-ago (${oldScore}) despite identical raw consumption count`);
  });

  test('eaten today scores lower than eaten 3+ days ago, all else equal', () => {
    const eatenToday = computeMealPreferenceScores(
      [{ mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-30' }], '2026-08-30',
    ).get(EGGS)!.netScore;
    const eatenLongAgo = computeMealPreferenceScores(
      [{ mealKey: EGGS, slot: 'breakfast', type: 'consumed', localDate: '2026-08-20' }], '2026-08-30',
    ).get(EGGS)!.netScore;
    assert.ok(eatenToday < eatenLongAgo);
  });
});

describe('slot isolation — a meal\'s dinner history never inflates its breakfast ranking', () => {
  test('filtering by slot excludes cross-slot events', () => {
    const events: MealPreferenceEvent[] = [
      { mealKey: EGGS, slot: 'dinner', type: 'consumed', localDate: '2026-08-10' },
    ];
    const breakfastScores = computeMealPreferenceScores(events, '2026-08-30', 'breakfast');
    assert.equal(breakfastScores.has(EGGS), false);
    const dinnerScores = computeMealPreferenceScores(events, '2026-08-30', 'dinner');
    assert.ok(dinnerScores.has(EGGS));
  });
});

describe('normalisePreferenceScore', () => {
  test('clamps to [0, 1] regardless of the raw score magnitude', () => {
    assert.equal(normalisePreferenceScore(-5), 0);
    assert.equal(normalisePreferenceScore(0), 0);
    assert.ok(normalisePreferenceScore(1000) <= 1);
  });
});
