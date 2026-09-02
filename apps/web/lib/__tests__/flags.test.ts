import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isWeeklyAdaptationEnabled, isRagEnabled, isExecutionFeedbackEnabled, isNutritionCoachingEnabled, isNutritionCameraEnabled, isNutritionSavedMealsEnabled, isNutritionFitnessContextEnabled, isNutritionAdviceEffectivenessEnabled, isNutritionOutcomeIntelligenceEnabled, flagSnapshot } from '../flags.ts';

const KEYS = ['ACP_WEEKLY_ADAPTATION_ENABLED', 'ACP_RAG_ENABLED', 'ACP_EXECUTION_FEEDBACK_ENABLED'];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('operational kill switches', () => {
  test('all default to ENABLED when unset', () => {
    assert.equal(isWeeklyAdaptationEnabled(), true);
    assert.equal(isRagEnabled(), true);
    assert.equal(isExecutionFeedbackEnabled(), true);
  });

  test('only the exact string "false" disables a flag', () => {
    process.env.ACP_RAG_ENABLED = 'false';
    assert.equal(isRagEnabled(), false);
    process.env.ACP_RAG_ENABLED = '0';
    assert.equal(isRagEnabled(), true);
    process.env.ACP_RAG_ENABLED = 'FALSE';
    assert.equal(isRagEnabled(), true);
    process.env.ACP_RAG_ENABLED = 'true';
    assert.equal(isRagEnabled(), true);
  });

  test('flags are independent', () => {
    process.env.ACP_WEEKLY_ADAPTATION_ENABLED = 'false';
    assert.equal(isWeeklyAdaptationEnabled(), false);
    assert.equal(isRagEnabled(), true);
    assert.equal(isExecutionFeedbackEnabled(), true);
  });

  test('flagSnapshot reflects current env', () => {
    process.env.ACP_EXECUTION_FEEDBACK_ENABLED = 'false';
    assert.deepEqual(flagSnapshot(), { weeklyAdaptation: true, rag: true, executionFeedback: false, nutritionCoaching: true, nutritionCamera: true, nutritionSavedMeals: true, nutritionFitnessContext: true, nutritionAdviceEffectiveness: true, nutritionOutcomeIntelligence: true });
  });

  test('ACP_NUTRITION_COACHING_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_NUTRITION_COACHING_ENABLED;
    assert.equal(isNutritionCoachingEnabled(), true);
    process.env.ACP_NUTRITION_COACHING_ENABLED = 'true';
    assert.equal(isNutritionCoachingEnabled(), true);
    process.env.ACP_NUTRITION_COACHING_ENABLED = 'false';
    assert.equal(isNutritionCoachingEnabled(), false);
    delete process.env.ACP_NUTRITION_COACHING_ENABLED;
  });

  test('ACP_NUTRITION_CAMERA_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_NUTRITION_CAMERA_ENABLED;
    assert.equal(isNutritionCameraEnabled(), true);
    process.env.ACP_NUTRITION_CAMERA_ENABLED = 'true';
    assert.equal(isNutritionCameraEnabled(), true);
    process.env.ACP_NUTRITION_CAMERA_ENABLED = '0';
    assert.equal(isNutritionCameraEnabled(), true);
    process.env.ACP_NUTRITION_CAMERA_ENABLED = 'false';
    assert.equal(isNutritionCameraEnabled(), false);
    assert.equal(flagSnapshot().nutritionCamera, false);
    delete process.env.ACP_NUTRITION_CAMERA_ENABLED;
  });

  test('ACP_NUTRITION_SAVED_MEALS_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_NUTRITION_SAVED_MEALS_ENABLED;
    assert.equal(isNutritionSavedMealsEnabled(), true);
    process.env.ACP_NUTRITION_SAVED_MEALS_ENABLED = 'true';
    assert.equal(isNutritionSavedMealsEnabled(), true);
    process.env.ACP_NUTRITION_SAVED_MEALS_ENABLED = '0';
    assert.equal(isNutritionSavedMealsEnabled(), true);
    process.env.ACP_NUTRITION_SAVED_MEALS_ENABLED = 'false';
    assert.equal(isNutritionSavedMealsEnabled(), false);
    assert.equal(flagSnapshot().nutritionSavedMeals, false);
    delete process.env.ACP_NUTRITION_SAVED_MEALS_ENABLED;
  });

  test('ACP_NUTRITION_FITNESS_CONTEXT_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_NUTRITION_FITNESS_CONTEXT_ENABLED;
    assert.equal(isNutritionFitnessContextEnabled(), true);
    process.env.ACP_NUTRITION_FITNESS_CONTEXT_ENABLED = 'true';
    assert.equal(isNutritionFitnessContextEnabled(), true);
    process.env.ACP_NUTRITION_FITNESS_CONTEXT_ENABLED = '0';
    assert.equal(isNutritionFitnessContextEnabled(), true);
    process.env.ACP_NUTRITION_FITNESS_CONTEXT_ENABLED = 'false';
    assert.equal(isNutritionFitnessContextEnabled(), false);
    assert.equal(flagSnapshot().nutritionFitnessContext, false);
    delete process.env.ACP_NUTRITION_FITNESS_CONTEXT_ENABLED;
  });

  test('ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED;
    assert.equal(isNutritionAdviceEffectivenessEnabled(), true);
    process.env.ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED = 'true';
    assert.equal(isNutritionAdviceEffectivenessEnabled(), true);
    process.env.ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED = '0';
    assert.equal(isNutritionAdviceEffectivenessEnabled(), true);
    process.env.ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED = 'false';
    assert.equal(isNutritionAdviceEffectivenessEnabled(), false);
    assert.equal(flagSnapshot().nutritionAdviceEffectiveness, false);
    delete process.env.ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED;
  });

  test('ACP_OUTCOME_INTELLIGENCE_ENABLED — off only for exactly "false"', () => {
    delete process.env.ACP_OUTCOME_INTELLIGENCE_ENABLED;
    assert.equal(isNutritionOutcomeIntelligenceEnabled(), true);
    process.env.ACP_OUTCOME_INTELLIGENCE_ENABLED = 'true';
    assert.equal(isNutritionOutcomeIntelligenceEnabled(), true);
    process.env.ACP_OUTCOME_INTELLIGENCE_ENABLED = '0';
    assert.equal(isNutritionOutcomeIntelligenceEnabled(), true);
    process.env.ACP_OUTCOME_INTELLIGENCE_ENABLED = 'false';
    assert.equal(isNutritionOutcomeIntelligenceEnabled(), false);
    assert.equal(flagSnapshot().nutritionOutcomeIntelligence, false);
    delete process.env.ACP_OUTCOME_INTELLIGENCE_ENABLED;
  });
});
