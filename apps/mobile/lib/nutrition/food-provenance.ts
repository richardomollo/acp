// ACP Intelligence™ — Nutrition N7.5B. Honest, concise provenance disclosure
// for a canonical food/dish. Deterministic string mapping only; it changes
// no nutrient arithmetic (§22) — it just makes the ORIGIN of the numbers
// legible to the user.

import type { CompositionMethod } from './food-types.ts';

/** The one-line disclosure for a food's portion/detail view, or `null` when
 *  no disclosure is warranted (a direct authoritative composition). */
export function foodProvenanceDisclosure(
  compositionMethod: CompositionMethod | null,
  recipeSource?: string | null,
): string | null {
  switch (compositionMethod) {
    case 'standard_recipe_estimated':
      return 'Standard recipe — nutrition is estimated and can vary by preparation.';
    case 'standard_recipe_verified':
      return 'Standard recipe.';
    case 'proxy_composition':
      return recipeSource
        ? `Nutrition is based on ${recipeSource}.`
        : 'Nutrition is based on a close cooked-food match and is approximate.';
    case 'direct_verified':
    case null:
    default:
      return null;
  }
}

/** A very short tag for a search-result row — kept minimal so results stay
 *  scannable (§13). `null` for anything that needs no tag. */
export function foodProvenanceTag(compositionMethod: CompositionMethod | null): string | null {
  if (compositionMethod === 'standard_recipe_estimated' || compositionMethod === 'standard_recipe_verified') {
    return 'standard recipe';
  }
  if (compositionMethod === 'proxy_composition') return 'approximate';
  return null;
}
