import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import { buildHistory } from '../nutrition/nutrition-history.ts';
import { buildNutritionPatterns } from '../nutrition/nutrition-patterns.ts';
import { buildNutritionReferenceComparisons, type UserReferenceContext } from '../nutrition/nutrition-reference-engine.ts';
import {
  getNutritionCoachingEligibility, buildNutritionCoachingOpportunities,
  prioritiseOpportunities, MAX_COACHING_OPPORTUNITIES,
  type NutritionCoachingOpportunity,
} from '../nutrition/nutrition-coaching-opportunity.ts';

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
const ctx = (over: Partial<UserReferenceContext> = {}): UserReferenceContext => ({
  age: { status: 'available', value: 30 },
  sex: { status: 'available', value: 'male' },
  weight: { status: 'available', value: { kg: 82.5, source: 'client_measurement', recordedAt: null } },
  ...over,
});

// 6 logged days, protein ~90 g/day (below the 82.5×1.4=115.5 reference min),
// Greek yoghurt frequently logged at breakfast and a meaningful protein contributor.
function proteinBelowScenario() {
  const dates = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'];
  const entries: FoodLogEntry[] = [];
  for (const d of dates) {
    entries.push(entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 25, fibreG: 0 }));
    entries.push(entry(d, 'rice', 'White rice, cooked', 'lunch', { energyKcal: 400, proteinG: 8, fibreG: 1 }));
    entries.push(entry(d, 'veg', 'Broccoli, raw', 'dinner', { energyKcal: 150, proteinG: 12, fibreG: 8 }));
  }
  const end = dates[0];
  const days = buildHistory(entries, 7, end);
  const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: end });
  const comparisons = buildNutritionReferenceComparisons(ctx(), days, patterns);
  return { entries, days, patterns, comparisons };
}

describe('eligibility (§5/§6/§19)', () => {
  const { comparisons } = proteinBelowScenario();
  const protein = comparisons.find(c => c.nutrient === 'proteinG')!;

  test('protein below_range with strong evidence → eligible', () => {
    assert.equal(protein.state, 'below_range');
    assert.equal(getNutritionCoachingEligibility(protein), 'eligible');
  });

  test('within_range / meets_or_exceeds / above_range → no_action_needed (never coach "reduce")', () => {
    for (const st of ['within_range', 'meets_or_exceeds_reference', 'above_range'] as const) {
      assert.equal(getNutritionCoachingEligibility({ ...protein, state: st }), 'no_action_needed');
    }
  });

  test('insufficient_days / insufficient_data → insufficient_evidence', () => {
    assert.equal(getNutritionCoachingEligibility({ ...protein, state: 'insufficient_days' }), 'insufficient_evidence');
    assert.equal(getNutritionCoachingEligibility({ ...protein, state: 'insufficient_data' }), 'insufficient_evidence');
  });

  test('missing reference context → insufficient_context', () => {
    assert.equal(getNutritionCoachingEligibility({
      ...protein, reference: { status: 'insufficient_context', reason: 'no weight' },
    }), 'insufficient_context');
  });

  test('unsupported / not_applicable reference → unsupported', () => {
    assert.equal(getNutritionCoachingEligibility({
      ...protein, reference: { status: 'unsupported', reason: 'menopause not tracked' },
    }), 'unsupported');
    assert.equal(getNutritionCoachingEligibility({
      ...protein, reference: { status: 'not_applicable', reason: 'under 18' },
    }), 'unsupported');
  });

  test('macro (protein) allows MODERATE readiness; micronutrient requires HIGH (§19)', () => {
    const macroModerate = { ...protein, readiness: 'moderate' as const };
    assert.equal(getNutritionCoachingEligibility(macroModerate), 'eligible');
    const macroLimited = { ...protein, readiness: 'limited' as const };
    assert.equal(getNutritionCoachingEligibility(macroLimited), 'insufficient_evidence');

    const micro = comparisons.find(c => c.nutrient === 'ironMg')!;
    const microModerate = { ...micro, state: 'below_reference' as const, readiness: 'moderate' as const,
      reference: micro.reference.status === 'available' ? micro.reference : { status: 'available' as const, reference: { nutrient: 'ironMg' as const, kind: 'population_reference' as const, referenceType: 'exact' as const, value: 11, unit: 'mg', source: { organisation: 'EFSA', document: 'DRV', sourceType: 'PRI' as const, url: 'https://x', year: 2017 }, personalised: false } } };
    assert.equal(getNutritionCoachingEligibility(microModerate), 'insufficient_evidence');
    assert.equal(getNutritionCoachingEligibility({ ...microModerate, readiness: 'high' }), 'eligible');
  });
});

