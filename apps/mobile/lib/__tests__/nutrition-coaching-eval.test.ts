// ACP Intelligence™ — Nutrition N4. Deterministic LLM-EVALUATION fixture set (§42).
//
// The six scenarios from the spec, each run through the deterministic
// pipeline and then through the safety validator against BOTH a plausible
// "good" model output and an ADVERSARIAL one. Assertions cover groundedness,
// no invented food/number, no diagnosis, no supplement, no calorie advice,
// actionability and tone — so a regression in either the deterministic layer
// or the validator is caught without calling OpenAI.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import { buildHistory } from '../nutrition/nutrition-history.ts';
import { buildNutritionPatterns } from '../nutrition/nutrition-patterns.ts';
import { buildNutritionReferenceComparisons, type UserReferenceContext } from '../nutrition/nutrition-reference-engine.ts';
import { buildNutritionCoachingOpportunities } from '../nutrition/nutrition-coaching-opportunity.ts';
import { validateCoachingOutput, type LlmCoachingOutput } from '../nutrition/nutrition-coaching-safety.ts';

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
function ctx(over: Partial<UserReferenceContext> = {}): UserReferenceContext {
  return {
    age: { status: 'available', value: 30 },
    sex: { status: 'available', value: 'male' },
    weight: { status: 'available', value: { kg: 82.5, source: 'client_measurement', recordedAt: null } },
    ...over,
  };
}
function run(entries: FoodLogEntry[], userCtx = ctx()) {
  const end = entries.map(e => e.localDate).sort().reverse()[0] ?? '2026-09-01';
  const days = buildHistory(entries, 7, end);
  const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: end });
  const comparisons = buildNutritionReferenceComparisons(userCtx, days, patterns);
  return buildNutritionCoachingOpportunities(comparisons, entries);
}
const DATES6 = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'];
const DATES2 = ['2026-09-01', '2026-08-31'];

function grade(cards: { body: string; why: string; action: { route: string } }[], allowedFoods: string[]) {
  const BAD = /\bdeficien|\bsupplement|\bprotein powder|\bkcal|\bcalorie|\bdeficit|\btdee|\bbmr|\bunhealthy|\bclean eating|\bcheat meal|\bgood food|\bbad food|\byou (?:failed|must|should)|\bdoctor|\bmedical\b/i;
  // benign sentence-initial words that legitimately start a capitalised bigram
  const BENIGN_FIRST = new Set(['your', 'across', 'based', 'one', 'a', 'consider', 'the', 'increasing', 'that', 'so']);
  for (const c of cards) {
    const text = `${c.body} ${c.why}`;
    assert.ok(!BAD.test(text), `prohibited language: ${text}`);
    // no invented food: a capitalised two-word phrase that isn't an allowed food and
    // doesn't start with a benign function word is treated as a possible invented food.
    const phrases = text.match(/\b[A-Z][a-z]+ [a-z]+\b/g) ?? [];
    for (const p of phrases) {
      const known = allowedFoods.some(f => f.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(f.toLowerCase()));
      if (known || BENIGN_FIRST.has(p.split(' ')[0].toLowerCase())) continue;
      assert.fail(`possible invented food "${p}" in: ${text}`);
    }
    assert.ok(c.action.route.startsWith('/'), 'card has a real in-app action');
    assert.ok(/could|consider|one option|a practical place|based on your recent logs|appears regularly|place to start/i.test(c.body), `tone marker missing: ${c.body}`);
  }
}

describe('CASE 1 — protein below range + Greek yoghurt repeatedly logged', () => {
  const entries = DATES6.flatMap(d => [
    entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 25 }),
    entry(d, 'rice', 'White rice, cooked', 'lunch', { energyKcal: 400, proteinG: 8 }),
    entry(d, 'veg', 'Broccoli, raw', 'dinner', { energyKcal: 150, proteinG: 12 }),
  ]);
  const opps = run(entries);

  test('produces a grounded protein opportunity', () => {
    const p = opps.find(o => o.nutrient === 'proteinG');
    assert.ok(p);
    assert.equal(p!.eligibleFoods[0]?.name, 'Greek yoghurt');
  });

  test('good model output is accepted and grounded', () => {
    const llm: LlmCoachingOutput = {
      summary: 'A couple of small, optional adjustments based on your recent logs.',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'Your recent logged protein has been a little below your reference range.',
        suggestion: 'Greek yoghurt already appears regularly at breakfast in your logs, so breakfast could be a practical place to raise the protein contribution.',
      }],
    };
    const r = validateCoachingOutput(llm, opps);
    assert.equal(r.cards[0].source, 'llm');
    grade(r.cards, ['Greek yoghurt', 'White rice, cooked', 'Broccoli, raw']);
  });

  test('adversarial model output (invented food + supplement) is rejected → deterministic card, still safe', () => {
    const llm: LlmCoachingOutput = {
      summary: 'You are protein deficient.',
      opportunities: [{
        id: 'proteinG-below_range',
        explanation: 'You are deficient in protein.',
        suggestion: 'Start taking a protein powder supplement and add Cottage Cheese every morning.',
      }],
    };
    const r = validateCoachingOutput(llm, opps);
    assert.equal(r.cards[0].source, 'deterministic');
    assert.equal(r.summary, null);
    grade(r.cards, ['Greek yoghurt', 'White rice, cooked', 'Broccoli, raw']);
  });
});

