import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDraft, addComponent, removeComponent, setComponentFood, setComponentPortion,
  reorderComponent, renameDraft, validateDraft, computeSavedMealPreview,
  draftToItemRows, prefillFromEntries, componentsFromPrefill, prepareSavedMealLog,
  defaultPortionForFood, draftFromSavedMeal,
  type SavedMealDraft, type DraftComponent, type SavedMeal,
} from '../nutrition/saved-meal.ts';
import { resolveGrams, computeLogSnapshot, scaleNutrients } from '../nutrition/food-nutrition.ts';
import { emptyNutrients, type CanonicalFood, type Nutrients } from '../nutrition/food-types.ts';

// ── fixtures (USDA-shaped) ───────────────────────────────────────────────
function greekYoghurt(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 59; n.proteinG = 10.19; n.carbohydrateG = 3.6; n.fatG = 0.39;
  n.fibreG = 0; n.sugarG = 3.24; n.calciumMg = 110; n.vitaminB12Ug = 0.75;
  // vitamin D deliberately null
  return {
    id: 'gy', source: 'USDA FoodData Central', externalId: null, fdcId: 170894,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Greek yoghurt, plain, nonfat', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [{ label: '1 container (170 g)', grams: 170 }],
    defaultServingGrams: 170, defaultServingLabel: '1 container (170 g)',
    isGeneric: true, countryCode: null,
  };
}
function banana(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 89; n.proteinG = 1.09; n.carbohydrateG = 22.84; n.fatG = 0.33; n.fibreG = 2.6; n.potassiumMg = 358;
  return {
    id: 'ba', source: 'USDA FoodData Central', externalId: null, fdcId: 173944,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Banana, raw', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [
      { label: '1 small (101 g)', grams: 101 },
      { label: '1 medium (118 g)', grams: 118 },
    ],
    defaultServingGrams: 118, defaultServingLabel: '1 medium (118 g)',
    isGeneric: true, countryCode: null,
  };
}
function oats(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 379; n.proteinG = 13.15; n.carbohydrateG = 67.7; n.fatG = 6.52; n.fibreG = 10.1; n.ironMg = 4.25;
  // no vitamin C at all (null) — completeness must stay honest
  return {
    id: 'oa', source: 'USDA FoodData Central', externalId: null, fdcId: 169705,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Oats, rolled', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [], defaultServingGrams: 40, defaultServingLabel: null,
    isGeneric: true, countryCode: null,
  };
}
function milk(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 61; n.proteinG = 3.15; n.carbohydrateG = 4.8; n.fatG = 3.25; n.fibreG = 0;
  return {
    id: 'mk', source: 'USDA FoodData Central', externalId: null, fdcId: 171265,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Whole milk', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: 1.03, nutrients: n,
    servings: [{ label: '1 cup (244 g)', grams: 244 }],
    defaultServingGrams: 244, defaultServingLabel: '1 cup (244 g)',
    isGeneric: true, countryCode: null,
  };
}
function coffee(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 1; n.proteinG = 0.12; n.potassiumMg = 49;
  return {
    id: 'co', source: 'USDA FoodData Central', externalId: null, fdcId: 171881,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Coffee, brewed', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n, // NO density → ml unsupported
    servings: [], defaultServingGrams: null, defaultServingLabel: null,
    isGeneric: true, countryCode: null,
  };
}

const comp = (food: CanonicalFood, quantity: string, unit: DraftComponent['unit'], servingLabel: string | null = null): DraftComponent =>
  ({ key: `k_${food.id}_${quantity}${unit}`, food, quantity, unit, servingLabel });

function sumKcalIndependently(items: { food: CanonicalFood; grams: number }[]): number {
  let total = 0;
  for (const { food, grams } of items) {
    const snap = scaleNutrients(food.nutrients, grams / food.basisGrams) as Nutrients;
    if (snap.energyKcal != null) total += snap.energyKcal;
  }
  return Math.round(total * 1e4) / 1e4;
}

