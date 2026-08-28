import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeWeightProgress } from '../weight-progress.ts';

describe('computeWeightProgress — deterministic, never AI', () => {
  test('weight-loss journey: 100kg -> 92kg -> 70kg goal', () => {
    const p = computeWeightProgress(100, 92, 70);
    assert.equal(p?.direction, 'loss');
    assert.equal(p?.progressKg, 8);
    assert.equal(p?.remainingKg, 22);
    assert.equal(p?.percent, Math.round((8 / 30) * 100));
  });

  test('weight-gain journey: 86kg -> 90kg -> 100kg goal', () => {
    const p = computeWeightProgress(86, 90, 100);
    assert.equal(p?.direction, 'gain');
    assert.equal(p?.progressKg, 4);
    assert.equal(p?.remainingKg, 10);
    assert.equal(p?.percent, Math.round((4 / 14) * 100));
  });

  test('clamps to 100% when the user has reached or passed the goal', () => {
    const p = computeWeightProgress(100, 68, 70);
    assert.equal(p?.percent, 100);
    assert.equal(p?.remainingKg, 0);
  });

  test('never goes negative when the user moves away from the target', () => {
    const p = computeWeightProgress(100, 104, 70);
    assert.equal(p?.progressKg, 0);
    assert.equal(p?.percent, 0);
    assert.equal(p?.remainingKg, 30);
  });

  test('returns null with no goal weight', () => {
    assert.equal(computeWeightProgress(100, 92, null), null);
  });

  test('returns null with no current weight', () => {
    assert.equal(computeWeightProgress(100, null, 70), null);
  });

  test('returns null with no starting weight', () => {
    assert.equal(computeWeightProgress(null, 92, 70), null);
  });

  test('returns null when goal equals starting weight (nothing to progress toward)', () => {
    assert.equal(computeWeightProgress(80, 80, 80), null);
  });
});
