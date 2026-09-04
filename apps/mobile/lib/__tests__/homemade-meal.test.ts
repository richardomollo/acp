import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseManualNutrition, hasAnyManualNutrient, buildManualHomemadeMealInput,
  normaliseUserNutrients, savedMealProvenanceDisclosure, savedMealProvenanceTag,
  MANUAL_MACRO_FIELDS, USER_PROVIDED_NUTRITION_DISCLOSURE, HOMEMADE_MEAL_SOURCE,
} from '../nutrition/homemade-meal.ts';
import { NUTRIENT_KEYS } from '../nutrition/food-types.ts';

// ACP Intelligence™ — Nutrition N6.5 (Beta Feedback #018). Universal
// cooked-meal logging. These assert the two hard rules of the feature:
//   • a blank nutrient stays UNKNOWN (null), never 0;
//   • the user's own numbers are logged verbatim as an estimate — nothing
//     scales, cross-fills, or invents a value, and micronutrients are never
//     guessed.

describe('parseManualNutrition — blank ≠ zero', () => {
  test('every field blank → all null, nothing "filled", ok', () => {
    const r = parseManualNutrition({});
    assert.equal(r.ok, true);
    assert.deepEqual(r.filled, []);
    for (const k of MANUAL_MACRO_FIELDS) assert.equal(r.nutrients[k], null);
  });

  test('whitespace-only is treated as blank (null), not 0', () => {
    const r = parseManualNutrition({ energyKcal: '   ', proteinG: '\t' });
    assert.equal(r.nutrients.energyKcal, null);
    assert.equal(r.nutrients.proteinG, null);
    assert.deepEqual(r.filled, []);
  });

  test('a partial fill sets only those fields; the rest stay null', () => {
    const r = parseManualNutrition({ energyKcal: '520', proteinG: '28' });
    assert.equal(r.ok, true);
    assert.equal(r.nutrients.energyKcal, 520);
    assert.equal(r.nutrients.proteinG, 28);
    assert.equal(r.nutrients.carbohydrateG, null);
    assert.equal(r.nutrients.fatG, null);
    assert.equal(r.nutrients.fibreG, null);
    assert.deepEqual(new Set(r.filled), new Set(['energyKcal', 'proteinG']));
  });

  test('an explicit "0" is a measured zero and is kept', () => {
    const r = parseManualNutrition({ fibreG: '0' });
    assert.equal(r.nutrients.fibreG, 0);
    assert.deepEqual(r.filled, ['fibreG']);
  });

  test('negative → field error, not ok', () => {
    const r = parseManualNutrition({ energyKcal: '-10' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.energyKcal);
    assert.equal(r.nutrients.energyKcal, null);
  });

  test('non-numeric → field error, not ok', () => {
    const r = parseManualNutrition({ proteinG: 'lots' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.proteinG);
  });

  test('does not cross-fill — macros present never synthesise a kcal value', () => {
    const r = parseManualNutrition({ proteinG: '10', carbohydrateG: '20', fatG: '5' });
    assert.equal(r.nutrients.energyKcal, null);
  });
});

describe('hasAnyManualNutrient', () => {
  test('false when nothing filled, true once a macro is set', () => {
    assert.equal(hasAnyManualNutrient(parseManualNutrition({})), false);
    assert.equal(hasAnyManualNutrient(parseManualNutrition({ energyKcal: '100' })), true);
  });
});

describe('normaliseUserNutrients — never smuggles a bad or invented value', () => {
  test('keeps listed finite non-negative values, everything else null', () => {
    const n = normaliseUserNutrients({ energyKcal: 300, proteinG: 12, fatG: 0 });
    assert.equal(n.energyKcal, 300);
    assert.equal(n.proteinG, 12);
    assert.equal(n.fatG, 0);
    assert.equal(n.carbohydrateG, null);
  });

  test('drops NaN / negative / non-number, leaving null', () => {
    const n = normaliseUserNutrients({ energyKcal: NaN, proteinG: -3, fatG: 'x' as unknown as number });
    assert.equal(n.energyKcal, null);
    assert.equal(n.proteinG, null);
    assert.equal(n.fatG, null);
  });

  test('null / undefined input → a full all-null vector', () => {
    const n = normaliseUserNutrients(null);
    for (const k of NUTRIENT_KEYS) assert.equal(n[k], null);
  });
});

describe('buildManualHomemadeMealInput — the N1 row it produces', () => {
  const base = { name: 'Mum’s beef stew', grams: 350, macros: { energyKcal: '520', proteinG: '31' }, mealSlot: 'dinner' as const };

  test('valid input → a food_id-less, user-provided estimate row', () => {
    const r = buildManualHomemadeMealInput(base);
    assert.equal(r.ok, true);
    const i = r.input!;
    assert.equal(i.foodId, null);
    assert.equal(i.displayName, 'Mum’s beef stew');
    assert.equal(i.unit, 'g');
    assert.equal(i.quantity, 350);
    assert.equal(i.captureMethod, 'manual');
    assert.equal(i.userProvidedNutrition, true);
    assert.equal(i.mealSlot, 'dinner');
  });

  test('only the macros the user typed are carried; nothing else is present', () => {
    const r = buildManualHomemadeMealInput(base);
    assert.deepEqual(r.input!.nutrients, { energyKcal: 520, proteinG: 31 });
  });

  test('micronutrients are never populated — not even as 0', () => {
    const r = buildManualHomemadeMealInput({ ...base, macros: { energyKcal: '400', proteinG: '20', carbohydrateG: '30', fatG: '10', fibreG: '4' } });
    const micros = NUTRIENT_KEYS.filter(k => !(MANUAL_MACRO_FIELDS as readonly string[]).includes(k));
    for (const k of micros) assert.equal((r.input!.nutrients as Record<string, unknown>)[k], undefined);
  });

  test('blank name → form error, no input', () => {
    const r = buildManualHomemadeMealInput({ ...base, name: '   ' });
    assert.equal(r.ok, false);
    assert.ok(r.formErrors.name);
    assert.equal(r.input, undefined);
  });

  test('missing / non-positive grams → form error (grams-first)', () => {
    assert.equal(buildManualHomemadeMealInput({ ...base, grams: 0 }).ok, false);
    assert.equal(buildManualHomemadeMealInput({ ...base, grams: NaN }).ok, false);
    assert.ok(buildManualHomemadeMealInput({ ...base, grams: -5 }).formErrors.grams);
  });

  test('a bad macro blocks the whole log', () => {
    const r = buildManualHomemadeMealInput({ ...base, macros: { energyKcal: '520', proteinG: '-1' } });
    assert.equal(r.ok, false);
    assert.ok(r.macroErrors.proteinG);
  });

  test('no macros at all is still allowed — an unknown-nutrition portion, counts nothing', () => {
    const r = buildManualHomemadeMealInput({ name: 'Leftover curry', grams: 300, macros: {} });
    assert.equal(r.ok, true);
    assert.deepEqual(r.input!.nutrients, {});
    assert.equal(r.input!.userProvidedNutrition, true);
  });

  test('portion note is trimmed onto the row note, blank → null', () => {
    assert.equal(buildManualHomemadeMealInput({ ...base, portionNote: '  1 big bowl  ' }).input!.note, '1 big bowl');
    assert.equal(buildManualHomemadeMealInput({ ...base, portionNote: '   ' }).input!.note, null);
  });
});

describe('saved-meal provenance disclosure', () => {
  test('an ingredient-summed meal needs no caveat; an estimated one is disclosed', () => {
    assert.equal(savedMealProvenanceDisclosure('user_recipe_from_components'), null);
    assert.match(savedMealProvenanceDisclosure('user_meal_estimated')!, /estimate/i);
    assert.equal(savedMealProvenanceTag('user_recipe_from_components'), null);
    assert.equal(savedMealProvenanceTag('user_meal_estimated'), 'estimate');
  });
});

describe('constants', () => {
  test('the disclosure names both facts: user-owned numbers + unknown micros', () => {
    assert.match(USER_PROVIDED_NUTRITION_DISCLOSURE, /yours/i);
    assert.match(USER_PROVIDED_NUTRITION_DISCLOSURE, /(vitamin|mineral)/i);
    assert.equal(HOMEMADE_MEAL_SOURCE, 'User provided');
  });
});
