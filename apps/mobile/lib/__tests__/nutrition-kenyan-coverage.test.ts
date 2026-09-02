// Nutrition N7.5 — Kenyan food coverage. These tests exercise the PURE layers
// that the newly-seeded canonical Kenyan foods flow through: the N5 lexical
// matcher (§57/§62) and the N1 portion + snapshot maths (§47/§51/§52/§53).
// The rows themselves are asserted end-to-end against local Supabase in
// supabase/tests/nutrition-kenyan-coverage.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rankCanonicalMatches, isConfidentMatch } from '../nutrition/nutrition-photo.ts';
import { resolveGrams, computeLogSnapshot, scaleNutrients, PortionError } from '../nutrition/food-nutrition.ts';
import { foodProvenanceDisclosure, foodProvenanceTag } from '../nutrition/food-provenance.ts';
import { emptyNutrients, type CanonicalFood, type FoodSearchResult } from '../nutrition/food-types.ts';

// ── fixtures mirroring the seeded rows ──────────────────────────────────
const sr = (name: string, over: Partial<FoodSearchResult> = {}): FoodSearchResult => ({
  id: name, name, brand: null, source: 'ACP standardized recipe', sourceType: 'estimated',
  isGeneric: true, energyKcalPer100g: over.energyKcalPer100g ?? 120,
  compositionMethod: over.compositionMethod ?? null,
});

// The full new Kenyan set + a few pre-existing foods that share tokens.
const CATALOG: FoodSearchResult[] = [
  sr('Ugali (maize meal / posho, cooked)', { energyKcalPer100g: 121 }),
  sr('Maize meal (whole-grain cornmeal)', { source: 'USDA FoodData Central', sourceType: 'trusted_food_database', energyKcalPer100g: 362 }),
  sr('Githeri (boiled maize and beans)'),
  sr('Sukuma wiki (collard/kale greens, fried)'),
  sr('Kale (sukuma wiki), raw', { source: 'USDA FoodData Central', sourceType: 'trusted_food_database' }),
  sr('Chapati (Kenyan-style flatbread)'),
  sr('Mukimo (mashed potato, maize and greens)'),
  sr('Pilau (spiced rice, standard recipe)'),
  sr('White rice, cooked', { source: 'USDA FoodData Central', sourceType: 'trusted_food_database' }),
  sr('Nyama choma (grilled beef, lean)', { sourceType: 'trusted_food_database' }),
  sr('Matoke (boiled green banana / plantain)', { sourceType: 'trusted_food_database' }),
  sr('Banana, raw', { source: 'USDA FoodData Central', sourceType: 'trusted_food_database' }),
];

function searchByIlike(query: string): FoodSearchResult[] {
  const q = query.trim().toLowerCase();
  return CATALOG.filter(f => f.name.toLowerCase().includes(q));
}

// ── §57/§62 — a search term lands on the right canonical dish ────────────
describe('search + lexical matching for Kenyan dishes (§57/§62)', () => {
  for (const [term, expected] of [
    ['ugali', 'Ugali (maize meal / posho, cooked)'],
    ['Ugali', 'Ugali (maize meal / posho, cooked)'],
    ['UGALI', 'Ugali (maize meal / posho, cooked)'],
    ['posho', 'Ugali (maize meal / posho, cooked)'],          // §49 — alias via the name parenthetical
    ['githeri', 'Githeri (boiled maize and beans)'],
    ['chapati', 'Chapati (Kenyan-style flatbread)'],
    ['mukimo', 'Mukimo (mashed potato, maize and greens)'],
    ['pilau', 'Pilau (spiced rice, standard recipe)'],
    ['nyama choma', 'Nyama choma (grilled beef, lean)'],
    ['nyama', 'Nyama choma (grilled beef, lean)'],
    ['matoke', 'Matoke (boiled green banana / plantain)'],
  ] as const) {
    test(`"${term}" → ${expected}`, () => {
      const results = searchByIlike(term);
      assert.ok(results.length >= 1, `expected ≥1 result for "${term}"`);
      const ranked = rankCanonicalMatches(term, results);
      assert.equal(ranked[0].result.name, expected);
      assert.ok(isConfidentMatch(ranked[0]), `"${term}" should be a confident match`);
    });
  }

  test('"ugali" never returns unrelated maize products (only the Ugali row contains "ugali")', () => {
    assert.deepEqual(searchByIlike('ugali').map(r => r.name), ['Ugali (maize meal / posho, cooked)']);
  });

  test('"sukuma wiki" returns BOTH the raw kale and the cooked dish, both confident (dish present; alphabetical tie-break puts raw kale first — known limitation, no relevance ranking in N7.5)', () => {
    const results = searchByIlike('sukuma wiki');
    assert.equal(results.length, 2);
    const ranked = rankCanonicalMatches('sukuma wiki', results);
    assert.ok(ranked.every(r => isConfidentMatch(r)));
    assert.ok(ranked.some(r => r.result.name === 'Sukuma wiki (collard/kale greens, fried)'));
  });

  test('"sukuma" alone (no "wiki") still surfaces both greens options', () => {
    const results = searchByIlike('sukuma');
    assert.deepEqual(
      results.map(r => r.name).sort(),
      ['Kale (sukuma wiki), raw', 'Sukuma wiki (collard/kale greens, fried)'],
    );
  });

  test('an unknown food yields nothing (§63-F — no fabricated result)', () => {
    assert.deepEqual(searchByIlike('spaghetti bolognese'), []);
  });
});

