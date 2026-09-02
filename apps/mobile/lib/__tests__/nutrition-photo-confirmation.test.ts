import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateToItem, manualItem, setItemFood, removeItem, restoreItem,
  loggableItems, allItemsMatched, defaultPortionFor,
  type PhotoConfirmationItem, type VisionCandidate,
} from '../nutrition/nutrition-photo.ts';
import { emptyNutrients, type CanonicalFood } from '../nutrition/food-types.ts';

function withServings(): CanonicalFood {
  return {
    id: 'gy', source: 'USDA FoodData Central', externalId: null, fdcId: null,
    sourceType: 'trusted_food_database', sourceUrl: null,
    name: 'Greek yoghurt, plain, nonfat', brand: null, description: null,
    basisGrams: 100, basisUnit: 'g', densityGPerMl: null,
    nutrients: emptyNutrients(),
    servings: [{ label: '1 container (170 g)', grams: 170 }],
    defaultServingGrams: 170, defaultServingLabel: '1 container (170 g)',
    isGeneric: true, countryCode: null,
  };
}
function gramsOnly(): CanonicalFood {
  return { ...withServings(), id: 'ch', name: 'Chicken breast, grilled', servings: [], defaultServingGrams: 120, defaultServingLabel: null };
}
function withDensity(): CanonicalFood {
  return { ...withServings(), id: 'mk', name: 'Whole milk', densityGPerMl: 1.03 };
}

const cand = (over: Partial<VisionCandidate> = {}): VisionCandidate => ({ label: over.label ?? 'yoghurt', confidence: over.confidence ?? 'high' });

describe('confirmation state machine (§49 — mandatory user confirmation)', () => {
  test('a detected candidate starts unmatched and is NOT loggable', () => {
    const item = candidateToItem(cand());
    assert.equal(item.status, 'needs_match');
    assert.equal(item.food, null);
    assert.equal(item.addedManually, false);
    assert.deepEqual(loggableItems([item]), []);
    assert.equal(allItemsMatched([item]), false);
  });

  test('accepting a match → matched + default portion from the canonical food', () => {
    const item = setItemFood(candidateToItem(cand()), withServings());
    assert.equal(item.status, 'matched');
    assert.equal(item.food!.id, 'gy');
    assert.deepEqual(
      { quantity: item.quantity, unit: item.unit, servingLabel: item.servingLabel },
      { quantity: '1', unit: 'serving', servingLabel: '1 container (170 g)' },
    );
    assert.equal(loggableItems([item]).length, 1);
    assert.equal(allItemsMatched([item]), true);
  });

  test('default portion for a grams-only food is grams, not a serving', () => {
    assert.deepEqual(defaultPortionFor(gramsOnly()), { quantity: '120', unit: 'g', servingLabel: null });
  });

  test('changing a match replaces the food and re-defaults the portion', () => {
    let item = setItemFood(candidateToItem(cand()), withServings());
    item = setItemFood(item, gramsOnly());
    assert.equal(item.food!.id, 'ch');
    assert.equal(item.unit, 'g');
    assert.equal(item.quantity, '120');
  });

  test('remove keeps the item in state (undoable) but out of loggable + match gate', () => {
    const matched = setItemFood(candidateToItem(cand()), withServings());
    const removed = removeItem(matched);
    assert.equal(removed.status, 'removed');
    assert.deepEqual(loggableItems([removed]), []);
    assert.equal(allItemsMatched([removed]), false); // no active items left

    const restored = restoreItem(removed);
    assert.equal(restored.status, 'matched');
    assert.equal(loggableItems([restored]).length, 1);
  });

  test('restoring an item that never had a food returns to needs_match', () => {
    const removed = removeItem(candidateToItem(cand()));
    assert.equal(restoreItem(removed).status, 'needs_match');
  });

  test('add a missed food manually → unmatched manual item, gate stays closed until matched', () => {
    const m = manualItem();
    assert.equal(m.addedManually, true);
    assert.equal(m.visionLabel, null);
    assert.equal(m.status, 'needs_match');
    const items = [setItemFood(candidateToItem(cand()), withServings()), m];
    assert.equal(allItemsMatched(items), false);
    items[1] = setItemFood(m, gramsOnly());
    assert.equal(allItemsMatched(items), true);
    assert.equal(loggableItems(items).length, 2);
  });

  test('a food with density exposes ml; one without cannot (unit list is the caller\'s, but the food carries the flag)', () => {
    assert.equal(withDensity().densityGPerMl, 1.03);
    assert.equal(gramsOnly().densityGPerMl, null);
  });

  test('an all-removed set is not ready to continue', () => {
    const items: PhotoConfirmationItem[] = [removeItem(setItemFood(candidateToItem(cand()), withServings()))];
    assert.equal(allItemsMatched(items), false);
  });
});
