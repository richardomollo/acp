// ACP Intelligence™ — Nutrition Catalogue V1 · Production SQL Seed Generator.
//
// AUTHORING TOOLING ONLY — never imported by the app. Generates a single,
// reviewable SQL file for manual application via the Supabase Dashboard SQL
// Editor (the Node deployment script's normal remote `fetch()` path is
// currently broken; this is the documented alternative for THIS release).
//
// NEVER connects to production. Foods are read from the LOCAL Supabase
// instance only (read-only) — the exact same canonical data the local
// rehearsal in the Production Deployment Package task already validated —
// and every nutrient value comes from the SAME composeMeal() pipeline
// already used and reviewed for that rehearsal. No number here is invented,
// recalculated, or touched by hand.
//
// Usage: node scripts/generate-nutrition-catalogue-production-sql.ts

import { ALL_INTERNATIONAL_MEALS, checkCatalogueIntegrity } from '../lib/nutrition/catalogue/index.ts';
import { composeMeal, ComposeMealError, type ComposedMeal } from '../lib/nutrition/meal-composer.ts';
import { FOOD_SELECT, mapDbFoodRow } from '../services/providers/food-provider.ts';
import type { CanonicalFood } from '../lib/nutrition/food-types.ts';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_PATH = path.resolve(import.meta.dirname, '../../../supabase/sql/nutrition_catalogue_v1_production_seed.sql');

// Local only — the same well-known local demo service-role key used
// throughout this task's local rehearsals. Never points at production.
const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const supabase = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY);

function sqlString(s: string | null): string {
  if (s == null) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}
