// ACP Intelligence™ Day 10 — client kill switches (§20-22).
//
// Expo inlines EXPO_PUBLIC_* env vars at build time. A flag is off ONLY when
// its value is exactly "false"; anything else (including unset) = enabled.
// Mirrors the server flags in apps/web/lib/flags.ts.

export function isExecutionFeedbackEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_EXECUTION_FEEDBACK_ENABLED !== 'false';
}

export function isIntelligenceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_INTELLIGENCE_ENABLED !== 'false';
}

// Nutrition N4 — the evidence-grounded coaching section on Today Nutrition.
// Off only when exactly "false". When off, Today / History / References
// (N1–N3) still render fully; only the coaching cards are hidden.
export function isNutritionCoachingEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_NUTRITION_COACHING_ENABLED !== 'false';
}

// Nutrition N5 — camera-assisted food logging. Off only when exactly "false".
// When off, Log-food hides its "Take a photo" / "Choose from library" entry
// and logging works by search exactly as before; nothing downstream changes.
export function isNutritionCameraEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_NUTRITION_CAMERA_ENABLED !== 'false';
}

// Nutrition N6 — saved meals ("My meals"). Off only when exactly "false".
// When off, every "My meals" entry point is hidden and N1–N5 keep working;
// any saved meals already created stay in the DB, just not reachable.
export function isNutritionSavedMealsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_NUTRITION_SAVED_MEALS_ENABLED !== 'false';
}

// Nutrition N7 — fitness × nutrition context observations on Today Nutrition.
// Off only when exactly "false". When off, the "Your activity & nutrition"
// section is absent, N7 makes NO extra data fetch, and N1–N6 plus all
// fitness intelligence are unchanged.
export function isNutritionFitnessContextEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_NUTRITION_FITNESS_CONTEXT_ENABLED !== 'false';
}

// Nutrition N8 — advice-effectiveness ("What's changed") on Today Nutrition.
// Off only when exactly "false". When off: NO coaching-exposure rows are
// written, NO effectiveness reads happen, and N1–N7 are unchanged.
export function isNutritionAdviceEffectivenessEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_NUTRITION_ADVICE_EFFECTIVENESS_ENABLED !== 'false';
}

// Nutrition N9 — outcome intelligence ("What ACP is learning") on the Fitness
// Journey screen. Longitudinal, deterministic, OBSERVATIONAL — never causal.
// Off only when exactly "false". When off: NO extra reads happen, the
// "What ACP is learning" section is absent, and N1–N8 plus every fitness
// intelligence surface are unchanged.
export function isNutritionOutcomeIntelligenceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACP_OUTCOME_INTELLIGENCE_ENABLED !== 'false';
}
