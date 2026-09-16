// ACP Intelligence™ — Nutrition: legacy Kenyan meal-suggestion canonicalisation.
//
// DEPLOYMENT / AUTHORING TOOLING ONLY, same shape as
// import-kfct-recipes.ts / deploy-nutrition-catalogue.ts.
//
// What it does:
//   1. Reads every `meals` row with cuisine='kenyan' (the canonical
//      taxonomy value — 20260829000002_international_nutrition_expansion.sql).
//   2. Classifies each with the SAME kind of deliberate, reviewable
//      keyword rules used in import-kfct-recipes.ts's RECONCILIATION_RULES
//      (never fuzzy string distance): does the meal's name match a known
//      KFCT dish family, AND does at least one ACTIVE, verified
//      (composition_method='standard_recipe_verified', country_code='KE')
//      `foods` row from that same family already exist?
//        SUPERSEDED_BY_KFCT — both yes. Deactivated (is_active=false).
//        REVIEW_REQUIRED    — name matches a family keyword, but no active
//                              KFCT equivalent was found (should not happen
//                              after import-kfct-recipes.ts has run; flagged
//                              rather than silently deactivated).
//        KEEP_ACTIVE        — no family-keyword match at all. Left exactly
//                              as-is (no KFCT equivalent claimed).
//   3. NEVER deletes a `meals` row, NEVER touches `meal_plan_items` or
//      `meal_logs` — is_active=false is the same non-destructive mechanism
//      import-kfct-recipes.ts already used for `foods`, and is already the
//      exact predicate the live suggestion engine
//      (services/nutrition-recommendation-service.ts fetchCandidatesBySlot)
//      filters new candidates on — so no suggestion-engine code changes are
//      needed for this to take effect. meal_plan_items.meal_id has no
//      ON DELETE cascade (RESTRICT by default) and this script never
//      deletes anyway, so historical plans keep resolving regardless.
//   4. Prints, for every superseded row, its meal_plan_items/meal_logs
//      reference counts — for human review, not because they gate anything
//      (a deactivation is always safe regardless of reference count).
//
// Safety: identical posture to import-kfct-recipes.ts — dry run by
// default, --apply to write, local-only unless
// ACP_ALLOW_REMOTE_MEAL_CANONICALISATION=1, fails loudly and writes
// nothing on any unexpected shape.
//
// Usage (from apps/mobile/):
//   node scripts/canonicalise-legacy-kenyan-meals.ts              # dry run, local
//   node scripts/canonicalise-legacy-kenyan-meals.ts --apply       # apply, local
//   node scripts/canonicalise-legacy-kenyan-meals.ts --json

