// ACP Intelligence™ Day 2 — programme ownership/trainer-protection decision.
// Pure and zero-dependency so it's directly unit-testable: an active
// TRAINER_CREATED/TRAINER_MODIFIED programme must never be regenerated or
// replaced by ACP (Day 2 section 22, non-negotiable).
export function decideProgrammeAction(
  active: { source: string } | null,
): 'generate' | 'already_active' | 'trainer_active' {
  if (!active) return 'generate';
  if (active.source !== 'ACP_GENERATED') return 'trainer_active';
  return 'already_active';
}