// ── §47/§51 — N1 portion + snapshot maths on the new foods ──────────────
function ugali(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 121; n.proteinG = 2.71; n.carbohydrateG = 25.63; n.fatG = 1.2;
  n.saturatedFatG = 0.17; n.fibreG = 2.43; n.sugarG = 0.21;
  n.potassiumMg = 95.67; n.calciumMg = 2; n.ironMg = 1.15; n.magnesiumMg = 42.33;
  n.vitaminCMg = 0; n.folateB9Ug = 8.33; n.vitaminAUg = 3.67;
  // sodium, vitamin D, B12 deliberately NULL (salt varies / not in source)
  return {
    id: 'ugali', source: 'ACP standardized recipe', externalId: 'acp-recipe:ugali-v1', fdcId: null,
    sourceType: 'estimated', sourceUrl: null,
    name: 'Ugali (maize meal / posho, cooked)', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [
      { label: '1 small serving (150 g)', grams: 150 },
      { label: '1 serving (250 g)', grams: 250 },
      { label: '1 large serving (350 g)', grams: 350 },
    ],
    defaultServingGrams: 250, defaultServingLabel: '1 serving (250 g)',
    isGeneric: true, countryCode: 'KE',
    compositionMethod: 'standard_recipe_estimated', recipeSource: 'ACP estimated standard recipe', recipeReference: 'acp-recipe:ugali-v1',
  };
}
function uji(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 39; n.proteinG = 0.88; n.carbohydrateG = 8.36; n.fatG = 0.39; n.fibreG = 0.79;
  return {
    ...ugali(), id: 'uji', externalId: 'acp-recipe:uji-v1', name: 'Uji (maize / millet porridge)',
    densityGPerMl: 1.02, nutrients: n,
    servings: [{ label: '1 cup (250 g / 245 ml)', grams: 250 }],
    defaultServingGrams: 250, defaultServingLabel: '1 cup (250 g / 245 ml)',
  };
}

describe('N1 portion + snapshot for the new foods (§47/§51/§52)', () => {
  test('Ugali resolves 100 g → a valid frozen snapshot', () => {
    const grams = resolveGrams(ugali(), 100, 'g', null);
    assert.equal(grams, 100);
    const snap = computeLogSnapshot(ugali(), grams);
    assert.equal(snap.energyKcal, 121);
    assert.equal(snap.proteinG, 2.71);
  });

  test('Ugali resolves its named serving deterministically', () => {
    assert.equal(resolveGrams(ugali(), 1, 'serving', '1 serving (250 g)'), 250);
    assert.equal(resolveGrams(ugali(), 2, 'serving', '1 small serving (150 g)'), 300);
    const snap = computeLogSnapshot(ugali(), 250);
    assert.equal(snap.energyKcal, 302.5); // 121 × 2.5
  });

  test('Ugali cannot be logged in ml (no density) — never 1 ml = 1 g (§15/§51)', () => {
    assert.throws(() => resolveGrams(ugali(), 200, 'ml', null), PortionError);
  });

  test('Uji CAN be logged in ml — density is documented (1.02)', () => {
    assert.equal(resolveGrams(uji(), 200, 'ml', null), 204);
  });

  test('§52 — a NULL micronutrient stays NULL through scaling; a measured 0 stays 0', () => {
    const snap = computeLogSnapshot(ugali(), 250);
    assert.equal(snap.sodiumMg, null);      // salt varies → NULL in the seed
    assert.equal(snap.vitaminDUg, null);    // not in source → NULL
    assert.equal(snap.vitaminCMg, 0);       // measured 0 → stays 0
    assert.equal(scaleNutrients(ugali().nutrients, 3).sodiumMg, null);
  });

  test('§53 — snapshot is a pure function of the food + grams (history stability holds by construction)', () => {
    const a = computeLogSnapshot(ugali(), 180);
    const b = computeLogSnapshot(ugali(), 180);
    assert.deepEqual(a, b);
  });

  test('N7.5B — Ugali carries an explicit "estimated standard recipe" classification + reference, and it does NOT change the numbers', () => {
    const u = ugali();
    assert.equal(u.compositionMethod, 'standard_recipe_estimated');
    assert.equal(u.recipeReference, 'acp-recipe:ugali-v1');
    assert.equal(foodProvenanceTag(u.compositionMethod), 'standard recipe');
    assert.match(foodProvenanceDisclosure(u.compositionMethod, u.recipeSource)!, /estimat/i);
    // §22/§30 — provenance metadata never touches arithmetic
    assert.equal(computeLogSnapshot(u, 100).energyKcal, 121);
  });
});
