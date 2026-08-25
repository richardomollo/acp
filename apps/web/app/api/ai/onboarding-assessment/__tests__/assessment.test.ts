import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAssessment, checkAuthorization, buildUserPrompt,
  deriveCategoryCounts, sumDurationMinutes, enforceTimeBudget, getWeeklyMinutesBudget,
  AI_REQUEST_CONFIG, SYSTEM_PROMPT,
} from '../assessment.ts';

const VALID_ASSESSMENT = {
  headline: 'You’re already putting in the work. Let’s make it count.',
  summary: 'You train regularly and want to build muscle, with nutrition and cost as your main barriers.',
  starting_point: {
    experience: 'Intermediate strength training experience',
    available_time: '4+ sessions a week',
    main_barriers: ['nutrition', 'cost'],
  },
  recommendation: {
    approach: 'nutrition_support',
    title: 'Nutrition is your biggest opportunity',
    reason: 'Professional guidance is an option if you’d like help creating an approach that fits your goals and budget.',
  },
  starting_plan: {
    title: 'Your first week',
    rationale: 'You already train regularly, so the priority is maintaining consistent strength work.',
    activities: [
      { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Continue your normal programme.' },
      { day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Consistency over volume.' },
      { day: 'Friday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'challenging', title: 'Strength session', description: 'Third session of the week.' },
      { day: 'Saturday', category: 'cardio', activity: 'Football', duration_minutes: 60, intensity: 'moderate', title: 'Football', description: 'Use an activity you enjoy for conditioning.' },
    ],
  },
  weekly_focus: {
    title: 'Nutrition consistency',
    description: 'Spend a few days understanding what you currently eat before changing anything.',
  },
  next_steps: ['Track your normal meals for a few days', 'Review how the week felt on Sunday'],
};

describe('validateAssessment', () => {
  test('accepts a well-formed assessment matching the schema', () => {
    assert.equal(validateAssessment(VALID_ASSESSMENT), true);
  });

  test('rejects a non-object', () => {
    assert.equal(validateAssessment(null), false);
    assert.equal(validateAssessment('a string'), false);
  });

  test('rejects a missing required top-level field', () => {
    const { headline, ...rest } = VALID_ASSESSMENT;
    assert.equal(validateAssessment(rest), false);
  });

  test('rejects an invalid recommendation.approach value (old Day-1 enum no longer accepted)', () => {
    const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: 'personal_trainer' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a non-array main_barriers', () => {
    const bad = { ...VALID_ASSESSMENT, starting_point: { ...VALID_ASSESSMENT.starting_point, main_barriers: 'nutrition' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an empty starting_plan.activities array', () => {
    const bad = { ...VALID_ASSESSMENT, starting_plan: { ...VALID_ASSESSMENT.starting_plan, activities: [] } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an activity with an invalid category', () => {
    const bad = {
      ...VALID_ASSESSMENT,
      starting_plan: {
        ...VALID_ASSESSMENT.starting_plan,
        activities: [{ ...VALID_ASSESSMENT.starting_plan.activities[0], category: 'swimming' }],
      },
    };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a missing weekly_focus', () => {
    const { weekly_focus, ...rest } = VALID_ASSESSMENT;
    assert.equal(validateAssessment(rest), false);
  });

  test('rejects more than 3 next_steps', () => {
    const bad = { ...VALID_ASSESSMENT, next_steps: ['a', 'b', 'c', 'd'] };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an empty next_steps array', () => {
    assert.equal(validateAssessment({ ...VALID_ASSESSMENT, next_steps: [] }), false);
  });
});

describe('deriveCategoryCounts', () => {
  test('counts activities by category — this is the single source of truth for session counts', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    assert.deepEqual(counts, { strength: 3, cardio: 1 });
  });

  test('never produces a count that disagrees with the activities array length', () => {
    const counts = deriveCategoryCounts(VALID_ASSESSMENT.starting_plan.activities);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    assert.equal(total, VALID_ASSESSMENT.starting_plan.activities.length);
  });
});

describe('sumDurationMinutes', () => {
  test('sums duration_minutes across all activities', () => {
    assert.equal(sumDurationMinutes(VALID_ASSESSMENT.starting_plan.activities), 240);
  });
});

describe('getWeeklyMinutesBudget', () => {
  test('maps known activity levels to a conservative minutes budget when no explicit hours are given', () => {
    assert.equal(getWeeklyMinutesBudget('inactive'), 90);
    assert.equal(getWeeklyMinutesBudget('occasional'), 120);
    assert.equal(getWeeklyMinutesBudget('active_2_3'), 180);
    assert.equal(getWeeklyMinutesBudget('active_4_plus'), 240);
    assert.equal(getWeeklyMinutesBudget('serious'), 300);
  });

  test('falls back to a conservative default for unknown/missing activity level', () => {
    assert.equal(getWeeklyMinutesBudget(null), 120);
    assert.equal(getWeeklyMinutesBudget(undefined), 120);
    assert.equal(getWeeklyMinutesBudget('made_up_value'), 120);
  });

  test('prefers the user\'s own stated weekly training hours over the activityLevel proxy when given', () => {
    // 5 hours/week stated explicitly should win over the "inactive" bucket's 90-min proxy.
    assert.equal(getWeeklyMinutesBudget('inactive', 5), 300);
  });

  test('treats 0 stated hours as canonical too (not "missing")', () => {
    assert.equal(getWeeklyMinutesBudget('active_4_plus', 0), 0);
  });

  test('ignores an invalid sportHoursPerWeek value and falls back to the activityLevel proxy', () => {
    assert.equal(getWeeklyMinutesBudget('occasional', -5), 120);
    assert.equal(getWeeklyMinutesBudget('occasional', NaN), 120);
    assert.equal(getWeeklyMinutesBudget('occasional', 'not a number' as any), 120);
  });
});

describe('enforceTimeBudget', () => {
  test('leaves a plan untouched when it already fits the budget', () => {
    const activities = VALID_ASSESSMENT.starting_plan.activities; // 240 min total
    const result = enforceTimeBudget(activities, 240);
    assert.equal(result.length, 4);
  });

  test('trims trailing activities until the total fits within a 15% tolerance', () => {
    const activities = VALID_ASSESSMENT.starting_plan.activities; // 240 min total, 4 activities
    const result = enforceTimeBudget(activities, 90); // tolerance = 103.5
    assert.ok(sumDurationMinutes(result) <= 90 * 1.15);
    assert.ok(result.length < activities.length);
  });

  test('never trims below one activity even if it alone exceeds the budget', () => {
    const activities = [VALID_ASSESSMENT.starting_plan.activities[0]]; // 60 min, single activity
    const result = enforceTimeBudget(activities, 10);
    assert.equal(result.length, 1);
  });
});

describe('checkAuthorization', () => {
  test('rejects when the token failed to resolve a user', () => {
    const result = checkAuthorization(null, 'user-1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  test('rejects when userId is missing or not a string', () => {
    const result = checkAuthorization({ id: 'user-1' }, undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  test('rejects when the authenticated user does not match the requested userId', () => {
    const result = checkAuthorization({ id: 'user-1' }, 'user-2');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  test('accepts when the authenticated user matches userId', () => {
    const result = checkAuthorization({ id: 'user-1' }, 'user-1');
    assert.equal(result.ok, true);
  });
});

describe('buildUserPrompt', () => {
  test('includes the onboarding answers as JSON in the prompt', () => {
    const answers = { goal: 'lose_weight', startingWeightKg: 80, goalWeightKg: 72 };
    const prompt = buildUserPrompt(answers);
    assert.ok(prompt.includes('"goal":"lose_weight"'));
    assert.ok(prompt.includes('"startingWeightKg":80'));
  });

  test('includes an explicit weekly minutes budget derived from activityLevel when no explicit hours are given', () => {
    const prompt = buildUserPrompt({ goal: 'lose_weight', activityLevel: 'active_2_3' });
    assert.ok(prompt.includes('180 minutes'));
    assert.ok(prompt.includes('estimated from their current activity level'));
  });

  test('uses the user\'s own stated training hours as the canonical budget when given, and says so', () => {
    const prompt = buildUserPrompt({ goal: 'lose_weight', activityLevel: 'inactive' }, 5);
    assert.ok(prompt.includes('300 minutes')); // 5 hrs * 60, not the "inactive" 90-min proxy
    assert.ok(prompt.includes("user's own stated 5 training hours/week"));
  });
});

describe('SYSTEM_PROMPT guardrails (regression coverage — not testing exact AI prose)', () => {
  test('explicitly rules out personal_training preference alone as a support-recommendation trigger', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('personal_training') && SYSTEM_PROMPT.toLowerCase().includes('not by itself enough'));
  });

  test('still instructs commercial neutrality (self_directed as default, no named providers)', () => {
    assert.ok(SYSTEM_PROMPT.includes('self_directed'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('never name a specific'));
  });

  test('still instructs the core safety constraints', () => {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('no diagnosis'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('no guaranteed outcomes'));
  });

  test('still instructs that starting_plan.activities is the single source of truth for counts', () => {
    assert.ok(SYSTEM_PROMPT.includes('starting_plan.activities'));
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes('single source of truth'));
  });
});

describe('AI_REQUEST_CONFIG (latency optimisation)', () => {
  test('uses minimal reasoning effort', () => {
    assert.equal(AI_REQUEST_CONFIG.reasoning_effort, 'minimal');
  });

  test('caps output tokens', () => {
    assert.ok(AI_REQUEST_CONFIG.max_completion_tokens > 0);
    assert.ok(AI_REQUEST_CONFIG.max_completion_tokens < 3000);
  });

  test('never sets temperature — this model only supports its default and errors on any other value (confirmed empirically)', () => {
    assert.equal((AI_REQUEST_CONFIG as any).temperature, undefined);
  });
});
