import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreExerciseFit, rankExerciseCandidates } from '../exercise-fit-validator.ts';
import type { ExerciseRequirement } from '../programme-types.ts';
import type { ACPExercise } from '../exercise-types.ts';

function exercise(overrides: Partial<ACPExercise> = {}): ACPExercise {
  return {
    id: '1', provider: 'musclewiki', name: 'Barbell Squat', bodyPart: 'upper legs', target: 'Quads',
    secondaryMuscles: [], equipment: 'barbell', difficulty: 'beginner', category: 'Compound',
    description: null, instructions: [], media: [], ...overrides,
  };
}

function requirement(overrides: Partial<ExerciseRequirement> = {}): ExerciseRequirement {
  return { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound', ...overrides };
}

describe('scoreExerciseFit — the two Beta Readiness Step 1 bugs, directly', () => {
  test('a stretch is rejected for a squat requirement even though its muscle tag matches', () => {
    const result = scoreExerciseFit(requirement(), exercise({ name: 'Kneeling Quad Stretch', target: 'Quads', category: null }));
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('name_indicates_mobility_or_warmup'));
  });

  test('a push-up is rejected for a core requirement despite a fuzzy-search match', () => {
    const result = scoreExerciseFit(
      requirement({ pattern: 'core', bodyPart: 'waist', muscleHint: undefined, role: 'core' }),
      exercise({ name: 'TRX Pushup', target: 'Chest', secondaryMuscles: ['Front Shoulders'], category: 'Compound' }),
    );
    assert.equal(result.rejected, true);
  });
});

describe('scoreExerciseFit — appropriate matches score positively', () => {
  test('a real compound squat exercise is accepted with a healthy score', () => {
    const result = scoreExerciseFit(requirement(), exercise({ name: 'Barbell Squat', target: 'Quads', category: 'Compound' }));
    assert.equal(result.rejected, false);
    assert.ok(result.score > 40);
  });

  test('a genuine core exercise is accepted for a core requirement', () => {
    const result = scoreExerciseFit(
      requirement({ pattern: 'core', bodyPart: 'waist', muscleHint: undefined, role: 'core' }),
      exercise({ name: 'Cable Rope Crunch', target: 'Abdominals', category: 'Isolation' }),
    );
    assert.equal(result.rejected, false);
  });

  test('difficulty match adds to the score without being required for acceptance', () => {
    const matching = scoreExerciseFit(requirement(), exercise({ difficulty: 'beginner' }), 'beginner');
    const mismatched = scoreExerciseFit(requirement(), exercise({ difficulty: 'advanced' }), 'beginner');
    assert.ok(matching.score > mismatched.score);
    assert.equal(mismatched.rejected, false); // still a valid squat, just not the requested difficulty
  });
});

describe('scoreExerciseFit — unrelated muscle mismatch', () => {
  test('a bicep exercise is rejected for a squat requirement (no name red flag, but wrong muscle entirely)', () => {
    const result = scoreExerciseFit(requirement(), exercise({ name: 'Barbell Curl', target: 'Biceps', category: 'Isolation' }));
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('muscle_mismatch'));
  });
});

describe('rankExerciseCandidates', () => {
  test('deterministic ordering — best fit first, rejects excluded entirely', () => {
    const candidates: ACPExercise[] = [
      exercise({ id: 'a', name: 'Kneeling Quad Stretch', target: 'Quads' }), // rejected: name
      exercise({ id: 'b', name: 'Barbell Curl', target: 'Biceps' }),         // rejected: muscle mismatch
      exercise({ id: 'c', name: 'Leg Press', target: 'Quads', category: 'Compound', difficulty: 'advanced' }),
      exercise({ id: 'd', name: 'Bodyweight Squat', target: 'Quads', category: 'Compound', difficulty: 'beginner' }),
    ];
    const ranked = rankExerciseCandidates(requirement(), candidates, 'beginner');
    assert.equal(ranked.length, 2);
    assert.equal(ranked.map(r => r.exercise.id).includes('a'), false);
    assert.equal(ranked.map(r => r.exercise.id).includes('b'), false);
    // 'd' matches difficulty too, so it should rank at or above 'c'
    assert.equal(ranked[0].exercise.id, 'd');
  });

  test('an empty/all-rejected pool returns an empty ranked list, never a forced pick', () => {
    const candidates: ACPExercise[] = [exercise({ name: 'Hamstring Stretch', target: 'Hamstrings' })];
    const ranked = rankExerciseCandidates(requirement(), candidates);
    assert.deepEqual(ranked, []);
  });
});