// ── §51 calculation ─────────────────────────────────────────────────────
describe('computeSavedMealPreview (§51 — deterministic sum of N1 component maths)', () => {
  test('My Breakfast: 250 g yoghurt + 1 medium banana + 30 g oats equals the independent per-component sum', () => {
    const components = [
      comp(greekYoghurt(), '250', 'g'),
      comp(banana(), '1', 'serving', '1 medium (118 g)'),
      comp(oats(), '30', 'g'),
    ];
    const p = computeSavedMealPreview(components);
    const expected = sumKcalIndependently([
      { food: greekYoghurt(), grams: 250 },
      { food: banana(), grams: 118 },
      { food: oats(), grams: 30 },
    ]);
    assert.equal(Math.round(p.energyKcal), Math.round(expected));
    assert.equal(p.unresolved.length, 0);
    assert.equal(p.resolved.length, 3);
    assert.equal(p.complete, true);
    // protein: 25.475 + 1.2862 + 3.945 ≈ 30.7
    assert.equal(Math.round(p.proteinG), 31);
  });

  test('named serving resolves through food_servings grams, not a guess', () => {
    const p = computeSavedMealPreview([comp(banana(), '2', 'serving', '1 small (101 g)')]);
    assert.equal(p.resolved[0].grams, 202);
  });

  test('ml with a real density converts; ml WITHOUT density is unresolved and excluded (never 1 ml = 1 g)', () => {
    const ok = computeSavedMealPreview([comp(milk(), '200', 'ml')]);
    assert.equal(ok.resolved[0].grams, 206); // 200 * 1.03
    assert.equal(ok.unresolved.length, 0);

    const bad = computeSavedMealPreview([comp(coffee(), '40', 'ml'), comp(banana(), '100', 'g')]);
    assert.equal(bad.unresolved.length, 1);
    assert.equal(bad.resolved.length, 1);
    assert.equal(bad.resolved[0].key, 'k_ba_100g');
    assert.equal(bad.complete, false);
  });

  test('missing micronutrient stays NULL (unknown), never 0; a measured 0 stays 0', () => {
    // oats has no vitamin C at all → preview vitaminC must be null, not 0
    const p = computeSavedMealPreview([comp(oats(), '100', 'g')]);
    assert.equal(p.micros.vitaminCMg ?? null, null);
    // yoghurt fibre is a measured 0 → stays 0 in the macro total
    const y = computeSavedMealPreview([comp(greekYoghurt(), '100', 'g')]);
    assert.equal(y.fibreG, 0);
  });

  test('completeness reflects partial nutrient coverage across components (N2 semantics)', () => {
    // yoghurt has calcium, banana does not → calcium coverage = 1/2 → "partial"
    const p = computeSavedMealPreview([comp(greekYoghurt(), '100', 'g'), comp(banana(), '100', 'g')]);
    assert.equal(p.completeness.calciumMg.knownEntryCount, 1);
    assert.equal(p.completeness.calciumMg.totalEntryCount, 2);
    assert.equal(p.completeness.calciumMg.level, 'partial');
    // both have energy → complete
    assert.equal(p.completeness.energyKcal.level, 'complete');
  });

  test('invalid quantity (0 / blank) → component unresolved, totals exclude it', () => {
    const p = computeSavedMealPreview([comp(banana(), '0', 'g'), comp(oats(), '', 'g'), comp(greekYoghurt(), '100', 'g')]);
    assert.equal(p.unresolved.length, 2);
    assert.equal(p.resolved.length, 1);
  });

  test('empty component list → zeroed macros, null micros, not "complete"', () => {
    const p = computeSavedMealPreview([]);
    assert.equal(p.energyKcal, 0);
    assert.equal(p.micros.calciumMg ?? null, null);
    assert.equal(p.complete, false);
  });
});

