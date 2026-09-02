// ACP Intelligence™ — Beta Feedback #014. Strength programme diversity &
// exercise-selection fidelity. Two canonical strength activities with
// different roles must not resolve to an identical ordered movement
// prescription; the same canonical activity must stay deterministic;
// primary-movement continuity is allowed; no RNG, no provider-order reliance.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitStrengthSessionForStructure, strengthRequirementBase, strengthSeedParity,
  fullBodyBaseForSeed, analyseStrengthSessionOverlap,
  FULL_BODY_A_REQUIREMENTS, FULL_BODY_B_REQUIREMENTS, SUPPORT_REQUIREMENTS,
  UPPER_BODY_REQUIREMENTS, LOWER_BODY_REQUIREMENTS,
  type StrengthStructure,
} from '../programme-generator.ts';
import { suggestedStrengthWorkoutType } from '../activity-recommendation.ts';

const keyOf = (rs: { pattern: string; role: string; muscleHint?: string }[]) =>
  rs.map(r => `${r.pattern}:${r.role}:${r.muscleHint ?? ''}`);

const session = (structure: StrengthStructure, experience: 'beginner' | 'intermediate' | 'advanced', seed?: string) => ({
  structure,
  requirements: fitStrengthSessionForStructure(structure, experience, 60, seed).requirements,
});

// ── §24 — different structures ≠ identical ordered programme ───────────────
describe('two different-role strength sessions never produce the same ordered prescription', () => {
  for (const [a, b] of [
    ['full_body', 'upper'], ['full_body', 'lower'], ['upper', 'lower'],
    ['full_body', 'support'], ['upper', 'support'], ['lower', 'support'],
  ] as [StrengthStructure, StrengthStructure][]) {
    test(`${a} vs ${b} — not order-equal, not prefix-identical`, () => {
      const r = analyseStrengthSessionOverlap(
        session(a, 'advanced', '2026-09-01'), session(b, 'advanced', '2026-09-01'),
      );
      assert.equal(r.orderedSequenceEqual, false, `${a} and ${b} share an identical ordered prescription`);
      assert.equal(r.suspicious, false, `${a}/${b} flagged as a suspicious duplicate`);
    });
  }

  test('the pre-#014 bug case: full_body vs support is no longer a prefix match', () => {
    const fb = session('full_body', 'advanced', '2026-09-01');
    const sup = session('support', 'advanced', '2026-09-01');
    const supKeys = keyOf(sup.requirements);
    const fbKeys = keyOf(fb.requirements);
    assert.ok(!supKeys.every((k, i) => k === fbKeys[i]), 'support is still a prefix of full_body');
  });
});

// ── §15/§16 — two full-body days in one week differ, deterministically ─────
describe('two full-body days in the same week', () => {
  test('an even-parity and an odd-parity planned_date pick different bases (A vs B)', () => {
    // 2026-09-01 → digits 20260901 → sum 20 → even → A ; 2026-09-04 → 20260904 → 21 → odd → B
    assert.equal(strengthSeedParity('2026-09-01'), 0);
    assert.equal(strengthSeedParity('2026-09-04'), 1);
    assert.equal(fullBodyBaseForSeed('2026-09-01'), FULL_BODY_A_REQUIREMENTS);
    assert.equal(fullBodyBaseForSeed('2026-09-04'), FULL_BODY_B_REQUIREMENTS);

    const mon = session('full_body', 'advanced', '2026-09-01');
    const thu = session('full_body', 'advanced', '2026-09-04');
    assert.notDeepEqual(keyOf(mon.requirements), keyOf(thu.requirements));
    // …but they legitimately still SHARE a movement (core) — continuity is not a bug (§7/§13)
    const shared = keyOf(mon.requirements).filter(k => keyOf(thu.requirements).includes(k));
    assert.ok(shared.length >= 1, 'expected at least one shared movement for progression continuity');
    // not flagged suspicious — same structure, different prescription
    assert.equal(analyseStrengthSessionOverlap(mon, thu).suspicious, false);
  });

  test('A and B are each a complete full-body session (compound + core coverage)', () => {
    for (const base of [FULL_BODY_A_REQUIREMENTS, FULL_BODY_B_REQUIREMENTS]) {
      assert.ok(base.some(r => r.role === 'compound'), 'no compound movement');
      assert.ok(base.some(r => r.role === 'core'), 'no core movement');
    }
  });
});

