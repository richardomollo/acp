// Nutrition N7.5B — provenance disclosure (pure). The structured rows are
// asserted end-to-end against local Supabase in
// supabase/tests/nutrition-dish-provenance.ts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { foodProvenanceDisclosure, foodProvenanceTag } from '../nutrition/food-provenance.ts';

describe('foodProvenanceDisclosure (§27)', () => {
  test('an estimated standard recipe discloses that nutrition is estimated / varies', () => {
    const d = foodProvenanceDisclosure('standard_recipe_estimated');
    assert.match(d!, /standard recipe/i);
    assert.match(d!, /estimat|vary/i);
  });

  test('a verified standard recipe is disclosed simply', () => {
    assert.equal(foodProvenanceDisclosure('standard_recipe_verified'), 'Standard recipe.');
  });

  test('a proxy composition names the underlying food when known', () => {
    assert.match(
      foodProvenanceDisclosure('proxy_composition', 'USDA cooked plantain')!,
      /based on USDA cooked plantain/i,
    );
    assert.match(foodProvenanceDisclosure('proxy_composition', null)!, /approximate/i);
  });

  test('a direct verified composition — and a pre-N7.5B NULL row — need NO disclosure', () => {
    assert.equal(foodProvenanceDisclosure('direct_verified'), null);
    assert.equal(foodProvenanceDisclosure(null), null);
  });

  test('no disclosure ever implies a health judgement or alarm', () => {
    for (const m of ['standard_recipe_estimated', 'standard_recipe_verified', 'proxy_composition'] as const) {
      const d = foodProvenanceDisclosure(m, 'X') ?? '';
      assert.doesNotMatch(d, /unhealthy|bad|inaccurate|wrong|do not trust|warning|caution/i);
    }
  });
});

describe('foodProvenanceTag (§13 — compact, scannable)', () => {
  test('estimated + verified standard recipes both tag "standard recipe"', () => {
    assert.equal(foodProvenanceTag('standard_recipe_estimated'), 'standard recipe');
    assert.equal(foodProvenanceTag('standard_recipe_verified'), 'standard recipe');
  });
  test('proxy → "approximate"; direct/NULL → no tag', () => {
    assert.equal(foodProvenanceTag('proxy_composition'), 'approximate');
    assert.equal(foodProvenanceTag('direct_verified'), null);
    assert.equal(foodProvenanceTag(null), null);
  });
});
