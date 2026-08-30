import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_CUISINES, CUISINE_LABEL, normalizeCuisine, isCanonicalCuisine, cuisineFitScore,
} from '../nutrition-cuisine.ts';

describe('Canonical cuisine taxonomy', () => {
  test('every canonical cuisine has a user-facing label', () => {
    for (const c of CANONICAL_CUISINES) {
      assert.equal(typeof CUISINE_LABEL[c], 'string');
      assert.ok(CUISINE_LABEL[c].length > 0);
    }
  });

  test('isCanonicalCuisine accepts only the fixed taxonomy, never "mixed"', () => {
    assert.equal(isCanonicalCuisine('kenyan'), true);
    assert.equal(isCanonicalCuisine('mixed'), false);
    assert.equal(isCanonicalCuisine('italian'), false);
  });

  test('normalizeCuisine lowercases and collapses spaces/hyphens to underscores', () => {
    assert.equal(normalizeCuisine('Middle Eastern'), 'middle_eastern');
    assert.equal(normalizeCuisine('South-Asian'), 'south_asian');
    assert.equal(normalizeCuisine('  Kenyan '), 'kenyan');
  });
});

describe('cuisineFitScore — soft ranking signal only, never a hard filter', () => {
  test('no preference set is neutral (0.5), never excludes', () => {
    assert.equal(cuisineFitScore('western', []), 0.5);
  });

  test('"mixed" preference is neutral (0.5) — no restriction at all', () => {
    assert.equal(cuisineFitScore('indian', ['mixed']), 0.5);
    assert.equal(cuisineFitScore('kenyan', ['mixed']), 0.5);
  });

  test('an exact cuisine match scores 1', () => {
    assert.equal(cuisineFitScore('kenyan', ['kenyan']), 1);
  });

  test('a sibling-group match scores 1 (indian preference includes south_asian meals)', () => {
    assert.equal(cuisineFitScore('south_asian', ['indian']), 1);
    assert.equal(cuisineFitScore('kenyan', ['east_african']), 1);
    assert.equal(cuisineFitScore('european', ['western']), 1);
  });

  test('a meal outside every stated preference group scores 0 — but this is a RANKING score, never used to exclude', () => {
    assert.equal(cuisineFitScore('east_asian', ['kenyan']), 0);
  });

  test('multiple preferences union their sibling groups', () => {
    assert.equal(cuisineFitScore('east_asian', ['kenyan', 'east_asian']), 1);
  });

  test('an unrecognised preference value degrades to itself rather than throwing', () => {
    assert.equal(cuisineFitScore('kenyan', ['not_a_real_cuisine']), 0);
  });
});
