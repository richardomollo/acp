import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decideProgrammeAction } from '../programme-ownership.ts';

describe('decideProgrammeAction — trainer protection (Day 2 section 22, non-negotiable)', () => {
  test('no active programme -> generate', () => {
    assert.equal(decideProgrammeAction(null), 'generate');
  });

  test('an active ACP_GENERATED programme -> already_active, never silently duplicated', () => {
    assert.equal(decideProgrammeAction({ source: 'ACP_GENERATED' }), 'already_active');
  });

  test('an active TRAINER_CREATED programme -> trainer_active, never regenerated/replaced', () => {
    assert.equal(decideProgrammeAction({ source: 'TRAINER_CREATED' }), 'trainer_active');
  });

  test('an active TRAINER_MODIFIED programme -> trainer_active, never regenerated/replaced', () => {
    assert.equal(decideProgrammeAction({ source: 'TRAINER_MODIFIED' }), 'trainer_active');
  });
});
