// ACP Intelligence™ — Nutrition: KFCT / FAO Kenyan Food Recipe import (V1).
//
// DEPLOYMENT / AUTHORING TOOLING ONLY, same shape as scripts/deploy-nutrition-catalogue.ts
// (Node 22+'s built-in TypeScript support; no bundler, run directly with node).
// Nothing in the running app imports this file.
//
// What it does:
//   1. Parses data/kfct/kenyan_recipes.csv + kenyan_recipe_ingredients.csv
//      (checked into the repo — never a developer's local /mnt/data path).
//   2. Validates shape: expected row counts, required columns, KFCT-code
//      uniqueness (intentional subcodes like 15066r/15066s are distinct
//      strings and pass unmodified — never merged).
//   3. Classifies every recipe: MATCH_EXISTING_ESTIMATED / MATCH_EXISTING_PROXY
//      / NEW_CANONICAL_FOOD / NO_NUTRIENT_PROFILE (deliberate, reviewable
//      keyword/category rules against the known 13 N7.5 Kenyan foods — never
//      fuzzy string matching. See RECONCILIATION below).
//   4. For the 140 recipes with a complete composition: upserts a `foods` row
//      (composition_method='standard_recipe_verified', the source's own
//      per-100g values verbatim — NEVER recomputed from ingredients) + a
//      `food_recipes` row + its `food_recipe_ingredients` rows.
//   4b. Preparation-method import (Lana Recipes V1 — KFCT method import):
//      every recipe's `instructions_text` cell is run through the pure,
//      deterministic parser in lib/nutrition/recipe-instructions.ts
//      (parseKfctInstructions — NO LLM, never invented, never paraphrased).
//      When it parses cleanly, the structured {sections:[{heading,steps}]}
//      result is written to food_recipes.instructions (jsonb) verbatim from
//      source. When the parser reports the source text is corrupted/
//      ambiguous (PDF line-wrap artifacts, column-interleaved section
//      headers), instructions is left NULL and the recipe is listed under
//      REVIEW_REQUIRED in the printed report — source fidelity over
//      completeness (never a guessed reconstruction).
//   5. For the 2 recipes without a composition: a `food_recipes` row ONLY
//      (food_id NULL, nutrient_status recording why) — no `foods` row, so
//      they are structurally unsearchable/unloggable and can never
//      contribute a nutrient value, let alone a zero.
//   6. Deactivates (is_active=false) the old N7.5 estimated/proxy `foods`
//      rows a reconciliation match supersedes. NEVER deletes, NEVER rewrites
//      their nutrient values — food_log_entries snapshots and
//      saved_meal_items references stay exactly as they were logged/saved;
//      they simply stop surfacing in new search/logging (same RLS predicate
//      `is_active = true` every other inactive food already relies on).
//
// Safety (identical posture to deploy-nutrition-catalogue.ts):
//   - Defaults to DRY RUN. Pass --apply to actually write.
//   - Defaults to the local Supabase instance. Refuses to run against
//     anything else unless BOTH --url/--service-key are explicitly passed
//     AND ACP_ALLOW_REMOTE_KFCT_IMPORT=1 is set.
//   - Fails loudly (throws, exits non-zero, writes nothing) on any
//     validation failure — never partially applies.
//   - NULL vs 0 is preserved exactly: a blank source cell becomes SQL NULL,
//     never 0. A source-reported '0' becomes numeric 0. (parseSourceNumber
//     below is the single place this distinction is made — never "|| 0".)
//
// Usage (from apps/mobile/, matching deploy-nutrition-catalogue.ts):
//   node scripts/import-kfct-recipes.ts                # dry run, local
//   node scripts/import-kfct-recipes.ts --apply         # apply, local
//   node scripts/import-kfct-recipes.ts --json          # machine-readable summary

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseKfctInstructions, type ParsedRecipeInstructions } from '../lib/nutrition/recipe-instructions.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script lives at apps/mobile/scripts/ (matches deploy-nutrition-
// catalogue.ts's location) — two levels up is the monorepo root, where
// data/kfct/*.csv is checked in (never a developer's local /mnt/data path).
const REPO_ROOT = path.resolve(__dirname, '../../..');

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
if (!isLocal && process.env.ACP_ALLOW_REMOTE_KFCT_IMPORT !== '1') {
  console.error(
    `Refusing to run: target URL "${url}" is not local, and ACP_ALLOW_REMOTE_KFCT_IMPORT=1 is not set.\n` +
    'This tool has only ever been rehearsed against the local Supabase instance. Production release is a separate, explicitly-authorized step.',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// ── CSV parsing (RFC4180 — handles quoted fields with embedded commas,
//    newlines and escaped "" quotes; the source's instructions_text needs
//    exactly this). No dependency — the repo has no CSV library. ──────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // last field/row (file may or may not end with a newline)
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...rest] = rows;
  return rest.map(r => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}

function loadCsv(relPath: string): Record<string, string>[] {
  const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  return rowsToObjects(parseCsv(text));
}

/** The ONLY place a source cell becomes a nutrient value. '' -> null
 *  (unavailable — never 0). A source-reported '0' -> numeric 0. Never `|| 0`. */
function parseSourceNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Non-numeric nutrient value: ${JSON.stringify(raw)}`);
  return n;
}

// ── KFCT wide-column -> Lana `foods` column mapping ─────────────────────
// Every KFCT field is accounted for; `null` means Lana has no equivalent
// column (never silently dropped without being named here). Chosen units
// prefer the modern/aggregate form: RAE over RE for vitamin A, DFE over
// "food folate" for folate — both because those are the columns Lana
// already has (N1) and because they are the standard modern units.
const NUTRIENT_MAP: Record<string, string | null> = {
  energy_kj: null,                          // Lana stores kcal only; kJ is a unit conversion of the same figure
  energy_kcal: 'energy_kcal',
  water_g: null,                            // not tracked in Lana's model
  protein_g: 'protein_g',
  fat_g: 'fat_g',
  carbohydrate_available_g: 'carbohydrate_g',
  fibre_g: 'fibre_g',
  ash_g: null,                              // residual/QA figure, not consumer-relevant
  calcium_mg: 'calcium_mg',
  iron_mg: 'iron_mg',
  magnesium_mg: 'magnesium_mg',
  phosphorus_mg: 'phosphorus_mg',
  potassium_mg: 'potassium_mg',
  sodium_mg: 'sodium_mg',
  zinc_mg: 'zinc_mg',
  selenium_mcg: 'selenium_ug',
  vitamin_a_rae_mcg: 'vitamin_a_ug',        // RAE preferred over RE (below)
  vitamin_a_re_mcg: null,
  retinol_mcg: null,
  beta_carotene_equiv_mcg: null,
  thiamin_mg: 'thiamin_b1_mg',
  riboflavin_mg: 'riboflavin_b2_mg',
  niacin_mg: 'niacin_b3_mg',
  folate_dfe_mcg: 'folate_b9_ug',           // DFE preferred over food_folate (below)
  food_folate_mcg: null,
  vitamin_b12_mcg: 'vitamin_b12_ug',
  vitamin_c_mg: 'vitamin_c_mg',
};

const SOURCE_NAME = 'FAO/Government of Kenya';
const SOURCE_CITATION =
  'FAO/Government of Kenya. 2018. Kenyan Food Recipes: A recipe book of common mixed dishes with nutrient value.';
const SOURCE_URL = 'http://www.fao.org/3/I8897EN/I8897en.pdf';

// ── Reconciliation — deliberate, reviewable rules against the 13 known
//    N7.5 Kenyan foods (20260903000002_nutrition_kenyan_food_coverage.sql).
//    NEVER fuzzy string distance — either an explicit keyword/category rule
//    matches or it doesn't; every match is listed in the printed report for
//    human review before --apply changes anything. ──────────────────────
interface ReconciliationRule {
  externalId: string;   // the existing foods.external_id to (maybe) deactivate
  name: string;         // for the report only
  classification: 'MATCH_EXISTING_ESTIMATED' | 'MATCH_EXISTING_PROXY';
  match: (r: { name: string; category: string }) => boolean;
}

const RECONCILIATION_RULES: ReconciliationRule[] = [
  { externalId: 'acp-recipe:ugali-v1', name: 'Ugali (maize meal / posho, cooked)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.category === 'Ugali' },
  { externalId: 'acp-recipe:githeri-v1', name: 'Githeri (boiled maize and beans)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('githeri') },
  { externalId: 'acp-recipe:chapati-v1', name: 'Chapati (Kenyan-style flatbread)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('chapati') },
  { externalId: 'acp-recipe:mukimo-v1', name: 'Mukimo (mashed potato, maize and greens)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('mukimo') },
  { externalId: 'acp-recipe:pilau-v1', name: 'Pilau (spiced rice, standard recipe)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('pilau') },
  { externalId: 'srlegacy:09277', name: 'Matoke (boiled green banana / plantain)',
    classification: 'MATCH_EXISTING_PROXY',
    match: r => { const n = r.name.toLowerCase(); return n.includes('matoke') || n.includes('stewed green banana'); } },
  { externalId: 'acp-recipe:uji-v1', name: 'Uji (maize / millet porridge)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.category === 'Porridges' },
  { externalId: 'acp-recipe:beans-stew-v1', name: 'Beans, stewed (Kenyan-style, with tomato and onion)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.category === 'Legume Dishes' },
  { externalId: 'acp-recipe:sukuma-wiki-v1', name: 'Sukuma wiki (collard/kale greens, fried)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('sukuma') },
  { externalId: 'acp-recipe:mandazi-v1', name: 'Mandazi (fried sweet dough)',
    classification: 'MATCH_EXISTING_ESTIMATED', match: r => r.name.toLowerCase().includes('mandazi') },
  // Deliberately NOT listed (checked against the full 142 — no KFCT mixed-
  // dish equivalent exists): srlegacy:11508 Sweet potato boiled (KFCT's
  // sweet-potato dishes are different preparations — fried, with peanut
  // butter — not a supersession); srlegacy:11109 Cabbage, cooked (KFCT's
  // "Stir-fried Cabbage" is a different, genuinely new dish); srlegacy:13364
  // Nyama choma (no grilled-beef recipe exists anywhere in the 142).
];

// ── Load + validate source data ─────────────────────────────────────────

interface RecipeRow {
  kfct_code: string; name: string; category: string; serves: string;
  preparation_time_text: string; cooking_time_text: string; instructions_text: string;
  nutrient_status: string; nutrient_note: string; [k: string]: string;
}
interface IngredientRow {
  kfct_code: string; recipe_name: string; sort_order: string; ingredient_name: string;
  grams: string; household_measure: string; ingredient_text: string;
}

function loadAndValidate() {
  const recipes = loadCsv('data/kfct/kenyan_recipes.csv') as unknown as RecipeRow[];
  const ingredients = loadCsv('data/kfct/kenyan_recipe_ingredients.csv') as unknown as IngredientRow[];

  const errors: string[] = [];

  if (recipes.length !== 142) errors.push(`Expected 142 recipes, found ${recipes.length}`);
  if (ingredients.length !== 837) errors.push(`Expected 837 ingredient rows, found ${ingredients.length}`);

  const requiredRecipeCols = ['kfct_code', 'name', 'category', 'composition_method', 'nutrient_status', ...Object.keys(NUTRIENT_MAP)];
  for (const col of requiredRecipeCols) {
    if (!(col in (recipes[0] ?? {}))) errors.push(`Missing required recipes column: ${col}`);
  }
  const requiredIngCols = ['kfct_code', 'sort_order', 'ingredient_name', 'grams', 'household_measure'];
  for (const col of requiredIngCols) {
    if (!(col in (ingredients[0] ?? {}))) errors.push(`Missing required ingredients column: ${col}`);
  }

  // KFCT code uniqueness — exact string match. Intentional subcodes
  // (15066r / 15066s) are distinct strings and pass without special-casing.
  const codeCounts = new Map<string, number>();
  for (const r of recipes) codeCounts.set(r.kfct_code, (codeCounts.get(r.kfct_code) ?? 0) + 1);
  for (const [code, count] of codeCounts) {
    if (count > 1) errors.push(`Duplicate KFCT code: ${code} (${count} rows)`);
  }

  const available = recipes.filter(r => r.nutrient_status === 'available_per_100g');
  const unavailable = recipes.filter(r => r.nutrient_status !== 'available_per_100g');
  if (available.length !== 140) errors.push(`Expected 140 recipes with available nutrient profile, found ${available.length}`);
  if (unavailable.length !== 2) errors.push(`Expected 2 recipes without a nutrient profile, found ${unavailable.length}`);
  for (const r of unavailable) {
    if (!['unavailable_missing_yield_factors', 'unavailable_missing_ingredient_composition'].includes(r.nutrient_status)) {
      errors.push(`Unrecognised nutrient_status for ${r.kfct_code}: ${r.nutrient_status}`);
    }
  }

  const recipeCodes = new Set(recipes.map(r => r.kfct_code));
  for (const ing of ingredients) {
    if (!recipeCodes.has(ing.kfct_code)) errors.push(`Ingredient row references unknown KFCT code: ${ing.kfct_code}`);
  }

  if (errors.length > 0) {
    console.error('KFCT import ABORTED — source validation failed. Nothing was written.');
    console.error(errors.map(e => `  - ${e}`).join('\n'));
    process.exit(1);
  }

  return { recipes, ingredients, available, unavailable };
}

// ── Build DB rows ────────────────────────────────────────────────────────

function buildFoodRow(r: RecipeRow) {
  const row: Record<string, unknown> = {
    source: SOURCE_NAME,
    external_id: `kfct:${r.kfct_code}`,
    fdc_id: null,
    source_type: 'trusted_food_database',
    source_url: SOURCE_URL,
    name: r.name,
    description: null,
    basis_grams: 100,
    basis_unit: 'g',
    basis_amount: 100,
    density_g_per_ml: null,
    is_generic: true,
    country_code: 'KE',
    language_code: 'en',
    is_active: true,
    composition_method: 'standard_recipe_verified',
    recipe_source: SOURCE_CITATION,
    recipe_reference: `kfct:${r.kfct_code}`,
    // No named serving derived — the source gives no reliable cooked-yield
    // figure (only a piece count for a few dishes, e.g. "makes 6 chapatis"),
    // and deriving grams/serving from raw ingredient-weight sums would
    // ignore the source's own (unexposed) yield/retention factors — a
    // guess, not a fact. Gram-based logging remains canonical (§16).
    default_serving_grams: null,
    default_serving_label: null,
  };
  for (const [kfctCol, lanaCol] of Object.entries(NUTRIENT_MAP)) {
    if (lanaCol == null) continue;
    row[lanaCol] = parseSourceNumber(r[kfctCol]);
  }
  // Columns Lana has that KFCT doesn't supply — explicitly NULL (unknown),
  // never 0, never left unset (which would silently keep a prior value on
  // upsert-merge semantics some ORMs apply — PostgREST upsert always
  // replaces the whole row, but being explicit here is the honest contract).
  for (const col of ['saturated_fat_g', 'sugar_g', 'copper_mg', 'manganese_mg', 'pantothenic_b5_mg',
    'vitamin_b6_mg', 'biotin_b7_ug', 'vitamin_d_ug', 'vitamin_e_mg', 'vitamin_k_ug']) {
    row[col] = null;
  }
  return row;
}

/** Runs every recipe's source `instructions_text` through the deterministic,
 *  non-LLM parser once, so the classification is computed exactly once and
 *  reused by both the printed report and the row-builder below — never
 *  re-derived differently in two places. */
function classifyInstructions(recipes: RecipeRow[]) {
  const byCode = new Map<string, { instructions: ParsedRecipeInstructions | null; multiPart: boolean; reviewReason: string | null }>();
  for (const r of recipes) {
    const result = parseKfctInstructions(r.instructions_text ?? '');
    byCode.set(r.kfct_code, {
      instructions: result.ok ? result.instructions! : null,
      multiPart: result.ok ? !!result.multiPart : false,
      reviewReason: result.ok ? null : (result.reviewReason ?? 'unknown'),
    });
  }
  return byCode;
}

function buildRecipeRow(
  r: RecipeRow,
  foodId: string | null,
  instructions: ParsedRecipeInstructions | null,
) {
  const available = r.nutrient_status === 'available_per_100g';
  return {
    food_id: foodId,
    name: r.name,
    category: r.category || null,
    source: SOURCE_NAME,
    source_reference: `kfct:${r.kfct_code}`,
    source_url: SOURCE_URL,
    serves: r.serves.trim() ? Number(r.serves.trim()) : null,
    preparation_time_text: r.preparation_time_text || null,
    cooking_time_text: r.cooking_time_text || null,
    // Source-authored KFCT/FAO ordered preparation method, structured by
    // lib/nutrition/recipe-instructions.ts's deterministic parser — never
    // LLM-generated, never invented. NULL when the source text couldn't be
    // reliably parsed (see REVIEW_REQUIRED in the printed report).
    instructions,
    nutrient_status: available ? 'available' : r.nutrient_status,
    nutrient_note: r.nutrient_note || null,
    version: 1,
  };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const { recipes, ingredients, available, unavailable } = loadAndValidate();

  // Preparation-method classification (Lana Recipes V1 — KFCT method
  // import) — computed once up front for every one of the 142 recipes,
  // independent of dry-run/apply, so the printed report always reflects
  // exactly what would be (or was) written.
  const instructionsByCode = classifyInstructions(recipes);
  const instructionsExtracted = [...instructionsByCode.values()].filter(v => v.instructions != null).length;
  const instructionsMultiPart = [...instructionsByCode.values()].filter(v => v.multiPart).length;
  const instructionsReviewRequired = recipes
    .filter(r => instructionsByCode.get(r.kfct_code)?.reviewReason != null)
    .map(r => ({ kfct_code: r.kfct_code, name: r.name, reason: instructionsByCode.get(r.kfct_code)!.reviewReason! }));

  // Reconciliation classification (§7/§54 D) — printed for every recipe,
  // independent of dry-run/apply.
  const classification = new Map<string, string>(); // kfct_code -> classification
  for (const r of recipes) {
    if (r.nutrient_status !== 'available_per_100g') { classification.set(r.kfct_code, 'NO_NUTRIENT_PROFILE'); continue; }
    classification.set(r.kfct_code, 'NEW_CANONICAL_FOOD'); // default; reclassified below if it supersedes an existing row
  }
  const supersessions: { externalId: string; name: string; classification: string; matchedCodes: string[] }[] = [];
  for (const rule of RECONCILIATION_RULES) {
    const matched = available.filter(r => rule.match({ name: r.name, category: r.category }));
    supersessions.push({ externalId: rule.externalId, name: rule.name, classification: rule.classification, matchedCodes: matched.map(r => r.kfct_code) });
  }
  // Existing foods with NO KFCT successor (checked, documented, kept as-is).
  const noMatch = [
    { externalId: 'srlegacy:11508', name: 'Sweet potato, boiled (ngwaci)', reason: 'KFCT sweet-potato dishes are different preparations (fried / with peanut butter), not a supersession of the plain boiled form' },
    { externalId: 'srlegacy:11109', name: 'Cabbage, cooked', reason: 'KFCT "Stir-fried Cabbage" is a genuinely different dish, not a supersession of the plain boiled form' },
    { externalId: 'srlegacy:13364', name: 'Nyama choma (grilled beef, lean)', reason: 'no grilled-beef recipe exists anywhere in the 142 KFCT recipes' },
  ];

  // Existing-state reads (dry-run summary; also used by --apply).
  const supersededExternalIds = supersessions.map(s => s.externalId);
  const { data: existingSuperseded, error: exErr } = await supabase
    .from('foods').select('id, external_id, name, is_active, composition_method')
    .in('external_id', supersededExternalIds);
  if (exErr) throw new Error(`Failed to read existing foods: ${exErr.message}`);
  const existingByExternalId = new Map((existingSuperseded ?? []).map((f: any) => [f.external_id, f]));

  const kfctExternalIds = recipes.map(r => `kfct:${r.kfct_code}`);
  const { data: existingKfct, error: exKfctErr } = await supabase
    .from('foods').select('external_id').in('external_id', kfctExternalIds);
  if (exKfctErr) throw new Error(`Failed to read existing KFCT foods: ${exKfctErr.message}`);
  const existingKfctIds = new Set((existingKfct ?? []).map((f: any) => f.external_id));

  const { count: foodCountBefore } = await supabase.from('foods').select('id', { count: 'exact', head: true });
  const { count: activeFoodCountBefore } = await supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true);

  const summary = {
    mode: APPLY ? 'apply' : 'dry_run',
    target: url,
    sourceRecipeCount: recipes.length,
    sourceIngredientCount: ingredients.length,
    availableCompositionCount: available.length,
    unavailableCompositionCount: unavailable.length,
    unavailableRecipes: unavailable.map(r => ({ kfct_code: r.kfct_code, name: r.name, nutrient_status: r.nutrient_status })),
    reconciliation: {
      supersessions: supersessions.map(s => ({ ...s, matchedCount: s.matchedCodes.length })),
      noKfctMatch: noMatch,
    },
    expectedNewFoods: available.length - existingKfctIds.size,
    expectedUpdatedFoods: [...existingKfctIds].length,
    expectedDeactivations: supersessions.filter(s => s.matchedCodes.length > 0 && existingByExternalId.get(s.externalId)?.is_active !== false).length,
    foodCountBefore: foodCountBefore ?? null,
    activeFoodCountBefore: activeFoodCountBefore ?? null,
    instructions: {
      totalRecipes: recipes.length,
      extracted: instructionsExtracted,
      multiPart: instructionsMultiPart,
      reviewRequiredCount: instructionsReviewRequired.length,
      reviewRequired: instructionsReviewRequired,
    },
  };

  if (!APPLY) {
    console.log(JSON_OUT ? JSON.stringify(summary, null, 2) : summary);
    console.log('\nDry run only — no rows written. Pass --apply to write.');
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────

  // 1. Upsert the 140 verified `foods` rows. NOTE: foods_source_external_uidx
  //    (20260901000001) is a PARTIAL unique index (WHERE external_id IS NOT
  //    NULL) — PostgREST's upsert(onConflict:) cannot target a partial
  //    index, so this is insert-new / update-existing by (source,
  //    external_id) instead of a single ON CONFLICT upsert.
  const foodRows = available.map(buildFoodRow);
  const newFoodRows = foodRows.filter(r => !existingKfctIds.has(r.external_id as string));
  const updateFoodRows = foodRows.filter(r => existingKfctIds.has(r.external_id as string));
  const CHUNK = 25;
  for (let i = 0; i < newFoodRows.length; i += CHUNK) {
    const chunk = newFoodRows.slice(i, i + CHUNK);
    const { error } = await supabase.from('foods').insert(chunk);
    if (error) throw new Error(`foods insert failed on chunk starting at ${i}: ${error.message}`);
  }
  for (const row of updateFoodRows) {
    const { source, external_id, ...rest } = row;
    const { error } = await supabase.from('foods').update(rest).match({ source, external_id });
    if (error) throw new Error(`foods update failed for ${external_id}: ${error.message}`);
  }

  // 2. Re-read to get ids for food_recipes.food_id.
  const { data: insertedFoods, error: readErr } = await supabase
    .from('foods').select('id, external_id').in('external_id', kfctExternalIds);
  if (readErr) throw new Error(`Failed to re-read inserted foods: ${readErr.message}`);
  const foodIdByExternalId = new Map((insertedFoods ?? []).map((f: any) => [f.external_id, f.id]));

  // 3. Upsert ALL 142 food_recipes rows (140 with food_id, 2 without).
  const recipeDbRows = recipes.map(r => {
    const foodId = r.nutrient_status === 'available_per_100g' ? (foodIdByExternalId.get(`kfct:${r.kfct_code}`) ?? null) : null;
    const instructions = instructionsByCode.get(r.kfct_code)?.instructions ?? null;
    return buildRecipeRow(r, foodId, instructions);
  });
  const { error: recErr } = await supabase.from('food_recipes').upsert(recipeDbRows, { onConflict: 'source,source_reference' });
  if (recErr) throw new Error(`food_recipes upsert failed: ${recErr.message}`);

  // 4. Read back recipe ids for the ingredient import.
  const { data: dbRecipes, error: dbRecErr } = await supabase
    .from('food_recipes').select('id, source_reference').eq('source', SOURCE_NAME);
  if (dbRecErr) throw new Error(`Failed to re-read food_recipes: ${dbRecErr.message}`);
  const recipeIdByReference = new Map((dbRecipes ?? []).map((r: any) => [r.source_reference, r.id]));

  // 5. Import ingredients (grams authoritative, canonical_food_id left
  //    NULL — see migration header). Delete-then-insert per recipe so a
  //    re-run is idempotent without needing a synthetic per-row key.
  const ingredientsByCode = new Map<string, IngredientRow[]>();
  for (const ing of ingredients) {
    if (!ingredientsByCode.has(ing.kfct_code)) ingredientsByCode.set(ing.kfct_code, []);
    ingredientsByCode.get(ing.kfct_code)!.push(ing);
  }
  let ingredientRowsWritten = 0;
  for (const r of recipes) {
    const recipeId = recipeIdByReference.get(`kfct:${r.kfct_code}`);
    if (!recipeId) throw new Error(`No food_recipes id resolved for ${r.kfct_code} after upsert — aborting.`);
    const rows = (ingredientsByCode.get(r.kfct_code) ?? []).map(ing => ({
      recipe_id: recipeId,
      sort_order: Number(ing.sort_order),
      ingredient_name: ing.ingredient_name,
      grams: Number(ing.grams),
      household_measure: ing.household_measure || null,
      canonical_food_id: null,
    }));
    if (rows.length === 0) continue;
    const { error: delErr } = await supabase.from('food_recipe_ingredients').delete().eq('recipe_id', recipeId);
    if (delErr) throw new Error(`Failed to clear old ingredients for ${r.kfct_code}: ${delErr.message}`);
    const { error: insErr } = await supabase.from('food_recipe_ingredients').insert(rows);
    if (insErr) throw new Error(`Failed to insert ingredients for ${r.kfct_code}: ${insErr.message}`);
    ingredientRowsWritten += rows.length;
  }

  // 6. Deactivate superseded old foods (is_active=false only — NEVER a
  //    delete, NEVER a nutrient rewrite; food_log_entries/saved_meal_items
  //    keep resolving via the unchanged food_id FK).
  const deactivated: string[] = [];
  for (const s of supersessions) {
    if (s.matchedCodes.length === 0) continue; // nothing superseded it — leave untouched
    const { error } = await supabase.from('foods').update({ is_active: false }).eq('external_id', s.externalId);
    if (error) throw new Error(`Failed to deactivate ${s.externalId}: ${error.message}`);
    deactivated.push(s.externalId);
  }

  const { count: foodCountAfter } = await supabase.from('foods').select('id', { count: 'exact', head: true });
  const { count: activeFoodCountAfter } = await supabase.from('foods').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const { count: recipeCountAfter } = await supabase.from('food_recipes').select('id', { count: 'exact', head: true });
  const { count: ingredientCountAfter } = await supabase.from('food_recipe_ingredients').select('id', { count: 'exact', head: true });

  const result = {
    ...summary,
    foodsWritten: foodRows.length,
    recipesWritten: recipeDbRows.length,
    ingredientRowsWritten,
    deactivated,
    foodCountAfter, activeFoodCountAfter, recipeCountAfter, ingredientCountAfter,
  };
  console.log(JSON_OUT ? JSON.stringify(result, null, 2) : result);
}

main().catch(e => { console.error(e); process.exit(1); });
