import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { passesThreshold, diversify } from '../retrieval.ts';

describe('passesThreshold', () => {
  test('a similarity at or above the threshold passes', () => {
    assert.equal(passesThreshold(0.5, 0.3), true);
    assert.equal(passesThreshold(0.3, 0.3), true);
  });
  test('a similarity below the threshold fails — retrieval may legitimately return zero results (test J)', () => {
    assert.equal(passesThreshold(0.1, 0.3), false);
  });
});

describe('diversify (test L — document cap)', () => {
  test('never returns more than maxPerDocument chunks from the same document', () => {
    const rows = [
      { documentId: 'doc-1', rank: 1 }, { documentId: 'doc-1', rank: 2 }, { documentId: 'doc-1', rank: 3 },
      { documentId: 'doc-2', rank: 4 },
    ];
    const result = diversify(rows, 2);
    assert.equal(result.filter(r => r.documentId === 'doc-1').length, 2);
    assert.equal(result.filter(r => r.documentId === 'doc-2').length, 1);
  });

  test('preserves relative rank order otherwise', () => {
    const rows = [{ documentId: 'a', rank: 1 }, { documentId: 'b', rank: 2 }, { documentId: 'a', rank: 3 }];
    assert.deepEqual(diversify(rows, 2).map(r => r.rank), [1, 2, 3]);
  });

  test('an empty input returns an empty result', () => {
    assert.deepEqual(diversify([], 2), []);
  });
});
