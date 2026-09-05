// ACP Intelligence™ — Nutrition N1. Domain types for the food-evidence layer.
//
// These describe ACP's CANONICAL food model and the user's ACTUAL food log —
// deliberately separate from the curated `meals` library / meal plans (which
// are recommendations, not evidence). No provider-specific shapes here: an
// external food source is normalised into `CanonicalFood` at the adapter
// boundary (services/providers/food-provider.ts) before anything domain-level
// touches it.
//
// Missing ≠ zero: every nutrient value is `number | null`. `null` means the
// source did not supply it; `0` means a measured zero. Nothing in this layer
// ever coerces one into the other.

/** Canonical nutrient keys — the full set the schema stores (N1 §3, micronutrient-capable from day one). */
export const NUTRIENT_KEYS = [
  'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'saturatedFatG', 'fibreG', 'sugarG', 'sodiumMg',
  'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'potassiumMg', 'zincMg', 'copperMg', 'manganeseMg', 'seleniumUg',
  'vitaminAUg', 'thiaminB1Mg', 'riboflavinB2Mg', 'niacinB3Mg', 'pantothenicB5Mg', 'vitaminB6Mg', 'biotinB7Ug',
  'folateB9Ug', 'vitaminB12Ug', 'vitaminCMg', 'vitaminDUg', 'vitaminEMg', 'vitaminKUg',
] as const;

export type NutrientKey = typeof NUTRIENT_KEYS[number];

/** The five keys N1's UI surfaces and `nutrition_day` coalesces to 0. The rest stay `null` when unknown. */
export const MACRO_KEYS: readonly NutrientKey[] = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fibreG'];

/** A full nutrient vector. Every key present; value `null` = unknown, `0` = measured zero. */
export type Nutrients = Record<NutrientKey, number | null>;

export type FoodSourceType =
  | 'trusted_food_database' | 'manufacturer' | 'restaurant'
  | 'acp_curated' | 'user_custom' | 'estimated';

/**
 * Nutrition N7.5B — how this row's per-100g composition was established.
 * Nutrient provenance and RECIPE provenance are distinct: USDA proving what
 * maize meal contains does not prove 100 g maize meal → 300 g ugali.
 *   direct_verified          — an authoritative food-composition entry for
 *                              exactly this food/dish.
 *   standard_recipe_verified — an authoritative standardized recipe supplied
 *                              ingredients + amounts + cooked yield.
 *   standard_recipe_estimated — ingredient nutrients are authoritative, but
 *                              the ratios / oil / yield / servings carry ACP
 *                              assumptions.
 *   proxy_composition        — an authoritative direct food used as an
 *                              explicit stand-in for a local dish.
 */
export type CompositionMethod =
  | 'direct_verified' | 'standard_recipe_verified'
  | 'standard_recipe_estimated' | 'proxy_composition';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type LogUnit = 'g' | 'ml' | 'serving';
export type CaptureMethod = 'manual' | 'search' | 'plan' | 'camera' | 'saved_meal';

/**
 * Nutrition N6.5 (Beta #018) — how a reusable saved meal was defined.
 *   user_recipe_from_components — the user listed canonical-food ingredients;
 *     every number is a deterministic sum of verified food facts.
 *   user_meal_estimated — the user saved an approximate meal (a standard
 *     recipe estimate, or their own typed numbers). Disclosed as an estimate.
 */
export type SavedMealProvenance = 'user_recipe_from_components' | 'user_meal_estimated';

/** A named household measure for a food, resolved to grams (never guessed — from the source or an explicit ACP estimate). */
export interface FoodServing {
  label: string;   // "1 medium (118 g)"
  grams: number;
}

/** Canonical food identity + facts. Nutrients are per `basisGrams` grams (default 100). */
export interface CanonicalFood {
  id: string;
  source: string;              // dataset name, e.g. "USDA FoodData Central"
  externalId: string | null;   // stable id within that dataset (USDA SR-Legacy NDB number)
  /** USDA FoodData Central numeric surrogate id — directly fetchable at
   *  /fdc/v1/food/{fdcId}. Present only for USDA-sourced foods (N1 §6). */
  fdcId: number | null;
  sourceType: FoodSourceType;
  sourceUrl: string | null;
  name: string;
  brand: string | null;
  description: string | null;

  basisGrams: number;          // nutrients below are the amount in this many grams
  basisUnit: 'g' | 'ml';       // display only ("per 100 ml")
  /** ml→g factor; `null` means this food cannot be logged in ml (N1 §8). */
  densityGPerMl: number | null;

  nutrients: Nutrients;

  servings: FoodServing[];
  defaultServingGrams: number | null;
  defaultServingLabel: string | null;

  isGeneric: boolean;
  countryCode: string | null;

