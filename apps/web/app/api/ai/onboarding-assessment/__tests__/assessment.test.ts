import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessment, checkAuthorization, buildUserPrompt } from '../assessment.ts';

const VALID_ASSESSMENT = {
  headline: 'Build muscle while staying consistent',
  summary: 'You are new to strength training and have some time to commit each week.',
  starting_point: {
    experience: 'New to strength training',
    available_time: '4-6 hours a week',
    main_barriers: ['confidence', 'knowledge'],
  },
  recommendation: {
    approach: 'personal_trainer',
    title: 'Start with guided sessions',
    reason: 'Low confidence and limited experience suggest coaching will help you start safely.',
  },
  weekly_plan: {
    strength_sessions: 2,
    cardio_sessions: 1,
    recovery_sessions: 1,
  },
  next_steps: ['Book an intro session', 'Track your first week'],
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

  test('rejects an invalid recommendation.approach value', () => {
    const bad = { ...VALID_ASSESSMENT, recommendation: { ...VALID_ASSESSMENT.recommendation, approach: 'ai_agent' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a non-array main_barriers', () => {
    const bad = { ...VALID_ASSESSMENT, starting_point: { ...VALID_ASSESSMENT.starting_point, main_barriers: 'confidence' } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects a negative weekly_plan value', () => {
    const bad = { ...VALID_ASSESSMENT, weekly_plan: { ...VALID_ASSESSMENT.weekly_plan, strength_sessions: -1 } };
    assert.equal(validateAssessment(bad), false);
  });

  test('rejects an empty next_steps array', () => {
    const bad = { ...VALID_ASSESSMENT, next_steps: [] };
    assert.equal(validateAssessment(bad), false);
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
    assert.ok(prompt.includes('"goal": "lose_weight"'));
    assert.ok(prompt.includes('"startingWeightKg": 80'));
  });
});