function sqlNum(n: number | null): string {
  return n == null ? 'NULL' : String(n);
}
function sqlTextArray(arr: string[]): string {
  if (arr.length === 0) return "'{}'";
  const escaped = arr.map(s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  return `'{${escaped}}'`;
}

function rowToValuesTuple(m: ComposedMeal): string {
  return [
    sqlString(m.name), sqlString(m.category), sqlString(m.cuisine), sqlString(m.description),
    sqlTextArray(m.ingredients), sqlNum(m.calories), sqlNum(m.protein_g), sqlNum(m.carbs_g), sqlNum(m.fat_g),
    sqlNum(m.fibre_g), sqlNum(m.prep_time_minutes), sqlString(m.difficulty), sqlTextArray(m.tags),
    sqlString(m.serving_description), sqlString(m.source), sqlString(m.source_type),
    sqlString(m.composition_method), sqlString(m.recipe_source), sqlString(m.recipe_reference),
    m.is_active ? 'true' : 'false',
  ].join(', ');
}

async function main() {
  const integrity = checkCatalogueIntegrity(ALL_INTERNATIONAL_MEALS);
  if (!integrity.ok) {
    console.error('Catalogue source integrity check failed — aborting SQL generation. Nothing written.');
    console.error(JSON.stringify(integrity, null, 2));
    process.exit(1);
  }

  const { data: foodRows, error: foodsErr } = await supabase.from('foods').select(FOOD_SELECT);
  if (foodsErr) throw new Error(`Failed to load local canonical foods: ${foodsErr.message}`);
  const foodsByName = new Map<string, CanonicalFood>();
  for (const row of (foodRows ?? []) as Record<string, any>[]) {
    const food = mapDbFoodRow(row);
    foodsByName.set(food.name, food);
  }

  const foodsById = new Map<string, CanonicalFood>();
  const composed: ComposedMeal[] = [];
  const missingIngredients: { meal: string; foodName: string }[] = [];
  const failures: { meal: string; reason: string }[] = [];

  for (const src of ALL_INTERNATIONAL_MEALS) {
    const ingredientInputs: { foodId: string; grams: number }[] = [];
    let hasMissing = false;
    for (const ing of src.ingredients) {
      const food = foodsByName.get(ing.foodName);
      if (!food) { missingIngredients.push({ meal: src.name, foodName: ing.foodName }); hasMissing = true; continue; }
      foodsById.set(food.id, food);
      ingredientInputs.push({ foodId: food.id, grams: ing.grams });
    }
    if (hasMissing) continue;
    try {
      composed.push(composeMeal({ ...src, ingredients: ingredientInputs }, foodsById));
    } catch (e) {
      if (e instanceof ComposeMealError) failures.push({ meal: src.name, reason: `${e.code}: ${e.message}` });
      else throw e;
    }
  }

  if (missingIngredients.length > 0 || failures.length > 0 || composed.length !== 120) {
    console.error('Composition did not produce exactly 120 valid rows — aborting. Nothing written.');
    console.error(JSON.stringify({ composedCount: composed.length, missingIngredients, failures }, null, 2));
    process.exit(1);
  }

  // Cross-check against whatever is CURRENTLY in the local `meals` table
  // (the same rows the Production Deployment Package task's local rehearsal
  // applied and verified), so the generated SQL's report can state plainly
  // whether this recomputation matches that already-validated state exactly
  // — not just "compiles", but bit-for-bit identical nutrient/provenance
  // values for every one of the 120 recipe_reference identities.
  const { data: existingLocal } = await supabase
    .from('meals')
    .select('recipe_reference, name, cuisine, category, calories, protein_g, carbs_g, fat_g, fibre_g, composition_method, recipe_source')
    .not('recipe_reference', 'is', null);
  const existingByRef = new Map((existingLocal ?? []).map((r: any) => [r.recipe_reference, r]));
  const mismatches: { ref: string; field: string; local: unknown; recomputed: unknown }[] = [];
  const missingLocally: string[] = [];
  for (const m of composed) {
    const local = existingByRef.get(m.recipe_reference);
    if (!local) { missingLocally.push(m.recipe_reference); continue; }
    const fields: [string, unknown, unknown][] = [
      ['name', local.name, m.name], ['cuisine', local.cuisine, m.cuisine], ['category', local.category, m.category],
      ['calories', local.calories, m.calories], ['protein_g', Number(local.protein_g), m.protein_g],
      ['carbs_g', Number(local.carbs_g), m.carbs_g], ['fat_g', Number(local.fat_g), m.fat_g],
      ['fibre_g', local.fibre_g == null ? null : Number(local.fibre_g), m.fibre_g],
      ['composition_method', local.composition_method, m.composition_method],
      ['recipe_source', local.recipe_source, m.recipe_source],
    ];
    for (const [field, localVal, recomputedVal] of fields) {
      if (localVal !== recomputedVal) mismatches.push({ ref: m.recipe_reference, field, local: localVal, recomputed: recomputedVal });
    }
  }

  // ── Build the SQL file ────────────────────────────────────────────────
  const genDate = new Date().toISOString();
  const valuesBlock = composed.map(m => `  (${rowToValuesTuple(m)})`).join(',\n');

  const sql = `-- ACP Intelligence™ — Nutrition Catalogue V1 · PRODUCTION SEED.
-- Generated ${genDate} by scripts/generate-nutrition-catalogue-production-sql.ts.
--
-- Source of every nutrient/provenance value: composeMeal()
-- (apps/mobile/lib/nutrition/meal-composer.ts), run against the SAME 120
-- approved meal sources (lib/nutrition/catalogue/index.ts, batches 1-6) and
-- the SAME canonical \`foods\` evidence already used for the local
-- Production Deployment Package rehearsal. Nothing below was invented or
-- hand-recalculated — every VALUES row is a frozen composeMeal() output.
--
-- SAFE TO RUN VIA THE SUPABASE DASHBOARD SQL EDITOR. Idempotent: upserts on
-- the existing \`meals_recipe_reference_unique\` constraint
-- (recipe_reference), so re-running this file changes nothing on a second
-- run. Structurally cannot touch a Kenyan (or any other) row, because every
-- Kenyan meal has recipe_reference IS NULL and this statement only ever
-- targets rows by a non-null recipe_reference value.
--
-- Release order (apply once, in this order):
--   1. 20260916000001_meal_catalogue_provenance.sql   (composition_method/recipe_source/recipe_reference columns)
--   2. 20260917000001_canonical_ingredient_expansion.sql (corrected 19 canonical ingredients)
--   3. 20260918000001_meals_recipe_reference_unique.sql  (UNIQUE(recipe_reference) — required for the ON CONFLICT below)
--   4. THIS FILE

BEGIN;

-- ── Preconditions — fail loudly, write nothing, rather than partially deploy ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals' AND column_name = 'recipe_reference'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: meals.recipe_reference does not exist — apply 20260916000001_meal_catalogue_provenance.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals' AND column_name = 'composition_method'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: meals.composition_method does not exist — apply 20260916000001_meal_catalogue_provenance.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meals_recipe_reference_unique'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: meals_recipe_reference_unique constraint does not exist — apply 20260918000001_meals_recipe_reference_unique.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals' AND column_name = 'cuisine'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: meals.cuisine does not exist — base nutrition_hub_schema migration missing.';
  END IF;
END $$;

-- Capture the pre-deploy Kenyan count for the post-deploy comparison below
-- (a session-local TEMP table — persists for the rest of this SQL Editor
-- session so verification query 7 below can read it after COMMIT, and is
-- dropped automatically when the session ends; never a permanent schema
-- change).
CREATE TEMP TABLE _pre_deploy_counts AS
SELECT
  (SELECT count(*) FROM public.meals WHERE recipe_reference IS NULL) AS kenyan_count_before,
  (SELECT count(*) FROM public.meals WHERE recipe_reference IS NOT NULL) AS intl_count_before;

-- ── The 120 approved international meals (upsert by recipe_reference) ──────
INSERT INTO public.meals (
  name, category, cuisine, description, ingredients,
  calories, protein_g, carbs_g, fat_g, fibre_g,
  prep_time_minutes, difficulty, tags, serving_description,
  source, source_type, composition_method, recipe_source, recipe_reference, is_active
)
VALUES
${valuesBlock}
ON CONFLICT (recipe_reference) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category, cuisine = EXCLUDED.cuisine,
  description = EXCLUDED.description, ingredients = EXCLUDED.ingredients,
  calories = EXCLUDED.calories, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g,
  fat_g = EXCLUDED.fat_g, fibre_g = EXCLUDED.fibre_g,
  prep_time_minutes = EXCLUDED.prep_time_minutes, difficulty = EXCLUDED.difficulty,
  tags = EXCLUDED.tags, serving_description = EXCLUDED.serving_description,
  source = EXCLUDED.source, source_type = EXCLUDED.source_type,
  composition_method = EXCLUDED.composition_method, recipe_source = EXCLUDED.recipe_source,
  is_active = EXCLUDED.is_active;

-- ── Postcondition — abort the whole transaction if this write didn't land
--    exactly 120 international rows (never partially deploy) ───────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.meals WHERE recipe_reference IS NOT NULL;
  IF v_count <> 120 THEN
    RAISE EXCEPTION 'Postcondition failed: expected exactly 120 international (recipe_reference IS NOT NULL) meals after upsert, found %. Rolling back.', v_count;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — run after COMMIT above (read-only)
-- ════════════════════════════════════════════════════════════════════════

-- 1. Exactly 120 Lana Catalogue V1 meals.
SELECT count(*) AS international_meal_count FROM public.meals WHERE recipe_reference IS NOT NULL;
-- expect: 120

-- 2. Cuisine group breakdown: European/Western = 40, Mediterranean = 40, Global = 40.
SELECT
  CASE WHEN cuisine IN ('western','european') THEN 'european_western' ELSE cuisine END AS cuisine_group,
  count(*)
FROM public.meals WHERE recipe_reference IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- expect: european_western=40, mediterranean=40, global=40

-- 3. Category ("occasion") breakdown: 30 breakfast / 45 lunch / 45 dinner.
SELECT category, count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL GROUP BY category ORDER BY category;
-- expect: breakfast=30, lunch=45, dinner=45

-- 4. Zero duplicate recipe_reference anywhere in meals.
SELECT recipe_reference, count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL GROUP BY recipe_reference HAVING count(*) > 1;
-- expect: 0 rows

-- 5. Complete provenance on every new catalogue row.
SELECT count(*) AS rows_missing_provenance FROM public.meals
WHERE recipe_reference IS NOT NULL
  AND (composition_method IS NULL OR recipe_source IS NULL OR recipe_reference IS NULL);
-- expect: 0

-- 6. No null core macros on new rows (fibre may legitimately be NULL — UNKNOWN ≠ ZERO).
SELECT name, recipe_reference FROM public.meals
WHERE recipe_reference IS NOT NULL
  AND (calories IS NULL OR protein_g IS NULL OR carbs_g IS NULL OR fat_g IS NULL);
-- expect: 0 rows

-- 7. Kenyan meal count unchanged before vs after this deploy.
SELECT
  p.kenyan_count_before,
  (SELECT count(*) FROM public.meals WHERE recipe_reference IS NULL) AS kenyan_count_after,
  p.intl_count_before,
  (SELECT count(*) FROM public.meals WHERE recipe_reference IS NOT NULL) AS intl_count_after
FROM _pre_deploy_counts p;
-- expect: kenyan_count_before = kenyan_count_after; intl_count_after = 120
-- NOTE: _pre_deploy_counts is a TEMP table scoped to this SQL Editor
-- session/transaction — run this query in the SAME session as the block
-- above, before the session ends, or re-derive kenyan_count_before from
-- your own separately-recorded pre-deploy count if running it later.
`;

  writeFileSync(OUTPUT_PATH, sql);

  console.log(JSON.stringify({
    composedCount: composed.length,
    integrityOk: integrity.ok,
    cuisineGroupCounts: integrity.cuisineGroupCounts,
    categoryCounts: integrity.categoryCounts,
    localMatchCheck: {
      existingLocalRowsChecked: existingByRef.size,
      missingLocally, // recipe_references composed here but not currently present in local `meals` — expected empty if local state is exactly the validated catalogue
      mismatches, // any field-level difference between local `meals` rows and this fresh recomputation — expected empty
      exactMatch: missingLocally.length === 0 && mismatches.length === 0,
    },
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
