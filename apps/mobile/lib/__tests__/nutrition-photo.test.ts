import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVisionResult, rankCanonicalMatches, isConfidentMatch,
  isAllowedMimeType, approxBase64Bytes, IMAGE_CONSTRAINTS, mimeFromPickedAsset,
} from '../nutrition/nutrition-photo.ts';
import type { FoodSearchResult } from '../nutrition/food-types.ts';

const sr = (over: Partial<FoodSearchResult> = {}): FoodSearchResult => ({
  id: over.id ?? 'x', name: over.name ?? 'Food', brand: over.brand ?? null,
  source: 'USDA FoodData Central', sourceType: 'trusted_food_database',
  isGeneric: over.isGeneric ?? true, energyKcalPer100g: over.energyKcalPer100g ?? 100,
});

// ── §47 vision parse ──────────────────────────────────────────────────────
describe('parseVisionResult (§47 — strict, labels + detection confidence only)', () => {
  test('one food', () => {
    const r = parseVisionResult({ foods: [{ label: 'banana', confidence: 'high' }], uncertain: false });
    assert.deepEqual(r, { foods: [{ label: 'banana', confidence: 'high' }], uncertain: false });
  });

  test('multiple foods, order preserved', () => {
    const r = parseVisionResult({
      foods: [
        { label: 'grilled chicken', confidence: 'high' },
        { label: 'white rice', confidence: 'medium' },
        { label: 'mixed vegetables', confidence: 'low' },
      ],
      uncertain: false,
    });
    assert.deepEqual(r!.foods.map(f => f.label), ['grilled chicken', 'white rice', 'mixed vegetables']);
  });

  test('accepts a JSON string payload', () => {
    const r = parseVisionResult('{"foods":[{"label":"apple","confidence":"medium"}],"uncertain":false}');
    assert.equal(r!.foods[0].label, 'apple');
  });

  test('empty foods list → uncertain forced true', () => {
    assert.deepEqual(parseVisionResult({ foods: [], uncertain: false }), { foods: [], uncertain: true });
  });

  test('malformed JSON string → null', () => {
    assert.equal(parseVisionResult('not json {'), null);
  });

  test('prose / wrong shape → null', () => {
    assert.equal(parseVisionResult('Here is what I see: a banana.'), null);
    assert.equal(parseVisionResult({ items: [] }), null);
    assert.equal(parseVisionResult([{ label: 'banana' }]), null);
    assert.equal(parseVisionResult(null), null);
  });

  test('too many candidates are capped at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `food ${i}`, confidence: 'high' }));
    const r = parseVisionResult({ foods: many, uncertain: false });
    assert.equal(r!.foods.length, IMAGE_CONSTRAINTS.maxCandidates);
  });

  test('duplicate labels (case/space-insensitive) dropped', () => {
    const r = parseVisionResult({
      foods: [
        { label: 'Banana', confidence: 'high' },
        { label: '  banana ', confidence: 'low' },
        { label: 'BANANA', confidence: 'medium' },
      ],
      uncertain: false,
    });
    assert.equal(r!.foods.length, 1);
    assert.equal(r!.foods[0].label, 'Banana');
  });

  test('blank / too-short / too-long labels dropped', () => {
    const r = parseVisionResult({
      foods: [
        { label: '', confidence: 'high' },
        { label: ' ', confidence: 'high' },
        { label: 'a', confidence: 'high' },
        { label: 'x'.repeat(80), confidence: 'high' },
        { label: 'toast', confidence: 'high' },
      ],
      uncertain: false,
    });
    assert.deepEqual(r!.foods, [{ label: 'toast', confidence: 'high' }]);
  });

  test('invalid / missing confidence downgrades to low (never a nutrition confidence)', () => {
    const r = parseVisionResult({
      foods: [
        { label: 'rice', confidence: 'very sure' },
        { label: 'beans', confidence: 0.9 },
        { label: 'kale' },
      ],
      uncertain: false,
    });
    assert.deepEqual(r!.foods.map(f => f.confidence), ['low', 'low', 'low']);
  });

  test('never returns calories / macros even if the model includes them', () => {
    const r = parseVisionResult({
      foods: [{ label: 'burger', confidence: 'high', calories: 650, protein: 40, healthy: false }],
      uncertain: false,
    });
    assert.deepEqual(Object.keys(r!.foods[0]).sort(), ['confidence', 'label']);
  });
});

