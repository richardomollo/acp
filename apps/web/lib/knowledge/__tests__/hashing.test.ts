import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashDocument, hashChunk } from '../hashing.ts';

describe('hashDocument', () => {
  const base = {
    domain: 'training', title: 'Beginner Strength Consistency', source: null, version: 1,
    metadata: { goals: ['build_muscle'] },
    sections: [{ heading: 'A', content: 'Some content here.' }],
  };

  test('identical input hashes identically', () => {
    assert.equal(hashDocument(base), hashDocument({ ...base }));
  });

  test('whitespace/case differences do not change the hash (section 22 normalization)', () => {
    const variant = { ...base, title: '  BEGINNER   strength consistency  ' };
    assert.equal(hashDocument(base), hashDocument(variant));
  });

  test('different content produces a different hash', () => {
    const variant = { ...base, sections: [{ heading: 'A', content: 'Totally different content.' }] };
    assert.notEqual(hashDocument(base), hashDocument(variant));
  });

  test('different version produces a different hash (a v2 is never mistaken for a duplicate of v1)', () => {
    assert.notEqual(hashDocument(base), hashDocument({ ...base, version: 2 }));
  });

  test('field-boundary collision does not occur (domain+title vs a differently-split equivalent)', () => {
    const a = { ...base, domain: 'ab', title: 'c' };
    const b = { ...base, domain: 'a', title: 'bc' };
    assert.notEqual(hashDocument(a), hashDocument(b));
  });
});

describe('hashChunk', () => {
  test('identical content/heading/metadata hashes identically (enables cross-document reuse)', () => {
    const chunk = { content: 'Some chunk content.', heading: 'H', metadata: { topics: ['x'] } };
    assert.equal(hashChunk(chunk), hashChunk({ ...chunk }));
  });

  test('different heading produces a different hash even with identical content', () => {
    const a = { content: 'Same content.', heading: 'A', metadata: {} };
    const b = { content: 'Same content.', heading: 'B', metadata: {} };
    assert.notEqual(hashChunk(a), hashChunk(b));
  });
});
