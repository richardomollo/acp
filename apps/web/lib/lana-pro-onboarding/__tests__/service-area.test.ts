import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAreaInput,
  areaAlreadyPresent,
  addServiceArea,
  removeServiceArea,
  sanitizeServiceAreas,
  MAX_AREA_LABEL_LENGTH,
  MAX_SERVICE_AREAS,
} from '../service-area.ts';

describe('normalizeAreaInput', () => {
  test('trims and collapses internal whitespace', () => {
    assert.equal(normalizeAreaInput('  Kilimani   West  '), 'Kilimani West');
  });
  test('empty / whitespace-only → ""', () => {
    assert.equal(normalizeAreaInput(''), '');
    assert.equal(normalizeAreaInput('   '), '');
  });
  test('clips to the max length', () => {
    assert.equal(normalizeAreaInput('x'.repeat(200)).length, MAX_AREA_LABEL_LENGTH);
  });
  test('non-string → ""', () => {
    // @ts-expect-error deliberate misuse
    assert.equal(normalizeAreaInput(null), '');
  });
});

describe('addServiceArea', () => {
  test('adds a normalised chip', () => {
    assert.deepEqual(addServiceArea([], '  Karen '), ['Karen']);
  });
  test('is country-agnostic — any string works', () => {
    assert.deepEqual(addServiceArea(['Brooklyn'], 'Lisbon — Alfama'), ['Brooklyn', 'Lisbon — Alfama']);
  });
  test('de-dupes case-insensitively, keeping the original casing', () => {
    assert.deepEqual(addServiceArea(['Kilimani'], 'kilimani'), ['Kilimani']);
  });
  test('splits comma / newline separated input into several chips', () => {
    assert.deepEqual(addServiceArea([], 'Kilimani, Lavington\nKaren'), ['Kilimani', 'Lavington', 'Karen']);
  });
  test('ignores empty fragments', () => {
    assert.deepEqual(addServiceArea([], 'Kilimani, , ,Karen'), ['Kilimani', 'Karen']);
  });
  test('respects the soft cap', () => {
    const many = Array.from({ length: MAX_SERVICE_AREAS }, (_, i) => `Area ${i}`);
    assert.equal(addServiceArea(many, 'One More').length, MAX_SERVICE_AREAS);
  });
  test('returns a new array (no mutation)', () => {
    const a: string[] = [];
    const b = addServiceArea(a, 'Karen');
    assert.notEqual(a, b);
    assert.equal(a.length, 0);
  });
});

describe('removeServiceArea', () => {
  test('removes case-insensitively', () => {
    assert.deepEqual(removeServiceArea(['Kilimani', 'Karen'], 'KILIMANI'), ['Karen']);
  });
  test('no-op when absent', () => {
    assert.deepEqual(removeServiceArea(['Karen'], 'Kilimani'), ['Karen']);
  });
});

describe('areaAlreadyPresent', () => {
  test('true for a case-insensitive match', () => {
    assert.equal(areaAlreadyPresent(['Karen'], ' karen '), true);
  });
  test('false for empty candidate', () => {
    assert.equal(areaAlreadyPresent(['Karen'], '   '), false);
  });
});

describe('sanitizeServiceAreas', () => {
  test('drops empties, trims, de-dupes, caps — safe on junk draft data', () => {
    assert.deepEqual(
      sanitizeServiceAreas(['  Karen ', 'karen', '', 42, null, 'Lavington']),
      ['Karen', 'Lavington'],
    );
  });
  test('non-array → []', () => {
    assert.deepEqual(sanitizeServiceAreas('Karen'), []);
    assert.deepEqual(sanitizeServiceAreas(undefined), []);
  });
});
