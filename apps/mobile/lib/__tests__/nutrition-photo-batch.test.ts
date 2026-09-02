import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBatchLog, summariseBatch } from '../nutrition/nutrition-photo-batch.ts';
import {
  candidateToItem, setItemFood, removeItem, type PhotoConfirmationItem,
} from '../nutrition/nutrition-photo.ts';
import { emptyNutrients, type CanonicalFood } from '../nutrition/food-types.ts';

function banana(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 89; n.proteinG = 1.09; n.carbohydrateG = 22.84; n.fatG = 0.33; n.fibreG = 2.6;
  return {
    id: 'ba', source: 'USDA FoodData Central', externalId: null, fdcId: null,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Banana, raw', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [{ label: '1 medium (118 g)', grams: 118 }],
    defaultServingGrams: 118, defaultServingLabel: '1 medium (118 g)',
    isGeneric: true, countryCode: null,
  };
}
function yoghurt(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 59; n.proteinG = 10.19; n.fibreG = 0;
  return {
    id: 'gy', source: 'USDA FoodData Central', externalId: null, fdcId: null,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Greek yoghurt, plain, nonfat', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null, nutrients: n,
    servings: [], defaultServingGrams: 170, defaultServingLabel: null,
    isGeneric: true, countryCode: null,
  };
}

const matched = (food: CanonicalFood, label: string) => setItemFood(candidateToItem({ label, confidence: 'high' }), food);

describe('prepareBatchLog (§27/§33 — independent N1 rows, camera provenance)', () => {
  test('two confirmed foods → two FoodLogInputs, each with capture_method camera', () => {
    const items = [matched(banana(), 'banana'), matched(yoghurt(), 'yoghurt')];
    const { prepared, errors } = prepareBatchLog(items, 'breakfast');
    assert.equal(errors.length, 0);
    assert.equal(prepared.length, 2);
    for (const p of prepared) {
      assert.equal(p.input.captureMethod, 'camera');
      assert.equal(p.input.mealSlot, 'breakfast');
      assert.ok(p.previewGrams > 0);
    }
    assert.equal(prepared[0].input.foodId, 'ba');
    assert.equal(prepared[1].input.foodId, 'gy');
  });

  test('preview grams/kcal use the exact N1 pure maths', () => {
    const [p] = prepareBatchLog([matched(banana(), 'banana')], null).prepared;
    // default portion = 1 serving of 118 g → 89 kcal/100g * 1.18
    assert.equal(Math.round(p.previewGrams), 118);
    assert.equal(Math.round(p.previewKcal!), Math.round(89 * 1.18));
  });

  test('removed and unmatched items are excluded', () => {
    const items: PhotoConfirmationItem[] = [
      matched(banana(), 'banana'),
      removeItem(matched(yoghurt(), 'yoghurt')),
      candidateToItem({ label: 'unknown thing', confidence: 'low' }),
    ];
    const { prepared } = prepareBatchLog(items, 'lunch');
    assert.deepEqual(prepared.map(p => p.input.foodId), ['ba']);
  });

  test('an invalid portion is caught deterministically — that item errors, the write is never attempted', () => {
    const bad = { ...matched(banana(), 'banana'), quantity: '0' };
    const { prepared, errors } = prepareBatchLog([bad, matched(yoghurt(), 'yoghurt')], 'dinner');
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].input.foodId, 'gy');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].itemId, bad.id);
  });

  test('serving unit carries the serving label; grams/ml do not', () => {
    const g = { ...matched(yoghurt(), 'yoghurt'), unit: 'g' as const, quantity: '200' };
    const [p] = prepareBatchLog([g], null).prepared;
    assert.equal(p.input.unit, 'g');
    assert.equal(p.input.servingLabel, null);

    const s = { ...matched(banana(), 'banana') }; // default is a serving
    const [ps] = prepareBatchLog([s], null).prepared;
    assert.equal(ps.input.unit, 'serving');
    assert.equal(ps.input.servingLabel, '1 medium (118 g)');
  });
});

describe('summariseBatch (§28 — never a false "all done")', () => {
  test('all ok', () => {
    const out = summariseBatch([{ itemId: 'a', ok: true, entryId: 'e1' }, { itemId: 'b', ok: true, entryId: 'e2' }]);
    assert.deepEqual({ allOk: out.allOk, loggedCount: out.loggedCount, failedCount: out.failedCount }, { allOk: true, loggedCount: 2, failedCount: 0 });
  });

  test('partial failure is reported truthfully', () => {
    const out = summariseBatch([{ itemId: 'a', ok: true, entryId: 'e1' }, { itemId: 'b', ok: false, error: 'network' }]);
    assert.equal(out.allOk, false);
    assert.equal(out.loggedCount, 1);
    assert.equal(out.failedCount, 1);
  });

  test('empty batch is not "all ok"', () => {
    assert.equal(summariseBatch([]).allOk, false);
  });

  test('retry re-keys only the failed itemId — a merged result set never double-counts a success', () => {
    const first = [{ itemId: 'a', ok: true, entryId: 'e1' }, { itemId: 'b', ok: false, error: 'x' }];
    const retry = [{ itemId: 'b', ok: true, entryId: 'e2' }];
    const merged = new Map<string, (typeof first)[number]>();
    for (const r of [...first, ...retry]) merged.set(r.itemId, r);
    const out = summariseBatch([...merged.values()]);
    assert.equal(out.loggedCount, 2);
    assert.equal(out.failedCount, 0);
  });
});
