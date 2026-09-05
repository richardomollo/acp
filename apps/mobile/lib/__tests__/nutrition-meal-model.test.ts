import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mealCandidateFromCatalogueRow, mealCandidateFromSavedMeal, mealCandidateKey,
  scaleMealCandidate, scaleMealMacros, isValidPortionMultiplier,
  type CatalogueMealRow, type SavedMealForCandidate,
} from '../nutrition/nutrition-meal-model.ts';

// Beta Feedback #022 — the canonical meal candidate model. Extends #018
// (homemade/saved meals) rather than inventing a second meal concept.

const FRIED_EGGS: CatalogueMealRow = {
  id: 'meal-eggs', name: 'Fried eggs', category: 'breakfast', cuisine: 'kenyan',
  tags: ['high_protein'], calories: 300, protein_g: 18, carbs_g: 2, fat_g: 24,
  fibre_g: 0, prep_time_minutes: 10, image_url: null,
};

describe('§13/§14 — fried eggs, beef stew, fried rice can all be planned/logged as ordinary candidates', () => {
  test('13. a catalogue "fried eggs" row becomes a valid breakfast candidate', () => {
    const c = mealCandidateFromCatalogueRow(FRIED_EGGS);
    assert.equal(c.name, 'Fried eggs');
    assert.equal(c.slot, 'breakfast');
    assert.equal(c.macros.proteinG, 18);
  });

  test('14. beef stew (a lunch/dinner catalogue row) is structurally identical, no special-casing', () => {
    const beefStew: CatalogueMealRow = { ...FRIED_EGGS, id: 'meal-stew', name: 'Beef stew with rice', category: 'dinner' };
    const c = mealCandidateFromCatalogueRow(beefStew);
    assert.equal(c.name, 'Beef stew with rice');
    assert.equal(c.slot, 'dinner');
  });

  test('15. fried rice likewise', () => {
    const friedRice: CatalogueMealRow = { ...FRIED_EGGS, id: 'meal-rice', name: 'Fried rice', category: 'lunch' };
    const c = mealCandidateFromCatalogueRow(friedRice);
    assert.equal(c.name, 'Fried rice');
  });

  test('16. a composite cooked meal (#018 saved meal) becomes a candidate WITHOUT any static catalogue match', () => {
    const homemadeLasagne: SavedMealForCandidate = {
      id: 'saved-1', name: 'Homemade lasagne', provenance: 'user_recipe_from_components',
      preview: { energyKcal: 650, proteinG: 32, carbohydrateG: 55, fatG: 28, fibreG: 4 },
    };
    const c = mealCandidateFromSavedMeal(homemadeLasagne, 'dinner');
    assert.equal(c.source, 'saved_meal');
    assert.equal(c.name, 'Homemade lasagne');
    assert.equal(c.macros.proteinG, 32);
    // no catalogue meal_id was ever consulted — the id is the saved_meals row itself
    assert.equal(c.id, 'saved-1');
  });

  test('12. a saved homemade meal can become a recommendation candidate at all (not just a loggable item)', () => {
    const savedBreakfast: SavedMealForCandidate = {
      id: 'saved-2', name: 'Boiled eggs and toast', provenance: 'user_meal_estimated',
      preview: { energyKcal: 350, proteinG: 20, carbohydrateG: 30, fatG: 14, fibreG: 2 },
    };
    const c = mealCandidateFromSavedMeal(savedBreakfast, 'breakfast');
    assert.ok(c); // constructible — the orchestrator can rank it exactly like a catalogue row
  });
});

describe('§12 — portion scaling is deterministic, never fabricated', () => {
  test('18. 1.5x scales every known macro by exactly 1.5, never regenerating a value', () => {
    const c = mealCandidateFromCatalogueRow(FRIED_EGGS);
    const scaled = scaleMealCandidate(c, 1.5);
    assert.equal(scaled.macros.calories, 450);
    assert.equal(scaled.macros.proteinG, 27);
    assert.equal(scaled.macros.carbsG, 3);
  });

  test('0.5x halves every known macro', () => {
    const scaled = scaleMealMacros({ calories: 300, proteinG: 18, carbsG: 2, fatG: 24, fibreG: 0 }, 0.5);
    assert.equal(scaled.calories, 150);
    assert.equal(scaled.proteinG, 9);
  });

  test('an unknown (null) macro stays null after scaling — never coerced to 0', () => {
    const scaled = scaleMealMacros({ calories: null, proteinG: 10, carbsG: null, fatG: 5, fibreG: null }, 2);
    assert.equal(scaled.calories, null);
    assert.equal(scaled.proteinG, 20);
    assert.equal(scaled.carbsG, null);
  });

  test('the standard multiplier set is exactly 0.5/0.75/1/1.25/1.5', () => {
    for (const m of [0.5, 0.75, 1, 1.25, 1.5]) assert.equal(isValidPortionMultiplier(m), true);
    assert.equal(isValidPortionMultiplier(2), false);
    assert.equal(isValidPortionMultiplier(0.6), false);
  });
});

describe('mealCandidateKey — stable identity for behavioural history', () => {
  test('a catalogue id and a saved-meal id never collide even if numerically equal', () => {
    assert.notEqual(mealCandidateKey('catalogue', 'abc'), mealCandidateKey('saved_meal', 'abc'));
  });
});
