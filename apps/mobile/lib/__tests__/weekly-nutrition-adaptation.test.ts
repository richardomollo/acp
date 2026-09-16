// Lana Nutrition — Monthly → Weekly → Daily Planning V1. Pure-logic tests
// for lib/nutrition/weekly-nutrition-adaptation.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWeeklyAdaptation, buildWeeklyAdaptationInput, ADAPTATION_GATES } from '../nutrition/weekly-nutrition-adaptation.ts';

describe('buildWeeklyAdaptationInput — Closing the Loop §3/§4/§6/§7/§8', () => {
  test('§27 — no-log days ≠ zero intake: 3 days with logs + 4 days with none only ever count the 3 observed days', () => {
    const days = [
      { hasLogs: true, proteinG: 100 }, { hasLogs: true, proteinG: 100 }, { hasLogs: true, proteinG: 100 },
      { hasLogs: false, proteinG: 0 }, { hasLogs: false, proteinG: 0 }, { hasLogs: false, proteinG: 0 }, { hasLogs: false, proteinG: 0 },
    ];
    const input = buildWeeklyAdaptationInput(days, [], { min: 80, max: 120 });
    assert.equal(input.proteinAdherence?.daysWithTarget, 3); // never 7 — the 4 no-log days are NOT zero-intake observations
  });

  test('§26 — one single observed day is insufficient for a durable adaptation call downstream (via evaluateWeeklyAdaptation)', () => {
    const days = [{ hasLogs: true, proteinG: 40 }]; // well below any target, but only ONE day of evidence
    const input = buildWeeklyAdaptationInput(days, [], { min: 80, max: 120 });
    const calls = evaluateWeeklyAdaptation(input);
    assert.equal(calls.length, 0); // below minDaysForAnySignal — no call at all, never a premature ADJUST
  });

  test('§5 — no protein target this week -> proteinAdherence is null, never a fabricated signal even with real logged days', () => {
    const days = [{ hasLogs: true, proteinG: 100 }, { hasLogs: true, proteinG: 100 }];
    const input = buildWeeklyAdaptationInput(days, [], null);
    assert.equal(input.proteinAdherence, null);
  });

  test('§7/§28 — a planned meal EXPLICITLY logged (status=consumed) counts as adherence regardless of planned-vs-actual grams (grams live in food_log_entries, not here)', () => {
    const plannedMeals = [
      { mealSlot: 'lunch' as const, status: 'consumed' as const }, // e.g. planned 250g Githeri, actually logged 180g — still "consumed"
      { mealSlot: 'lunch' as const, status: 'consumed' as const },
      { mealSlot: 'lunch' as const, status: 'planned' as const },
    ];
    const input = buildWeeklyAdaptationInput([], plannedMeals, null);
    const lunch = input.slotAdherence.find(s => s.slot === 'lunch')!;
    assert.equal(lunch.plannedDays, 3);
    assert.equal(lunch.consumedDays, 2);
  });

  test('§8/§29 — a planned meal the user replaced with a DIFFERENT food (status=replaced) is never counted as consumed', () => {
    const plannedMeals = [
      { mealSlot: 'dinner' as const, status: 'replaced' as const }, // planned Githeri, actually logged rice + chicken
      { mealSlot: 'dinner' as const, status: 'consumed' as const },
    ];
    const input = buildWeeklyAdaptationInput([], plannedMeals, null);
    const dinner = input.slotAdherence.find(s => s.slot === 'dinner')!;
    assert.equal(dinner.plannedDays, 2);
    assert.equal(dinner.consumedDays, 1); // only the genuinely-consumed one — 'replaced' never inflates adherence
  });

  test('a merely "recommended" (never even swapped/confirmed) row is not counted as consumed', () => {
    const plannedMeals = [{ mealSlot: 'breakfast' as const, status: 'recommended' as const }];
    const input = buildWeeklyAdaptationInput([], plannedMeals, null);
    const breakfast = input.slotAdherence.find(s => s.slot === 'breakfast')!;
    assert.equal(breakfast.consumedDays, 0);
  });

  test('a skipped planned meal is not counted as consumed either', () => {
    const plannedMeals = [{ mealSlot: 'snack' as const, status: 'skipped' as const }];
    const input = buildWeeklyAdaptationInput([], plannedMeals, null);
    assert.equal(input.slotAdherence.find(s => s.slot === 'snack')!.consumedDays, 0);
  });

  test('deterministic — same evidence always produces the same input shape', () => {
    const days = [{ hasLogs: true, proteinG: 90 }];
    const plannedMeals = [{ mealSlot: 'lunch' as const, status: 'consumed' as const }];
    const a = buildWeeklyAdaptationInput(days, plannedMeals, { min: 80, max: 120 });
    const b = buildWeeklyAdaptationInput(days, plannedMeals, { min: 80, max: 120 });
    assert.deepEqual(a, b);
  });

  test('every canonical slot is always represented, even with zero planned meals', () => {
    const input = buildWeeklyAdaptationInput([], [], null);
    assert.deepEqual(input.slotAdherence.map(s => s.slot).sort(), ['breakfast', 'dinner', 'lunch', 'snack']);
  });
});

