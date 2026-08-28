import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSupportStyle, buildPlanSummary, deriveActivityLevel,
  describeWorkHours, describeSportHours, describeLeisureHours,
  isStep2Complete, resolveOnboardingResumeStep, buildFallbackWeekPlan,
  EMPTY_ANSWERS, type OnboardingAnswers,
} from '../onboarding.ts';

describe('deriveActivityLevel', () => {
  test('maps weekly sport hours to the closest activity-level tier', () => {
    assert.equal(deriveActivityLevel(0), 'inactive');
    assert.equal(deriveActivityLevel(0.5), 'inactive');
    assert.equal(deriveActivityLevel(1), 'occasional');
    assert.equal(deriveActivityLevel(2.9), 'occasional');
    assert.equal(deriveActivityLevel(3), 'active_2_3');
    assert.equal(deriveActivityLevel(4.9), 'active_2_3');
    assert.equal(deriveActivityLevel(5), 'active_4_plus');
    assert.equal(deriveActivityLevel(7.9), 'active_4_plus');
    assert.equal(deriveActivityLevel(8), 'serious');
    assert.equal(deriveActivityLevel(20), 'serious');
  });
});

describe('starting-point slider descriptive labels', () => {
  test('describeWorkHours buckets weekly work hours', () => {
    assert.equal(describeWorkHours(0), 'Not currently working');
    assert.equal(describeWorkHours(20), 'Part-time desk work');
    assert.equal(describeWorkHours(40), 'Full-time desk work');
    assert.equal(describeWorkHours(55), 'Long hours / physically demanding work');
  });

  test('describeSportHours reuses the activity-level labels', () => {
    assert.equal(describeSportHours(0), 'Mostly inactive');
    assert.equal(describeSportHours(2), 'Occasionally active');
    assert.equal(describeSportHours(4), 'Active 2–3× a week');
    assert.equal(describeSportHours(6), 'Active 4+× a week');
    assert.equal(describeSportHours(10), 'I train seriously');
  });

  test('describeLeisureHours buckets remaining weekly hours', () => {
    assert.equal(describeLeisureHours(5), 'Packed schedule, very little downtime');
    assert.equal(describeLeisureHours(20), 'A modest amount of downtime');
    assert.equal(describeLeisureHours(45), 'A healthy amount of downtime');
    assert.equal(describeLeisureHours(90), 'Plenty of free time to recover and recharge');
  });
});

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

  test('weight loss: goal weight can be higher than current weight, same as build strength', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      startingWeightKg: 65,
      goalWeightKg: 70,
      goalTargetDate: '2026-12-15',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Gain 5 kg by December 2026');
  });

  test('gain weight: computes the kg difference (target minus current) and formats the date', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'build_muscle',
      startingWeightKg: 70,
      goalWeightKg: 78,
      goalTargetDate: '2026-11-01',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Gain 8 kg by November 2026');
  });

  test('gain weight: falls back to the goal label when no weights were set', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'build_muscle' };
    assert.equal(buildPlanSummary(answers).goalLine, 'Build strength');
  });

  test('gain weight: goal weight equal to current weight is allowed (build muscle without gaining)', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'build_muscle',
      startingWeightKg: 75,
      goalWeightKg: 75,
      goalTargetDate: '2026-11-01',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Build muscle while maintaining your current weight');
  });

  test('gain weight: goal weight can be lower than current weight (recomposition)', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'build_muscle',
      startingWeightKg: 85,
      goalWeightKg: 80,
      goalTargetDate: '2026-11-01',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Lose 5 kg by November 2026');
  });

  test('maintain weight: derives the goal line from a single chosen focus area', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'maintain_weight',
      goalDetails: { health_focus: ['energy'] },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Maintain a healthy weight — focus on energy');
  });

  test('maintain weight: joins multiple chosen focus areas', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'maintain_weight',
      goalDetails: { health_focus: ['energy', 'fitness', 'sleep_recovery'] },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Maintain a healthy weight — focus on energy, fitness and sleep/recovery');
  });

  test('maintain weight: falls back to a generic line when no focus was set', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'maintain_weight' };
    assert.equal(buildPlanSummary(answers).goalLine, 'Maintain a healthy weight');
  });

  test('maintain weight: once weight fields are set, uses the same weight-diff line as build strength', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'maintain_weight',
      startingWeightKg: 70,
      goalWeightKg: 70,
      goalTargetDate: '2026-12-15',
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Maintain your current weight');
  });

  test('reduce stress: derives the goal line from the chosen focus area', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'reduce_stress',
      goalDetails: { health_focus: ['sleep_recovery'] },
    };
    assert.equal(buildPlanSummary(answers).goalLine, 'Reduce stress — focus on sleep/recovery');
  });

  test('reduce stress: falls back to a generic line when no focus was set', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'reduce_stress' };
    assert.equal(buildPlanSummary(answers).goalLine, 'Reduce stress & improve wellbeing');
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

