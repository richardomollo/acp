import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { selectExerciseForRequirement, buildFallbackExercise } from '../../services/exercise-selection-service.ts';
import type { ExerciseRequirement } from '../programme-types.ts';

function requirement(overrides: Partial<ExerciseRequirement> = {}): ExerciseRequirement {
  return { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound', ...overrides };
}

// Real MuscleWiki contract (Beta Readiness Step 1): /search returns a bare
// array of full exercise objects, muscles live in `primary_muscles`, and
// `category` is the equipment field (e.g. "Barbell", "Dumbbell", "Bodyweight").
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
      { id: 1, name: 'Bodyweight Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
      { id: 2, name: 'Leg Press', primary_muscles: ['Quads'], category: 'Machine', difficulty: 'Beginner' },
    ]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t1', muscleHint: 'quad' }), 'home', 'beginner', new Set());
    assert.equal(result.exercise.id, '1');
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.sets, 3);
    assert.equal(result.reps, 10); // compound role
  });

  test('avoids an already-selected exercise when another candidate exists', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 1, name: 'Bodyweight Squat', primary_muscles: ['Quads'], category: 'Bodyweight', difficulty: 'Beginner' },
      { id: 2, name: 'Goblet Squat', primary_muscles: ['Quads'], category: 'Dumbbell', difficulty: 'Beginner' },
    ]);
    // "quads" (not "quad") — a different, still-valid substring of the mock's
    // muscle name, purely so this test gets its own exerciseService cache
    // entry instead of reusing the previous test's.
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t2', muscleHint: 'quads' }), 'home', 'beginner', new Set(['1']));
    assert.equal(result.exercise.id, '2');
  });

  test('relaxes the equipment/location filter when nothing home-friendly is available', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 1, name: 'Barbell Back Squat', primary_muscles: ['Quads'], category: 'Barbell', difficulty: 'Beginner' },
    ]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t3', muscleHint: 'qua' }), 'home', 'beginner', new Set());
    assert.equal(result.exercise.id, '1'); // no home-equipment match exists, so the only real candidate wins over the hardcoded fallback
    assert.equal(result.fallbackUsed, false);
  });

  test('falls back to a safe built-in bodyweight exercise when the provider has nothing at all', async () => {
    globalThis.fetch = mockSearchResponse([]);
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'legs-t4', muscleHint: 'no-match-t4' }), 'home', 'beginner', new Set());
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.exercise.id, 'fallback-squat');
    assert.equal(result.exercise.equipment, 'bodyweight');
  });

  test('never throws when the provider errors — falls back instead', async () => {
    globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
    const result = await selectExerciseForRequirement(requirement({ bodyPart: 'chest-t5', pattern: 'horizontal_push', muscleHint: 'no-match-t5' }), 'home', 'beginner', new Set());
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.exercise.id, 'fallback-horizontal_push');
  });

  test('sets/reps/rest come from the requirement role, not the exercise itself', async () => {
    globalThis.fetch = mockSearchResponse([]);
    const core = await selectExerciseForRequirement(requirement({ pattern: 'core', bodyPart: 'waist-t6', muscleHint: undefined, role: 'core' }), 'home', 'beginner', new Set());
    assert.equal(core.reps, 15);
    assert.equal(core.restSeconds, 45);
  });

  test('an equipment value with different spacing/casing than ACP’s own convention still matches home equipment (e.g. real "Bodyweight" vs historical "body weight")', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 3, name: 'Push Up', primary_muscles: ['Chest'], category: 'Bodyweight', difficulty: 'Beginner' },
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

// Chunk 4.5C live-audit bug fix: MuscleWiki uses "Dumbbells"/"Kettlebells"
// (plural) but ACP's HOME_EQUIPMENT only listed the singular forms, so
// every dumbbell/kettlebell candidate was silently excluded from every
// 'home' generation — pushing selection toward worse candidates further
// down the relaxation ladder. Also covers the new home-friendly equipment
// categories ('stretches'/'recovery'/'pilates'/'yoga') found live to be
// real MuscleWiki mobility-content equipment tags.
describe('home-equipment vocabulary (Chunk 4.5C regression)', () => {
  test('plural "Dumbbells"/"Kettlebells" now match home, same as the singular forms', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 10, name: 'Dumbbell Shoulder External Rotation', primary_muscles: ['Shoulders'], category: 'Dumbbells', difficulty: 'Beginner' },
    ]);
    const result = await selectExerciseForRequirement(
      { pattern: 'vertical_push', bodyPart: 'shoulders-t8', muscleHint: 'shoulder', role: 'compound' },
      'home', 'beginner', new Set(),
    );
    assert.equal(result.exercise.id, '10');
    assert.equal(result.fallbackUsed, false);
  });

  test('"Stretches" and "Recovery" equipment categories are treated as home-friendly (real no-equipment mobility content)', async () => {
    globalThis.fetch = mockSearchResponse([
      { id: 11, name: 'Shoulders Stretch Variation Four', primary_muscles: ['Shoulders'], category: 'Stretches', difficulty: 'Beginner' },
    ]);
    const result = await selectExerciseForRequirement(
      { pattern: 'shoulder_mobility', bodyPart: 'shoulders-t9', muscleHint: 'shoulder-t9', role: 'mobility' },
      'home', 'beginner', new Set(),
    );
    assert.equal(result.exercise.id, '11');
    assert.equal(result.fallbackUsed, false);
  });
});