describe('evaluateWeeklyAdaptation — §35-39 evidence thresholds', () => {
  test('A. a single day (1 planned) is below the minimum — no call is emitted at all, not even WATCH', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'breakfast', plannedDays: 1, consumedDays: 1 }],
      proteinAdherence: null,
    });
    assert.equal(calls.length, 0);
  });

  test('B. below the "any signal" floor is skipped, above it but below the confident floor is WATCH/emerging (§36)', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'dinner', plannedDays: ADAPTATION_GATES.minDaysForAnySignal, consumedDays: 1 }],
      proteinAdherence: null,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, 'watch');
    assert.equal(calls[0].confidence, 'emerging');
    assert.match(calls[0].message, /insufficient to establish a durable pattern/);
  });

  test('C. high adherence with enough days -> KEEP', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'lunch', plannedDays: 5, consumedDays: 4 }], // 0.8 >= keepRate
      proteinAdherence: null,
    });
    assert.equal(calls[0].type, 'keep');
    assert.equal(calls[0].confidence, 'strong'); // 5 days >= strongDays
  });

  test('D. low adherence with enough days -> ADJUST', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'breakfast', plannedDays: 4, consumedDays: 1 }], // 0.25 <= adjustRate
      proteinAdherence: null,
    });
    assert.equal(calls[0].type, 'adjust');
    assert.equal(calls[0].confidence, 'moderate'); // 4 days: moderate, not strong
    assert.match(calls[0].message, /repeatedly fallen below/);
  });

  test('E. mixed adherence in between the two thresholds -> WATCH, not KEEP or ADJUST', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'snack', plannedDays: 5, consumedDays: 3 }], // 0.6 — between adjustRate(0.4) and keepRate(0.75)
      proteinAdherence: null,
    });
    assert.equal(calls[0].type, 'watch');
  });

  test('F. protein evidence uses the same gates, subject "protein"', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [],
      proteinAdherence: { daysWithTarget: 5, daysAtOrAboveMin: 1 }, // 0.2 -> adjust
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].subject, 'protein');
    assert.equal(calls[0].type, 'adjust');
  });

  test('G. no protein target this week (null) -> no protein call at all, never fabricated', () => {
    const calls = evaluateWeeklyAdaptation({ slotAdherence: [], proteinAdherence: null });
    assert.equal(calls.length, 0);
  });

  test('H. multiple slots each produce their own independent call', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [
        { slot: 'breakfast', plannedDays: 5, consumedDays: 5 },
        { slot: 'dinner', plannedDays: 5, consumedDays: 0 },
      ],
      proteinAdherence: null,
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(c => c.subject).sort(), ['breakfast', 'dinner']);
    assert.deepEqual(calls.map(c => c.type).sort(), ['adjust', 'keep']);
  });

  test('I. deterministic — same input always produces the same output (no LLM, no randomness)', () => {
    const input = {
      slotAdherence: [{ slot: 'lunch' as const, plannedDays: 5, consumedDays: 3 }],
      proteinAdherence: { daysWithTarget: 6, daysAtOrAboveMin: 5 },
    };
    const a = evaluateWeeklyAdaptation(input);
    const b = evaluateWeeklyAdaptation(input);
    assert.deepEqual(a, b);
  });

  test('J. is a pure synchronous function — no Promise, no network', () => {
    const result = evaluateWeeklyAdaptation({ slotAdherence: [], proteinAdherence: null });
    assert.equal(result instanceof Promise, false);
  });

  test('K. zero planned days for a slot never produces a spurious call', () => {
    const calls = evaluateWeeklyAdaptation({
      slotAdherence: [{ slot: 'snack', plannedDays: 0, consumedDays: 0 }],
      proteinAdherence: null,
    });
    assert.equal(calls.length, 0);
  });
});
