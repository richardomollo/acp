import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { selectExerciseForRequirement, buildFallbackExercise } from '../../services/exercise-selection-service.ts';
import type { ExerciseRequirement } from '../programme-types.ts';

function requirement(overrides: Partial<ExerciseRequirement> = {}): ExerciseRequirement {
  return { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound', ...overrides };
}

// ExerciseDB Primary / MuscleWiki Optional (2026-09) — exercise-service.ts's
// activeProvider is now exercisedbProvider, so fetchCandidates ultimately
// hits ExerciseDB's real contract: every list endpoint returns a bare array
// of full exercise objects, muscle lives in `target`, and `equipment` is its
// own field (e.g. "barbell", "dumbbell", "body weight") — see
// services/providers/exercisedb-provider.ts's raw shape.
function mockSearchResponse(exercises: any[]) {
  return (async () => ({ ok: true, json: async () => exercises } as any)) as any;
}

// exerciseService caches search results in-memory per exact filter object —
// each test below uses its own distinct query string purely so its fetch
// mock is guaranteed to be hit rather than served from another test's cache.
describe('selectExerciseForRequirement', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('picks a candidate matching muscle hint, location, and difficulty (tier 1)', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 1, name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quads', equipment: 'body weight' },
      { id: 2, name: 'Leg Press', bodyPart: 'upper legs', target: 'quads', equipment: 'leverage machine' },
    ]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t1', muscleHint: 'quad' }), 'home', 'beginner', new Set());
    assert.equal(result.exercise.id, '1');
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.sets, 3);
    assert.equal(result.reps, 10); // compound role
  });

  test('avoids an already-selected exercise when another candidate exists', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 1, name: 'Bodyweight Squat', bodyPart: 'upper legs', target: 'quads', equipment: 'body weight' },
      { id: 2, name: 'Goblet Squat', bodyPart: 'upper legs', target: 'quads', equipment: 'dumbbell' },
    ]);
    // "quads" (not "quad") — a different, still-valid substring of the mock's
    // muscle name, purely so this test gets its own exerciseService cache
    // entry instead of reusing the previous test's.
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t2', muscleHint: 'quads' }), 'home', 'beginner', new Set(['1']));
    assert.equal(result.exercise.id, '2');
  });

  test('relaxes the equipment/location filter when nothing home-friendly is available', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 1, name: 'Barbell Back Squat', bodyPart: 'upper legs', target: 'quads', equipment: 'barbell' },
    ]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t3', muscleHint: 'qua' }), 'home', 'beginner', new Set());
    assert.equal(result.exercise.id, '1'); // no home-equipment match exists, so the only real candidate wins over the hardcoded fallback
    assert.equal(result.fallbackUsed, false);
  });

  test('falls back to a safe built-in bodyweight exercise when the provider has nothing at all', async () => {
    globalThis.fetch = mockSearchResponse([]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t4', muscleHint: 'no-match-t4' }), 'home', 'beginner', new Set());
    assert.equal(result.fallbackUsed, true);
    // Beta #017 — the curated fallback id is `fallback-<pattern>-<slug>`.
    assert.ok(result.exercise.id.startsWith('fallback-squat'), result.exercise.id);
    assert.equal(result.exercise.provider, 'acp');
    assert.equal(result.exercise.equipment, 'bodyweight'); // home context → bodyweight movement
  });

  test('TestFlight incident fix — skipNetwork bypasses the provider entirely and goes straight to the Tier 5 fallback', async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => { fetchCalled = true; return { ok: true, json: async () => [{ id: 99, name: 'Should never be seen', bodyPart: 'upper legs', target: 'quads', equipment: 'barbell' }] } as any; }) as any;
    const result = await selectExerciseForRequirement(
      requirement({ bodyPart: 'legs-skipnet', muscleHint: 'no-match-skipnet' }), 'home', 'beginner', new Set(), { skipNetwork: true },
    );
    assert.equal(fetchCalled, false, 'skipNetwork must never call the exercise provider');
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.exercise.id.startsWith('fallback-squat'), result.exercise.id);
    assert.match(result.fallbackReason ?? '', /time budget/i);
  });

  test('skipNetwork still folds into an already-selected fallback rather than emitting a duplicate row', async () => {
    // The curated 'squat' bodyweight pool has exactly two entries (Bodyweight
    // Squat, Split Squat) — seed both as already-used so a budget-exceeded
    // call for the same pattern has no distinct curated option left and must
    // fold, exactly like the network path already does when its pool is
    // exhausted (Beta #016).
    const alreadySelected = new Set(['name:bodyweight squat', 'name:split squat']);
    const result = await selectExerciseForRequirement(
      requirement({ bodyPart: 'legs-skipnet2' }), 'home', 'beginner', alreadySelected, { skipNetwork: true },
    );
    assert.equal(result.duplicate, true);
    assert.match(result.fallbackReason ?? '', /already in this session/i);
  });

  test('never throws when the provider errors — falls back instead', async () => {
    globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'chest-t5', pattern: 'horizontal_push', muscleHint: 'no-match-t5' }), 'home', 'beginner', new Set());
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.exercise.id.startsWith('fallback-horizontal_push'), result.exercise.id);
    assert.equal(result.exercise.provider, 'acp');
  });

  test('sets/reps/rest come from the requirement role, not the exercise itself', async () => {
    globalThis.fetch = mockSearchResponse([]);
    const core = await selectExerciseForRequirement(requirement({ pattern: 'core', bodyPart: 'waist-t6', muscleHint: undefined, role: 'core' }), 'home', 'beginner', new Set());
    assert.equal(core.reps, 15);
    assert.equal(core.restSeconds, 45);
  });

  test('an equipment value with different spacing/casing than ACP’s own convention still matches home equipment (e.g. real ExerciseDB "body weight")', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 3, name: 'Push Up', bodyPart: 'chest', target: 'pectorals', equipment: 'body weight' },
    ]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'chest-t7', pattern: 'horizontal_push', muscleHint: 'chest' }), 'home', 'beginner', new Set());
    assert.equal(result.exercise.id, '3');
    assert.equal(result.fallbackUsed, false);
  });
});

