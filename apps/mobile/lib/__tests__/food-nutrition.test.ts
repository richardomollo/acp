import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateQuantity, resolveGrams, scaleNutrients, computeLogSnapshot, sumDailyNutrition, PortionError,
} from '../nutrition/food-nutrition.ts';
import { emptyNutrients, type Nutrients, type CanonicalFood } from '../nutrition/food-types.ts';

// Per-100 g Greek yoghurt, nonfat (USDA SR Legacy 01256) — the acceptance food.
function greekYoghurt(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 59; n.proteinG = 10.19; n.carbohydrateG = 3.6; n.fatG = 0.39;
  n.fibreG = 0;            // measured zero — must stay 0, never become null
  n.sugarG = 3.24; n.sodiumMg = 36; n.calciumMg = 110; n.potassiumMg = 141;
  n.vitaminB12Ug = 0.75;
  // vitamin D deliberately left null (unknown for this record) — must stay null
  return {
    id: 'gy', source: 'USDA FoodData Central', externalId: 'srlegacy:01256', fdcId: 170894,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Greek yoghurt, plain, nonfat', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null,
    nutrients: n, servings: [{ label: '1 container (170 g)', grams: 170 }],
    defaultServingGrams: 170, defaultServingLabel: '1 container (170 g)',
    isGeneric: true, countryCode: null,
  };
}

function banana(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 89; n.proteinG = 1.09; n.carbohydrateG = 22.84; n.fatG = 0.33; n.fibreG = 2.6; n.potassiumMg = 358;
  return {
    id: 'ba', source: 'USDA FoodData Central', externalId: 'srlegacy:09040', fdcId: 173944,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Banana, raw', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null,
    nutrients: n,
    servings: [
      { label: '1 small (101 g)', grams: 101 },
      { label: '1 medium (118 g)', grams: 118 },
      { label: '1 large (136 g)', grams: 136 },
    ],
    defaultServingGrams: 118, defaultServingLabel: '1 medium (118 g)',
    isGeneric: true, countryCode: null,
  };
}

function milk(): CanonicalFood {
  const n = emptyNutrients();
  n.energyKcal = 61; n.proteinG = 3.15; n.carbohydrateG = 4.8; n.fatG = 3.25; n.fibreG = 0;
  return {
    id: 'mk', source: 'USDA FoodData Central', externalId: 'srlegacy:01077', fdcId: 171265,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Whole milk', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: 1.03, // ml→g allowed
    nutrients: n, servings: [{ label: '1 cup (244 g)', grams: 244 }],
    defaultServingGrams: 244, defaultServingLabel: '1 cup (244 g)',
    isGeneric: true, countryCode: null,
  };
}

describe('validateQuantity (§38)', () => {
  test('accepts a positive finite number', () => {
    assert.equal(validateQuantity(250), 250);
    assert.equal(validateQuantity(0.5), 0.5);
  });
  test('rejects zero, negative, NaN, Infinity and non-numbers', () => {
    for (const bad of [0, -1, -0.001, NaN, Infinity, -Infinity, '250', null, undefined, {}]) {
      assert.throws(() => validateQuantity(bad as number), PortionError, `should reject ${String(bad)}`);
    }
  });
});

describe('scaleNutrients — missing ≠ zero (§38)', () => {
  test('scales known values, keeps null null, keeps measured 0 as 0', () => {
    const scaled = scaleNutrients(greekYoghurt().nutrients, 2.5); // 250 g
    assert.equal(scaled.energyKcal, 147.5);
    assert.equal(scaled.proteinG, 25.475);
    assert.equal(scaled.fibreG, 0, 'measured zero must stay 0');
    assert.equal(scaled.vitaminDUg, null, 'unknown must stay null');
    assert.equal(scaled.vitaminB12Ug, 1.875);
  });
  test('factor 0.5 (50 g) and factor 1 (100 g)', () => {
    assert.equal(scaleNutrients(greekYoghurt().nutrients, 0.5).energyKcal, 29.5);
    assert.equal(scaleNutrients(greekYoghurt().nutrients, 1).energyKcal, 59);
  });
});

describe('resolveGrams — portion is first-class (§7/§8/§9)', () => {
  test('grams pass through', () => {
    assert.equal(resolveGrams(greekYoghurt(), 250, 'g'), 250);
  });
  test('a named serving resolves to its grams (never invented)', () => {
    assert.equal(resolveGrams(banana(), 1, 'serving', '1 medium (118 g)'), 118);
    assert.equal(resolveGrams(banana(), 2, 'serving', '1 small (101 g)'), 202);
  });
  test('no serving label but a single default serving → uses the default', () => {
    assert.equal(resolveGrams(banana(), 1, 'serving'), 118);
  });
  test('unknown serving label is rejected — servings are never fabricated', () => {
    assert.throws(() => resolveGrams(banana(), 1, 'serving', '1 gigantic'),
      (e: unknown) => e instanceof PortionError && e.code === 'serving_unknown');
  });
  test('ml is allowed ONLY with a real density', () => {
    assert.equal(resolveGrams(milk(), 250, 'ml'), 257.5); // 250 * 1.03
    assert.throws(() => resolveGrams(greekYoghurt(), 250, 'ml'),
      (e: unknown) => e instanceof PortionError && e.code === 'unit_not_supported',
      'no density → ml must be refused, not faked as 1:1');
  });
  test('invalid quantity rejected before any unit maths', () => {
    assert.throws(() => resolveGrams(milk(), 0, 'g'),
      (e: unknown) => e instanceof PortionError && e.code === 'invalid_quantity');
  });
});