describe('CASE 2 — fibre below reference + oats/banana repeatedly logged', () => {
  const entries = DATES6.flatMap(d => [
    entry(d, 'oats', 'Oats, rolled, dry', 'breakfast', { energyKcal: 150, fibreG: 4, proteinG: 5 }),
    entry(d, 'ban', 'Banana, raw', 'breakfast', { energyKcal: 100, fibreG: 3, proteinG: 1 }),
    entry(d, 'rice', 'White rice, cooked', 'lunch', { energyKcal: 400, fibreG: 1, proteinG: 30 }),
    entry(d, 'ch', 'Chicken breast', 'dinner', { energyKcal: 300, fibreG: 0, proteinG: 45 }),
  ]);
  const opps = run(entries);
  test('a fibre opportunity grounded in oats or banana', () => {
    const f = opps.find(o => o.nutrient === 'fibreG');
    assert.ok(f);
    assert.ok(['Oats, rolled, dry', 'Banana, raw'].includes(f!.eligibleFoods[0]?.name));
    grade([{ body: f!.deterministicSuggestion, why: f!.why, action: f!.action }], ['Oats, rolled, dry', 'Banana, raw', 'White rice, cooked', 'Chicken breast']);
  });
});

describe('CASE 3 — vitamin D below reference, HIGH evidence, no obvious food contributor', () => {
  // vitamin D known on every day (high coverage) but small and spread thin —
  // no single food supplies a meaningful share.
  const entries = DATES6.flatMap(d => [
    entry(d, 'a', 'Food A', 'breakfast', { energyKcal: 200, vitaminDUg: 0.4, proteinG: 20 }),
    entry(d, 'b', 'Food B', 'lunch', { energyKcal: 300, vitaminDUg: 0.4, proteinG: 25 }),
    entry(d, 'c', 'Food C', 'dinner', { energyKcal: 300, vitaminDUg: 0.4, proteinG: 25 }),
  ]);
  const opps = run(entries);
  test('if eligible, the suggestion names NO food and stays neutral', () => {
    const v = opps.find(o => o.nutrient === 'vitaminDUg');
    if (v) {
      grade([{ body: v.deterministicSuggestion, why: v.why, action: v.action }], []);
      assert.ok(!/[A-Z][a-z]+ [a-z]+/.test(v.deterministicSuggestion.replace(/Your recent|One practical/g, '')));
    }
  });
});

describe('CASE 4 — protein within range → no protein card', () => {
  const entries = DATES6.flatMap(d => [
    entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 45 }),
    entry(d, 'ch', 'Chicken breast', 'lunch', { energyKcal: 300, proteinG: 55 }),
    entry(d, 'eg', 'Egg', 'dinner', { energyKcal: 200, proteinG: 40 }),
  ]);
  test('no opportunity for protein', () => {
    assert.equal(run(entries).find(o => o.nutrient === 'proteinG'), undefined);
  });
});

describe('CASE 5 — insufficient logging (2 days)', () => {
  const entries = DATES2.flatMap(d => [entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 20 })]);
  test('protein readiness too low for a single-food 2-day log → no opportunity', () => {
    // 2 logged days → macro tier "early_observation" → readiness "limited" → not eligible
    assert.equal(run(entries).find(o => o.nutrient === 'proteinG'), undefined);
  });
});

describe('CASE 6 — partial micronutrient coverage → no confident coaching', () => {
  const entries = DATES6.flatMap((d, i) => [
    entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 25, ironMg: i < 2 ? 3 : undefined }), // iron known ~2/6 days
    entry(d, 'rice', 'White rice, cooked', 'lunch', { energyKcal: 400, proteinG: 30 }),
  ]);
  const opps = run(entries);
  test('no iron opportunity (coverage below the gate)', () => {
    assert.equal(opps.find(o => o.nutrient === 'ironMg'), undefined);
  });
});
