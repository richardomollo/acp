// LH-39 — deterministic, conservative WEIGHT-DIRECTION fit for meal ranking.
//
// Pure, framework-free (same discipline as lib/nutrition-goal-fit.ts): no
// React Native, no Supabase, no LLM, no Math.random().
//
// WHAT THIS IS. The coarse `goal` string (build_muscle / lose_weight / …)
// already drives lib/nutrition-goal-fit.ts's protein/fibre/balance emphasis.
// It does NOT know the direction the user's own weights imply — "Build
// strength while going 73 → 80 kg" and "Build strength while going 90 → 80
// kg" are the same goal but opposite scale directions, and suggested meals
// should lean with that direction, not ignore it. This module adds that lean
// as a small, bounded, POOL-RELATIVE ranking signal.
//
// WHAT THIS IS NOT (LH-39 §5/§6/§8/§15):
//   • NOT "gain = the highest-calorie foods, loss = the lowest-calorie".
//     Every direction still rewards protein and macro balance; a light meal
//     is never excluded for a gain goal, a calorie-dense high-protein/fibre
//     meal still ranks well for a loss goal.
//   • NOT an absolute target. Every comparison is against the MEDIAN of the
//     actual candidate pool for that slot — nothing here computes or implies
//     a kcal/BMR/TDEE/surplus number, and the caller never surfaces one.
//   • NOT a hard filter. The caller blends this at a low weight, so a
//     genuinely better goal/cuisine match always wins.
//
// Uses only fields the real `meals` table actually has (calories, protein_g,
// fibre_g) plus the balance signal nutrition-goal-fit.ts already computes.

/** The scale direction implied by current vs goal weight — the exact value
 *  lib/onboarding-validation.ts's `validateGoalDirection` returns (LH-04). */
export type WeightDirection = 'loss' | 'gain' | 'none' | 'unknown';

export interface DirectionalFitMeal {
  calories: number;
  protein_g: number;
  fibre_g?: number | null;
  /** 0 | 0.5 | 1 — the meal's macro-balance signal from nutrition-goal-fit.ts.
   *  Kept as an input (not recomputed here) so balance stays defined in ONE
   *  place. */
  balanceSignal: number;
}

export interface PoolReference {
  medianCalories: number;
  medianProtein: number;
  medianFibre: number;
  /** false when the pool was empty — callers then treat every meal as neutral. */
  hasData: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Reference points for one slot's candidate pool. Deterministic — a function
 * of the pool alone. `calories`/`protein_g` are read with a 0 fallback,
 * matching how the rest of the nutrition code already tolerates the nullable
 * `meals` columns.
 */
export function buildPoolReference(
  pool: { calories?: number | null; protein_g?: number | null; fibre_g?: number | null }[],
): PoolReference {
  return {
    medianCalories: median(pool.map(m => m.calories ?? 0)),
    medianProtein: median(pool.map(m => m.protein_g ?? 0)),
    medianFibre: median(pool.map(m => m.fibre_g ?? 0)),
    hasData: pool.length > 0,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * A 0..1 directional-fit score for one meal, relative to its slot's pool.
 *
 *   'none' / 'unknown' / no pool data  → 0.5 (perfectly neutral — the caller's
 *                                        ranking is then unchanged).
 *   'gain'  → rewards meals at/above the pool's typical energy AND protein,
 *             while still weighting macro balance; a below-median meal keeps a
 *             meaningful non-zero score (never excluded).
 *   'loss'  → rewards protein- and fibre-forward meals (satiety per calorie)
 *             and gently favours lighter meals; a calorie-dense meal that is
 *             high protein AND high fibre still scores strongly (quality is
 *             never overridden by "lowest calorie wins").
 *
 * Bounded so the term can only ever nudge, never dominate: 'gain' ∈ [0.325, 1],
 * 'loss' ∈ [0.46, 1].
 */
export function directionalFitScore(
  meal: DirectionalFitMeal,
  direction: WeightDirection,
  ref: PoolReference,
): number {
  if (!ref.hasData || (direction !== 'gain' && direction !== 'loss')) return 0.5;

  const energyAtOrAboveTypical = (meal.calories ?? 0) >= ref.medianCalories;
  const proteinAtOrAboveTypical = (meal.protein_g ?? 0) >= ref.medianProtein;
  const fibreAtOrAboveTypical = (meal.fibre_g ?? 0) >= ref.medianFibre;
  const balance = clamp01(meal.balanceSignal);

  if (direction === 'gain') {
    return clamp01(
      0.5 * (energyAtOrAboveTypical ? 1 : 0.35) +
      0.3 * (proteinAtOrAboveTypical ? 1 : 0.5) +
      0.2 * balance,
    );
  }

  // direction === 'loss'
  return clamp01(
    0.4 * (proteinAtOrAboveTypical ? 1 : 0.4) +
    0.3 * (fibreAtOrAboveTypical ? 1 : 0.5) +
    0.3 * (energyAtOrAboveTypical ? 0.5 : 1),
  );
}
