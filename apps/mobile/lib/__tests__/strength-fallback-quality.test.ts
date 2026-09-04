// Beta Feedback #017 — strength fallback quality + conditioning execution
// fidelity.
//
// Root cause of the low-fidelity degrade: the MuscleWiki proxy is returning
// HTTP 429 (upstream rate-limit on the API key), so every requirement runs
// through Tier 5. Pre-#017 Tier 5 was ONE hardcoded bodyweight movement per
// pattern → an advanced gym "heavy duty" day degraded to Bodyweight Squat /
// Glute Bridge / Plank. #017 replaces it with a curated pool per
// (pattern × equipment context), drawn from ACP's own seeded catalogue
// (real names + real jsDelivr GIFs), and sanitises an unexecutable
// "plus conditioning" promise out of the plan rather than faking it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectExerciseForRequirement, buildFallbackExercise, selectionKeys, exerciseIdentity,
} from '../../services/exercise-selection-service.ts';
import { sanitizeStrengthActivity, isExecutableFeature } from '../plan-execution-capability.ts';
import { fitStrengthSessionForStructure, titleImpliesConditioning } from '../programme-generator.ts';
import type { ExerciseRequirement } from '../programme-types.ts';

const providerDown = () => (async () => ({ ok: true, json: async () => [] } as any)) as any;
const sq = (o: Partial<ExerciseRequirement> = {}): ExerciseRequirement =>
  ({ pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound', ...o });

describe('#017 — curated fallback pool: context fidelity', () => {
  test('advanced GYM squat fallback is a loaded barbell/machine movement, never Bodyweight Squat', () => {
    const ex = buildFallbackExercise(sq(), { equipmentLocation: 'gym' });
    assert.equal(ex.name.toLowerCase().includes('bodyweight'), false);
    assert.ok(['barbell', 'machine', 'dumbbell', 'cable'].includes(ex.equipment));
    assert.ok(ex.media.length >= 1, 'seeded catalogue entry carries a real GIF');
  });

  test('home/beginner squat fallback IS a bodyweight movement (§19 — do not universally gym/heavy)', () => {
    const ex = buildFallbackExercise(sq(), { equipmentLocation: 'home' });
    assert.equal(ex.equipment, 'bodyweight');
    assert.equal(ex.name, 'Bodyweight Squat');
  });

  test('no opts → legacy single bodyweight fallback (back-compat for callers/tests)', () => {
    const ex = buildFallbackExercise(sq());
    assert.equal(ex.equipment, 'bodyweight');
  });

  test('curated pool yields DISTINCT exercises for repeated same-pattern requirements', () => {
    const used = new Set<string>();
    const picks: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ex = buildFallbackExercise(sq({ role: i === 0 ? 'compound' : 'accessory' }), { equipmentLocation: 'gym', alreadySelected: used });
      for (const k of selectionKeys(ex)) used.add(k);
      picks.push(ex.name);
    }
    assert.equal(new Set(picks).size, 3, `expected 3 distinct curated squats, got ${JSON.stringify(picks)}`);
  });

  test('pool exhaustion falls back to the legacy movement, never fabricates', () => {
    // Pre-load every curated squat name.
    const used = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const ex = buildFallbackExercise(sq(), { equipmentLocation: 'gym', alreadySelected: used });
      for (const k of selectionKeys(ex)) used.add(k);
    }
    const last = buildFallbackExercise(sq(), { equipmentLocation: 'gym', alreadySelected: used });
    assert.ok(last.name.length > 0);
    assert.equal(last.instructions.length, 0); // never fabricated instructions
  });

  test('mobility patterns are untouched by the strength pool', () => {
    const ex = buildFallbackExercise({ pattern: 'thoracic_mobility', bodyPart: 'back', role: 'mobility' }, { equipmentLocation: 'gym' });
    assert.equal(ex.category, 'mobility');
    assert.equal(ex.media.length, 0);
  });
});

