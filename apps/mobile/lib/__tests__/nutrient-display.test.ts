import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NUTRIENT_KEYS, type NutrientKey } from '../nutrition/food-types.ts';
import {
  NUTRIENT_UNIT, NUTRIENT_LABEL, nutrientUnit,
  MACRO_DISPLAY_ORDER, KEY_NUTRIENTS, SECONDARY_NUTRIENTS, formatNutrientAmount,
} from '../nutrition/nutrient-display.ts';

describe('nutrient units (§17)', () => {
  test('every canonical key has a unit ∈ {kcal,g,mg,µg}', () => {
    for (const k of NUTRIENT_KEYS) {
      const u = NUTRIENT_UNIT[k];
      assert.ok(['kcal', 'g', 'mg', 'µg'].includes(u), `${k} → ${u}`);
    }
  });
  test('unit is derived from the key suffix, consistently', () => {
    assert.equal(nutrientUnit('energyKcal'), 'kcal');
    assert.equal(nutrientUnit('proteinG'), 'g');
    assert.equal(nutrientUnit('sodiumMg'), 'mg');
    assert.equal(nutrientUnit('vitaminB12Ug'), 'µg');
    assert.equal(nutrientUnit('folateB9Ug'), 'µg');
    assert.equal(nutrientUnit('vitaminDUg'), 'µg');
    assert.equal(nutrientUnit('vitaminEMg'), 'mg');
  });
  test('every key has a non-empty human label', () => {
    for (const k of NUTRIENT_KEYS) {
      assert.equal(typeof NUTRIENT_LABEL[k], 'string');
      assert.ok(NUTRIENT_LABEL[k].length > 0, k);
    }
  });
});

describe('display lists partition the nutrient set (§16)', () => {
  test('macros + key + secondary = NUTRIENT_KEYS exactly, no overlap', () => {
    const all = [...MACRO_DISPLAY_ORDER, ...KEY_NUTRIENTS, ...SECONDARY_NUTRIENTS];
    assert.equal(all.length, NUTRIENT_KEYS.length, 'no duplicates, full cover');
    assert.equal(new Set(all).size, NUTRIENT_KEYS.length);
    for (const k of NUTRIENT_KEYS) assert.ok(all.includes(k as NutrientKey), `${k} missing from a display list`);
  });
  test('key nutrients excludes macros', () => {
    for (const k of KEY_NUTRIENTS) assert.ok(!MACRO_DISPLAY_ORDER.includes(k));
  });
});

describe('formatNutrientAmount — no invented precision', () => {
  test('kcal is always whole', () => {
    assert.equal(formatNutrientAmount(147.53, 'kcal'), '148');
    assert.equal(formatNutrientAmount(0, 'kcal'), '0');
  });
  test('small values keep 1 dp, large values round', () => {
    assert.equal(formatNutrientAmount(2.44, 'mg'), '2.4');
    assert.equal(formatNutrientAmount(0.367, 'mg'), '0.4');
    assert.equal(formatNutrientAmount(358, 'mg'), '358');
    assert.equal(formatNutrientAmount(12.6, 'g'), '13');
    assert.equal(formatNutrientAmount(9.99, 'g'), '10');
  });
});
