// ACP Intelligence™ — Nutrition Catalogue V1 · Production Deployment Package.
//
// Deterministic aggregator: the single list of all 120 approved
// international meal SOURCES (data only — no DB access, no nutrient
// arithmetic), assembled by concatenating the six approved batch files in
// order. See scripts/deploy-nutrition-catalogue.ts for the authoring-time
// tool that actually composes and inserts these.
//
// Deliberately RE-EXPORTS the batch arrays rather than re-typing or copying
// their contents (Production Deployment Package spec §6 — "Do not duplicate
// meal definitions manually into multiple places if avoidable"), so this
// file can never drift from the approved, already-reviewed batch sources.

import type { ComposeMealInput } from '../meal-composer.ts';
import { BATCH1_EUROPEAN_WESTERN } from './batch1-european-western.ts';
import { BATCH2_EUROPEAN_WESTERN } from './batch2-european-western.ts';
import { BATCH3_MEDITERRANEAN } from './batch3-mediterranean.ts';
import { BATCH4_MEDITERRANEAN } from './batch4-mediterranean.ts';
import { BATCH5_GLOBAL } from './batch5-global.ts';
import { BATCH6_GLOBAL } from './batch6-global.ts';

/**
 * One ingredient line, referenced by the EXACT `foods.name` the deployment
 * script resolves to a real food id — never a fabricated id. Every
 * BatchNIngredientLine across all six batch files is structurally identical
 * to this (verified at authoring time); this is the one canonical name for
 * that shape going forward.
 */
export interface CatalogueIngredientLine {
  foodName: string;
  grams: number;
}

/**
 * Same shape as ComposeMealInput, but `ingredients` reference food NAMES
 * (resolved to ids by the deployment script against the live `foods` table)
 * instead of ids directly. Structurally identical to every BatchNMealSource.
 */
export type CatalogueMealSource = Omit<ComposeMealInput, 'ingredients'> & {
  ingredients: CatalogueIngredientLine[];
};

/**
 * All 120 approved international meal sources, in batch/authoring order.
 * European/Western (Batch 1 + 2) = 40, Mediterranean (Batch 3 + 4) = 40,
 * Global (Batch 5 + 6) = 40 — the approved Catalogue V1 target.
 */
export const ALL_INTERNATIONAL_MEALS: CatalogueMealSource[] = [
  ...BATCH1_EUROPEAN_WESTERN,
  ...BATCH2_EUROPEAN_WESTERN,
  ...BATCH3_MEDITERRANEAN,
  ...BATCH4_MEDITERRANEAN,
  ...BATCH5_GLOBAL,
  ...BATCH6_GLOBAL,
] as CatalogueMealSource[];

export const CATALOGUE_V1_EXPECTED_TOTAL = 120;

export interface CatalogueIntegrityReport {
  total: number;
  cuisineCounts: Record<string, number>;
  /** 'western' + 'european' counted together, matching the approved
   *  "European/Western = 40" target — the batches were never split into two
   *  separately-tracked halves for release purposes. */
  cuisineGroupCounts: { european_western: number; mediterranean: number; global: number; other: number };
  /** This schema has no separate `occasion` column — `category`
   *  (breakfast/lunch/dinner/snack/smoothie) IS the occasion axis used
   *  throughout the catalogue content batches (8/6/6, 2/9/9 splits). */
  categoryCounts: Record<string, number>;
  duplicateRecipeReferences: string[];
  emptyIngredientMeals: string[];
  missingProvenance: string[];
  ok: boolean;
}

/**
 * Pure, offline structural check of the source data itself — no DB, no
 * network call. Both the aggregator's own test and the deployment script's
 * dry-run summary call this so the check is defined exactly once.
 */
export function checkCatalogueIntegrity(meals: CatalogueMealSource[] = ALL_INTERNATIONAL_MEALS): CatalogueIntegrityReport {
  const cuisineCounts: Record<string, number> = {};
  const cuisineGroupCounts = { european_western: 0, mediterranean: 0, global: 0, other: 0 };
  const categoryCounts: Record<string, number> = {};
  const seenRefs = new Map<string, number>();
  const duplicateRecipeReferences: string[] = [];
  const emptyIngredientMeals: string[] = [];
  const missingProvenance: string[] = [];

  for (const m of meals) {
    cuisineCounts[m.cuisine] = (cuisineCounts[m.cuisine] ?? 0) + 1;
    if (m.cuisine === 'western' || m.cuisine === 'european') cuisineGroupCounts.european_western++;
    else if (m.cuisine === 'mediterranean') cuisineGroupCounts.mediterranean++;
    else if (m.cuisine === 'global') cuisineGroupCounts.global++;
    else cuisineGroupCounts.other++;

    categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1;

    const ref = m.recipeReference?.trim();
    if (ref) {
      const n = (seenRefs.get(ref) ?? 0) + 1;
      seenRefs.set(ref, n);
      if (n === 2) duplicateRecipeReferences.push(ref);
    }
    if (!m.ingredients || m.ingredients.length === 0) emptyIngredientMeals.push(m.name);
    if (!m.compositionMethod || !m.recipeSource?.trim() || !ref) missingProvenance.push(m.name);
  }

  const ok = meals.length === CATALOGUE_V1_EXPECTED_TOTAL
    && duplicateRecipeReferences.length === 0
    && emptyIngredientMeals.length === 0
    && missingProvenance.length === 0
    && cuisineGroupCounts.european_western === 40
    && cuisineGroupCounts.mediterranean === 40
    && cuisineGroupCounts.global === 40
    && cuisineGroupCounts.other === 0;

  return { total: meals.length, cuisineCounts, cuisineGroupCounts, categoryCounts, duplicateRecipeReferences, emptyIngredientMeals, missingProvenance, ok };
}
