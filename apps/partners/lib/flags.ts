// Product decision — client task assignment ("From your coach" agreed
// actions / the client_tasks table) is disabled on both the PT-authoring
// side (this constant, checked in app/pt-client/[clientId].tsx) and the
// customer-facing side (apps/mobile's isProfessionalContinuityEnabled(),
// same product decision, gated separately since these are different apps).
// Also mirrored in apps/web/lib/flags.ts's CLIENT_TASKS_ENABLED for the
// Lana Pro session workspace and the legacy /pt-dashboard client page.
// Hardcoded rather than env-based — avoids needing separate dashboard
// configuration across three independent apps that could silently drift
// out of sync. Existing client_tasks rows are untouched; only new creation
// is blocked. Rollback: flip back to true, no schema change needed.
export const CLIENT_TASKS_ENABLED = false;
