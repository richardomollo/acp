// LH-01 / LH-03 / LH-18 — the shared onboarding input-validation boundary.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEIGHT_MIN_KG, WEIGHT_MAX_KG, HOURS_PER_WEEK, MAX_SLEEP_HOURS_PER_NIGHT,
  validateWeightKg, validateCurrentWeight, validateGoalWeight, isPlausibleWeightKg,
  validateWeeklyTimeBudget, validateOnboardingHealthInputs, OnboardingValidationError,
} from '../onboarding-validation.ts';

describe('validateWeightKg — boundaries (LH-01, §9 A–D)', () => {
  test('A. 999 kg is blocked', () => {
    const r = validateCurrentWeight(999);
    assert.equal(r.ok, false);
    assert.match(r.error!, /between 30 and 350 kg/);
  });
  test('B. 1 kg goal weight is blocked (below range)', () => {
    assert.equal(validateGoalWeight(1).ok, false);
  });
  test('C. negative weight is blocked', () => {
    assert.equal(validateWeightKg(-5).ok, false);
    assert.equal(validateWeightKg(0).ok, false);
  });
  test('D. an in-range decimal weight is valid and rounded to 0.1', () => {
    const r = validateWeightKg(72.54);
    assert.equal(r.ok, true);
    assert.equal(r.value, 72.5);
    assert.equal(r.error, null);
  });
  test('exact bounds are inclusive', () => {
    assert.equal(validateWeightKg(WEIGHT_MIN_KG).ok, true);
    assert.equal(validateWeightKg(WEIGHT_MAX_KG).ok, true);
    assert.equal(validateWeightKg(WEIGHT_MIN_KG - 0.1).ok, false);
    assert.equal(validateWeightKg(WEIGHT_MAX_KG + 0.1).ok, false);
  });
  test('I. malformed / missing numeric input is blocked, never throws', () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity]) {
      const r = validateWeightKg(bad as any);
      assert.equal(r.ok, false);
      assert.equal(r.value, null);
      assert.ok(r.error);
    }
  });
  test('H. a blank (null) field reads as a required prompt, not a range error', () => {
    assert.match(validateCurrentWeight(null).error!, /Enter your current weight/);
  });
  test('isPlausibleWeightKg narrows correctly', () => {
    assert.equal(isPlausibleWeightKg(80), true);
    assert.equal(isPlausibleWeightKg(999), false);
    assert.equal(isPlausibleWeightKg(null), false);
  });
});

