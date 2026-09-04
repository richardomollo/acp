// Beta Feedback #016 — Strength exercise duplication & weekly rotation.
//
// Root cause (proven): an advanced canonical "lower body … plus conditioning"
// day builds a requirement list with repeated movement patterns
// (squat×3, core×2, hinge×2). When the MuscleWiki provider is unavailable,
// EVERY requirement falls through to buildFallbackExercise(), which returns a
// PATTERN-KEYED CONSTANT ({ id: 'fallback-<pattern>', name: <fixed> }) with no
// intra-session uniqueness guard — so the workout gets N rows pointing at the
// same exercise ("Bodyweight Squat ×3", "Plank ×3", …).
//
// The invariant this file protects: within one generated strength workout,
// COUNT(exercise_id) === COUNT(DISTINCT exercise_id) — enforced at the
// selection layer, not the UI.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStrengthStructure, fitStrengthSession, fitStrengthSessionForStructure,
  titleImpliesConditioning, LOWER_BODY_REQUIREMENTS, estimateStrengthSessionMinutes,
  type StrengthStructure,
} from '../programme-generator.ts';
import {
  selectExerciseForRequirement, buildFallbackExercise, selectionKeys, exerciseIdentity,
} from '../../services/exercise-selection-service.ts';
import type { ExerciseRequirement } from '../programme-types.ts';

const REPORTED_TITLE = 'Lower body heavy duty day plus short conditioning';

// A fetch mock that always returns an empty exercise list — i.e. the
// MuscleWiki proxy is unreachable / returns nothing, the exact condition
// under which the device produced duplicates.
function providerDown() {
  return (async () => ({ ok: true, json: async () => [] } as any)) as any;
}

describe('#016 — reported case reproduction (requirement layer)', () => {
  test('canonical title classifies as lower body AND implies a conditioning tail', () => {
    assert.equal(classifyStrengthStructure(REPORTED_TITLE, ''), 'lower');
    assert.equal(titleImpliesConditioning(REPORTED_TITLE, ''), true);
  });

  test('#015B grow-to-window repeats movement patterns for an advanced lower session', () => {
    // No conditioning skip → this is what #015B produced before #016.
    const { requirements } = fitStrengthSessionForStructure('lower', 'advanced', 60, 'tuesday');
    const hist: Record<string, number> = {};
    for (const r of requirements) hist[r.pattern] = (hist[r.pattern] ?? 0) + 1;
    // The defect shape: squat and (core|hinge) appear more than once.
    assert.ok(hist.squat >= 2, `expected repeated squat pattern, got ${JSON.stringify(hist)}`);
    assert.ok((hist.core ?? 0) >= 2 || (hist.hinge ?? 0) >= 2, JSON.stringify(hist));
  });

  test('provider-down + repeated patterns → buildFallbackExercise returns the SAME exercise (this is the bug it must not persist)', () => {
    const { requirements } = fitStrengthSessionForStructure('lower', 'advanced', 60, 'tuesday');
    const names = requirements.map(r => buildFallbackExercise(r).name);
    const distinct = new Set(names);
    // Before the selection-layer fix this list had duplicates by name.
    assert.ok(distinct.size < names.length, 'expected the raw fallback list to contain duplicates');
    assert.ok(names.filter(n => n === 'Bodyweight Squat').length >= 2);
  });
});

describe('#016 — requirement-layer guards', () => {
  test('fitStrengthSession never returns two requirements identical on (pattern, role, muscleHint, bodyPart)', () => {
    for (const s of ['full_body', 'upper', 'lower', 'support'] as StrengthStructure[]) {
      for (const exp of ['beginner', 'intermediate', 'advanced'] as const) {
        for (const ceil of [null, 30, 45, 60, 90]) {
          const { requirements } = fitStrengthSessionForStructure(s, exp, ceil, 'seed');
          const keys = requirements.map(r => `${r.pattern}|${r.role}|${r.muscleHint ?? ''}|${r.bodyPart}`);
          assert.equal(new Set(keys).size, keys.length,
            `duplicate requirement tuple in ${s}/${exp}/${ceil}: ${JSON.stringify(keys)}`);
        }
      }
    }
  });

  test('§8 — a "plus conditioning" activity does NOT pad the strength portion with #015B fill', () => {
    const withFill = fitStrengthSessionForStructure('lower', 'advanced', 60, 'seed');
    const noFill = fitStrengthSessionForStructure('lower', 'advanced', 60, 'seed', { skipPrimaryFill: true });
    assert.ok(noFill.requirements.length < withFill.requirements.length,
      'skipPrimaryFill must yield a shorter (un-padded) strength list');
    // still an honest, non-inflated estimate — never relabelled up
    assert.equal(noFill.durationMinutes, Math.min(estimateStrengthSessionMinutes(noFill.requirements, 'advanced'), 60));
  });

  test('titleImpliesConditioning matches the vocabulary, not plain strength titles', () => {
    for (const t of ['... plus short conditioning', 'Strength + finisher', 'Lower body metcon', 'Push day circuit', 'EMOM intervals']) {
      assert.equal(titleImpliesConditioning(t, ''), true, t);
    }
    for (const t of ['Lower body heavy duty day', 'Upper/lower support', 'Full body strength', 'Leg day']) {
      assert.equal(titleImpliesConditioning(t, ''), false, t);
    }
  });
});