describe('#017 — Tier 5 selection is context-aware and unique', () => {
  test('advanced + gym, provider down: full reported list → all distinct credible gym movements, no duplicates, no Bodyweight Squat', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = providerDown();
    try {
      const { requirements } = fitStrengthSessionForStructure('lower', 'advanced', 60, 'tuesday');
      const seen = new Set<string>();
      const rows: { name: string; equipment: string; id: string }[] = [];
      for (const req of requirements) {
        const p = await selectExerciseForRequirement(req, 'gym', 'advanced', seen);
        if (p.duplicate) continue;
        for (const k of selectionKeys(p.exercise)) seen.add(k);
        rows.push({ name: p.exercise.name, equipment: p.exercise.equipment, id: exerciseIdentity(p.exercise) });
      }
      assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'zero duplicate exercise identities');
      assert.equal(rows.some(r => r.name.toLowerCase() === 'bodyweight squat'), false);
      assert.ok(rows.filter(r => ['barbell', 'machine', 'cable', 'dumbbell'].includes(r.equipment)).length >= 3,
        'an advanced gym session should be predominantly loaded movements');
      assert.ok(rows.length >= 6, 'a substantive session, not a thin one');
    } finally {
      globalThis.fetch = orig;
    }
  });

  test('beginner + home, provider down: bodyweight fallbacks are appropriate and unique', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = providerDown();
    try {
      const { requirements } = fitStrengthSessionForStructure('full_body', 'beginner', 40, 'mon');
      const seen = new Set<string>();
      const rows: string[] = [];
      for (const req of requirements) {
        const p = await selectExerciseForRequirement(req, 'home', 'beginner', seen);
        if (p.duplicate) continue;
        for (const k of selectionKeys(p.exercise)) seen.add(k);
        assert.equal(p.exercise.equipment, 'bodyweight');
        rows.push(exerciseIdentity(p.exercise));
      }
      assert.equal(new Set(rows).size, rows.length);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('#017 §12/§13 — plan → execution capability sanitiser', () => {
  test('conditioning is DETECTED but NOT executable', () => {
    assert.equal(titleImpliesConditioning('Lower body heavy duty day plus short conditioning', ''), true);
    assert.equal(isExecutableFeature('conditioning_block'), false);
    assert.equal(isExecutableFeature('strength_structure'), true);
    assert.equal(isExecutableFeature('run_block'), true);
  });

  test('strips the unfulfillable conditioning clause from the strength activity', () => {
    const { activity, strippedConditioning } = sanitizeStrengthActivity({
      title: 'Lower body heavy duty day plus short conditioning',
      description: 'Heavy compound lower work, then a short conditioning finisher.',
    });
    assert.equal(strippedConditioning, true);
    assert.equal(titleImpliesConditioning(activity.title, activity.description), false);
    assert.match(activity.title!, /lower body heavy duty day/i);
    assert.doesNotMatch(activity.title!, /conditioning/i);
  });

  test('a plain strength activity is passed through untouched', () => {
    const input = { title: 'Lower body heavy duty day', description: 'Squat and hinge focus.' };
    const { activity, strippedConditioning } = sanitizeStrengthActivity(input);
    assert.equal(strippedConditioning, false);
    assert.deepEqual(activity, input);
  });

  test('after sanitising, #015B fills the strength window normally (no §8 skip needed)', () => {
    const raw = { title: 'Lower body heavy duty day plus short conditioning', description: null };
    const { activity } = sanitizeStrengthActivity(raw);
    const withCond = fitStrengthSessionForStructure('lower', 'advanced', 60, 'seed', { skipPrimaryFill: titleImpliesConditioning(raw.title, raw.description) });
    const sanitised = fitStrengthSessionForStructure('lower', 'advanced', 60, 'seed', { skipPrimaryFill: titleImpliesConditioning(activity.title, activity.description) });
    assert.ok(sanitised.requirements.length > withCond.requirements.length,
      'sanitised session fills its window; the conditioning-flagged one stayed short');
    assert.ok(sanitised.durationMinutes >= withCond.durationMinutes);
  });
});

describe('#017 §16/§17 — folded-set corruption removed', () => {
  test('a duplicate requirement is DROPPED, never folded onto a semantically different row', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = providerDown();
    try {
      // Exhaust the curated squat pool by pre-seeding it, forcing a genuine
      // "no unique candidate" on the next squat requirement.
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const ex = buildFallbackExercise(sq(), { equipmentLocation: 'gym', alreadySelected: seen });
        for (const k of selectionKeys(ex)) seen.add(k);
      }
      const p = await selectExerciseForRequirement(sq({ role: 'accessory', muscleHint: 'glute' }), 'gym', 'advanced', seen);
      // With the pool exhausted the only option is a repeat → flagged
      // duplicate so the caller DROPS it (no row, no corrupt fold).
      assert.equal(p.duplicate, true);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