describe('computeLogSnapshot — deterministic per-quantity scaling (§38)', () => {
  test('250 g Greek yoghurt = 2.5 × per-100 g', () => {
    const snap = computeLogSnapshot(greekYoghurt(), 250);
    assert.equal(snap.energyKcal, 147.5);
    assert.equal(snap.proteinG, 25.475);
    assert.equal(snap.carbohydrateG, 9);
    assert.equal(snap.fatG, 0.975);
    assert.equal(snap.fibreG, 0);
    assert.equal(snap.vitaminDUg, null);
  });
  test('same input → identical output (pure)', () => {
    assert.deepEqual(computeLogSnapshot(banana(), 118), computeLogSnapshot(banana(), 118));
  });
  test('rejects non-positive grams and a zero basis', () => {
    assert.throws(() => computeLogSnapshot(greekYoghurt(), 0), PortionError);
    assert.throws(() => computeLogSnapshot({ basisGrams: 0, nutrients: emptyNutrients() }, 100), PortionError);
  });
});

describe('sumDailyNutrition — totals from real entries only (§21)', () => {
  const entry = (n: Partial<Nutrients>) => {
    const base = emptyNutrients();
    return { nutrients: { ...base, ...n } as Nutrients };
  };

  test('macros sum; a nutrient unknown on every entry stays null (micro) / 0 (macro)', () => {
    const day = [
      entry({ energyKcal: 148, proteinG: 25.5, fibreG: 0, potassiumMg: 353 }),  // yoghurt 250 g
      entry({ energyKcal: 105, proteinG: 1.3, fibreG: 3.1, potassiumMg: 422 }), // banana 118 g
      entry({ energyKcal: 2, proteinG: 0.3, fibreG: 0 }),                        // coffee 237 g (potassium null here)
    ];
    const { macros, micros } = sumDailyNutrition(day);
    assert.equal(macros.energyKcal, 255);
    assert.equal(macros.proteinG, 27.1);
    assert.equal(macros.fibreG, 3.1);
    assert.equal(micros.potassiumMg, 775);     // summed over the 2 entries that knew it
    assert.equal(micros.vitaminDUg, null, 'no entry supplied vit D → stays unknown, never 0');
  });

  test('a day of only name-only custom entries totals 0 macros, null micros (not fabricated)', () => {
    const { macros, micros } = sumDailyNutrition([entry({}), entry({})]);
    assert.deepEqual(macros, { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 });
    assert.equal(micros.ironMg, null);
  });

  test('empty day → all-zero macros', () => {
    assert.deepEqual(sumDailyNutrition([]).macros, { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 });
  });
});

describe('canonical acceptance arithmetic (§27/§43)', () => {
  test('Greek yoghurt 250 g + banana 1 medium + coffee 250 ml → deterministic breakfast total', () => {
    const gy = computeLogSnapshot(greekYoghurt(), resolveGrams(greekYoghurt(), 250, 'g'));
    const ba = computeLogSnapshot(banana(), resolveGrams(banana(), 1, 'serving', '1 medium (118 g)'));
    // "flat white" is a composed drink (no composition model in N1) → milk + coffee logged separately.
    const coffee = (() => {
      const n = emptyNutrients(); n.energyKcal = 1; n.proteinG = 0.12; n.carbohydrateG = 0; n.fatG = 0.02; n.fibreG = 0;
      return { id: 'cf', source: 'USDA FoodData Central', externalId: 'srlegacy:14209', fdcId: 171890, sourceType: 'trusted_food_database' as const,
        sourceUrl: null, name: 'Coffee, brewed, black', brand: null, description: null,
        basisGrams: 100, basisUnit: 'g' as const, densityGPerMl: 1.0, nutrients: n,
        servings: [{ label: '1 cup (237 g)', grams: 237 }], defaultServingGrams: 237, defaultServingLabel: '1 cup (237 g)',
        isGeneric: true, countryCode: null };
    })();
    const cf = computeLogSnapshot(coffee, resolveGrams(coffee, 250, 'ml')); // 250 g (density 1.0)

    const { macros } = sumDailyNutrition([{ nutrients: gy }, { nutrients: ba }, { nutrients: cf }]);
    // yoghurt 147.5 + banana 105.02 + coffee 2.5  ≈ 255.02 kcal
    assert.ok(Math.abs(macros.energyKcal - 255.02) < 0.05, `kcal was ${macros.energyKcal}`);
    // protein: 25.475 + 1.2862 + 0.3  ≈ 27.06 g
    assert.ok(Math.abs(macros.proteinG - 27.06) < 0.05, `protein was ${macros.proteinG}`);
    assert.equal(ba.energyKcal, 105.02); // 89 * 1.18
  });
});
