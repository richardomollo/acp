// ACP Intelligence™ — Nutrition N1. Food-source normalisation boundary.
//
// N1 uses APPROACH C from the spec (§2): a curated seed subset of generic
// foods, sourced from USDA FoodData Central (public domain), stored in ACP's
// canonical `foods` table. There is NO live external API call in N1.
//
// This module is nonetheless the single seam where a food record — from the
// DB today, or an external provider in N2 — is turned into the domain
// `CanonicalFood` shape. UI and services never see a raw DB row or a
// provider payload; they see `CanonicalFood` / `FoodSearchResult`.

import {
  NUTRIENT_KEYS,
  type CanonicalFood, type FoodSearchResult, type Nutrients, type NutrientKey, type FoodSourceType, type CompositionMethod,
} from '@/lib/nutrition/food-types';

/** camelCase nutrient key → snake_case DB column (energyKcal → energy_kcal, vitaminB12Ug → vitamin_b12_ug). */
export const NUTRIENT_COLUMN: Record<NutrientKey, string> = NUTRIENT_KEYS.reduce((acc, k) => {
  acc[k] = k.replace(/([A-Z])/g, m => `_${m.toLowerCase()}`);
  return acc;
}, {} as Record<NutrientKey, string>);

/** Column list for a full `foods` select (identity + basis + every nutrient + serving defaults). */
export const FOOD_SELECT = [
  'id', 'source', 'external_id', 'fdc_id', 'source_type', 'source_url',
  'name', 'brand', 'description',
  'basis_grams', 'basis_unit', 'basis_amount', 'density_g_per_ml',
  ...Object.values(NUTRIENT_COLUMN),
  'default_serving_grams', 'default_serving_label', 'is_generic', 'country_code', 'language_code',
  'composition_method', 'recipe_source', 'recipe_reference',
].join(', ');

function readNutrients(row: Record<string, unknown>): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENT_KEYS) {
    const v = row[NUTRIENT_COLUMN[k]];
    out[k] = typeof v === 'number' ? v : v == null ? null : Number(v);
  }
  return out;
}

/** A `foods` row (+ optional joined `food_servings`) → domain `CanonicalFood`. */
export function mapDbFoodRow(
  row: Record<string, any>,
  servingRows: { label: string; grams: number }[] = [],
): CanonicalFood {
  return {
    id: String(row.id),
    source: String(row.source),
    externalId: row.external_id ?? null,
    fdcId: row.fdc_id == null ? null : Number(row.fdc_id),
    sourceType: row.source_type as FoodSourceType,
    sourceUrl: row.source_url ?? null,
    name: String(row.name),
    brand: row.brand ?? null,
    description: row.description ?? null,
    basisGrams: Number(row.basis_grams ?? 100),
    basisUnit: (row.basis_unit ?? 'g') as 'g' | 'ml',
    densityGPerMl: row.density_g_per_ml == null ? null : Number(row.density_g_per_ml),
    nutrients: readNutrients(row),
    servings: servingRows
      .map(s => ({ label: String(s.label), grams: Number(s.grams) }))
      .filter(s => Number.isFinite(s.grams) && s.grams > 0),
    defaultServingGrams: row.default_serving_grams == null ? null : Number(row.default_serving_grams),
    defaultServingLabel: row.default_serving_label ?? null,
    isGeneric: !!row.is_generic,
    countryCode: row.country_code ?? null,
    compositionMethod: (row.composition_method ?? null) as CompositionMethod | null,
    recipeSource: row.recipe_source ?? null,
    recipeReference: row.recipe_reference ?? null,
  };
}

/** A `foods` row → the compact search-result shape (list display only). */
export function mapDbFoodToSearchResult(row: Record<string, any>): FoodSearchResult {
  const kcal = row[NUTRIENT_COLUMN.energyKcal];
  return {
    id: String(row.id),
    name: String(row.name),
    brand: row.brand ?? null,
    source: String(row.source),
    sourceType: row.source_type as FoodSourceType,
    isGeneric: !!row.is_generic,
    energyKcalPer100g: kcal == null ? null : Number(kcal),
    compositionMethod: (row.composition_method ?? null) as CompositionMethod | null,
  };
}

// ── N2 seam (documented, not wired in N1) ─────────────────────────────────
// A normalised external provider food. When a real search API is added, its
// adapter maps the provider payload to this, then to `CanonicalFood` via the
// same nutrient keys — the domain layer never changes.
export interface NormalizedProviderFood {
  externalId: string;
  source: string;                 // e.g. 'USDA FoodData Central'
  sourceType: FoodSourceType;
  name: string;
  brand: string | null;
  basisGrams: number;             // usually 100
  densityGPerMl: number | null;
  nutrients: Partial<Nutrients>;  // only what the provider supplied — the rest stay null
  servings: { label: string; grams: number }[];
}
