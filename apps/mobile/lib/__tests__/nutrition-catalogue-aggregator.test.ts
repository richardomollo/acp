// ACP Intelligence™ — Nutrition Catalogue V1 · Production Deployment Package.
// Pure structural tests of the 120-meal aggregator — no DB, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_INTERNATIONAL_MEALS, checkCatalogueIntegrity, CATALOGUE_V1_EXPECTED_TOTAL } from '../nutrition/catalogue/index.ts';

test('aggregates exactly the approved 120 international meals', () => {
  assert.equal(ALL_INTERNATIONAL_MEALS.length, CATALOGUE_V1_EXPECTED_TOTAL);
});

test('every meal has a globally-unique, non-empty recipe reference', () => {
  const report = checkCatalogueIntegrity();
  assert.deepEqual(report.duplicateRecipeReferences, []);
});

test('no meal has an empty ingredient list', () => {
  const report = checkCatalogueIntegrity();
  assert.deepEqual(report.emptyIngredientMeals, []);
});

test('every meal carries complete provenance (compositionMethod + recipeSource + recipeReference)', () => {
  const report = checkCatalogueIntegrity();
  assert.deepEqual(report.missingProvenance, []);
});

test('cuisine groups match the approved Catalogue V1 target (40/40/40)', () => {
  const report = checkCatalogueIntegrity();
  assert.equal(report.cuisineGroupCounts.european_western, 40);
  assert.equal(report.cuisineGroupCounts.mediterranean, 40);
  assert.equal(report.cuisineGroupCounts.global, 40);
  assert.equal(report.cuisineGroupCounts.other, 0);
});

test('category ("occasion") counts sum to the full catalogue', () => {
  const report = checkCatalogueIntegrity();
  const sum = Object.values(report.categoryCounts).reduce((a, b) => a + b, 0);
  assert.equal(sum, CATALOGUE_V1_EXPECTED_TOTAL);
});

test('checkCatalogueIntegrity reports ok:true for the approved catalogue', () => {
  const report = checkCatalogueIntegrity();
  assert.equal(report.ok, true);
});

test('every batch-approved compositionMethod is authorable (standard_recipe_verified | standard_recipe_estimated)', () => {
  for (const m of ALL_INTERNATIONAL_MEALS) {
    assert.ok(m.compositionMethod === 'standard_recipe_verified' || m.compositionMethod === 'standard_recipe_estimated', `${m.name} has compositionMethod "${m.compositionMethod}"`);
  }
});
