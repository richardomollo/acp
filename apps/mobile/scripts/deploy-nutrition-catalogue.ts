// ACP Intelligence™ — Nutrition Catalogue V1 · Production Deployment Package.
//
// DEPLOYMENT / AUTHORING TOOLING ONLY. Nothing in the running app imports
// this file or anything it exports — it is a one-off script, run directly
// with `node` (Node 22+'s built-in TypeScript support; matches how every
// other authoring script in this repo runs .ts files without a bundler).
//
// What it does:
//   1. Loads the 120 approved international meal sources
//      (lib/nutrition/catalogue/index.ts — never redefined here).
//   2. Loads every canonical `foods` row from the target DB and resolves
//      each source's ingredient food NAMES to real food ids, using the
//      SAME row→CanonicalFood mapping the app itself uses
//      (services/providers/food-provider.ts's FOOD_SELECT/mapDbFoodRow —
//      no parallel mapping).
//   3. Composes every meal via meal-composer.ts's composeMeal() — the same
//      authoring-time composer used to build/verify every batch this
//      catalogue was approved from. No nutrient value is computed here.
//   4. Upserts the 120 rows keyed on `recipe_reference` (requires
//      20260918000001_meals_recipe_reference_unique.sql to be applied).
//      Never touches a row with recipe_reference IS NULL — the existing
//      Kenyan catalogue is structurally unreachable by this script.
//
// Safety:
//   - Defaults to DRY RUN. Pass --apply to actually write.
//   - Defaults to the local Supabase instance. Refuses to run against
//     anything else unless BOTH --url/--service-key are explicitly passed
//     AND the ACP_ALLOW_REMOTE_CATALOGUE_DEPLOY=1 env var is set — this
//     script has never been invoked against anything but local this task,
//     and ships with that off by default so a future misuse can't silently
//     reach production.
//   - Fails loudly (throws, exits non-zero, writes nothing) on any missing
//     ingredient or invalid composition — never partially applies.
//
// Usage:
//   node scripts/deploy-nutrition-catalogue.ts                # dry run, local
//   node scripts/deploy-nutrition-catalogue.ts --apply         # apply, local
//   node scripts/deploy-nutrition-catalogue.ts --json          # machine-readable summary

import { createClient } from '@supabase/supabase-js';
import { ALL_INTERNATIONAL_MEALS, checkCatalogueIntegrity, type CatalogueMealSource } from '../lib/nutrition/catalogue/index.ts';
import { composeMeal, ComposeMealError, type ComposedMeal } from '../lib/nutrition/meal-composer.ts';
import { FOOD_SELECT, mapDbFoodRow } from '../services/providers/food-provider.ts';
import type { CanonicalFood } from '../lib/nutrition/food-types.ts';

// ── CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_OUT = args.includes('--json');
const argVal = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const url = argVal('--url') ?? process.env.SUPABASE_URL ?? LOCAL_URL;
const serviceKey = argVal('--service-key') ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;