describe('validateWeeklyTimeBudget (LH-03, §9 E–G)', () => {
  test('E. sleep 24h/night + work 168h/week is blocked, naming the overage', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 24, workHoursPerWeek: 168, sportHoursPerWeek: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.committedHours, 24 * 7 + 168); // 336
    assert.equal(r.remainingHours, HOURS_PER_WEEK - 336); // -168, NOT clamped
    assert.equal(r.overageHours, 168);
    assert.equal(
      r.error,
      'Your schedule exceeds 168 hours by 168 hours. Adjust sleep, work or other commitments before continuing.',
    );
  });
  test('F. a weekly total of exactly 168h is valid (fields themselves valid)', () => {
    // sleep 8*7=56, work 80, sport 32 -> 168 exactly
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 8, workHoursPerWeek: 80, sportHoursPerWeek: 32 });
    assert.equal(r.committedHours, 168);
    assert.equal(r.remainingHours, 0);
    assert.equal(r.overageHours, 0);
    assert.equal(r.error, null);
    assert.equal(r.ok, true);
  });
  test('G. a weekly total of 169h is blocked by 1 hour', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 8, workHoursPerWeek: 80, sportHoursPerWeek: 33 });
    assert.equal(r.overageHours, 1);
    assert.equal(r.ok, false);
    assert.match(r.error!, /exceeds 168 hours by 1 hour\./); // singular
  });
  test('per-field: sleep > 24h/night is blocked', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 25, workHoursPerWeek: 0, sportHoursPerWeek: 0 });
    assert.equal(r.fieldErrors.sleep, `There are only ${MAX_SLEEP_HOURS_PER_NIGHT} hours in a day.`);
    assert.equal(r.ok, false);
  });
  test('per-field: negative hours are blocked', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 7, workHoursPerWeek: -1, sportHoursPerWeek: 0 });
    assert.equal(r.fieldErrors.work, 'Hours can’t be negative.');
    assert.equal(r.ok, false);
  });
  test('per-field: a single weekly field over 168 is blocked even before the total', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 7, workHoursPerWeek: 200, sportHoursPerWeek: 0 });
    assert.equal(r.fieldErrors.work, 'There are only 168 hours in a week.');
    assert.equal(r.ok, false);
  });
  test('blank fields: no error, not yet computable, not ok', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: null, workHoursPerWeek: null, sportHoursPerWeek: null });
    assert.deepEqual(r.fieldErrors, { sleep: null, work: null, sport: null, other: null });
    assert.equal(r.committedHours, null);
    assert.equal(r.remainingHours, null);
    assert.equal(r.error, null);
    assert.equal(r.ok, true); // no *errors*; the screen still gates on all-present
  });
  test('J. a normal week is valid with a sensible remainder', () => {
    const r = validateWeeklyTimeBudget({ sleepHoursPerNight: 7.5, workHoursPerWeek: 40, sportHoursPerWeek: 3 });
    assert.equal(r.ok, true);
    assert.equal(r.committedHours, 7.5 * 7 + 43); // 95.5
    assert.equal(r.remainingHours, 72.5);
    assert.equal(r.overageHours, 0);
  });
  test('optional other commitments count toward the budget', () => {
    const r = validateWeeklyTimeBudget({
      sleepHoursPerNight: 8, workHoursPerWeek: 40, sportHoursPerWeek: 5, otherHoursPerWeek: 100,
    });
    assert.equal(r.committedHours, 56 + 40 + 5 + 100); // 201
    assert.equal(r.overageHours, 33);
    assert.equal(r.ok, false);
  });
});

describe('validateOnboardingHealthInputs — the persistence/generation guard (LH-18)', () => {
  test('a weight goal with a 999 kg current weight is rejected with a reason', () => {
    const v = validateOnboardingHealthInputs({ goal: 'lose_weight', startingWeightKg: 999, goalWeightKg: 70 });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => /Current weight/.test(e)));
  });
  test('an impossible weekly schedule is rejected', () => {
    const v = validateOnboardingHealthInputs({
      goal: 'lose_weight', startingWeightKg: 80, goalWeightKg: 72,
      weeklyTime: { sleepHoursPerNight: 24, workHoursPerWeek: 168, sportHoursPerWeek: 0 },
    });
    assert.equal(v.ok, false);
    assert.ok(v.errors.some(e => /exceeds 168 hours/.test(e)));
  });
  test('a valid weight goal + valid schedule passes (§9 J — unchanged)', () => {
    const v = validateOnboardingHealthInputs({
      goal: 'lose_weight', startingWeightKg: 80, goalWeightKg: 72,
      weeklyTime: { sleepHoursPerNight: 7, workHoursPerWeek: 40, sportHoursPerWeek: 3 },
    });
    assert.equal(v.ok, true);
    assert.deepEqual(v.errors, []);
  });
  test('a non-weight goal does not require weights', () => {
    const v = validateOnboardingHealthInputs({ goal: 'reduce_stress', startingWeightKg: null, goalWeightKg: null });
    assert.equal(v.ok, true);
  });
  test('weeklyTime omitted → whole-week rule not evaluated (weight-only edit)', () => {
    const v = validateOnboardingHealthInputs({ goal: 'lose_weight', startingWeightKg: 80, goalWeightKg: 72 });
    assert.equal(v.weeklyTime, null);
    assert.equal(v.ok, true);
  });
  test('OnboardingValidationError carries the reasons', () => {
    const err = new OnboardingValidationError(['Current weight — bad', 'schedule exceeds']);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'OnboardingValidationError');
    assert.deepEqual(err.errors, ['Current weight — bad', 'schedule exceeds']);
    assert.match(err.message, /failed validation/);
  });
});