// ── §16/§17 — deterministic, no RNG, seed only tie-breaks ─────────────────
describe('determinism', () => {
  test('the same canonical activity regenerates the identical prescription', () => {
    const a = fitStrengthSessionForStructure('full_body', 'advanced', 60, '2026-09-01');
    const b = fitStrengthSessionForStructure('full_body', 'advanced', 60, '2026-09-01');
    assert.deepEqual(a.requirements, b.requirements);
    assert.equal(a.durationMinutes, b.durationMinutes);
  });

  test('seed parity is a pure function of the seed string', () => {
    assert.equal(strengthSeedParity('2026-09-01'), strengthSeedParity('2026-09-01'));
    assert.equal(strengthSeedParity(null), 0);           // missing seed → stable default (A)
    assert.equal(strengthSeedParity(undefined), 0);
    assert.equal(strengthSeedParity('monday'), strengthSeedParity('monday')); // non-numeric seed still stable
  });

  test('a missing planned_date falls back to full-body A (never throws, never random)', () => {
    assert.equal(strengthRequirementBase('full_body', null), FULL_BODY_A_REQUIREMENTS);
    assert.equal(strengthRequirementBase('full_body'), FULL_BODY_A_REQUIREMENTS);
  });
});

// ── §8 — support reflects its ROLE, not "full body but shorter" ───────────
describe('support session', () => {
  test('SUPPORT_REQUIREMENTS shares no COMPOUND movement with FULL_BODY_A (core overlap is fine — §13)', () => {
    const fbCompound = new Set(
      FULL_BODY_A_REQUIREMENTS.filter(r => r.role === 'compound').map(r => r.pattern),
    );
    for (const r of SUPPORT_REQUIREMENTS) {
      assert.ok(!fbCompound.has(r.pattern) || r.role !== 'compound',
        `support reuses full-body compound ${r.pattern}`);
    }
    // and the ordered prescriptions are not prefix-identical
    const fbKeys = FULL_BODY_A_REQUIREMENTS.map(r => `${r.pattern}:${r.role}`);
    const supKeys = SUPPORT_REQUIREMENTS.map(r => `${r.pattern}:${r.role}`);
    assert.ok(!supKeys.every((k, i) => k === fbKeys[i]));
  });
  test('support leads with accessory/positional work, not a compound lift', () => {
    assert.notEqual(SUPPORT_REQUIREMENTS[0].role, 'compound');
  });
  test('an advanced support day carries no experience-tier accessory volume', () => {
    const s = fitStrengthSessionForStructure('support', 'advanced', 60);
    assert.equal(s.requirements.length, SUPPORT_REQUIREMENTS.length);
  });
});

// ── §5 — identity: distinct workout_type per structure ───────────────────
describe('standalone-session identity keeps the four structures apart', () => {
  test('every structure maps to a distinct workout_type string', () => {
    const types = (['full_body', 'upper', 'lower', 'support'] as StrengthStructure[])
      .map(suggestedStrengthWorkoutType);
    assert.equal(new Set(types).size, 4);
    assert.equal(suggestedStrengthWorkoutType('full_body'), 'acp_suggested_strength'); // legacy string preserved
  });
});

// ── §12 — advanced ≠ exotic/heavier; still uses existing patterns only ───
describe('advanced user', () => {
  test('advanced full-body uses only existing StrengthMovementPattern values', () => {
    const allowed = new Set(['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'core']);
    for (const seed of ['2026-09-01', '2026-09-04']) {
      for (const r of fitStrengthSessionForStructure('full_body', 'advanced', 90, seed).requirements) {
        assert.ok(allowed.has(r.pattern), `unexpected pattern ${r.pattern}`);
      }
    }
  });
});

// ── analyseStrengthSessionOverlap self-check ─────────────────────────────
describe('analyseStrengthSessionOverlap (§14 helper)', () => {
  test('same structure + identical prescription is NOT suspicious (regeneration)', () => {
    const s = session('full_body', 'advanced', '2026-09-01');
    assert.equal(analyseStrengthSessionOverlap(s, s).suspicious, false);
    assert.equal(analyseStrengthSessionOverlap(s, s).orderedSequenceEqual, true);
  });
  test('different structure + identical ordered prescription IS suspicious', () => {
    const bad = analyseStrengthSessionOverlap(
      { structure: 'full_body', requirements: UPPER_BODY_REQUIREMENTS },
      { structure: 'support', requirements: UPPER_BODY_REQUIREMENTS },
    );
    assert.equal(bad.suspicious, true);
  });
  test('different structure + prefix-identical prescription IS suspicious (the old bug shape)', () => {
    const bad = analyseStrengthSessionOverlap(
      { structure: 'full_body', requirements: [...LOWER_BODY_REQUIREMENTS, LOWER_BODY_REQUIREMENTS[0]] },
      { structure: 'support', requirements: LOWER_BODY_REQUIREMENTS },
    );
    assert.equal(bad.suspicious, true);
  });
});
