// Lana Nutrition — Daily Macro Targets V1. Pure-logic tests for
// lib/nutrition/daily-macro-targets.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDailyMacroTargets, macroProgressFraction, formatMacroWithTarget,
} from '../nutrition/daily-macro-targets.ts';
import type { UserReferenceContext, ContextField } from '../nutrition/nutrition-reference-engine.ts';

const avail = <T,>(value: T): ContextField<T> => ({ status: 'available', value });
const missing = <T,>(reason = 'missing'): ContextField<T> => ({ status: 'insufficient_context', reason });

function ctx(opts: Partial<UserReferenceContext> = {}): UserReferenceContext {
  return {
    age: avail(30),
    sex: avail('male'),
    weight: avail({ kg: 80, source: 'client_measurement', recordedAt: '2026-08-30' }),
    ...opts,
  };
}

describe('resolveDailyMacroTargets — §5/§10 target confidence gate', () => {
  test('A. protein target resolves to the 1.4-2.0 g/kg range against the user\'s real weight (80kg → 112-160g)', () => {
    const t = resolveDailyMacroTargets(ctx());
    assert.deepEqual(t.proteinTargetG, { min: 112, max: 160 });
  });
  test('B. same inputs -> same target (deterministic, pure)', () => {
    const a = resolveDailyMacroTargets(ctx());
    const b = resolveDailyMacroTargets(ctx());
    assert.deepEqual(a, b);
  });
  test('C. missing weight -> protein target unavailable, never invented', () => {
    const t = resolveDailyMacroTargets(ctx({ weight: missing() }));
    assert.equal(t.proteinTargetG, null);
  });
  test('C2. under-18 -> protein target unavailable (adult-only reference)', () => {
    const t = resolveDailyMacroTargets(ctx({ age: avail(16) }));
    assert.equal(t.proteinTargetG, null);
  });
  test('C3. missing age -> protein target unavailable', () => {
    const t = resolveDailyMacroTargets(ctx({ age: missing() }));
    assert.equal(t.proteinTargetG, null);
  });
  test('D. no LLM/network call — a pure function of its argument only (structural: no async, returns synchronously)', () => {
    const result = resolveDailyMacroTargets(ctx());
    assert.equal(result instanceof Promise, false);
  });
  test('E. no nationality/country field anywhere in the input or output shape', () => {
    const t = resolveDailyMacroTargets(ctx());
    assert.ok(!('country' in t) && !('nationality' in t));
  });
  test('energy/carbs/fat targets are categorically unavailable — no reference exists for them in Lana\'s architecture today', () => {
    const t = resolveDailyMacroTargets(ctx());
    assert.equal(t.energyTargetKcal, null);
    assert.equal(t.carbsTargetG, null);
    assert.equal(t.fatTargetG, null);
    // ...even for a fully-complete profile (age/sex/weight all available) —
    // proves this isn't a per-user gate, it's an architectural absence.
  });
});

describe('macroProgressFraction — §16/§17 progress semantics', () => {
  test('below target -> fraction < 1', () => {
    assert.equal(macroProgressFraction(80, { min: 112, max: 160 }), 0.5);
  });
  test('exactly at target max -> 1', () => {
    assert.equal(macroProgressFraction(160, { min: 112, max: 160 }), 1);
  });
  test('over target -> capped at 1, never > 1 (no "over limit" alarm value)', () => {
    assert.equal(macroProgressFraction(240, { min: 112, max: 160 }), 1);
  });
  test('no target -> null, never 0 (0 would misleadingly read as "0% of nothing")', () => {
    assert.equal(macroProgressFraction(80, null), null);
  });
});

describe('formatMacroWithTarget — §13/§14 display', () => {
  test('with a target: "consumed / min–max{unit}"', () => {
    assert.equal(formatMacroWithTarget(92.4, { min: 112, max: 160 }, 'g'), '92 / 112–160g');
  });
  test('without a target: honest consumed-only form, never "/0" or "/--"', () => {
    assert.equal(formatMacroWithTarget(168, null, 'g'), '168g');
  });
  test('over-target value is still shown plainly, not clamped or hidden', () => {
    assert.equal(formatMacroWithTarget(200, { min: 112, max: 160 }, 'g'), '200 / 112–160g');
  });
});