// ── §52 draft CRUD (pure) ──────────────────────────────────────────────
describe('saved meal draft operations (§52)', () => {
  test('addComponent uses the N1 default portion (serving when available, else grams)', () => {
    let d = emptyDraft();
    d = addComponent(d, banana());
    assert.deepEqual(
      { q: d.components[0].quantity, u: d.components[0].unit, l: d.components[0].servingLabel },
      { q: '1', u: 'serving', l: '1 medium (118 g)' },
    );
    d = addComponent(d, oats());
    assert.deepEqual(
      { q: d.components[1].quantity, u: d.components[1].unit, l: d.components[1].servingLabel },
      { q: '40', u: 'g', l: null },
    );
  });

  test('defaultPortionForFood: grams-only food with no default → 100 g', () => {
    assert.deepEqual(defaultPortionForFood(coffee()), { quantity: '100', unit: 'g', servingLabel: null });
  });

  test('changing a component food re-defaults its portion', () => {
    let d = addComponent(emptyDraft(), banana());
    const key = d.components[0].key;
    d = setComponentPortion(d, key, { quantity: '3', unit: 'g', servingLabel: null });
    d = setComponentFood(d, key, oats());
    assert.equal(d.components[0].food.id, 'oa');
    assert.equal(d.components[0].unit, 'g');
    assert.equal(d.components[0].quantity, '40');
  });

  test('removeComponent / renameDraft', () => {
    let d = addComponent(addComponent(emptyDraft(), banana()), oats());
    d = renameDraft(d, 'My Breakfast');
    d = removeComponent(d, d.components[0].key);
    assert.equal(d.name, 'My Breakfast');
    assert.equal(d.components.length, 1);
    assert.equal(d.components[0].food.id, 'oa');
  });

  test('reorderComponent moves an item and clamps out-of-range targets', () => {
    let d = emptyDraft();
    for (const f of [greekYoghurt(), banana(), oats()]) d = addComponent(d, f);
    d = reorderComponent(d, 2, 0);
    assert.deepEqual(d.components.map(c => c.food.id), ['oa', 'gy', 'ba']);
    d = reorderComponent(d, 0, 99); // clamp to last
    assert.deepEqual(d.components.map(c => c.food.id), ['gy', 'ba', 'oa']);
    assert.deepEqual(reorderComponent(d, 5, 0).components.map(c => c.food.id), ['gy', 'ba', 'oa']); // no-op
  });
});

// ── validation ─────────────────────────────────────────────────────────
describe('validateDraft', () => {
  const withComp = (name: string, cs: DraftComponent[]): SavedMealDraft =>
    ({ id: null, name, description: '', components: cs, provenance: 'user_recipe_from_components' });

  test('blank name → nameError', () => {
    const v = validateDraft(withComp('   ', [comp(banana(), '100', 'g')]));
    assert.equal(v.ok, false);
    assert.ok(v.nameError);
  });
  test('no components → component error with empty key', () => {
    const v = validateDraft(withComp('X', []));
    assert.equal(v.ok, false);
    assert.equal(v.componentErrors[0].key, '');
  });
  test('a component with an unresolvable portion → keyed component error, not ok', () => {
    const bad = comp(coffee(), '40', 'ml');
    const v = validateDraft(withComp('X', [bad, comp(banana(), '100', 'g')]));
    assert.equal(v.ok, false);
    assert.equal(v.componentErrors[0].key, bad.key);
  });
  test('name + ≥1 resolvable component → ok', () => {
    const v = validateDraft(withComp('My Breakfast', [comp(banana(), '1', 'serving', '1 medium (118 g)')]));
    assert.deepEqual({ ok: v.ok, nameError: v.nameError, errs: v.componentErrors.length }, { ok: true, nameError: null, errs: 0 });
  });
  test('name over 80 chars → nameError', () => {
    const v = validateDraft(withComp('x'.repeat(81), [comp(banana(), '100', 'g')]));
    assert.ok(v.nameError);
  });
});

