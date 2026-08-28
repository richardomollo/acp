// Deterministic weight-outcome progress — no AI call, ever. Handles both
// loss and gain directions from real stored values only (never fabricated).

export interface WeightProgress {
  direction: 'loss' | 'gain';
  startingKg: number;
  currentKg: number;
  goalKg: number;
  progressKg: number;   // always >= 0, how far moved toward the goal
  remainingKg: number;  // always >= 0, how far still to go
  percent: number;      // clamped 0-100
}

// Returns null whenever there isn't a genuine weight target to measure
// against (no goal set, or goal === starting — nothing to progress toward).
export function computeWeightProgress(
  startingKg: number | null | undefined,
  currentKg: number | null | undefined,
  goalKg: number | null | undefined,
): WeightProgress | null {
  if (startingKg == null || currentKg == null || goalKg == null) return null;
  if (startingKg === goalKg) return null;

  const direction: 'loss' | 'gain' = goalKg < startingKg ? 'loss' : 'gain';
  const totalTargetChange = Math.abs(goalKg - startingKg);
  // Signed movement toward the goal from the starting point — negative if
  // the user has moved away from their target rather than toward it.
  const signedProgress = direction === 'loss' ? startingKg - currentKg : currentKg - startingKg;

  const progressKg = Math.max(0, signedProgress);
  const remainingKg = Math.max(0, totalTargetChange - progressKg);
  const percent = Math.max(0, Math.min(100, Math.round((progressKg / totalTargetChange) * 100)));

  return { direction, startingKg, currentKg, goalKg, progressKg, remainingKg, percent };
}