import { createClient } from '@supabase/supabase-js';
import { matchedRecipeFamilies } from '../lib/nutrition/recipe-model.ts';

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
if (!isLocal && process.env.ACP_ALLOW_REMOTE_MEAL_CANONICALISATION !== '1') {
  console.error(
    `Refusing to run: target URL "${url}" is not local, and ACP_ALLOW_REMOTE_MEAL_CANONICALISATION=1 is not set.\n` +
    'This tool has only ever been rehearsed against the local Supabase instance. Production release is a separate, explicitly-authorized step.',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// The ONE family matcher, shared with app/meal-detail.tsx's "verified
// recipe available" link — see lib/nutrition/recipe-model.ts's own header
// for why this moved there (never duplicated).
const familiesOf = matchedRecipeFamilies;

interface MealRow {
  id: string; name: string; category: string; cuisine: string;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fibre_g: number | null;
  ingredients: string[]; source: string | null; source_type: string | null; is_active: boolean;
}

async function main() {
  const { data: mealsData, error: mealsErr } = await supabase
    .from('meals')
    .select('id, name, category, cuisine, calories, protein_g, carbs_g, fat_g, fibre_g, ingredients, source, source_type, is_active')
    .eq('cuisine', 'kenyan');
  if (mealsErr) throw new Error(`Failed to read meals: ${mealsErr.message}`);
  const meals = (mealsData ?? []) as MealRow[];

  const { data: kfctFoodsData, error: kfctErr } = await supabase
    .from('foods')
    .select('id, name')
    .eq('country_code', 'KE')
    .eq('composition_method', 'standard_recipe_verified')
    .eq('is_active', true);
  if (kfctErr) throw new Error(`Failed to read KFCT foods: ${kfctErr.message}`);
  const kfctFoods = (kfctFoodsData ?? []) as { id: string; name: string }[];

  const kfctFamilyIndex = new Map<string, { id: string; name: string }[]>();
  for (const f of kfctFoods) {
    for (const fam of familiesOf(f.name)) {
      if (!kfctFamilyIndex.has(fam)) kfctFamilyIndex.set(fam, []);
      kfctFamilyIndex.get(fam)!.push(f);
    }
  }

  interface Classification {
    meal: MealRow;
    classification: 'SUPERSEDED_BY_KFCT' | 'REVIEW_REQUIRED' | 'KEEP_ACTIVE';
    matchedFamilies: string[];
    kfctEquivalents: string[]; // names, for the report
    mealPlanItemCount: number;
    mealLogCount: number;
  }

  const classifications: Classification[] = [];
  for (const meal of meals) {
    const families = familiesOf(meal.name);
    const kfctEquivalents = [...new Set(families.flatMap(f => (kfctFamilyIndex.get(f) ?? []).map(x => x.name)))];

    const { count: mealPlanItemCount } = await supabase
      .from('meal_plan_items').select('id', { count: 'exact', head: true }).eq('meal_id', meal.id);
    const { data: itemIdsData } = await supabase.from('meal_plan_items').select('id').eq('meal_id', meal.id);
    const itemIds = (itemIdsData ?? []).map((r: any) => r.id);
    let mealLogCount = 0;
    if (itemIds.length > 0) {
      const { count } = await supabase.from('meal_logs').select('id', { count: 'exact', head: true }).in('meal_plan_item_id', itemIds);
      mealLogCount = count ?? 0;
    }

    let classification: Classification['classification'];
    if (families.length === 0) classification = 'KEEP_ACTIVE';
    else if (kfctEquivalents.length > 0) classification = 'SUPERSEDED_BY_KFCT';
    else classification = 'REVIEW_REQUIRED';

    classifications.push({ meal, classification, matchedFamilies: families, kfctEquivalents, mealPlanItemCount: mealPlanItemCount ?? 0, mealLogCount });
  }

  const superseded = classifications.filter(c => c.classification === 'SUPERSEDED_BY_KFCT');
  const reviewRequired = classifications.filter(c => c.classification === 'REVIEW_REQUIRED');
  const keepActive = classifications.filter(c => c.classification === 'KEEP_ACTIVE');

  const summary = {
    mode: APPLY ? 'apply' : 'dry_run',
    target: url,
    kenyanMealCount: meals.length,
    kfctFamilyEquivalentsIndexed: [...kfctFamilyIndex.keys()],
    superseded: superseded.map(c => ({
      id: c.meal.id, name: c.meal.name, category: c.meal.category, wasActive: c.meal.is_active,
      matchedFamilies: c.matchedFamilies, kfctEquivalentCount: c.kfctEquivalents.length,
      mealPlanItemCount: c.mealPlanItemCount, mealLogCount: c.mealLogCount,
    })),
    reviewRequired: reviewRequired.map(c => ({ id: c.meal.id, name: c.meal.name, matchedFamilies: c.matchedFamilies })),
    keepActiveCount: keepActive.length,
    keepActiveNames: keepActive.map(c => c.meal.name),
    expectedDeactivations: superseded.filter(c => c.meal.is_active).length,
  };

  if (!APPLY) {
    console.log(JSON_OUT ? JSON.stringify(summary, null, 2) : summary);
    console.log('\nDry run only — no rows written. Pass --apply to write.');
    return;
  }

  if (reviewRequired.length > 0) {
    console.error('Canonicalisation ABORTED — REVIEW_REQUIRED rows exist (a family keyword matched but no active KFCT equivalent was found). Nothing was written.');
    console.error(JSON.stringify(reviewRequired.map(c => ({ id: c.meal.id, name: c.meal.name })), null, 2));
    process.exit(1);
  }

  let deactivated = 0;
  for (const c of superseded) {
    if (!c.meal.is_active) continue; // already inactive — idempotent no-op
    const { error } = await supabase.from('meals').update({ is_active: false }).eq('id', c.meal.id);
    if (error) throw new Error(`Failed to deactivate meal ${c.meal.id} (${c.meal.name}): ${error.message}`);
    deactivated++;
  }

  console.log(JSON_OUT ? JSON.stringify({ ...summary, deactivated }, null, 2) : { ...summary, deactivated });
}

main().catch(e => { console.error(e); process.exit(1); });
