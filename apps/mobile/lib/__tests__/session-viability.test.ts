// ACP Intelligence™ — Beta Feedback #015. Session viability & training-time
// fidelity. A support day must fill its PLANNED window with accessory work
// (not leave a "30 min" plan delivering 24), and must not be framed as a
// dedicated gym trip. #013's primary floor is untouched. No commute input,
// no supply coupling.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitStrengthSessionForStructure, assessStandaloneViability,
  estimateSessionMinutes, prescriptionForRequirements,
  SUPPORT_REQUIREMENTS, FULL_BODY_A_REQUIREMENTS, estimateStrengthSessionMinutes, compoundPrescription,
  type StrengthStructure,
} from '../programme-generator.ts';

const fit = (s: StrengthStructure, exp: 'beginner' | 'intermediate' | 'advanced', ceil: number) =>
  fitStrengthSessionForStructure(s, exp, ceil, 0);

// ── §12/§19 — the 30 → 24 discrepancy is closed ─────────────────────────
describe('support fills its planned window', () => {
  test('the exact screenshot case: support / advanced / planned 30 → generated ≈ 30, not 24', () => {
    const r = fit('support', 'advanced', 30);
    assert.ok(r.durationMinutes >= 27 && r.durationMinutes <= 30,
      `expected ~28–30 min, got ${r.durationMinutes}`);
    assert.ok(r.requirements.length > SUPPORT_REQUIREMENTS.length,
      'support grew beyond the 4-movement base to fill the window');
    // and it is honestly still SUPPORT — all added movements are accessory/core
    for (const req of r.requirements) assert.notEqual(req.role, 'compound');
  });

  test('a genuinely short planned window stays short (no over-inflation)', () => {
    const r20 = fit('support', 'advanced', 20);
    assert.ok(r20.durationMinutes <= 22, `20-min support stayed ${r20.durationMinutes}`);
    assert.equal(r20.requirements.length, SUPPORT_REQUIREMENTS.length); // no growth
  });

  test('support never overshoots its ceiling', () => {
    for (const ceil of [20, 25, 30, 35, 40]) {
      const r = fit('support', 'advanced', ceil);
      assert.ok(r.durationMinutes <= ceil, `support ceil ${ceil} → ${r.durationMinutes}`);
    }
  });

  test('§015C support fills a 60-min window but stays a SUPPORT session (all accessory, no compound)', () => {
    const r = fit('support', 'advanced', 60);
    assert.ok(r.durationMinutes >= 52 && r.durationMinutes <= 60, `support c60 → ${r.durationMinutes}`);
    assert.ok(r.requirements.every(req => req.role !== 'compound'), 'support gained a compound lift');
  });
});

// ── §4 — #013 primary floor untouched ──────────────────────────────────
describe('#013 regression — primary strength is unaffected', () => {
  test('full_body / advanced still builds the experience-aware volume', () => {
    const r = fit('full_body', 'advanced', 60);
    assert.ok(r.requirements.length >= FULL_BODY_A_REQUIREMENTS.length + 1); // +experience accessories
  });
  test('upper / lower unchanged by #015', () => {
    assert.equal(fit('upper', 'advanced', 60).requirements[0].role, 'compound');
    assert.equal(fit('lower', 'advanced', 60).requirements[0].role, 'compound');
  });
  test('a support day still carries no experience-tier scaling (beginner volume)', () => {
    // beginner and advanced support with the SAME ceiling get the same count
    assert.equal(fit('support', 'beginner', 30).requirements.length, fit('support', 'advanced', 30).requirements.length);
  });
});

// ── §7 — the viability predicate ───────────────────────────────────────
describe('assessStandaloneViability', () => {
  test('support content ≈ its planned window → short_support (legit)', () => {
    assert.equal(assessStandaloneViability('support', 29, 30), 'short_support');
    assert.equal(assessStandaloneViability('support', 20, 20), 'short_support');
  });
  test('support content far short of a substantial planned window → thin (planner should reconsider)', () => {
    assert.equal(assessStandaloneViability('support', 24, 30), 'thin');
    assert.equal(assessStandaloneViability('support', 34, 45), 'thin');
  });
  test('the post-fix generator never produces a thin 30-min support', () => {
    const r = fit('support', 'advanced', 30);
    assert.notEqual(assessStandaloneViability('support', r.durationMinutes, 30), 'thin');
  });
  test('primary sessions are viable / short_support, never thin', () => {
    assert.equal(assessStandaloneViability('full_body', 34, 55), 'viable');
    assert.equal(assessStandaloneViability('full_body', 22, 30), 'short_support');
  });
  test('no commute / travel input — args are structure / generated / planned / experience only', () => {
    assert.ok(assessStandaloneViability.length <= 4);
  });
  test('§015C advanced standalone support far below 60 → thin', () => {
    assert.equal(assessStandaloneViability('support', 30, 60, 'advanced'), 'thin');
    assert.equal(assessStandaloneViability('support', 58, 60, 'advanced'), 'viable');
    // non-advanced support keeps the #015 heuristic
    assert.equal(assessStandaloneViability('support', 29, 30, 'intermediate'), 'short_support');
  });
});

