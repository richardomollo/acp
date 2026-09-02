// Beta Feedback #013 — canonical strength-activity fidelity (Bug B).
// Pure coverage for the deterministic structure classifier + requirement
// selection + standalone-session identity. The end-to-end resolve/heal path
// is exercised by the existing activity-recommendation suites + local QA.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStrengthStructure, strengthRequirementBase, fitStrengthSessionForStructure,
  UPPER_BODY_REQUIREMENTS, LOWER_BODY_REQUIREMENTS, FULL_BODY_A_REQUIREMENTS, SUPPORT_REQUIREMENTS,
  estimateSessionMinutes, prescriptionForRequirements,
  type StrengthStructure,
} from '../programme-generator.ts';
import { suggestedStrengthWorkoutType } from '../activity-recommendation.ts';

describe('classifyStrengthStructure (§15/§39)', () => {
  const cases: [string, string, StrengthStructure][] = [
    ['Full-body strength', 'Compound lifts for the whole body', 'full_body'],
    ['Upper/lower support', 'upper/lower split light day', 'support'],   // the reported activity → deliberately lighter
    ['Strength — light day', 'Technique and accessory work', 'support'],
    ['Upper body strength', 'Push and pull focus', 'upper'],
    ['Lower body strength', 'Squat and hinge focus', 'lower'],
    ['Leg day', 'Heavy squats', 'lower'],
    ['Upper/lower split', 'Alternating upper and lower each session', 'full_body'], // both present, no "support" → generic
    ['Gym session', '', 'full_body'],                                   // unknown → safe default
    ['', '', 'full_body'],
  ];
  for (const [title, desc, expected] of cases) {
    test(`"${title}" / "${desc}" → ${expected}`, () => {
      assert.equal(classifyStrengthStructure(title, desc), expected);
    });
  }
});

describe('strengthRequirementBase', () => {
  test('maps each structure to a distinct base (Beta #014 — support is no longer full-body)', () => {
    assert.equal(strengthRequirementBase('upper'), UPPER_BODY_REQUIREMENTS);
    assert.equal(strengthRequirementBase('lower'), LOWER_BODY_REQUIREMENTS);
    assert.equal(strengthRequirementBase('full_body'), FULL_BODY_A_REQUIREMENTS); // default seed → A
    assert.equal(strengthRequirementBase('support'), SUPPORT_REQUIREMENTS);
    // support must NOT be a prefix of the full-body compound day
    const fbKeys = FULL_BODY_A_REQUIREMENTS.map(r => `${r.pattern}:${r.role}`);
    const supKeys = SUPPORT_REQUIREMENTS.map(r => `${r.pattern}:${r.role}`);
    assert.ok(!supKeys.every((k, i) => k === fbKeys[i]));
  });

  test('§39 upper and lower do NOT resolve to the same requirement set', () => {
    assert.notDeepEqual(
      UPPER_BODY_REQUIREMENTS.map(r => r.pattern).sort(),
      LOWER_BODY_REQUIREMENTS.map(r => r.pattern).sort(),
    );
  });

  test('every requirement uses only existing StrengthMovementPattern values', () => {
    const allowed = new Set(['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'core']);
    for (const set of [UPPER_BODY_REQUIREMENTS, LOWER_BODY_REQUIREMENTS]) {
      for (const r of set) assert.ok(allowed.has(r.pattern), `unexpected pattern ${r.pattern}`);
    }
  });
});

describe('fitStrengthSessionForStructure', () => {
  test('a support day carries NO experience-tier accessory volume, even for an advanced user', () => {
    const advSupport = fitStrengthSessionForStructure('support', 'advanced', 60);
    const advFull = fitStrengthSessionForStructure('full_body', 'advanced', 60);
    assert.equal(advSupport.requirements.length, SUPPORT_REQUIREMENTS.length); // base only, no +2 accessories
    assert.ok(advFull.requirements.length > advSupport.requirements.length);
    assert.equal(advSupport.structure, 'support');
  });

  test('a primary advanced session still gets the experience-aware volume, fitted under the ceiling', () => {
    const adv = fitStrengthSessionForStructure('full_body', 'advanced', 90);
    assert.ok(adv.requirements.length >= FULL_BODY_A_REQUIREMENTS.length);
    assert.ok(adv.durationMinutes <= 90);
    // the stored duration is the estimate of the actual prescription
    assert.equal(adv.durationMinutes, Math.min(estimateSessionMinutes(prescriptionForRequirements(adv.requirements)), 90));
  });

  test('the prescribed ceiling is always respected (never labels more time than the plan)', () => {
    for (const s of ['full_body', 'upper', 'lower', 'support'] as StrengthStructure[]) {
      assert.ok(fitStrengthSessionForStructure(s, 'advanced', 30).durationMinutes <= 30);
    }
  });
});

describe('suggestedStrengthWorkoutType (§40 — cache identity carries structure)', () => {
  test('full_body keeps the legacy string; upper/lower/support each get their own (Beta #014)', () => {
    assert.equal(suggestedStrengthWorkoutType('full_body'), 'acp_suggested_strength');
    assert.equal(suggestedStrengthWorkoutType('support'), 'acp_suggested_strength_support');
    assert.equal(suggestedStrengthWorkoutType('upper'), 'acp_suggested_strength_upper');
    assert.equal(suggestedStrengthWorkoutType('lower'), 'acp_suggested_strength_lower');
    // all four distinct → a full-body day and a support day reviewed in one
    // sitting can never claim the same (user, workout_type, date) slot
    assert.equal(new Set(['full_body', 'upper', 'lower', 'support'].map(s => suggestedStrengthWorkoutType(s as any))).size, 4);
  });

  test('an upper day and a lower day in the same week never share an identity', () => {
    assert.notEqual(suggestedStrengthWorkoutType('upper'), suggestedStrengthWorkoutType('lower'));
  });
});
