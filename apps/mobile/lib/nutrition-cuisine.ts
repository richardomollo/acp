// ACP Intelligence™ Day 7.2 — canonical cuisine taxonomy + deterministic
// cuisine-preference matching. Pure, framework-free — mirrors the
// conventions of lib/programme-generator.ts / lib/exercise-fit-validator.ts
// (no LLM, no embeddings, no randomness).
//
// Cuisine preference is a SOFT ranking signal here, never a hard filter —
// this preserves lib/nutrition-matching.ts's existing, already-live Day 5
// principle ("cuisine is a ranking signal, not exclusive filter, Part 24")
// rather than silently changing established behaviour. 'mixed' and "no
// preference set" both mean "no narrow restriction", matching section 5/38
// of the Day 7.2 spec.
export type CanonicalCuisine =
  | 'kenyan' | 'east_african' | 'mediterranean' | 'south_asian' | 'indian'
  | 'middle_eastern' | 'east_asian' | 'western' | 'european' | 'global';

export const CANONICAL_CUISINES: readonly CanonicalCuisine[] = [
  'kenyan', 'east_african', 'mediterranean', 'south_asian', 'indian',
  'middle_eastern', 'east_asian', 'western', 'european', 'global',
];

// User-facing labels (section 37) — canonical storage values stay
// machine-safe snake_case; only the UI needs the readable form.
export const CUISINE_LABEL: Record<CanonicalCuisine, string> = {
  kenyan: 'Kenyan',
  east_african: 'East African',
  mediterranean: 'Mediterranean',
  south_asian: 'South Asian',
  indian: 'Indian',
  middle_eastern: 'Middle Eastern',
  east_asian: 'East Asian',
  western: 'Western',
  european: 'European',
  global: 'Global',
};

// A user preference for one cuisine reasonably includes its closest
// sibling too (section 23's own examples: 'indian' preference -> Indian AND
// South Asian eligible). Not a hard filter (see module header) — only used
// to compute the soft cuisineFit signal below.
const CUISINE_GROUPS: Record<string, CanonicalCuisine[]> = {
  kenyan: ['kenyan', 'east_african'],
  east_african: ['kenyan', 'east_african'],
  indian: ['indian', 'south_asian'],
  south_asian: ['indian', 'south_asian'],
  mediterranean: ['mediterranean'],
  middle_eastern: ['middle_eastern'],
  east_asian: ['east_asian'],
  western: ['western', 'european'],
  european: ['western', 'european'],
  global: ['global'],
};

export function normalizeCuisine(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isCanonicalCuisine(value: string): value is CanonicalCuisine {
  return (CANONICAL_CUISINES as readonly string[]).includes(value);
}

/**
 * Soft cuisine-fit signal for ranking (never excludes a meal — see module
 * header): 1 = matches an explicit preference (or its sibling group), 0.5 =
 * neutral (no preference set, or preference is 'mixed'/global-eligible), 0 =
 * a meal outside every stated preference's group.
 */
export function cuisineFitScore(mealCuisine: string, preferences: string[]): number {
  if (preferences.length === 0) return 0.5; // section 38 — no preference set, still valid
  if (preferences.includes('mixed')) return 0.5; // section 5/28 — global eligibility, no restriction
  const eligible = new Set(preferences.flatMap(p => CUISINE_GROUPS[normalizeCuisine(p)] ?? [normalizeCuisine(p) as CanonicalCuisine]));
  return eligible.has(mealCuisine as CanonicalCuisine) ? 1 : 0;
}
