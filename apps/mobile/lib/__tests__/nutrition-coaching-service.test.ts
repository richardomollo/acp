import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import { buildHistory } from '../nutrition/nutrition-history.ts';
import { buildNutritionPatterns } from '../nutrition/nutrition-patterns.ts';
import { buildNutritionReferenceComparisons, type UserReferenceContext } from '../nutrition/nutrition-reference-engine.ts';
import { buildNutritionCoachingOpportunities } from '../nutrition/nutrition-coaching-opportunity.ts';
import {
  fetchNutritionCoaching, getNutritionCoaching, toRequestOpportunities,
} from '../nutrition/nutrition-coaching.ts';

afterEach(() => { delete process.env.EXPO_PUBLIC_ACP_NUTRITION_COACHING_ENABLED; });

let seq = 0;
function entry(localDate: string, foodId: string, name: string, slot: MealSlot | null, nutrients: Partial<Nutrients>): FoodLogEntry {
  const n = emptyNutrients();
  for (const [k, v] of Object.entries(nutrients)) (n as any)[k] = v;
  return {
    id: `e${++seq}`, userId: 'u1', loggedAt: `${localDate}T12:00:00Z`, localDate, timezone: 'Africa/Nairobi',
    mealSlot: slot, foodId, displayName: name, brand: null, quantity: 100, unit: 'g', servingLabel: null,
    quantityGrams: 100, captureMethod: 'search', source: 'USDA FoodData Central', sourceType: 'trusted_food_database', note: null, nutrients: n,
  };
}
const ctx = (): UserReferenceContext => ({
  age: { status: 'available', value: 30 },
  sex: { status: 'available', value: 'male' },
  weight: { status: 'available', value: { kg: 82.5, source: 'client_measurement', recordedAt: null } },
});
function scenario() {
  const dates = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'];
  const entries = dates.flatMap(d => [
    entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 25, fibreG: 0 }),
    entry(d, 'rice', 'White rice, cooked', 'lunch', { energyKcal: 400, proteinG: 8, fibreG: 1 }),
    entry(d, 'veg', 'Broccoli, raw', 'dinner', { energyKcal: 150, proteinG: 12, fibreG: 8 }),
  ]);
  const days = buildHistory(entries, 7, dates[0]);
  const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
  const comparisons = buildNutritionReferenceComparisons(ctx(), days, patterns);
  const opportunities = buildNutritionCoachingOpportunities(comparisons, entries);
  return { entries, comparisons, opportunities };
}

describe('privacy — request payload (§39)', () => {
  test('toRequestOpportunities contains only allowed fields; no weight/name/email/raw logs', () => {
    const { opportunities } = scenario();
    const payload = toRequestOpportunities(opportunities);
    const json = JSON.stringify(payload);
    assert.ok(!/email|@|"name":"u1"|userId|weight|kg|82\.5|1996-|token/i.test(json), json);
    for (const o of payload) {
      assert.deepEqual(Object.keys(o).sort(), [
        'averageLoggedLabel', 'comparisonLabel', 'coverageBand', 'eligibleFoods', 'id', 'loggedDays', 'nutrientLabel', 'referenceLabel',
      ]);
      for (const f of o.eligibleFoods) assert.deepEqual(Object.keys(f).sort(), ['mealSlot', 'name']);
    }
  });
});

describe('fetchNutritionCoaching — race + fallback (§24/§25)', () => {
  const { opportunities } = scenario();

  test('OpenAI unreachable (fetch throws) → null', async () => {
    const res = await fetchNutritionCoaching('tok', opportunities, () => { throw new Error('network'); });
    assert.equal(res, null);
  });
  test('non-200 → null', async () => {
    const res = await fetchNutritionCoaching('tok', opportunities, async () => new Response('nope', { status: 502 }));
    assert.equal(res, null);
  });
  test('invalid JSON shape → null', async () => {
    const res = await fetchNutritionCoaching('tok', opportunities, async () => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    assert.equal(res, null);
  });
  test('slow response beyond UX deadline → null (deterministic fallback path)', async () => {
    const slow: typeof fetch = () => new Promise(r => setTimeout(() => r(new Response('{}', { status: 200 })), 200));
    const res = await fetchNutritionCoaching('tok', opportunities, slow, 20);
    assert.equal(res, null);
  });
  test('valid structured response → returned', async () => {
    const good = { summary: 's', opportunities: [{ id: opportunities[0].id, explanation: 'e', suggestion: 'x' }] };
    const res = await fetchNutritionCoaching('tok', opportunities, async () => new Response(JSON.stringify(good), { status: 200 }));
    assert.deepEqual(res, good);
  });
  test('no opportunities → does not even call fetch', async () => {
    let called = false;
    const res = await fetchNutritionCoaching('tok', [], async () => { called = true; return new Response('{}'); });
    assert.equal(res, null);
    assert.equal(called, false);
  });
});

describe('feature flag (§37)', () => {
  test('disabled → getNutritionCoaching builds NO opportunities and never fetches', async () => {
    process.env.EXPO_PUBLIC_ACP_NUTRITION_COACHING_ENABLED = 'false';
    const { comparisons, entries } = scenario();
    let called = false;
    const res = await getNutritionCoaching('tok', comparisons, entries, async () => { called = true; return new Response('{}'); });
    assert.equal(res.enabled, false);
    assert.equal(res.opportunities.length, 0);
    assert.equal(res.validated.cards.length, 0);
    assert.equal(called, false);
  });

  test('enabled + OpenAI down → deterministic cards still present', async () => {
    const { comparisons, entries } = scenario();
    const res = await getNutritionCoaching('tok', comparisons, entries, () => { throw new Error('down'); });
    assert.equal(res.enabled, true);
    assert.ok(res.opportunities.length > 0);
    assert.ok(res.validated.cards.length > 0);
    assert.ok(res.validated.cards.every(c => c.source === 'deterministic'));
    assert.equal(res.validated.summary, null);
  });

  test('enabled + no accessToken → deterministic cards only (no fetch)', async () => {
    const { comparisons, entries } = scenario();
    let called = false;
    const res = await getNutritionCoaching(null, comparisons, entries, async () => { called = true; return new Response('{}'); });
    assert.equal(called, false);
    assert.ok(res.validated.cards.every(c => c.source === 'deterministic'));
  });
});
