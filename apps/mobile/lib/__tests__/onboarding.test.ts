import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSupportStyle, buildPlanSummary, EMPTY_ANSWERS, type OnboardingAnswers } from '../onboarding.ts';

describe('deriveSupportStyle', () => {
  test('weighs confidence/knowledge/consistency/motivation toward beginner support', () => {
    assert.equal(deriveSupportStyle(['confidence', 'knowledge']), 'beginner_support');
  });

  test('weighs accountability/nutrition/time toward goal support', () => {
    assert.equal(deriveSupportStyle(['accountability', 'nutrition']), 'goal_support');
  });

  test('returns balanced_support when signals are equal (including none selected)', () => {
    assert.equal(deriveSupportStyle([]), 'balanced_support');
    assert.equal(deriveSupportStyle(['confidence', 'accountability']), 'balanced_support');
  });

  test('a barrier outside both signal sets (e.g. cost) does not tip the balance', () => {
    assert.equal(deriveSupportStyle(['cost']), 'balanced_support');
  });
});

describe('buildPlanSummary', () => {
  const base: OnboardingAnswers = { ...EMPTY_ANSWERS };

  test('weight loss: computes the kg difference and formats the target month/year', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      startingWeightKg: 80,
      goalWeightKg: 72,
      goalTargetDate: '2026-12-15',
      activityLevel: 'occasional',
    };
    const summary = buildPlanSummary(answers);
    assert.equal(summary.goalLine, 'Lose 8 kg by December 2026');
    assert.equal(summary.startingPointLine, 'Occasionally active');
  });

  test('weight loss: rounds fractional kg differences to one decimal', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      startingWeightKg: 80.4,
      goalWeightKg: 72.1,
      goalTargetDate: '2026-12-15',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Lose 8.3 kg by December 2026');
  });

  test('running: formats the target 5K time as m:ss and includes the target date', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'improve_running',
      goalTargetDate: '2026-11-01',
      goalDetails: { target_5k_seconds: 24 * 60 + 5 },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Run a 5K in 24:05 by November 2026');
  });

  test('running: falls back to a generic line when no target time was set', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'improve_running' };
    assert.equal(buildPlanSummary(answers).goalLine, 'Improve your 5K time');
  });

  test('strength: uses the selected strength target label', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'build_muscle',
      goalDetails: { strength_target: 'visible_muscle' },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Build visible muscle');
  });

  test('health: derives the goal line from the chosen focus area', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'improve_health',
      goalDetails: { health_focus: 'energy' },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Improve your energy');
  });

  test('recommended approach always includes at least one item and de-duplicates', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      barriers: ['nutrition', 'accountability'],
    };
    const { approach } = buildPlanSummary(answers);
    assert.ok(approach.length > 0);
    assert.equal(new Set(approach).size, approach.length);
    assert.ok(approach.includes('Strength'));
    assert.ok(approach.includes('Cardio'));
    assert.ok(approach.includes('Nutrition'));
    assert.ok(approach.includes('Community'));
  });

  test('never surfaces the internal P1/P2-style support_style label as the focus line', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'lose_weight', barriers: ['confidence'] };
    const { focusLine } = buildPlanSummary(answers);
    assert.ok(!focusLine.toLowerCase().includes('p1'));
    assert.ok(!focusLine.toLowerCase().includes('p2'));
    assert.ok(!focusLine.toLowerCase().includes('support'));
  });
});