describe('buildFallbackExercise', () => {
  test('every strength movement pattern has a safe bodyweight fallback, category strength', () => {
    for (const pattern of ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'core'] as const) {
      const ex = buildFallbackExercise({ pattern, bodyPart: 'x', role: 'compound' });
      assert.equal(ex.equipment, 'bodyweight');
      assert.equal(ex.difficulty, 'beginner');
      assert.equal(ex.category, 'strength');
      assert.ok(ex.name.length > 0);
    }
  });

  // Chunk 4.5C bug fix: the three mobility patterns were previously MISSING
  // from FALLBACK_BY_PATTERN entirely, so they silently fell through to the
  // 'core' (strength) fallback — 'Plank', mislabeled category:'strength' —
  // whenever MuscleWiki genuinely had nothing acceptable. This is exactly
  // the scenario where a bad fallback is guaranteed to be shown, not just
  // possible, since it's the last tier of the relaxation ladder.
  test('every mobility movement pattern has its OWN real mobility fallback — never the strength "core" fallback', () => {
    const strengthFallbackNames = new Set(['Bodyweight Squat', 'Glute Bridge', 'Push Up', 'Superman Row', 'Pike Push Up', 'Plank']);
    for (const pattern of ['hip_mobility', 'shoulder_mobility', 'thoracic_mobility'] as const) {
      const ex = buildFallbackExercise({ pattern, bodyPart: 'x', role: 'mobility' });
      assert.equal(ex.equipment, 'bodyweight');
      assert.equal(ex.difficulty, 'beginner');
      assert.equal(ex.category, 'mobility');
      assert.equal(strengthFallbackNames.has(ex.name), false, `${pattern} fallback "${ex.name}" must not be a strength exercise`);
    }
  });
});

// Chunk 4.5C live-audit bug fix (originally against MuscleWiki, which used
// "Dumbbells"/"Kettlebells" plural): ACP's HOME_EQUIPMENT set carries both
// singular and plural forms plus the mobility-content categories
// ('stretches'/'recovery'/'pilates'/'yoga') so ANY provider using either
// vocabulary is recognised correctly — this set is shared, provider-
// agnostic code (exercise-selection-service.ts), unchanged by the
// ExerciseDB Primary / MuscleWiki Optional switch, so it still needs
// coverage regardless of which provider is active today. Fixtures below use
// ExerciseDB's real raw shape (the provider actually in the critical path
// now), not a claim that ExerciseDB itself returns "Stretches"/"Recovery"
// tags (it doesn't — real ExerciseDB has very little mobility content at
// all, a documented coverage gap the Lana curated fallback covers).
describe('home-equipment vocabulary (Chunk 4.5C regression)', () => {
  test('plural "Dumbbells"/"Kettlebells" now match home, same as the singular forms', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 10, name: 'Dumbbell Shoulder External Rotation', bodyPart: 'shoulders', target: 'delts', equipment: 'dumbbells' },
    ]);
    const result = await selectExerciseForRequirement(
      { pattern: 'vertical_push', bodyPart: 'shoulders-t8', muscleHint: 'shoulder', role: 'compound' },
      'home', 'beginner', new Set(),
    );
    assert.equal(result.exercise.id, '10');
    assert.equal(result.fallbackUsed, false);
  });

  test('"stretches" and "recovery" equipment values are still treated as home-friendly (shared matching code, provider-agnostic)', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 11, name: 'Shoulders Stretch Variation Four', bodyPart: 'shoulders', target: 'delts', equipment: 'stretches' },
    ]);
    const result = await selectExerciseForRequirement(
      { pattern: 'shoulder_mobility', bodyPart: 'shoulders-t9', muscleHint: 'shoulder-t9', role: 'mobility' },
      'home', 'beginner', new Set(),
    );
    assert.equal(result.exercise.id, '11');
    assert.equal(result.fallbackUsed, false);
  });
});
