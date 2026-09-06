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

// Beta Feedback #019 — geographic gating of marketplace supply. Off only when
// exactly "false". This is a cross-cutting change (Discover, category screens,
// Home marketplace modules, plan fulfilment, professional support), so it
// carries a kill switch: when off, every marketplace surface reverts to the
// pre-#019 behaviour (no location resolution, no geo-scoped queries, no
// unsupported-market state) while all non-marketplace features are unaffected
// either way. Location is still never requested at startup.
export function isMarketplaceGeoGatingEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LANA_MARKETPLACE_GEO_GATING_ENABLED !== 'false';
}

// Beta Feedback #020 — the weekly measurement check-in (Home card + one
// supplemental local notification per due window). Off only when exactly
// "false". When off: no Home check-in card, no measurement notification is
// scheduled, and any already-scheduled one is left alone until the app
// naturally clears it. The existing "My Goals" check-in card and all
// progress/measurement features are unaffected either way.
export function isMeasurementCheckinEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LANA_MEASUREMENT_CHECKIN_ENABLED !== 'false';
}

// Beta Feedback #022 — adaptive daily nutrition planning + learning loop on
// Today Nutrition (Log this / Swap / Portion / "Having something else?").
// Deliberately OPT-IN (on only when exactly "true"), unlike every flag above —
// this is new, undeployed, unverified-on-device behaviour, not a rollback
// switch for something already shipped. Off (the default): the existing
// "no active meal plan → suggested meals" behaviour is completely unchanged,
// and every nutritionist-assigned meal_plans path is unaffected either way
// (this feature never touches that path, on or off).
export function isAdaptiveNutritionEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LANA_ADAPTIVE_NUTRITION_ENABLED === 'true';
}

// Phase 4.5 / 4.6 — professional → consumer continuity: the "From your coach"
// Home card + agreed-action list, the /coach-update screen, and the evolved
// /trainer-tasks screen, all fed by get_client_session_feed. Off ONLY when
// exactly "false" (kill switch, default on). When off: Home makes NO
// continuity fetch and renders no coach card/actions; the generated plan,
// measurement check-in and every other Home surface are unchanged; any
// professional_session_records already written stay in the DB, just not
// surfaced. Rollback needs no schema change.
export function isProfessionalContinuityEnabled(): boolean {
  return process.env.EXPO_PUBLIC_LANA_PROFESSIONAL_CONTINUITY_ENABLED !== 'false';
}