describe('opportunity building (§36)', () => {
  const { entries, comparisons } = proteinBelowScenario();
  const opps = buildNutritionCoachingOpportunities(comparisons, entries);
  const protein = opps.find(o => o.nutrient === 'proteinG')!;

  test('a protein opportunity is produced', () => {
    assert.ok(protein);
    assert.equal(protein.id, 'proteinG-below_range');
    assert.equal(protein.eligibility, 'eligible');
    assert.equal(protein.domain, 'macro');
  });

  test('"why" is the exact deterministic N2/N3 facts — logged days + average + reference', () => {
    assert.match(protein.why, /Across 6 logged days/);
    assert.match(protein.why, /average logged protein was/);
    assert.match(protein.why, /reference is 115\.5–165 g\/day, based on your recorded body weight/);
  });

  test('grounded in an actually-logged food that contributes protein', () => {
    assert.ok(protein.eligibleFoods.length > 0);
    assert.equal(protein.eligibleFoods[0].name, 'Greek yoghurt');
    assert.deepEqual(protein.eligibleFoods[0].mealSlots, ['breakfast']);
    assert.match(protein.deterministicSuggestion, /Greek yoghurt already appears regularly/);
    assert.match(protein.deterministicSuggestion, /breakfast/);
  });

  test('deterministic copy contains no diagnosis / supplement / calorie / judgement language', () => {
    const BANNED = ['deficien', 'supplement', 'kcal', 'calorie', 'deficit', 'unhealthy', 'you should', 'you must', 'good food', 'bad food', 'perfect', 'optimal'];
    const text = `${protein.deterministicTitle} ${protein.deterministicSuggestion} ${protein.why}`.toLowerCase();
    for (const b of BANNED) assert.ok(!text.includes(b), `"${b}" leaked into deterministic copy`);
  });

  test('action reuses an existing screen, not a marketplace CTA', () => {
    assert.equal(protein.action.route, '/nutrition-history');
    assert.ok(!/trainer|book|buy|shop|upgrade/i.test(protein.action.label));
  });
});

describe('prioritisation (§7)', () => {
  const base: NutritionCoachingOpportunity = {
    id: 'x', nutrient: 'proteinG', nutrientLabel: 'Protein', comparison: 'below_range', readiness: 'high',
    eligibility: 'eligible', domain: 'macro',
    evidenceSummary: { averageLogged: 100, averageLoggedLabel: '100 g/day', referenceLabel: '115–165 g/day', loggedDays: 6, windowDays: 7, coverageBand: 'high' },
    eligibleFoods: [], why: 'w', deterministicTitle: 't', deterministicSuggestion: 's', action: { label: 'l', route: '/nutrition-history' },
  };
  const mk = (o: Partial<NutritionCoachingOpportunity>): NutritionCoachingOpportunity => ({ ...base, ...o });

  test('caps at 3', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(id => mk({ id, nutrient: `n${id}` as any }));
    assert.equal(prioritiseOpportunities(many).length, MAX_COACHING_OPPORTUNITIES);
  });
  test('higher readiness first', () => {
    const out = prioritiseOpportunities([
      mk({ id: 'lim', nutrient: 'fibreG', readiness: 'limited' }),
      mk({ id: 'hi', nutrient: 'proteinG', readiness: 'high' }),
    ]);
    assert.equal(out[0].id, 'hi');
  });
  test('macros before micronutrients at equal readiness', () => {
    const out = prioritiseOpportunities([
      mk({ id: 'iron', nutrient: 'ironMg', domain: 'micronutrient' }),
      mk({ id: 'prot', nutrient: 'proteinG', domain: 'macro' }),
    ]);
    assert.equal(out[0].id, 'prot');
  });
  test('deterministic & stable — same input, same order', () => {
    const list = [mk({ id: 'iron', nutrient: 'magnesiumMg', domain: 'micronutrient' }), mk({ id: 'cal', nutrient: 'calciumMg', domain: 'micronutrient' })];
    assert.deepEqual(prioritiseOpportunities(list).map(o => o.id), prioritiseOpportunities(list).map(o => o.id));
  });
});

describe('within-range scenario produces no coaching (§6)', () => {
  test('protein at reference → no opportunity', () => {
    const dates = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28'];
    const entries = dates.flatMap(d => [
      entry(d, 'gy', 'Greek yoghurt', 'breakfast', { energyKcal: 150, proteinG: 45 }),
      entry(d, 'ch', 'Chicken breast', 'lunch', { energyKcal: 300, proteinG: 60 }),
      entry(d, 'eg', 'Egg', 'dinner', { energyKcal: 200, proteinG: 35 }),
    ]);
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const comparisons = buildNutritionReferenceComparisons(ctx(), days, patterns);
    const opps = buildNutritionCoachingOpportunities(comparisons, entries);
    assert.equal(opps.find(o => o.nutrient === 'proteinG'), undefined);
  });
});