  /** N7.5B — provenance of this composition; `null` for pre-N7.5B rows (treated as direct). */
  compositionMethod: CompositionMethod | null;
  /** N7.5B — short, human-readable recipe/proxy provenance (e.g. "ACP estimated standard recipe"). */
  recipeSource: string | null;
  /** N7.5B — a stable reference for the recipe/proxy (the derivation slug, or a citation). */
  recipeReference: string | null;
}

/** Compact row for the search results list. */
export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  sourceType: FoodSourceType;
  isGeneric: boolean;
  /** kcal per 100 g, for the list subtitle only — full facts come from getFood(id). */
  energyKcalPer100g: number | null;
  /** N7.5B — lets the row show a compact "· standard recipe" tag for estimated dishes. */
  compositionMethod: CompositionMethod | null;
}

/** What the Log-food flow submits. */
export interface FoodLogInput {
  /** `null` for a name-only custom entry (N1 §13 option B) or a homemade meal
   *  logged with user-entered numbers (N6.5 — see `userProvidedNutrition`). */
  foodId: string | null;
  displayName: string;
  brand?: string | null;
  quantity: number;
  unit: LogUnit;
  servingLabel?: string | null;   // required when unit === 'serving'
  mealSlot?: MealSlot | null;
  captureMethod: CaptureMethod;
  note?: string | null;
  /** Nutrition N6.5 (Beta #018) — a user-entered nutrient snapshot for a
   *  homemade / packaged / takeaway item that has no canonical `foods` row.
   *  Only honoured when `foodId` is null and `userProvidedNutrition` is true;
   *  the values are the TOTALS for the portion eaten (never per-100 g) and
   *  are frozen verbatim — nothing scales or invents them. Nutrients the user
   *  left blank stay `null` (unknown), never 0. */
  nutrients?: Partial<Nutrients> | null;
  /** Nutrition N6.5 — marks the row's numbers as the user's own, not a
   *  verified database's. Persisted to `food_log_entries.user_provided_nutrition`. */
  userProvidedNutrition?: boolean;
  /** Nutrition N6 — set together for every entry written in one log action so
   *  the occurrence can be shown/edited/deleted as a group. Never read by
   *  N2/N3/N4 nutrition maths. */
  logGroupId?: string | null;
  /** Nutrition N6 — provenance: this row was logged FROM a saved meal. */
  savedMealId?: string | null;
  /**
   * Beta #022A — a caller-supplied nutrient snapshot with a TRUTHFUL,
   * non-user source (e.g. Lana's own curated `meals` catalogue —
   * sourceType 'acp_curated'). Only honoured when `foodId` is null AND
   * `userProvidedNutrition` is NOT true — this is a distinct third case from
   * N6.5's "the user typed these numbers in" path (§022A §2: a catalogue
   * recommendation logged via "Log this" must never be mislabelled as
   * user-provided merely because the user tapped a button). `nutrients` is
   * still frozen verbatim, exactly like the userProvidedNutrition path.
   */
  source?: string | null;
  sourceType?: FoodSourceType | null;
}

/** A persisted food log entry (snake_case DB row is mapped to this in the service). */
export interface FoodLogEntry {
  id: string;
  userId: string;
  loggedAt: string;            // ISO
  localDate: string;           // YYYY-MM-DD (user's local calendar day)
  timezone: string | null;
  mealSlot: MealSlot | null;
  foodId: string | null;
  displayName: string;
  brand: string | null;
  quantity: number;
  unit: LogUnit;
  servingLabel: string | null;
  /** the deterministic scaling basis actually used; `null` only for a name-only custom entry */
  quantityGrams: number | null;
  captureMethod: CaptureMethod;
  source: string | null;
  sourceType: FoodSourceType | null;
  note: string | null;
  /** Nutrition N6 — the occurrence this row belongs to (rows logged together
   *  share one id); `null` for every pre-N6 row and any single-food log. */
  logGroupId: string | null;
  /** Nutrition N6 — the saved meal this occurrence was logged from, or `null`. */
  savedMealId: string | null;
  /** Nutrition N6.5 (Beta #018) — the nutrient snapshot was typed in by the
   *  user (homemade / packaged / takeaway), not derived from a canonical food. */
  userProvidedNutrition: boolean;
  /** nutrients SCALED to quantityGrams, frozen at log time. `null` = source didn't supply it. */
  nutrients: Nutrients;
}

/** Deterministic daily totals derived from the day's entries (never from plans/recommendations). */
export interface DailyNutritionSummary {
  localDate: string;
  entryCount: number;
  customEntryCount: number;
  /** macros: 0 when there's no data (matches the nutrition_day view's COALESCE) */
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fibreG: number;
  /** micronutrients: `null` when no logged food supplied the nutrient — "unknown", not zero */
  micros: Partial<Record<NutrientKey, number | null>>;
}

/** An empty nutrient vector — every key explicitly `null` (unknown), never `0`. */
export function emptyNutrients(): Nutrients {
  return NUTRIENT_KEYS.reduce((acc, k) => { acc[k] = null; return acc; }, {} as Nutrients);
}
