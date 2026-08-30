import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, locationFit } from '../location.ts';

describe('Test L — no location', () => {
  test('missing user location resolves to neutral, never exclusion or a penalty', () => {
    const result = locationFit(undefined, { latitude: -1.28, longitude: 36.8 });
    assert.equal(result.score, 0.5);
    assert.equal(result.nearby, false);
  });

  test('missing candidate location also resolves to neutral', () => {
    const result = locationFit({ latitude: -1.28, longitude: 36.8 }, undefined);
    assert.equal(result.score, 0.5);
  });
});

describe('Test M — location fit', () => {
  test('a nearer candidate outranks a farther one when both coordinates exist', () => {
    const user = { latitude: -1.2921, longitude: 36.8219 }; // Nairobi CBD
    const near = locationFit(user, { latitude: -1.2949588, longitude: 36.7875554 }); // ~3.9km
    const far = locationFit(user, { latitude: -1.3938636, longitude: 36.7442377 }); // ~15km+
    assert.ok(near.score > far.score);
  });

  test('haversineKm is symmetric and zero for identical points', () => {
    assert.equal(haversineKm(-1.28, 36.8, -1.28, 36.8), 0);
    const a = haversineKm(-1.28, 36.8, -1.30, 36.82);
    const b = haversineKm(-1.30, 36.82, -1.28, 36.8);
    assert.ok(Math.abs(a - b) < 1e-9);
  });

  test('text-based fallback matches case-insensitively when no coordinates exist', () => {
    const result = locationFit({ text: 'Westlands' }, { text: 'Westlands, Nairobi' });
    assert.equal(result.score, 1);
    assert.equal(result.nearby, true);
  });

  test('text-based fallback is neutral (never 0) on a genuine mismatch', () => {
    const result = locationFit({ text: 'Karen' }, { text: 'Westlands' });
    assert.equal(result.score, 0.5);
  });
});