// ── §48 deterministic canonical matching ──────────────────────────────────
describe('rankCanonicalMatches (§48 — lexical, no LLM, never invents a food)', () => {
  test('banana → exact generic match ranks top', () => {
    const results = [sr({ id: 'b', name: 'Banana, raw', isGeneric: true }), sr({ id: 'bb', name: 'Banana bread', isGeneric: false })];
    const ranked = rankCanonicalMatches('banana', results);
    assert.equal(ranked[0].result.id, 'b');
    assert.ok(isConfidentMatch(ranked[0]));
  });

  test('greek yoghurt → "Greek yoghurt, plain" beats "Yoghurt drink"', () => {
    const results = [
      sr({ id: 'yd', name: 'Yoghurt drink, strawberry', isGeneric: false }),
      sr({ id: 'gy', name: 'Greek yoghurt, plain, nonfat', isGeneric: true }),
    ];
    const ranked = rankCanonicalMatches('greek yoghurt', results);
    assert.equal(ranked[0].result.id, 'gy');
  });

  test('grilled chicken → "Chicken breast, grilled" is a confident match', () => {
    const results = [
      sr({ id: 'cbg', name: 'Chicken breast, grilled', isGeneric: true }),
      sr({ id: 'cn', name: 'Chicken nuggets', isGeneric: false }),
    ];
    const ranked = rankCanonicalMatches('grilled chicken', results);
    assert.equal(ranked[0].result.id, 'cbg');
    assert.ok(isConfidentMatch(ranked[0]));
  });

  test('no results → empty list (UI falls back to manual search), never a fabricated composite', () => {
    assert.deepEqual(rankCanonicalMatches('chicken biryani with raita', []), []);
  });

  test('unrelated results score low and are not confident', () => {
    const ranked = rankCanonicalMatches('dragonfruit', [sr({ id: 'z', name: 'Olive oil' })]);
    assert.equal(isConfidentMatch(ranked[0]), false);
  });
});

// ── image constraint helpers (client mirror of the server guard) ──────────
describe('image constraint helpers (§39)', () => {
  test('mime whitelist', () => {
    assert.equal(isAllowedMimeType('image/jpeg'), true);
    assert.equal(isAllowedMimeType('image/png'), true);
    assert.equal(isAllowedMimeType('image/webp'), true);
    assert.equal(isAllowedMimeType('image/gif'), false);
    assert.equal(isAllowedMimeType('application/pdf'), false);
    assert.equal(isAllowedMimeType(undefined), false);
  });

  test('approxBase64Bytes counts decoded size, strips data-URL prefix and whitespace', () => {
    // "AAAA" (4 chars, no padding) → 3 bytes
    assert.equal(approxBase64Bytes('AAAA'), 3);
    // "AA==" → 1 byte
    assert.equal(approxBase64Bytes('AA=='), 1);
    assert.equal(approxBase64Bytes('data:image/jpeg;base64,AAAA'), 3);
    assert.equal(approxBase64Bytes('AA AA\n'), 3);
  });
});

// ── N10 N5 device defect — HEIC must not be silently relabelled JPEG ───────
describe('mimeFromPickedAsset (§7 — honest type, no silent HEIC→JPEG)', () => {
  test('a declared allowed mime is used as-is', () => {
    assert.equal(mimeFromPickedAsset({ mimeType: 'image/png', uri: 'file:///x' }), 'image/png');
    assert.equal(mimeFromPickedAsset({ mimeType: 'image/JPEG', uri: 'file:///x' }), 'image/jpeg');
  });
  test('an unknown declared mime falls back to the uri extension', () => {
    assert.equal(mimeFromPickedAsset({ mimeType: null, uri: 'file:///IMG_0001.PNG' }), 'image/png');
    assert.equal(mimeFromPickedAsset({ mimeType: undefined, uri: 'file:///m.webp' }), 'image/webp');
  });
  test('HEIC / HEIF resolves to image/heic (an UNSUPPORTED type) — never a fake image/jpeg', () => {
    assert.equal(mimeFromPickedAsset({ mimeType: 'image/heic', uri: 'file:///IMG_0002.HEIC' }), 'image/heic');
    assert.equal(mimeFromPickedAsset({ mimeType: null, uri: 'file:///IMG_0003.heif' }), 'image/heic');
    assert.equal(isAllowedMimeType(mimeFromPickedAsset({ mimeType: 'image/heif', uri: '' })), false);
  });
  test('a plain camera capture with no hints defaults to jpeg', () => {
    assert.equal(mimeFromPickedAsset({ mimeType: null, uri: 'file:///tmp/rn_image_abc.jpg' }), 'image/jpeg');
    assert.equal(mimeFromPickedAsset({ mimeType: undefined, uri: null }), 'image/jpeg');
  });
});