// Generalization task (section 7/31) — mobility uses the SAME validator with
// an inverted policy: stretch/mobility names are exactly what we want, and
// heavy/explosive strength movement names are what must be rejected.
describe('scoreExerciseFit — mobility requirements (inverted policy from strength)', () => {
  function mobilityRequirement(overrides: Partial<ExerciseRequirement> = {}): ExerciseRequirement {
    return { pattern: 'hip_mobility', bodyPart: 'upper legs', muscleHint: 'hip', role: 'mobility', ...overrides };
  }

  test('a genuine hip mobility drill is accepted (never rejected the way it would be for a strength requirement)', () => {
    const result = scoreExerciseFit(mobilityRequirement(), exercise({ name: 'Kneeling Hip Flexor Stretch', target: 'Hip Flexors', category: null }));
    assert.equal(result.rejected, false);
    assert.ok(result.reasons.includes('muscle_match'));
  });

  test('a heavy barbell lift is rejected for a mobility requirement despite a muscle-tag overlap', () => {
    const result = scoreExerciseFit(mobilityRequirement(), exercise({ name: 'Barbell Back Squat', target: 'Hip Flexors', category: 'Compound' }));
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('name_indicates_heavy_strength_movement'));
  });

  test('an unrelated mobility drill (wrong area) is rejected on muscle mismatch, not name', () => {
    const result = scoreExerciseFit(
      mobilityRequirement({ pattern: 'shoulder_mobility', muscleHint: 'shoulder' }),
      exercise({ name: 'Ankle Circles', target: 'Ankle', category: null }),
    );
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('muscle_mismatch'));
  });

  test('rankExerciseCandidates for a mobility requirement excludes heavy lifts and unrelated drills, keeps genuine mobility work', () => {
    const candidates: ACPExercise[] = [
      exercise({ id: 'a', name: 'Barbell Deadlift', target: 'Hip Flexors', category: 'Compound' }), // rejected: heavy movement name
      exercise({ id: 'b', name: 'Ankle Circles', target: 'Ankle' }), // rejected: wrong area
      exercise({ id: 'c', name: '90/90 Hip Stretch', target: 'Hip Flexors', category: null }),
    ];
    const ranked = rankExerciseCandidates(mobilityRequirement(), candidates);
    assert.deepEqual(ranked.map(r => r.exercise.id), ['c']);
  });

  // Chunk 4.5C: found live — a canonical bodyweight COMPOUND strength
  // movement (push-up) was passing the mobility validator purely because it
  // matched the (too broad, since fixed) 'chest' keyword and earned the
  // bodyweight-equipment bonus. "Not on the original reject list" is not the
  // same claim as "is a good mobility exercise" (section 6).
  test('a push-up (canonical bodyweight strength movement) is rejected for a mobility requirement even though it is bodyweight and beginner', () => {
    const result = scoreExerciseFit(
      mobilityRequirement({ pattern: 'shoulder_mobility', muscleHint: 'shoulder' }),
      exercise({ name: 'Push Up', target: 'Chest', secondaryMuscles: ['Front Shoulders'], category: 'Compound', equipment: 'bodyweight' }),
    );
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('name_indicates_heavy_strength_movement'));
  });

  test('an explosive/ballistic movement (kettlebell swing) is rejected for a mobility requirement despite a muscle-area match', () => {
    const result = scoreExerciseFit(
      mobilityRequirement(),
      exercise({ name: 'Kettlebell Swing', target: 'Hip Flexors', equipment: 'kettlebell' }),
    );
    assert.equal(result.rejected, true);
    assert.ok(result.reasons.includes('name_indicates_heavy_strength_movement'));
  });

  test('a pure chest-targeting exercise (no shoulder/delt/rotator signal) no longer passes shoulder_mobility purely on the old broad "chest" keyword', () => {
    const result = scoreExerciseFit(
      mobilityRequirement({ pattern: 'shoulder_mobility', muscleHint: undefined }),
      exercise({ name: 'Cable Chest Fly', target: 'Chest', secondaryMuscles: [], equipment: 'cable' }),
    );
    // Rejected on the general "cable" resistance-equipment name signal AND
    // no longer earns a false muscle-match via 'chest' alone.
    assert.equal(result.rejected, true);
  });

  test('genuine mobility content with real positive evidence (stretch name + bodyweight equipment) scores higher than a bare muscle-match-only candidate', () => {
    const positiveEvidence = scoreExerciseFit(
      mobilityRequirement({ pattern: 'shoulder_mobility', muscleHint: undefined }),
      exercise({ name: 'Shoulder Stretch', target: 'Shoulders', equipment: 'bodyweight' }),
    );
    const muscleMatchOnly = scoreExerciseFit(
      mobilityRequirement({ pattern: 'shoulder_mobility', muscleHint: undefined }),
      exercise({ name: 'Dumbbell Shoulder Raise', target: 'Shoulders', equipment: 'dumbbell', difficulty: 'advanced' }),
    );
    assert.equal(positiveEvidence.rejected, false);
    assert.ok(positiveEvidence.score > muscleMatchOnly.score);
    assert.ok(positiveEvidence.reasons.includes('mobility_positive_name_match'));
    assert.ok(positiveEvidence.reasons.includes('mobility_friendly_equipment'));
  });
});
