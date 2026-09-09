// LH-40 — the canonical goal-aware strength prescription layer.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  prescribeSet, prescriptionGoalBucket, describeStrengthPrescription,
  type PrescriptionRole,
} from '../workout-prescription.ts';

const px = (role: PrescriptionRole, goal: string | null, experience: 'beginner' | 'intermediate' | 'advanced') =>
  prescribeSet({ role, goal, experience });

describe('prescriptionGoalBucket — maps the real taxonomy, invents nothing', () => {
  test('build_muscle → strength', () => assert.equal(prescriptionGoalBucket('build_muscle'), 'strength'));
  test('lose_weight / body_recomposition / eat_healthier → fat_loss', () => {
    for (const g of ['lose_weight', 'body_recomposition', 'eat_healthier']) assert.equal(prescriptionGoalBucket(g), 'fat_loss');
  });
  test('improve_running → endurance', () => assert.equal(prescriptionGoalBucket('improve_running'), 'endurance'));
  test('general_fitness / maintain_weight / improve_mobility / unknown / null → general', () => {
    for (const g of ['general_fitness', 'maintain_weight', 'improve_mobility', 'healthy_lifestyle', 'improve_health', 'reduce_stress', 'nonsense', null, undefined]) {
      assert.equal(prescriptionGoalBucket(g as any), 'general');
    }
  });
});

describe('A/B/C — Build strength: role-aware, never a uniform 3×12/60', () => {
  test('A. primary/compound movement — lower reps, longer rest, scales with experience', () => {
    const b = px('compound', 'build_muscle', 'beginner');
    const i = px('compound', 'build_muscle', 'intermediate');
    const a = px('compound', 'build_muscle', 'advanced');
    assert.deepEqual([b.sets, b.reps, b.restSeconds], [3, 8, 90]);
    assert.deepEqual([i.sets, i.reps, i.restSeconds], [4, 6, 150]);
    assert.deepEqual([a.sets, a.reps, a.restSeconds], [4, 5, 180]);
    // strictly lower reps / longer rest than an accessory in the same session
    const acc = px('accessory', 'build_muscle', 'beginner');
    assert.ok(b.reps < acc.reps && b.restSeconds > acc.restSeconds);
  });

  test('B. accessory movement — moderate reps, moderate rest; NOT the compound scheme', () => {
    const acc = px('accessory', 'build_muscle', 'advanced');
    assert.deepEqual([acc.sets, acc.reps, acc.restSeconds], [3, 10, 75]);
    assert.notDeepEqual(acc, px('compound', 'build_muscle', 'advanced'));
  });

  test('C. mobility/support movement never inherits strength sets/reps/rest', () => {
    for (const goal of ['build_muscle', 'lose_weight', 'general_fitness', 'improve_running']) {
      const m = px('mobility', goal, 'advanced');
      assert.equal(m.reps, 0);               // timed hold, not a rep target
      assert.equal(m.sets, 2);
      assert.equal(m.restSeconds, 15);
      assert.equal(m.repRangeLabel, '');
    }
  });

  test('the device repro no longer holds — a Build strength session is not all 3×12/60', () => {
    const roles: PrescriptionRole[] = ['compound', 'compound', 'compound', 'accessory', 'core'];
    const schemes = new Set(roles.map(r => {
      const p = px(r, 'build_muscle', 'beginner');
      return `${p.sets}x${p.reps}/${p.restSeconds}`;
    }));
    assert.ok(schemes.size >= 2, 'at least compound vs accessory/core differ');
    assert.ok(![...schemes].every(s => s === '3x12/60'), 'not the generic template');
  });
});

