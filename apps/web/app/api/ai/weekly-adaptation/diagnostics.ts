// Day 6.5 — dev/test-only structured instrumentation for validating the
// weekly-adaptation pipeline end-to-end. A no-op unless explicitly enabled
// (ACP_DEBUG_ADAPTATION=1), so it can never fire in production by accident.
// Callers must only ever pass plan/activity-shape data (days, categories,
// durations, counts) — never userId, accessToken, email, name, or any other
// PII/auth material. No new database table; stdout only.
const ENABLED = process.env.ACP_DEBUG_ADAPTATION === '1';

export function logAdaptationStage(stage: string, data: Record<string, unknown>): void {
  if (!ENABLED) return;
  console.log(JSON.stringify({ stage, ...data }));
}