describe('#016 — selection layer holds the intra-session uniqueness invariant', () => {
  const lower: ExerciseRequirement = { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound' };

  test('exerciseIdentity / selectionKeys collapse name casing + whitespace', () => {
    const a = buildFallbackExercise({ ...lower });
    const b = { ...a, name: '  bodyweight   SQUAT ' };
    assert.deepEqual(
      selectionKeys(a).filter(k => k.startsWith('name:')),
      selectionKeys(b as any).filter(k => k.startsWith('name:')),
    );
    assert.equal(exerciseIdentity({ ...a, id: '' } as any), exerciseIdentity({ ...b, id: '' } as any));
  });

  test('provider down (advanced gym): repeated squat pattern resolves to a DISTINCT curated exercise, not a duplicate/drop', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = providerDown();
    try {
      const seen = new Set<string>();
      // req 1 — squat compound → curated gym fallback "Barbell Squat"
      const r1 = await selectExerciseForRequirement({ ...lower, bodyPart: 'legs-u1' }, 'gym', 'advanced', seen);
      assert.equal(r1.fallbackUsed, true);
      assert.equal(r1.duplicate ?? false, false);
      assert.notEqual(r1.exercise.name.toLowerCase(), 'bodyweight squat', '#017 — advanced gym must not degrade to Bodyweight Squat');
      for (const k of selectionKeys(r1.exercise)) seen.add(k);

      // req 2 — squat accessory → the NEXT curated squat/gym movement, a
      // real distinct exercise (not a duplicate, not dropped).
      const r2 = await selectExerciseForRequirement(
        { pattern: 'squat', bodyPart: 'legs-u2', muscleHint: 'glute', role: 'accessory' }, 'gym', 'advanced', seen,
      );
      assert.equal(r2.duplicate ?? false, false);
      assert.notEqual(exerciseIdentity(r2.exercise), exerciseIdentity(r1.exercise), 'second squat must be a different exercise');
      for (const k of selectionKeys(r2.exercise)) seen.add(k);

      // req 3 — core → curated core movement, distinct again.
      const r3 = await selectExerciseForRequirement(
        { pattern: 'core', bodyPart: 'waist-u3', role: 'core' }, 'gym', 'advanced', seen,
      );
      assert.equal(r3.duplicate ?? false, false);
      assert.notEqual(exerciseIdentity(r3.exercise), exerciseIdentity(r1.exercise));
      assert.notEqual(exerciseIdentity(r3.exercise), exerciseIdentity(r2.exercise));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('provider down: replaying the reported requirement list yields ZERO within-session duplicate identities (invariant, strengthened by #017)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = providerDown();
    try {
      const { requirements } = fitStrengthSessionForStructure('lower', 'advanced', 60, 'tuesday');
      const seen = new Set<string>();
      const persistedIdentities: string[] = [];
      let dropped = 0;
      for (const req of requirements) {
        const picked = await selectExerciseForRequirement(req, 'gym', 'advanced', seen);
        if (picked.duplicate) { dropped++; continue; }           // §17 — dropped, never a corrupt/duplicate row
        for (const k of selectionKeys(picked.exercise)) seen.add(k);
        persistedIdentities.push(exerciseIdentity(picked.exercise));
      }
      // THE #016 INVARIANT: COUNT(rows) === COUNT(DISTINCT exercise_id).
      assert.equal(new Set(persistedIdentities).size, persistedIdentities.length,
        `duplicate persisted identity: ${JSON.stringify(persistedIdentities)}`);
      // #017 — the advanced gym curated pool is deep enough that every
      // requirement gets its own credible exercise: nothing dropped, a full
      // session, and not one Bodyweight Squat.
      assert.equal(dropped, 0, 'advanced gym curated pool should satisfy every requirement uniquely');
      assert.equal(persistedIdentities.length, requirements.length);
      assert.ok(!persistedIdentities.some(id => id.includes('bodyweight-squat')));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('provider HAS candidates: distinct exercises per requirement, no duplicate, no false "duplicate" flag', async () => {
    const origFetch = globalThis.fetch;
    // Enough distinct quad exercises that every squat requirement gets its own.
    // Unique muscleHint ('quadA1') so exerciseService's per-filter cache
    // isn't polluted by the provider-down tests above.
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => [
        { id: 10, name: 'Back Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
        { id: 11, name: 'Front Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
        { id: 12, name: 'Bulgarian Split Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
        { id: 13, name: 'Hack Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
      ],
    } as any)) as any;
    try {
      const seen = new Set<string>();
      const picks: string[] = [];
      for (let i = 0; i < 3; i++) {
        const p = await selectExerciseForRequirement(
          { pattern: 'squat', bodyPart: `legs-hasA${i}`, muscleHint: 'quadA1', role: i === 0 ? 'compound' : 'accessory' },
          'gym', 'beginner', seen,
        );
        assert.equal(p.duplicate ?? false, false);
        assert.equal(p.fallbackUsed, false);
        for (const k of selectionKeys(p.exercise)) seen.add(k);
        picks.push(p.exercise.id);
      }
      assert.equal(new Set(picks).size, 3, `expected 3 distinct provider exercises, got ${JSON.stringify(picks)}`);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('Tier 4 no longer reuses an already-selected exercise (was the #014 gap)', async () => {
    const origFetch = globalThis.fetch;
    // One valid candidate only — a 2nd requirement can find nothing NEW.
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => [{ id: 99, name: 'Romanian Deadlift', primary_muscles: ['Hamstrings'], category: 'Bodyweight', difficulty: 'Beginner' }],
    } as any)) as any;
    try {
      const seen = new Set<string>();
      const a = await selectExerciseForRequirement(
        { pattern: 'hinge', bodyPart: 'legs-t4A', muscleHint: 'hammyA1', role: 'compound' }, 'gym', 'beginner', seen,
      );
      assert.equal(a.exercise.id, '99');
      for (const k of selectionKeys(a.exercise)) seen.add(k);
      const b = await selectExerciseForRequirement(
        { pattern: 'hinge', bodyPart: 'legs-t4B', muscleHint: 'hammyA1', role: 'accessory' }, 'gym', 'beginner', seen,
      );
      // Only candidate is already used → must fall to a UNIQUE fallback, or
      // flag duplicate — never silently return exercise 99 again.
      assert.notEqual(b.exercise.id, '99');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('#016 — regression guards for #013/#014/#015/#015B', () => {
  test('#013 — advanced lower still fits under its prescribed ceiling and never labels more time than planned', () => {
    for (const ceil of [30, 45, 60, 90]) {
      const f = fitStrengthSessionForStructure('lower', 'advanced', ceil, 'seed');
      assert.ok(f.durationMinutes <= ceil, `${f.durationMinutes} > ${ceil}`);
    }
  });

  test('#014 — lower base is distinct from full-body and keeps its two compound lifts', () => {
    const compounds = LOWER_BODY_REQUIREMENTS.filter(r => r.role === 'compound').map(r => r.pattern);
    assert.deepEqual(compounds, ['squat', 'hinge']);
  });

  test('#015B — advanced primary session is still meaningfully longer than beginner (volume from sets/ramp, not just count)', () => {
    const adv = fitStrengthSessionForStructure('lower', 'advanced', 90, 'seed').durationMinutes;
    const beg = fitStrengthSessionForStructure('lower', 'beginner', 90, 'seed').durationMinutes;
    assert.ok(adv > beg, `${adv} !> ${beg}`);
  });

  test('#015 — a support day is unaffected: still all accessory/core, no compound', () => {
    const sup = fitStrengthSessionForStructure('support', 'advanced', 45, 'seed');
    assert.ok(sup.requirements.every(r => r.role !== 'compound'));
    assert.equal(sup.structure, 'support');
  });

  test('determinism — same canonical inputs regenerate the identical requirement list', () => {
    const a = fitStrengthSessionForStructure('lower', 'advanced', 60, '2026-09-08', { skipPrimaryFill: true });
    const b = fitStrengthSessionForStructure('lower', 'advanced', 60, '2026-09-08', { skipPrimaryFill: true });
    assert.deepEqual(a.requirements, b.requirements);
    assert.equal(a.durationMinutes, b.durationMinutes);
  });
});