// ── §14 — the 24 min figure is a full-session estimate, not just work ──
describe('duration semantics', () => {
  test('estimateSessionMinutes includes warm-up + per-exercise setup (not bare working time)', () => {
    const bare = SUPPORT_REQUIREMENTS.length * 3 * 12 * 3 / 60; // working reps only, mins
    const full = estimateSessionMinutes(prescriptionForRequirements(SUPPORT_REQUIREMENTS));
    assert.ok(full > bare + 5, 'estimate should exceed bare working time by warm-up + setup + rest');
  });
});

// ── Beta #015B — PRIMARY strength fills its canonical window ──────────────

describe('#015B — primary strength honours the canonical duration', () => {
  for (const s of ['full_body', 'upper', 'lower'] as StrengthStructure[]) {
    test(`advanced ${s} / canonical 55 → generated within 6 min of target (was 34)`, () => {
      const r = fit(s, 'advanced', 55);
      assert.ok(r.durationMinutes >= 55 - 6 && r.durationMinutes <= 55,
        `${s}: expected 49–55, got ${r.durationMinutes}`);
    });
  }
  test('intermediate full_body / canonical 45 → near target', () => {
    const r = fit('full_body', 'intermediate', 45);
    assert.ok(r.durationMinutes >= 45 - 8 && r.durationMinutes <= 45, `got ${r.durationMinutes}`);
  });
  test('§21 a genuinely constrained 30-min primary is NOT forced up to 55', () => {
    const r = fit('full_body', 'advanced', 30);
    assert.ok(r.durationMinutes <= 30);
  });
  test('§6 the window is filled by set volume + accessory work, never a compound of a new pattern', () => {
    const r = fit('upper', 'advanced', 55);
    const basePatterns = new Set(['horizontal_push', 'horizontal_pull', 'vertical_push']);
    for (const req of r.requirements) {
      if (req.role === 'compound') assert.ok(basePatterns.has(req.pattern), `new compound pattern ${req.pattern}`);
    }
  });
  test('§8 advanced compound prescription = more sets + longer rest than beginner', () => {
    const beg = compoundPrescription('beginner');
    const adv = compoundPrescription('advanced');
    assert.ok(adv.sets >= beg.sets && adv.restSeconds > beg.restSeconds);
  });
  test('§12 upper fill adds no lower-body movement; lower fill adds no upper-body movement', () => {
    const upper = fit('upper', 'advanced', 55).requirements.map(r => r.pattern);
    const lower = fit('lower', 'advanced', 55).requirements.map(r => r.pattern);
    assert.ok(!upper.includes('squat') && !upper.includes('hinge'));
    assert.ok(!lower.includes('horizontal_push') && !lower.includes('vertical_push'));
  });
  test('§13/§14 support is untouched by the primary fitter — still short, still all-accessory', () => {
    const sup = fit('support', 'advanced', 30);
    assert.ok(sup.durationMinutes <= 30 && sup.durationMinutes >= 26);
    assert.ok(sup.requirements.every(r => r.role !== 'compound'));
  });
  test('same canonical activity regenerates the identical prescription (determinism)', () => {
    const a = fitStrengthSessionForStructure('full_body', 'advanced', 55, 0);
    const b = fitStrengthSessionForStructure('full_body', 'advanced', 55, 0);
    assert.deepEqual(a.requirements, b.requirements);
    assert.equal(a.durationMinutes, b.durationMinutes);
  });
  test('the stored duration equals the generator estimate (label ↔ content, §20)', () => {
    const r = fit('full_body', 'advanced', 55);
    assert.equal(r.durationMinutes, Math.min(estimateStrengthSessionMinutes(r.requirements, 'advanced'), 55));
  });
});
