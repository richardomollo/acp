// ACP Intelligence™ — Nutrition #022. The canonical meal candidate model.
//
// Lana already has TWO real meal sources: the curated `meals` catalogue
// (admin-authored dishes) and `saved_meals` (#018/N6 — user recipes built
// from canonical-food components or a saved estimate). This module does NOT
// invent a third storage concept — it defines one pure, in-memory shape both
// sources normalise into, so the orchestrator/ranking/portion logic never
// needs to know which table a candidate came from.
//
// A "meal" here is a RECOMMENDATION CANDIDATE — never evidence of what was
// eaten. Consumed evidence stays exactly where N1 already puts it
// (food_log_entries); this module never writes nutrition numbers of its own.

import type { MealSlot } from './food-types.ts';

export type MealCandidateSource = 'catalogue' | 'saved_meal';

/** The five macro fields Lana's catalogue/saved-meal data actually carries
 *  (mirrors MACRO_KEYS in food-types.ts) — never a full micronutrient vector,
 *  since neither `meals` nor a saved-meal preview reliably supplies those. */
export interface MealMacros {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fibreG: number | null;
}

export interface MealCandidate {
  /** the underlying meals.id or saved_meals.id — never a synthetic id */
  id: string;
  source: MealCandidateSource;
  name: string;
  slot: MealSlot;
  /** 'kenyan' | 'east_african' | ... | 'global', or null for a saved meal with no single cuisine */
  cuisine: string | null;
  tags: string[];
  macros: MealMacros;
  prepTimeMinutes: number | null;
  imageUrl: string | null;
  /** #018 provenance — only ever set for a saved-meal candidate */
  savedMealProvenance: 'user_recipe_from_components' | 'user_meal_estimated' | null;
}

const MULTIPLIERS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export type PortionMultiplier = (typeof MULTIPLIERS)[number];
export const PORTION_MULTIPLIERS: readonly PortionMultiplier[] = MULTIPLIERS;
export const DEFAULT_PORTION_MULTIPLIER: PortionMultiplier = 1;

export function isValidPortionMultiplier(n: number): n is PortionMultiplier {
  return (PORTION_MULTIPLIERS as readonly number[]).includes(n);
}

function scaleMacro(v: number | null, multiplier: number): number | null {
  return v == null ? null : Math.round(v * multiplier * 100) / 100;
}

/**
 * §12 — deterministic portion scaling. Multiplies the candidate's OWN real
 * macro numbers by the multiplier; never regenerates or invents a value.
 * `null` (unknown) stays `null` — scaling an unknown by anything is still
 * unknown, never coerced to 0.
 */
export function scaleMealMacros(macros: MealMacros, multiplier: number): MealMacros {
  return {
    calories: scaleMacro(macros.calories, multiplier),
    proteinG: scaleMacro(macros.proteinG, multiplier),
    carbsG: scaleMacro(macros.carbsG, multiplier),
    fatG: scaleMacro(macros.fatG, multiplier),
    fibreG: scaleMacro(macros.fibreG, multiplier),
  };
}

export function scaleMealCandidate(candidate: MealCandidate, multiplier: number): MealCandidate {
  return { ...candidate, macros: scaleMealMacros(candidate.macros, multiplier) };
}

/** Raw shape a `meals` catalogue row's relevant columns map to (service maps DB → this). */
export interface CatalogueMealRow {
  id: string;
  name: string;
  category: MealSlot;
  cuisine: string;
  tags: string[] | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  prep_time_minutes: number | null;
  image_url: string | null;
}

export function mealCandidateFromCatalogueRow(row: CatalogueMealRow): MealCandidate {
  return {
    id: row.id,
    source: 'catalogue',
    name: row.name,
    slot: row.category,
    cuisine: row.cuisine,
    tags: row.tags ?? [],
    macros: {
      calories: row.calories, proteinG: row.protein_g, carbsG: row.carbs_g,
      fatG: row.fat_g, fibreG: row.fibre_g,
    },
    prepTimeMinutes: row.prep_time_minutes,
    imageUrl: row.image_url,
    savedMealProvenance: null,
  };
}

/** Minimal shape a saved meal's computed preview + its own metadata supply — the
 *  service builds this from `SavedMeal` (lib/nutrition/saved-meal.ts) + the
 *  already-existing `computeSavedMealPreview`, never a second nutrient engine. */
export interface SavedMealForCandidate {
  id: string;
  name: string;
  provenance: 'user_recipe_from_components' | 'user_meal_estimated';
  preview: { energyKcal: number; proteinG: number; carbohydrateG: number; fatG: number; fibreG: number };
}

/**
 * §3 — a homemade/saved meal becomes a first-class recommendation candidate
 * without ever requiring a static-catalogue match (spec §3/test 12). `slot`
 * is supplied by the caller (a saved meal has no fixed occasion of its own —
 * the user can plan it for whichever slot they're filling).
 */
export function mealCandidateFromSavedMeal(meal: SavedMealForCandidate, slot: MealSlot): MealCandidate {
  return {
    id: meal.id,
    source: 'saved_meal',
    name: meal.name,
    slot,
    cuisine: null, // a homemade recipe has no single catalogue cuisine tag
    tags: [], // saved meals carry no curated tag vocabulary (only meals.tags does)
    macros: {
      calories: meal.preview.energyKcal, proteinG: meal.preview.proteinG,
      carbsG: meal.preview.carbohydrateG, fatG: meal.preview.fatG, fibreG: meal.preview.fibreG,
    },
    prepTimeMinutes: null,
    imageUrl: null,
    savedMealProvenance: meal.provenance,
  };
}

/** A stable identity key for behavioural learning/history grouping (#022 §8) —
 *  distinct candidates that happen to share a name must NOT be conflated, so
 *  this keys on source+id, never on the display name alone. */
export function mealCandidateKey(source: MealCandidateSource, id: string): string {
  return `${source}:${id}`;
}