describe('D/E — other goals differ, and none regress to a single template', () => {
  test('D. general fitness compound is the balanced default (identical to the pre-LH-40 experience scale)', () => {
    assert.deepEqual(px('compound', 'general_fitness', 'beginner'),     px('compound', null, 'beginner'));
    assert.deepEqual([px('compound', 'general_fitness', 'beginner').sets, px('compound', 'general_fitness', 'beginner').reps, px('compound', 'general_fitness', 'beginner').restSeconds], [3, 10, 75]);
    assert.deepEqual([px('accessory', 'general_fitness', 'advanced').sets, px('accessory', 'general_fitness', 'advanced').reps, px('accessory', 'general_fitness', 'advanced').restSeconds], [3, 12, 60]); // == legacy REPS_BY_ROLE.accessory
  });

  test('weight-loss support — higher reps, shorter rest than the strength bucket', () => {
    const s = px('compound', 'build_muscle', 'intermediate');
    const w = px('compound', 'lose_weight', 'intermediate');
    assert.ok(w.reps > s.reps);
    assert.ok(w.restSeconds < s.restSeconds);
    assert.deepEqual([w.sets, w.reps, w.restSeconds], [3, 10, 75]);
  });

  test('E. running-support strength — conservative, not maximal; supportive rep range', () => {
    const r = px('compound', 'improve_running', 'advanced');
    assert.deepEqual([r.sets, r.reps, r.restSeconds], [3, 8, 90]);
    // never as heavy/low-rep as the dedicated strength bucket's advanced compound
    assert.ok(r.reps > px('compound', 'build_muscle', 'advanced').reps);
  });
});

describe('F/G/H — experience is used for compounds only (no arbitrary accessory scaling)', () => {
  test('F/G/H. compound sets/reps/rest change across beginner→intermediate→advanced for every bucket', () => {
    for (const goal of ['build_muscle', 'lose_weight', 'general_fitness']) {
      const b = px('compound', goal, 'beginner');
      const a = px('compound', goal, 'advanced');
      assert.notDeepEqual(b, a, goal);
    }
  });
  test('accessory & core are flat across experience — deliberately, no load/%1RM model (§12)', () => {
    for (const role of ['accessory', 'core'] as PrescriptionRole[]) {
      const b = px(role, 'build_muscle', 'beginner');
      const a = px(role, 'build_muscle', 'advanced');
      assert.deepEqual(b, a);
    }
  });
});

describe('I/J — the session description is DERIVED and never a universal claim', () => {
  test('I. describeStrengthPrescription reflects the actual per-role schemes from prescribeSet', () => {
    const desc = describeStrengthPrescription(['compound', 'accessory', 'core'], 'build_muscle', 'beginner');
    assert.match(desc, /Compound lifts: 3×6–8/);
    assert.match(desc, /Accessories: 3×8–12/);
    assert.match(desc, /Core: 3×10–15/);
    assert.match(desc, /Rest 45–90s/); // min/max rest across the present roles
    assert.match(desc, /Each exercise below lists its own sets, reps and rest\./);
  });
  test('J. no hardcoded "3 sets of 6–10" — the summary states multiple schemes, not one', () => {
    const desc = describeStrengthPrescription(['compound', 'compound', 'accessory', 'accessory', 'core'], 'build_muscle', 'intermediate');
    assert.doesNotMatch(desc, /3 sets of 6[–-]10 reps/i);
    // it names distinct compound vs accessory ranges
    assert.match(desc, /Compound lifts: 4×5–7/);
    assert.match(desc, /Accessories: 3×8–12/);
  });
  test('a mobility-only role list summarises as holds, never a strength rep scheme', () => {
    const desc = describeStrengthPrescription(['mobility', 'mobility'], 'build_muscle', 'advanced');
    assert.match(desc, /Mobility: 2 sets, slow controlled holds/);
    assert.doesNotMatch(desc, /\d+×\d/); // no "3×8" style scheme
  });
  test('an empty role list falls back to the goal-intent sentence, no invented numbers', () => {
    const desc = describeStrengthPrescription([], 'lose_weight', 'beginner');
    assert.doesNotMatch(desc, /\d+×\d/);
    assert.match(desc, /metabolic strength session/i);
  });
});

describe('L — prescription is provider-independent and deterministic', () => {
  test('same (role, goal, experience) always yields the same prescription — no RNG, no provider input', () => {
    for (let i = 0; i < 50; i++) {
      assert.deepEqual(px('compound', 'build_muscle', 'advanced'), px('compound', 'build_muscle', 'advanced'));
    }
  });
  test('no load / %1RM / RPE / RIR fields are produced (§12)', () => {
    const p = px('compound', 'build_muscle', 'advanced') as Record<string, unknown>;
    for (const k of ['load', 'loadKg', 'weight', 'percent1RM', 'rpe', 'rir', 'oneRepMax']) {
      assert.equal(k in p, false, k);
    }
  });
});
