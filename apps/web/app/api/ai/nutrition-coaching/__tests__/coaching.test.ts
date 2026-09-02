import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitiseOpportunities, buildNutritionCoachingUserPrompt, validateCoachingResponse,
  NUTRITION_COACHING_JSON_SCHEMA, NUTRITION_COACHING_SYSTEM_PROMPT,
  type CoachingRequestOpportunity,
} from '../coaching.ts';

const opp = (over: Partial<CoachingRequestOpportunity> = {}): CoachingRequestOpportunity => ({
  id: 'proteinG-below_range',
  nutrientLabel: 'Protein',
  comparisonLabel: 'below your reference range',
  averageLoggedLabel: '108 g/day',
  referenceLabel: '115–165 g/day',
  loggedDays: 6,
  coverageBand: 'high',
  eligibleFoods: [{ name: 'Greek yoghurt', mealSlot: 'breakfast' }],
  ...over,
});

describe('sanitiseOpportunities (§39 — server never trusts the client blindly)', () => {
  test('caps at 3 and strips unknown fields', () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}-below_reference`, nutrientLabel: 'X', averageLoggedLabel: '1', referenceLabel: '2',
      loggedDays: 4, coverageBand: 'moderate', eligibleFoods: [],
      weightKg: 82.5, email: 'a@b.com', rawLog: [{ secret: true }],   // must be dropped
    }));
    const out = sanitiseOpportunities(raw);
    assert.equal(out.length, 3);
    for (const o of out) {
      assert.deepEqual(Object.keys(o).sort(), [
        'averageLoggedLabel', 'comparisonLabel', 'coverageBand', 'eligibleFoods', 'id', 'loggedDays', 'nutrientLabel', 'referenceLabel',
      ]);
    }
  });
  test('rejects entries without id / nutrientLabel', () => {
    assert.equal(sanitiseOpportunities([{ nutrientLabel: 'X' }, { id: 'a' }]).length, 0);
  });
  test('non-array input → []', () => {
    assert.deepEqual(sanitiseOpportunities(undefined), []);
    assert.deepEqual(sanitiseOpportunities({}), []);
  });
});

describe('buildNutritionCoachingUserPrompt', () => {
  test('lists each opportunity id + the supplied labels, no other data', () => {
    const p = buildNutritionCoachingUserPrompt([opp()]);
    assert.match(p, /id: proteinG-below_range/);
    assert.match(p, /average logged: 108 g\/day/);
    assert.match(p, /reference: 115–165 g\/day/);
    assert.match(p, /Greek yoghurt \(breakfast\)/);
    assert.ok(!/kg|weight|email|token/i.test(p));
  });
  test('marks the no-eligible-foods case so the model does not name one', () => {
    const p = buildNutritionCoachingUserPrompt([opp({ eligibleFoods: [] })]);
    assert.match(p, /do not name a food/);
  });
});

describe('validateCoachingResponse (§16/§33)', () => {
  const allowed = [opp()];

  test('keeps a clean, in-allowlist card', () => {
    const r = validateCoachingResponse({
      summary: 'Small optional adjustments based on your recent logs.',
      opportunities: [{ id: 'proteinG-below_range', explanation: 'Protein has been below your reference range.', suggestion: 'Greek yoghurt at breakfast could carry a little more protein.' }],
    }, allowed);
    assert.ok(r);
    assert.equal(r!.opportunities.length, 1);
    assert.ok(r!.summary.length > 0);
  });

  test('drops an unknown id', () => {
    const r = validateCoachingResponse({
      summary: 'ok', opportunities: [{ id: 'sodiumMg-above_range', explanation: 'x', suggestion: 'y' }],
    }, allowed);
    assert.equal(r, null); // nothing valid, no summary survivable → null (client falls back)
  });

  test('a response whose only card has prohibited language → null (client uses all-deterministic)', () => {
    const r = validateCoachingResponse({
      summary: 'Small optional adjustments.',
      opportunities: [{ id: 'proteinG-below_range', explanation: 'You are deficient.', suggestion: 'Take a supplement.' }],
    }, allowed);
    assert.equal(r, null);
  });

  test('a clean card survives alongside a dropped dirty one, dirty summary is scrubbed', () => {
    const two = [opp(), opp({ id: 'fibreG-below_reference', nutrientLabel: 'Fibre', eligibleFoods: [] })];
    const r = validateCoachingResponse({
      summary: 'Check your TDEE and cut calories.',
      opportunities: [
        { id: 'proteinG-below_range', explanation: 'Protein has been below your reference range.', suggestion: 'Greek yoghurt at breakfast could carry more protein.' },
        { id: 'fibreG-below_reference', explanation: 'You are fibre deficient.', suggestion: 'Take a supplement.' },
      ],
    }, two);
    assert.ok(r);
    assert.equal(r!.opportunities.length, 1);
    assert.equal(r!.opportunities[0].id, 'proteinG-below_range');
    assert.equal(r!.summary, '');
  });

  test('drops a card that names a food when the opportunity had none', () => {
    const noFoods = [opp({ eligibleFoods: [] })];
    const r = validateCoachingResponse({
      summary: 'ok',
      opportunities: [{ id: 'proteinG-below_range', explanation: 'Below the reference range.', suggestion: 'Add Cottage Cheese to breakfast.' }],
    }, noFoods);
    assert.equal(r, null);
  });

  test('rejects calorie / TDEE language even inside the summary', () => {
    const r = validateCoachingResponse({
      summary: 'Aim for a small calorie deficit and check your TDEE.',
      opportunities: [{ id: 'proteinG-below_range', explanation: 'Below reference range.', suggestion: 'Greek yoghurt could carry more protein.' }],
    }, allowed);
    assert.ok(r);
    assert.equal(r!.summary, ''); // scrubbed
    assert.equal(r!.opportunities.length, 1);
  });
});

describe('schema + prompt constants', () => {
  test('strict JSON schema shape', () => {
    assert.equal(NUTRITION_COACHING_JSON_SCHEMA.type, 'object');
    assert.equal(NUTRITION_COACHING_JSON_SCHEMA.additionalProperties, false);
    assert.deepEqual([...NUTRITION_COACHING_JSON_SCHEMA.required].sort(), ['opportunities', 'summary']);
    assert.equal(NUTRITION_COACHING_JSON_SCHEMA.properties.opportunities.maxItems, 3);
  });
  test('system prompt forbids the key unsafe behaviours', () => {
    const p = NUTRITION_COACHING_SYSTEM_PROMPT.toLowerCase();
    for (const must of ['do not invent', 'no supplements', 'no diagnosis', 'no calories', 'do not moralise food', 'no medical advice']) {
      assert.ok(p.includes(must), `system prompt should state: ${must}`);
    }
    assert.ok(p.includes('you do not calculate nutrition facts'));
  });
});
