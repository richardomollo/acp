import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageInput, parseVisionAnalysis, approxBase64Bytes,
  NUTRITION_PHOTO_JSON_SCHEMA, NUTRITION_PHOTO_SYSTEM_PROMPT, NUTRITION_PHOTO_MODEL,
  MAX_IMAGE_BYTES, MAX_CANDIDATES,
} from '../photo-analysis.ts';

const b64 = (bytes: number) => 'A'.repeat(Math.ceil(bytes / 3) * 4);

describe('validateImageInput (§39 — type + size, base64 body only, no SSRF)', () => {
  test('accepts a jpeg/png/webp under the cap', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      const r = validateImageInput(b64(50_000), mime);
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.mimeType, mime);
    }
  });

  test('rejects a non-whitelisted type with 415', () => {
    const r = validateImageInput(b64(1000), 'image/gif');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 415);
  });

  test('rejects a missing / too-short payload with 400', () => {
    assert.equal(validateImageInput('', 'image/jpeg').ok, false);
    assert.equal(validateImageInput('abc', 'image/jpeg').ok, false);
    assert.equal(validateImageInput(undefined, 'image/jpeg').ok, false);
  });

  test('rejects an oversize image with 413', () => {
    const r = validateImageInput(b64(MAX_IMAGE_BYTES + 10_000), 'image/jpeg');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 413);
  });

  test('rejects a payload with non-base64 characters (e.g. a smuggled URL) with 400', () => {
    const r = validateImageInput('https://evil.example/x'.padEnd(200, '/'), 'image/jpeg');
    assert.equal(r.ok, false);
  });

  test('tolerates a data: URL prefix and still measures the decoded size', () => {
    const r = validateImageInput(`data:image/png;base64,${b64(20_000)}`, 'image/png');
    assert.equal(r.ok, true);
  });
});

describe('approxBase64Bytes', () => {
  test('strips prefix + whitespace, accounts for padding', () => {
    assert.equal(approxBase64Bytes('AAAA'), 3);
    assert.equal(approxBase64Bytes('AA=='), 1);
    assert.equal(approxBase64Bytes('data:image/jpeg;base64,AAAA'), 3);
  });
});

describe('parseVisionAnalysis (server mirror — labels + confidence only)', () => {
  test('valid single + multi food', () => {
    assert.deepEqual(
      parseVisionAnalysis({ foods: [{ label: 'banana', confidence: 'high' }], uncertain: false }),
      { foods: [{ label: 'banana', confidence: 'high' }], uncertain: false },
    );
    const multi = parseVisionAnalysis({
      foods: [{ label: 'rice', confidence: 'medium' }, { label: 'dal', confidence: 'low' }], uncertain: true,
    });
    assert.equal(multi!.foods.length, 2);
    assert.equal(multi!.uncertain, true);
  });

  test('accepts a JSON string', () => {
    assert.equal(parseVisionAnalysis('{"foods":[{"label":"toast","confidence":"high"}],"uncertain":false}')!.foods[0].label, 'toast');
  });

  test('malformed JSON / wrong shape / prose → null', () => {
    assert.equal(parseVisionAnalysis('{bad'), null);
    assert.equal(parseVisionAnalysis({ nope: 1 }), null);
    assert.equal(parseVisionAnalysis('a plate of food'), null);
  });

  test('empty list forces uncertain true', () => {
    assert.deepEqual(parseVisionAnalysis({ foods: [], uncertain: false }), { foods: [], uncertain: true });
  });

  test('caps at MAX_CANDIDATES, drops duplicates and blanks', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ label: `food ${i}`, confidence: 'high' }));
    assert.equal(parseVisionAnalysis({ foods: many, uncertain: false })!.foods.length, MAX_CANDIDATES);

    const dup = parseVisionAnalysis({
      foods: [{ label: 'Egg', confidence: 'high' }, { label: 'egg', confidence: 'low' }, { label: '', confidence: 'high' }],
      uncertain: false,
    });
    assert.deepEqual(dup!.foods, [{ label: 'Egg', confidence: 'high' }]);
  });

  test('invalid confidence → low', () => {
    assert.equal(parseVisionAnalysis({ foods: [{ label: 'kale', confidence: 'certain' }], uncertain: false })!.foods[0].confidence, 'low');
  });

  test('strips any calories/macros/judgement the model tries to attach', () => {
    const r = parseVisionAnalysis({ foods: [{ label: 'fries', confidence: 'high', kcal: 400, healthy: false }], uncertain: false });
    assert.deepEqual(Object.keys(r!.foods[0]).sort(), ['confidence', 'label']);
  });

  test('drops labels that describe people / setting rather than food (§45)', () => {
    const r = parseVisionAnalysis({
      foods: [{ label: 'a person eating', confidence: 'high' }, { label: 'pasta', confidence: 'high' }],
      uncertain: false,
    });
    assert.deepEqual(r!.foods, [{ label: 'pasta', confidence: 'high' }]);
  });
});

describe('prompt + schema contract (§5/§6 — the model must not be asked for nutrition)', () => {
  test('model is the repo-standard multimodal model', () => {
    assert.equal(NUTRITION_PHOTO_MODEL, 'gpt-5-mini');
  });

  test('schema exposes only label + confidence + uncertain', () => {
    assert.deepEqual(Object.keys(NUTRITION_PHOTO_JSON_SCHEMA.properties).sort(), ['foods', 'uncertain']);
    assert.deepEqual(
      Object.keys(NUTRITION_PHOTO_JSON_SCHEMA.properties.foods.items.properties).sort(),
      ['confidence', 'label'],
    );
    assert.equal(NUTRITION_PHOTO_JSON_SCHEMA.properties.foods.maxItems, MAX_CANDIDATES);
    assert.equal(NUTRITION_PHOTO_JSON_SCHEMA.additionalProperties, false);
  });

  test('system prompt forbids calories/macros/portion/health judgement and person inference', () => {
    const p = NUTRITION_PHOTO_SYSTEM_PROMPT.toLowerCase();
    assert.match(p, /do not estimate calories/);
    assert.match(p, /macros|portion size/);
    assert.match(p, /do not judge whether the food is healthy/);
    assert.match(p, /person|people|face/);
    assert.doesNotMatch(p, /coach|advice|recommend/);
  });
});
