import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGoalSupported, deriveSessionsPerWeek, deriveEquipmentLocation, deriveDurationWeeks,
  buildGenerationContext, buildTrainingStrategy, buildWorkoutSlots, workoutTypeSpec,
  buildStrengthRequirements, strengthDurationMinutes, FULL_BODY_A_REQUIREMENTS,
  type ProfileLike,
} from '../programme-generator.ts';

function profile(overrides: Partial<ProfileLike> = {}): ProfileLike {
  return {
    goal: 'lose_weight', experience_level: 'beginner', activity_level: 'occasional',
    preferred_activities: [], goal_target_date: null, ...overrides,
  };
}

describe('isGoalSupported', () => {
  test('supports the strength/general-fitness family', () => {
    for (const g of ['lose_weight', 'build_muscle', 'maintain_weight', 'general_fitness', 'body_recomposition']) {
      assert.equal(isGoalSupported(g as any), true, g);
    }
  });
  test('supports improve_running', () => {
    assert.equal(isGoalSupported('improve_running' as any), true);
  });
  test('does not support reduce_stress — not a safe/reliable exercise-programming goal', () => {
    assert.equal(isGoalSupported('reduce_stress' as any), false);
  });
  test('null/undefined goal is unsupported', () => {
    assert.equal(isGoalSupported(null), false);
    assert.equal(isGoalSupported(undefined), false);
  });
});

describe('deriveSessionsPerWeek', () => {
  test('inactive/occasional -> 2', () => {
    assert.equal(deriveSessionsPerWeek('inactive'), 2);
    assert.equal(deriveSessionsPerWeek('occasional'), 2);
    assert.equal(deriveSessionsPerWeek(null), 2);
  });
  test('active_2_3/active_4_plus/serious -> 3 (capped for V1)', () => {
    assert.equal(deriveSessionsPerWeek('active_2_3'), 3);
    assert.equal(deriveSessionsPerWeek('active_4_plus'), 3);
    assert.equal(deriveSessionsPerWeek('serious'), 3);
  });
});

describe('deriveEquipmentLocation', () => {
  test('gym in preferred_activities -> gym', () => {
    assert.equal(deriveEquipmentLocation(['gym', 'running']), 'gym');
  });
  test('no gym listed -> safe home default', () => {
    assert.equal(deriveEquipmentLocation(['running', 'yoga']), 'home');
    assert.equal(deriveEquipmentLocation(null), 'home');
    assert.equal(deriveEquipmentLocation([]), 'home');
  });
});

describe('deriveDurationWeeks', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  test('no target date -> 8-week default', () => {
    assert.equal(deriveDurationWeeks(null, start), 8);
  });
  test('a realistic target date within [4,16] weeks is used', () => {
    assert.equal(deriveDurationWeeks('2026-02-26', start), 8); // ~8 weeks out
  });
  test('an unrealistically close target date falls back to the default rather than a 1-week programme', () => {
    assert.equal(deriveDurationWeeks('2026-01-05', start), 8);
  });
  test('an unrealistically far target date falls back to the default rather than a 2-year programme', () => {
    assert.equal(deriveDurationWeeks('2027-06-01', start), 8);
  });
  test('an invalid date string falls back to the default', () => {
    assert.equal(deriveDurationWeeks('not-a-date', start), 8);
  });
});

describe('buildGenerationContext', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  test('maps real profile fields with no defaults recorded where data exists', () => {
    const ctx = buildGenerationContext(profile({ experience_level: 'intermediate', activity_level: 'active_2_3', preferred_activities: ['gym'] }), start);
    assert.equal(ctx.experience, 'intermediate');
    assert.equal(ctx.sessionsPerWeek, 3);
    assert.equal(ctx.equipmentLocation, 'gym');
    assert.ok(!ctx.defaultsUsed.includes('experience'));
    assert.ok(!ctx.defaultsUsed.includes('sessions_per_week'));
    assert.ok(!ctx.defaultsUsed.includes('equipment_location'));
  });

  test('missing experience_level defaults to beginner and is documented', () => {
    const ctx = buildGenerationContext(profile({ experience_level: null }), start);
    assert.equal(ctx.experience, 'beginner');
    assert.ok(ctx.defaultsUsed.includes('experience'));
  });

  test('session_duration_minutes is always a documented default — no onboarding input exists for it', () => {
    const ctx = buildGenerationContext(profile(), start);
    assert.equal(ctx.sessionDurationMinutes, 30);
    assert.ok(ctx.defaultsUsed.includes('session_duration_minutes'));
  });

  test('a null goal falls back to general_fitness', () => {
    const ctx = buildGenerationContext(profile({ goal: null }), start);
    assert.equal(ctx.goal, 'general_fitness');
  });
});

