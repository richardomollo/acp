// ACP Intelligence™ Day 10 — operational kill switches (§20-22).
//
// Three env-controlled flags. Each defaults to ENABLED; a flag is off ONLY
// when its env var is exactly the string "false". These are incident
// controls, not a feature-management platform — keep the count at three.
//
//   ACP_WEEKLY_ADAPTATION_ENABLED=false
//     → the weekly-adaptation route returns the user's CURRENT plan
//       unchanged (never an error, never a regenerate). Onboarding,
//       My Plan, completion and execution feedback are unaffected.
//
//   ACP_RAG_ENABLED=false
//     → weekly adaptation still runs, with no RELEVANT ACP KNOWLEDGE block
//       (identical to a live RAG outage, which is already handled).
//
//   ACP_EXECUTION_FEEDBACK_ENABLED=false
//     → the adaptation prompt gets no EXECUTION EVIDENCE block and no
//       execution-pattern coaching memory is written. Completion, partial
//       and skip still work; the mobile feedback UI hides itself via the
//       matching EXPO_PUBLIC_ flag.

function isOff(name: string): boolean {
  return process.env[name] === 'false';
}

export function isWeeklyAdaptationEnabled(): boolean {
  return !isOff('ACP_WEEKLY_ADAPTATION_ENABLED');
}

export function isRagEnabled(): boolean {
  return !isOff('ACP_RAG_ENABLED');
}

export function isExecutionFeedbackEnabled(): boolean {
  return !isOff('ACP_EXECUTION_FEEDBACK_ENABLED');
}

//   ACP_NUTRITION_COACHING_ENABLED=false
//     → the nutrition-coaching route returns 503; the mobile Nutrition
//       screen hides its whole "coaching" section via the matching
//       EXPO_PUBLIC_ flag. Nutrition logging, Today totals, history and the
//       N3 reference comparisons are all unaffected.
export function isNutritionCoachingEnabled(): boolean {
  return !isOff('ACP_NUTRITION_COACHING_ENABLED');
}

//   ACP_NUTRITION_CAMERA_ENABLED=false
//     → the nutrition-photo-analysis route returns 503; the mobile Log-food
//       screen hides its "Take a photo" / "Choose from library" entry via the
//       matching EXPO_PUBLIC_ flag and users log foods by search exactly as
//       before. The camera only ever assists creating normal N1 food
//       evidence — nothing downstream depends on it (N5 §4/§37).
export function isNutritionCameraEnabled(): boolean {
  return !isOff('ACP_NUTRITION_CAMERA_ENABLED');
}

//   ACP_NUTRITION_SAVED_MEALS_ENABLED=false
//     → the mobile "My meals" (saved meals) feature hides every entry point
//       via the matching EXPO_PUBLIC_ flag. N6 has no server route — this
//       flag exists so the beta feature has a documented kill switch and the
//       snapshot stays a complete mirror of the client flags. N1–N5 are
//       unaffected either way (N6 §47).
export function isNutritionSavedMealsEnabled(): boolean {
  return !isOff('ACP_NUTRITION_SAVED_MEALS_ENABLED');
}

//   ACP_NUTRITION_FITNESS_CONTEXT_ENABLED=false
//     → the mobile "Your activity & nutrition" (N7 cross-domain context)
//       section hides via the matching EXPO_PUBLIC_ flag. N7 has no server
//       route and is fully deterministic — this flag exists for a documented
//       beta kill switch and a complete client-flag mirror. N1–N6 and all
//       fitness intelligence are unaffected (N7 §39).
export function isNutritionFitnessContextEnabled(): boolean {
  return !isOff('ACP_NUTRITION_FITNESS_CONTEXT_ENABLED');
}

//   ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED=false
//     → the mobile "What's changed" (N8 advice-effectiveness) section hides
//       and no coaching-exposure rows are written, via the matching
//       EXPO_PUBLIC_ flag. N8 has no server route and is fully deterministic
//       — this flag exists for a documented beta kill switch and a complete
//       client-flag mirror. N1–N7 are unaffected either way (N8 §40).
export function isNutritionAdviceEffectivenessEnabled(): boolean {
  return !isOff('ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED');
}

//   ACP_OUTCOME_INTELLIGENCE_ENABLED=false
//     → the mobile "What ACP is learning" (N9 outcome intelligence) section
//       on the Fitness Journey screen hides and no longitudinal reads happen,
//       via the matching EXPO_PUBLIC_ flag. N9 has no server route and is
//       fully deterministic — this flag exists for a documented beta kill
//       switch and a complete client-flag mirror. N1–N8 are unaffected
//       either way (N9 §41).
export function isNutritionOutcomeIntelligenceEnabled(): boolean {
  return !isOff('ACP_OUTCOME_INTELLIGENCE_ENABLED');
}

/** Snapshot for a single structured log line at request start. */
export function flagSnapshot(): { weeklyAdaptation: boolean; rag: boolean; executionFeedback: boolean; nutritionCoaching: boolean; nutritionCamera: boolean; nutritionSavedMeals: boolean; nutritionFitnessContext: boolean; nutritionAdviceEffectiveness: boolean; nutritionOutcomeIntelligence: boolean } {
  return {
    weeklyAdaptation: isWeeklyAdaptationEnabled(),
    rag: isRagEnabled(),
    executionFeedback: isExecutionFeedbackEnabled(),
    nutritionCoaching: isNutritionCoachingEnabled(),
    nutritionCamera: isNutritionCameraEnabled(),
    nutritionSavedMeals: isNutritionSavedMealsEnabled(),
    nutritionFitnessContext: isNutritionFitnessContextEnabled(),
    nutritionAdviceEffectiveness: isNutritionAdviceEffectivenessEnabled(),
    nutritionOutcomeIntelligence: isNutritionOutcomeIntelligenceEnabled(),
  };
}