describe('resolveOnboardingResumeStep', () => {
  const base: OnboardingAnswers = { ...EMPTY_ANSWERS };

  test('sends a user with no goal back to step 1', () => {
    assert.equal(resolveOnboardingResumeStep(base, false), '/onboarding/goal');
  });

  test('sends a user with an incomplete step 2 back to step 2', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'lose_weight' };
    assert.equal(isStep2Complete(answers), false);
    assert.equal(resolveOnboardingResumeStep(answers, false), '/onboarding/success');
  });

  test('weight loss step 2 requires strength experience, same as build strength', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      startingWeightKg: 80,
      goalWeightKg: 72,
      goalTargetDate: '2026-12-15',
    };
    assert.equal(isStep2Complete(answers), false);
    assert.equal(isStep2Complete({ ...answers, strengthExperience: 'beginner' }), true);
  });

  test('maintain weight step 2 requires weight fields + strength experience, same as build strength', () => {
    const answers: OnboardingAnswers = { ...base, goal: 'maintain_weight', goalDetails: { health_focus: ['energy'] } };
    assert.equal(isStep2Complete(answers), false);
    assert.equal(isStep2Complete({
      ...base, goal: 'maintain_weight',
      startingWeightKg: 70, goalWeightKg: 70, goalTargetDate: '2026-12-15', strengthExperience: 'beginner',
    }), true);
  });

  test('sends a user who finished step 2 but not the activity hours back to step 3', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'lose_weight',
      startingWeightKg: 80,
      goalWeightKg: 72,
      goalTargetDate: '2026-12-15',
      strengthExperience: 'beginner',
    };
    assert.equal(isStep2Complete(answers), true);
    assert.equal(resolveOnboardingResumeStep(answers, false), '/onboarding/starting-point');
  });

  test('sends a user who finished step 3 but has no barriers back to step 4', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'maintain_weight',
      startingWeightKg: 70,
      goalWeightKg: 70,
      goalTargetDate: '2026-12-15',
      strengthExperience: 'beginner',
    };
    assert.equal(resolveOnboardingResumeStep(answers, true), '/onboarding/barriers');
  });

  test('sends a user who finished step 4 but has no preferred activities to step 5', () => {
    const answers: OnboardingAnswers = {
      ...base,
      goal: 'maintain_weight',
      startingWeightKg: 70,
      goalWeightKg: 70,
      goalTargetDate: '2026-12-15',
      strengthExperience: 'beginner',
      barriers: ['time'],
    };
    assert.equal(resolveOnboardingResumeStep(answers, true), '/onboarding/activities');
  });

});

describe('buildFallbackWeekPlan (no-AI fallback: basic first-week structure)', () => {
  test('derives day slots deterministically from the approach array', () => {
    const plan = buildFallbackWeekPlan(['Strength', 'Cardio']);
    assert.ok(plan.length > 0);
    assert.ok(plan.every(item => typeof item.day === 'string' && typeof item.label === 'string'));
  });

  test('ignores approach areas with no day mapping (e.g. Nutrition, Community)', () => {
    const plan = buildFallbackWeekPlan(['Nutrition', 'Community']);
    assert.deepEqual(plan, []);
  });

  test('is fully deterministic — same input always produces the same output', () => {
    const a = buildFallbackWeekPlan(['Strength', 'Movement']);
    const b = buildFallbackWeekPlan(['Strength', 'Movement']);
    assert.deepEqual(a, b);
  });
});