describe('buildTrainingStrategy', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  test('2 sessions/week strength goal -> Full Body A/B', () => {
    const ctx = buildGenerationContext(profile({ activity_level: 'inactive' }), start);
    const strategy = buildTrainingStrategy(ctx);
    assert.deepEqual(strategy.weeklyWorkoutTypes, ['full_body_a', 'full_body_b']);
  });

  test('3 sessions/week strength goal -> Full Body A/B alternating', () => {
    const ctx = buildGenerationContext(profile({ activity_level: 'active_2_3' }), start);
    const strategy = buildTrainingStrategy(ctx);
    assert.deepEqual(strategy.weeklyWorkoutTypes, ['full_body_a', 'full_body_b', 'full_body_a']);
  });

  test('improve_running at 3 sessions/week balances strength + easy + interval running', () => {
    const ctx = buildGenerationContext(profile({ goal: 'improve_running', activity_level: 'active_2_3' }), start);
    const strategy = buildTrainingStrategy(ctx);
    assert.deepEqual(strategy.weeklyWorkoutTypes, ['full_body_a', 'run_easy', 'run_intervals']);
  });

  test('explanation is a non-empty, goal-aware sentence', () => {
    const ctx = buildGenerationContext(profile(), start);
    const strategy = buildTrainingStrategy(ctx);
    assert.ok(strategy.explanation.length > 20);
    assert.match(strategy.explanation, /sessions a week/);
  });
});

describe('buildWorkoutSlots', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  test('produces sessionsPerWeek x durationWeeks slots, on the expected days', () => {
    const ctx = buildGenerationContext(profile({ activity_level: 'active_2_3' }), start);
    const strategy = buildTrainingStrategy(ctx);
    const slots = buildWorkoutSlots(strategy, ctx);
    assert.equal(slots.length, ctx.sessionsPerWeek * ctx.durationWeeks);
    const week1 = slots.filter(s => s.weekNumber === 1);
    assert.deepEqual(week1.map(s => s.dayOfWeek), ['monday', 'wednesday', 'saturday']);
  });

  test('every week repeats the exact same structure (no progression logic in V1)', () => {
    const ctx = buildGenerationContext(profile({ activity_level: 'active_2_3' }), start);
    const strategy = buildTrainingStrategy(ctx);
    const slots = buildWorkoutSlots(strategy, ctx);
    const week1Types = slots.filter(s => s.weekNumber === 1).map(s => s.workoutType);
    const week2Types = slots.filter(s => s.weekNumber === 2).map(s => s.workoutType);
    assert.deepEqual(week1Types, week2Types);
  });

  test('a strength slot carries movement requirements; an activity-block slot carries a description instead', () => {
    const ctx = buildGenerationContext(profile({ goal: 'improve_running', activity_level: 'active_2_3' }), start);
    const strategy = buildTrainingStrategy(ctx);
    const slots = buildWorkoutSlots(strategy, ctx);
    const strengthSlot = slots.find(s => s.workoutType === 'full_body_a')!;
    assert.equal(strengthSlot.isActivityBlock, false);
    assert.ok(strengthSlot.requirements && strengthSlot.requirements.length > 0);

    const runSlot = slots.find(s => s.workoutType === 'run_easy')!;
    assert.equal(runSlot.isActivityBlock, true);
    assert.ok(runSlot.activityDescription && runSlot.activityDescription.length > 0);
    assert.equal(runSlot.requirements, undefined);
  });
});

describe('workoutTypeSpec', () => {
  test('unknown workout type falls back to a safe default rather than throwing', () => {
    const spec = workoutTypeSpec('nonexistent');
    assert.equal(spec.isActivityBlock, true);
  });
});