const isLocal = /127\.0\.0\.1|localhost/.test(url);
if (!isLocal && process.env.ACP_ALLOW_REMOTE_CATALOGUE_DEPLOY !== '1') {
  console.error(
    `Refusing to run: target URL "${url}" is not local, and ACP_ALLOW_REMOTE_CATALOGUE_DEPLOY=1 is not set.\n` +
    'This tool has only ever been rehearsed against the local Supabase instance. Production release is a separate, explicitly-authorized step.',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// ── Row shape ────────────────────────────────────────────────────────────

/** Strips the two non-DB fields ComposedMeal carries for authoring-time
 *  review (fibreComplete, __ingredientBreakdown) — never sent to the DB. */
function toDbRow(m: ComposedMeal): Record<string, unknown> {
  const { fibreComplete: _fibreComplete, __ingredientBreakdown: _breakdown, ...row } = m;
  return row;
}

interface CompositionFailure { name: string; recipeReference: string; reason: string }

async function loadFoodsByName(): Promise<Map<string, CanonicalFood>> {
  const { data, error } = await supabase.from('foods').select(FOOD_SELECT);
  if (error) throw new Error(`Failed to load foods: ${error.message}`);
  const byName = new Map<string, CanonicalFood>();
  for (const row of (data ?? []) as Record<string, any>[]) {
    const food = mapDbFoodRow(row);
    byName.set(food.name, food);
  }
  return byName;
}

function composeAll(sources: CatalogueMealSource[], foodsByName: Map<string, CanonicalFood>) {
  const foodsById = new Map<string, CanonicalFood>();
  const missingIngredients: { meal: string; foodName: string }[] = [];
  const composed: ComposedMeal[] = [];
  const failures: CompositionFailure[] = [];

  for (const src of sources) {
    const ingredientInputs: { foodId: string; grams: number }[] = [];
    let hasMissing = false;
    for (const ing of src.ingredients) {
      const food = foodsByName.get(ing.foodName);
      if (!food) {
        missingIngredients.push({ meal: src.name, foodName: ing.foodName });
        hasMissing = true;
        continue;
      }
      foodsById.set(food.id, food);
      ingredientInputs.push({ foodId: food.id, grams: ing.grams });
    }
    if (hasMissing) continue; // already recorded; don't also throw a compose error for it

    try {
      const meal = composeMeal({ ...src, ingredients: ingredientInputs }, foodsById);
      composed.push(meal);
    } catch (e) {
      if (e instanceof ComposeMealError) {
        failures.push({ name: src.name, recipeReference: src.recipeReference, reason: `${e.code}: ${e.message}` });
      } else {
        throw e;
      }
    }
  }
  return { composed, missingIngredients, failures };
}

async function main() {
  const integrity = checkCatalogueIntegrity(ALL_INTERNATIONAL_MEALS);

  const foodsByName = await loadFoodsByName();
  const { composed, missingIngredients, failures } = composeAll(ALL_INTERNATIONAL_MEALS, foodsByName);

  // Fail loudly, write nothing, on any missing ingredient or invalid
  // composition (spec §7) — regardless of dry-run or apply mode.
  if (!integrity.ok || missingIngredients.length > 0 || failures.length > 0) {
    console.error('Catalogue deployment ABORTED — validation failed. Nothing was written.');
    console.error(JSON.stringify({ integrity, missingIngredients, failures }, null, 2));
    process.exit(1);
  }

  const rows = composed.map(toDbRow);
  const recipeRefs = composed.map(m => m.recipe_reference);

  // Existing-state read for the dry-run summary and for the Kenyan-catalogue
  // preservation check — read-only, never a write.
  const { data: existingIntl, error: exErr } = await supabase
    .from('meals').select('recipe_reference, calories, protein_g, carbs_g, fat_g, name')
    .in('recipe_reference', recipeRefs);
  if (exErr) throw new Error(`Failed to read existing catalogue rows: ${exErr.message}`);
  const existingByRef = new Map((existingIntl ?? []).map((r: any) => [r.recipe_reference, r]));

  const { count: kenyanCountBefore } = await supabase
    .from('meals').select('id', { count: 'exact', head: true }).is('recipe_reference', null);

  let expectedInserts = 0, expectedUpdates = 0, expectedUnchanged = 0;
  for (const row of rows) {
    const existing = existingByRef.get(row.recipe_reference as string);
    if (!existing) { expectedInserts++; continue; }
    const changed = existing.calories !== row.calories || existing.protein_g !== row.protein_g
      || existing.carbs_g !== row.carbs_g || existing.fat_g !== row.fat_g || existing.name !== row.name;
    if (changed) expectedUpdates++; else expectedUnchanged++;
  }

  const summary = {
    mode: APPLY ? 'apply' : 'dry_run',
    target: url,
    mealCount: rows.length,
    cuisineGroupCounts: integrity.cuisineGroupCounts,
    categoryCounts: integrity.categoryCounts,
    duplicateIdentityCheck: integrity.duplicateRecipeReferences.length === 0 ? 'pass' : integrity.duplicateRecipeReferences,
    missingIngredientCount: missingIngredients.length,
    provenanceComplete: integrity.missingProvenance.length === 0,
    fibreCompleteCount: composed.filter(m => m.fibre_g != null).length,
    fibreIncompleteCount: composed.filter(m => m.fibre_g == null).length,
    expectedInserts,
    expectedUpdates,
    expectedUnchanged,
    kenyanCountBefore: kenyanCountBefore ?? null,
  };

  if (!APPLY) {
    console.log(JSON_OUT ? JSON.stringify(summary, null, 2) : summary);
    console.log('\nDry run only — no rows written. Pass --apply to write.');
    return;
  }

  // Chunked upsert, keyed on the additive recipe_reference unique
  // constraint. Never touches a row with recipe_reference IS NULL, so the
  // existing Kenyan catalogue is structurally unreachable by this call.
  const CHUNK = 25;
  let applied = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('meals').upsert(chunk, { onConflict: 'recipe_reference' });
    if (error) throw new Error(`Upsert failed on chunk starting at ${i}: ${error.message}`);
    applied += chunk.length;
  }

  const { count: kenyanCountAfter } = await supabase
    .from('meals').select('id', { count: 'exact', head: true }).is('recipe_reference', null);
  const { count: intlCountAfter } = await supabase
    .from('meals').select('id', { count: 'exact', head: true }).not('recipe_reference', 'is', null);

  console.log(JSON_OUT ? JSON.stringify({ ...summary, applied, kenyanCountAfter, intlCountAfter }, null, 2)
    : { ...summary, applied, kenyanCountAfter, intlCountAfter });
}

main().catch(e => { console.error(e); process.exit(1); });
