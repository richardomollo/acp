import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_TYPE_OPTIONS,
  BUSINESS_TYPE_VALUES,
  OPERATING_MODEL_OPTIONS,
  OPERATING_MODEL_VALUES,
  isBusinessTypeValue,
  isOperatingModelValue,
  businessTypeToGymType,
  businessTypeLabel,
  operatingModelLabel,
} from '../business-taxonomy.ts';

describe('business-taxonomy', () => {
  test('the MVP business types are exactly the five designed for', () => {
    assert.deepEqual([...BUSINESS_TYPE_VALUES], [
      'gym', 'fitness_studio', 'pilates_yoga_studio', 'spa_wellness', 'other',
    ]);
  });

  test('no experience / community / programme option exists', () => {
    const hay = JSON.stringify([...BUSINESS_TYPE_OPTIONS, ...OPERATING_MODEL_OPTIONS]).toLowerCase();
    for (const forbidden of ['experience', 'community', 'programme', 'program']) {
      assert.equal(hay.includes(forbidden), false, `"${forbidden}" must not appear`);
    }
  });

  test('every business type maps to an existing venue_types token', () => {
    const allowed = new Set(['gym', 'studio', 'pilates', 'spa', 'yoga']);
    for (const o of BUSINESS_TYPE_OPTIONS) {
      assert.equal(allowed.has(o.gymType), true, `${o.value} → ${o.gymType}`);
      assert.equal(businessTypeToGymType(o.value), o.gymType);
    }
  });

  test('businessTypeToGymType falls back to "gym" for unknown input', () => {
    assert.equal(businessTypeToGymType(''), 'gym');
    assert.equal(businessTypeToGymType('nonsense'), 'gym');
  });

  test('isBusinessTypeValue / isOperatingModelValue are strict', () => {
    assert.equal(isBusinessTypeValue('gym'), true);
    assert.equal(isBusinessTypeValue('GYM'), false);
    assert.equal(isBusinessTypeValue(null), false);
    assert.equal(isOperatingModelValue('classes'), true);
    assert.equal(isOperatingModelValue('memberships'), false);
  });

  test('operating models are the three MVP models', () => {
    assert.deepEqual([...OPERATING_MODEL_VALUES], ['classes', 'appointments', 'facility_access']);
  });

  test('labels resolve, and fall through to the raw value', () => {
    assert.equal(businessTypeLabel('spa_wellness'), 'Spa or wellness centre');
    assert.equal(businessTypeLabel('mystery'), 'mystery');
    assert.equal(operatingModelLabel('classes'), 'Classes');
    assert.equal(operatingModelLabel('mystery'), 'mystery');
  });
});