// ── persistence + prefill mapping ──────────────────────────────────────
describe('draftToItemRows / prefill', () => {
  test('draftToItemRows preserves order and only carries serving_label for serving unit', () => {
    let d = emptyDraft();
    d = addComponent(d, greekYoghurt());               // serving
    d = addComponent(d, oats());                        // grams
    const rows = draftToItemRows(d);
    assert.deepEqual(rows.map(r => r.sort_order), [0, 1]);
    assert.equal(rows[0].unit, 'serving');
    assert.equal(rows[0].serving_label, '1 container (170 g)');
    assert.equal(rows[1].unit, 'g');
    assert.equal(rows[1].serving_label, null);
  });

  test('prefillFromEntries keeps canonical entries, drops name-only customs', () => {
    const specs = prefillFromEntries([
      { foodId: 'ba', quantity: 1, unit: 'serving', servingLabel: '1 medium (118 g)', quantityGrams: 118 },
      { foodId: null, quantity: 1, unit: 'serving', servingLabel: null, quantityGrams: null }, // name-only → dropped
      { foodId: 'oa', quantity: 30, unit: 'g', servingLabel: null, quantityGrams: 30 },
    ]);
    assert.deepEqual(specs.map(s => s.foodId), ['ba', 'oa']);
    assert.equal(specs[0].servingLabel, '1 medium (118 g)');
  });

  test('componentsFromPrefill drops specs whose canonical food could not be loaded', () => {
    const byId = new Map([['ba', banana()]]);
    const out = componentsFromPrefill(
      [{ foodId: 'ba', quantity: 2, unit: 'g', servingLabel: null }, { foodId: 'missing', quantity: 1, unit: 'g', servingLabel: null }],
      byId,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].food.id, 'ba');
    assert.equal(out[0].quantity, '2');
  });

  test('draftFromSavedMeal round-trips a persisted meal into an editable draft', () => {
    const meal: SavedMeal = {
      id: 'm1', name: 'My Breakfast', description: null,
      provenance: 'user_recipe_from_components',
      createdAt: 't', updatedAt: 't',
      components: [
        { id: 'i2', food: oats(), quantity: 30, unit: 'g', servingLabel: null, sortOrder: 1 },
        { id: 'i1', food: banana(), quantity: 1, unit: 'serving', servingLabel: '1 medium (118 g)', sortOrder: 0 },
      ],
    };
    const d = draftFromSavedMeal(meal);
    assert.equal(d.id, 'm1');
    assert.deepEqual(d.components.map(c => c.food.id), ['ba', 'oa']); // re-sorted by sortOrder
    assert.equal(d.components[0].quantity, '1');
  });
});

// ── logging → N1 inputs (§54 shape) ───────────────────────────────────
describe('prepareSavedMealLog (§5/§54 — one independent N1 row per component)', () => {
  const components = [
    comp(greekYoghurt(), '250', 'g'),
    comp(banana(), '1', 'serving', '1 medium (118 g)'),
  ];

  test('every component → a FoodLogInput carrying the same logGroupId + savedMealId, capture_method saved_meal', () => {
    const { prepared, errors } = prepareSavedMealLog(components, { slot: 'breakfast', savedMealId: 'm1', logGroupId: 'grp-1' });
    assert.equal(errors.length, 0);
    assert.equal(prepared.length, 2);
    for (const p of prepared) {
      assert.equal(p.input.captureMethod, 'saved_meal');
      assert.equal(p.input.logGroupId, 'grp-1');
      assert.equal(p.input.savedMealId, 'm1');
      assert.equal(p.input.mealSlot, 'breakfast');
    }
    assert.equal(prepared[0].input.foodId, 'gy');
    assert.equal(prepared[0].input.unit, 'g');
    assert.equal(prepared[0].input.servingLabel, null);
    assert.equal(prepared[1].input.unit, 'serving');
    assert.equal(prepared[1].input.servingLabel, '1 medium (118 g)');
    assert.equal(Math.round(prepared[1].previewGrams), 118);
  });

  test('an unresolvable component is reported, its write never attempted', () => {
    const { prepared, errors } = prepareSavedMealLog(
      [comp(coffee(), '40', 'ml'), comp(banana(), '100', 'g')],
      { slot: null, savedMealId: 'm1', logGroupId: 'grp-2' },
    );
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].input.foodId, 'ba');
    assert.equal(errors.length, 1);
  });

  test('preview grams/kcal use the exact N1 maths', () => {
    const { prepared } = prepareSavedMealLog([comp(greekYoghurt(), '250', 'g')], { slot: null, savedMealId: null, logGroupId: 'g' });
    const grams = resolveGrams(greekYoghurt(), 250, 'g', null);
    assert.equal(prepared[0].previewGrams, grams);
    assert.equal(prepared[0].previewKcal, computeLogSnapshot(greekYoghurt(), grams).energyKcal);
  });
});
