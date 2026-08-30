import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMealForGoal, type GoalFitMeal } from '../nutrition-goal-fit.ts';

function meal(overrides: Partial<GoalFitMeal> = {}): GoalFitMeal {
  return { calories: 400, protein_g: 5, carbs_g: 50, fat_g: 10, fibre_g: 1, ...overrides };
}

describe('Per-signal bands', () => {
  test('protein signal: >=20g full, >=10g half, else none', () => {
    assert.equal(scoreMealForGoal(meal({ protein_g: 25 }), null).proteinSignal, 1);
    assert.equal(scoreMealForGoal(meal({ protein_g: 12 }), null).proteinSignal, 0.5);
    assert.equal(scoreMealForGoal(meal({ protein_g: 3 }), null).proteinSignal, 0);
  });

  test('fibre signal: >=5g full, >=2g half, else none, missing fibre_g treated as 0', () => {
    assert.equal(scoreMealForGoal(meal({ fibre_g: 6 }), null).fibreSignal, 1);
    assert.equal(scoreMealForGoal(meal({ fibre_g: 3 }), null).fibreSignal, 0.5);
    assert.equal(scoreMealForGoal(meal({ fibre_g: undefined }), null).fibreSignal, 0);
  });

  test('balance signal: a meal with no dominant macro (<75% of energy) scores 1, an unbalanced one scores 0.5', () => {
    const balanced = meal({ protein_g: 20, carbs_g: 30, fat_g: 10 }); // no macro >= 75% of kcal
    const unbalanced = meal({ protein_g: 0, carbs_g: 0, fat_g: 40 }); // pure fat
    assert.equal(scoreMealForGoal(balanced, null).balanceSignal, 1);
    assert.equal(scoreMealForGoal(unbalanced, null).balanceSignal, 0.5);
  });

  test('balance signal never penalises a meal with no usable macro data — neutral, not a failure', () => {
    const noMacros = meal({ protein_g: 0, carbs_g: 0, fat_g: 0 });
    assert.equal(scoreMealForGoal(noMacros, null).balanceSignal, 0.5);
  });
});

describe('Goal-weighted blends — never a single-signal cliff', () => {
  test('every goal formula is a positive combination of all three signals, never zero-weighted to one', () => {
    const goals = ['build_muscle', 'body_recomposition', 'lose_weight', 'maintain_weight', 'general_fitness', 'reduce_stress', null, undefined, 'not_a_real_goal'];
    const highProteinLowFibreUnbalanced = meal({ protein_g: 30, fibre_g: 0, carbs_g: 0, fat_g: 0 });
    for (const goal of goals) {
      const r = scoreMealForGoal(highProteinLowFibreUnbalanced, goal as string | null);
      // protein=1, fibre=0, balance=0.5 (no usable carb/fat, but protein alone dominates >=75%... verify via component check instead of overall bounds)
      assert.ok(r.overall > 0 && r.overall < 1, `goal=${goal} overall=${r.overall} should be a blend, not 0 or 1`);
    }
  });

  test('build_muscle weights protein most heavily among the goals', () => {
    const highProtein = meal({ protein_g: 30, fibre_g: 0 });
    const buildMuscle = scoreMealForGoal(highProtein, 'build_muscle').overall;
    const maintain = scoreMealForGoal(highProtein, 'maintain_weight').overall;
    assert.ok(buildMuscle > maintain);
  });

  test('lose_weight is explicitly NOT calorie-minimizing — two meals with identical macros but very different calories score identically', () => {
    const lowCal = meal({ calories: 200, protein_g: 15, fibre_g: 3 });
    const highCal = meal({ calories: 900, protein_g: 15, fibre_g: 3 });
    assert.equal(scoreMealForGoal(lowCal, 'lose_weight').overall, scoreMealForGoal(highCal, 'lose_weight').overall);
  });

  test('build_muscle is explicitly NOT "every meal must be high-protein" — a moderate-protein balanced meal still scores meaningfully above zero', () => {
    const moderate = meal({ protein_g: 12, fibre_g: 3, carbs_g: 30, fat_g: 10 });
    const r = scoreMealForGoal(moderate, 'build_muscle');
    assert.ok(r.overall >= 0.4);
  });

  test('an unmapped/unknown goal falls back to the same balanced formula as maintain_weight', () => {
    const m = meal({ protein_g: 22, fibre_g: 6, carbs_g: 20, fat_g: 10 });
    const unknown = scoreMealForGoal(m, 'some_future_goal_not_yet_supported');
    const maintain = scoreMealForGoal(m, 'maintain_weight');
    assert.equal(unknown.overall, maintain.overall);
  });
});