// Chunk 4.5C2 — experience level must materially affect Strength duration
// and exercise volume, not just candidate-difficulty filtering/copy.
describe('strengthDurationMinutes', () => {
  test('beginner/intermediate/advanced defaults sit inside their guidance bands', () => {
    assert.equal(strengthDurationMinutes('beginner'), 40);
    assert.equal(strengthDurationMinutes('intermediate'), 55);
    assert.equal(strengthDurationMinutes('advanced'), 70);
  });

  test('advanced + an explicit 45-minute constraint is capped, not treated as intermediate', () => {
    const capped = strengthDurationMinutes('advanced', 45);
    assert.equal(capped, 45);
    assert.notEqual(capped, strengthDurationMinutes('intermediate')); // stays its own value, not silently equal to the intermediate default
  });

  test('an explicit constraint looser than the default never inflates duration beyond the tier default', () => {
    assert.equal(strengthDurationMinutes('advanced', 120), 70);
  });

  test('no explicit constraint (null/undefined) uses the tier default', () => {
    assert.equal(strengthDurationMinutes('beginner', null), 40);
    assert.equal(strengthDurationMinutes('beginner', undefined), 40);
  });
});

describe('buildStrengthRequirements', () => {
  test('beginner gets the base full-body list unchanged', () => {
    const reqs = buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'beginner');
    assert.equal(reqs.length, FULL_BODY_A_REQUIREMENTS.length);
    assert.deepEqual(reqs, FULL_BODY_A_REQUIREMENTS);
  });

  test('intermediate adds exactly one accessory movement beyond the base', () => {
    const reqs = buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'intermediate');
    assert.equal(reqs.length, FULL_BODY_A_REQUIREMENTS.length + 1);
    assert.deepEqual(reqs.slice(0, FULL_BODY_A_REQUIREMENTS.length), FULL_BODY_A_REQUIREMENTS); // base preserved verbatim, in order
  });

  test('advanced adds exactly two accessory movements beyond the base — not identical to beginner/intermediate volume', () => {
    const reqs = buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'advanced');
    assert.equal(reqs.length, FULL_BODY_A_REQUIREMENTS.length + 2);
    assert.notEqual(reqs.length, buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'beginner').length);
    assert.notEqual(reqs.length, buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'intermediate').length);
  });

  test('base list is never mutated by the extension', () => {
    const before = FULL_BODY_A_REQUIREMENTS.length;
    buildStrengthRequirements(FULL_BODY_A_REQUIREMENTS, 'advanced');
    assert.equal(FULL_BODY_A_REQUIREMENTS.length, before);
  });
});

describe('buildWorkoutSlots — experience-aware Strength prescription (Chunk 4.5C2)', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  test('an advanced profile gets a longer, higher-volume Strength slot than a beginner profile', () => {
    const beginnerCtx = buildGenerationContext(profile({ experience_level: 'beginner', activity_level: 'active_2_3' }), start);
    const advancedCtx = buildGenerationContext(profile({ experience_level: 'advanced', activity_level: 'active_2_3' }), start);

    const beginnerSlot = buildWorkoutSlots(buildTrainingStrategy(beginnerCtx), beginnerCtx).find(s => s.workoutType === 'full_body_a')!;
    const advancedSlot = buildWorkoutSlots(buildTrainingStrategy(advancedCtx), advancedCtx).find(s => s.workoutType === 'full_body_a')!;

    assert.equal(beginnerSlot.durationMinutes, 40);
    assert.equal(advancedSlot.durationMinutes, 70);
    assert.ok(advancedSlot.requirements!.length > beginnerSlot.requirements!.length);
  });

  test('an activity-block slot (e.g. an easy run) keeps the flat session default regardless of experience — mobility/running/walking are out of scope for this chunk', () => {
    const ctx = buildGenerationContext(profile({ goal: 'improve_running', experience_level: 'advanced', activity_level: 'active_2_3' }), start);
    const runSlot = buildWorkoutSlots(buildTrainingStrategy(ctx), ctx).find(s => s.workoutType === 'run_easy')!;
    assert.equal(runSlot.durationMinutes, ctx.sessionDurationMinutes);
  });
});
