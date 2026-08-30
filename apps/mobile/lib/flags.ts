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
