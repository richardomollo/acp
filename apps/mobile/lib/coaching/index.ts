// ACP Intelligence™ Day 8 — coaching experience & explainability layer.
// Deterministic, no network, no LLM. See individual modules for detail.
export * from './types.ts';
export { compareWeeklyPlans, describePlanChanges, normalizeWeekday, MEANINGFUL_MINUTES_RATIO, MEANINGFUL_MINUTES_FLOOR } from './plan-comparison.ts';
export { buildPlanExplanation, type PlanExplanationInput } from './plan-explanation.ts';
export { buildWeeklyCoachingBrief, type WeeklyCoachingBriefInput } from './coaching-brief.ts';
export { buildProgressExplanation, type ProgressExplanationInput } from './progress-explanation.ts';
export { findBannedPhrases, assertUserSafeCoachingText } from './copy-safety.ts';
