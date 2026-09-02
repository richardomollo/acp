// ACP Intelligence™ — Beta Feedback #014. Strength programme diversity &
// exercise-selection fidelity. Two canonical strength activities with
// different roles must not resolve to an identical ordered movement
// prescription; the same canonical activity must stay deterministic;
// primary-movement continuity is allowed; no RNG, no provider-order reliance.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitStrengthSessionForStructure, strengthRequirementBase, strengthSeedParity,
  fullBodyBaseForSeed, fullBodyOrdinalInPlan, analyseStrengthSessionOverlap,
  FULL_BODY_A_REQUIREMENTS, FULL_BODY_B_REQUIREMENTS, SUPPORT_REQUIREMENTS,
  UPPER_BODY_REQUIREMENTS, LOWER_BODY_REQUIREMENTS,
  type StrengthStructure,
} from '../programme-generator.ts';
import { suggestedStrengthWorkoutType } from '../activity-recommendation.ts';

const keyOf = (rs: { pattern: string; role: string; muscleHint?: string }[]) =>
  rs.map(r => `${r.pattern}:${r.role}:${r.muscleHint ?? ''}`);

// seed for full_body is now the session's ORDINAL among the plan's full-body
// sessions (0-based); a string seed remains a best-effort date fallback.
const session = (structure: StrengthStructure, experience: 'beginner' | 'intermediate' | 'advanced', seed?: number | string) => ({
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

// ── §8/§9/§16 — two full-body days alternate by PLAN POSITION, not date ────
describe('two full-body days in the same week (ordinal seed)', () => {
  test('1st full-body session → A, 2nd → B, 3rd → A (ordinal, not calendar parity)', () => {
    assert.equal(fullBodyBaseForSeed(0), FULL_BODY_A_REQUIREMENTS);
    assert.equal(fullBodyBaseForSeed(1), FULL_BODY_B_REQUIREMENTS);
    assert.equal(fullBodyBaseForSeed(2), FULL_BODY_A_REQUIREMENTS);
    assert.equal(fullBodyBaseForSeed(3), FULL_BODY_B_REQUIREMENTS);

    const first = session('full_body', 'advanced', 0);
    const second = session('full_body', 'advanced', 1);
    assert.notDeepEqual(keyOf(first.requirements), keyOf(second.requirements));
    const shared = keyOf(first.requirements).filter(k => keyOf(second.requirements).includes(k));
    assert.ok(shared.length >= 1, 'expected a shared movement for progression continuity (§7/§13)');
    assert.equal(analyseStrengthSessionOverlap(first, second).suspicious, false);
  });

  // §16 — the MANDATORY same-parity-date regression. The old planned_date
  // digit-sum-parity seed gave BOTH of these the same variant.
  test('§16 two full-body dates with the SAME digit-sum parity still get different variants via ordinal', () => {
    // 2026-09-07 → 2+0+2+6+0+9+0+7 = 26 (even) ; 2026-09-09 → 28 (even) — SAME parity
    assert.equal(strengthSeedParity('2026-09-07'), strengthSeedParity('2026-09-09'));
    // …so the old date seed would have picked A for both:
    assert.equal(fullBodyBaseForSeed('2026-09-07'), fullBodyBaseForSeed('2026-09-09'));
    // the ordinal seed does not:
    const a = session('full_body', 'advanced', 0);   // 1st full-body in plan
    const b = session('full_body', 'advanced', 1);   // 2nd full-body in plan
    assert.notDeepEqual(keyOf(a.requirements), keyOf(b.requirements));
    assert.equal(analyseStrengthSessionOverlap(a, b).orderedSequenceEqual, false);
  });

  test('a numeric ordinal seed is n%2 (not digit-sum) — 10 → A, 11 → B', () => {
    assert.equal(strengthSeedParity(10), 0);
    assert.equal(strengthSeedParity(11), 1);
    assert.equal(strengthSeedParity(-1), 1); // negative-safe
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

  test('a missing seed falls back to full-body A (never throws, never random)', () => {
    assert.equal(strengthRequirementBase('full_body', null), FULL_BODY_A_REQUIREMENTS);
    assert.equal(strengthRequirementBase('full_body'), FULL_BODY_A_REQUIREMENTS);
  });

  test('§9 the same plan position ⇒ the same variant across repeated resolutions', () => {
    for (const ord of [0, 1, 2, 3, 4]) {
      assert.equal(fullBodyBaseForSeed(ord), fullBodyBaseForSeed(ord));
      assert.deepEqual(
        fitStrengthSessionForStructure('full_body', 'advanced', 60, ord).requirements,
        fitStrengthSessionForStructure('full_body', 'advanced', 60, ord).requirements,
      );
    }
  });
});

// ── §8 fullBodyOrdinalInPlan — position among the plan's full-body sessions ─
describe('fullBodyOrdinalInPlan', () => {
  const plan = [
    { category: 'strength', title: 'Full-body strength', description: '' },   // idx 0 → ordinal 0
    { category: 'cardio', title: 'Easy run', description: '' },               // idx 1 (skipped)
    { category: 'strength', title: 'Upper body strength', description: '' },  // idx 2 (upper, not full_body)
    { category: 'strength', title: 'Full-body strength', description: '' },   // idx 3 → ordinal 1
    { category: 'strength', title: 'Upper/lower support', description: '' },  // idx 4 (support)
    { category: 'strength', title: 'Full-body strength', description: '' },   // idx 5 → ordinal 2
  ];
  test('counts only preceding strength full-body sessions', () => {
    assert.equal(fullBodyOrdinalInPlan(plan, 0), 0);
    assert.equal(fullBodyOrdinalInPlan(plan, 3), 1);
    assert.equal(fullBodyOrdinalInPlan(plan, 5), 2);
  });
  test('two full-body activities in one plan get consecutive ordinals → A then B', () => {
    const o1 = fullBodyOrdinalInPlan(plan, 0);
    const o2 = fullBodyOrdinalInPlan(plan, 3);
    assert.equal(o2 - o1, 1);
    assert.notEqual(fullBodyBaseForSeed(o1), fullBodyBaseForSeed(o2));
  });
  test('a non-strength category is never counted', () => {
    assert.equal(fullBodyOrdinalInPlan([{ category: 'cardio', title: 'Full-body run', description: '' }], 1), 0);
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
  test('an advanced support day carries no experience-tier accessory volume (advanced == beginner)', () => {
    // Beta #015 — window-fill growth is experience-independent.
    const adv = fitStrengthSessionForStructure('support', 'advanced', 60);
    const beg = fitStrengthSessionForStructure('support', 'beginner', 60);
    assert.equal(adv.requirements.length, beg.requirements.length);
    assert.ok(adv.requirements.every(r => r.role !== 'compound')); // still all accessory/core
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
