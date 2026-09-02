import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossDomainWindow, datesInWindow, buildFitnessDayEvidence, buildCrossDomainObservations,
  breakfastLoggedDates, findUnsafeCrossDomainPhrases, assertSafeCrossDomainObservation,
  CROSS_DOMAIN_GATES,
  type CompletedActivityInput, type CrossDomainWindow,
} from '../nutrition/nutrition-fitness-context.ts';
import type { NutritionCoachingOpportunity } from '../nutrition/nutrition-coaching-opportunity.ts';
import type { ActivityCategory } from '../ai-assessment.ts';

const END = '2026-09-14';
const W7 = crossDomainWindow(END, 7);   // 2026-09-08 .. 2026-09-14
const W14 = crossDomainWindow(END, 14); // 2026-09-01 .. 2026-09-14

// A plan whose every index is a given category — lets tests pick "strength"/"cardio" by plan.
function planOf(category: ActivityCategory) {
  return Array.from({ length: 30 }, () => ({ category }));
}
const PLANS = new Map<string, { category: ActivityCategory }[]>([
  ['strengthPlan', planOf('strength')],
  ['cardioPlan', planOf('cardio')],
  ['mobilityPlan', planOf('mobility')],
]);

function completions(specs: { plan: string; dates: string[] }[]): CompletedActivityInput[] {
  const out: CompletedActivityInput[] = [];
  let idx = 0;
  for (const { plan, dates } of specs) {
    for (const d of dates) out.push({ planId: plan, activityIndex: idx++, plannedDate: d, completionSource: 'manual' });
  }
  return out;
}
const fitnessDays = (c: CompletedActivityInput[], w: CrossDomainWindow) =>
  buildFitnessDayEvidence(PLANS, c, new Map(), w);

function proteinOpp(over: Partial<NutritionCoachingOpportunity['evidenceSummary']> & { comparison?: NutritionCoachingOpportunity['comparison']; readiness?: NutritionCoachingOpportunity['readiness']; nutrient?: 'proteinG' | 'fibreG' } = {}): NutritionCoachingOpportunity {
  const nutrient = over.nutrient ?? 'proteinG';
  return {
    id: `${nutrient}-below_range`,
    nutrient,
    nutrientLabel: nutrient === 'proteinG' ? 'Protein' : 'Fibre',
    comparison: over.comparison ?? 'below_range',
    readiness: over.readiness ?? 'high',
    eligibility: 'eligible',
    domain: 'macro',
    evidenceSummary: {
      averageLogged: 108,
      averageLoggedLabel: nutrient === 'proteinG' ? '108 g/day' : '18 g/day',
      referenceLabel: nutrient === 'proteinG' ? '115–165 g/day' : '25–38 g/day',
      loggedDays: over.loggedDays ?? 6,
      windowDays: over.windowDays ?? 7,
      coverageBand: over.coverageBand ?? 'high',
    },
    eligibleFoods: [],
    why: '',
    deterministicTitle: '',
    deterministicSuggestion: '',
    action: { label: '', route: '' },
  };
}

const NO_ENTRIES: Record<string, { mealSlot: null }[]> = {};

// ── §5 shared time model ────────────────────────────────────────────────
describe('shared local-date model (§5)', () => {
  test('crossDomainWindow spans the right inclusive calendar range', () => {
    assert.deepEqual(W7, { windowDays: 7, startLocalDate: '2026-09-08', endLocalDate: '2026-09-14' });
    assert.equal(datesInWindow(W7).length, 7);
    assert.equal(datesInWindow(W7)[0], '2026-09-08');
    assert.equal(datesInWindow(W7)[6], '2026-09-14');
  });

  test('date join is pure string equality — timezone-independent', () => {
    // A completion planned on 2026-03-29 (EU DST change) and a nutrition day
    // on the same local date align regardless of tz; window math never
    // crosses a day due to UTC offset.
    const w = crossDomainWindow('2026-03-30', 7); // 2026-03-24 .. 2026-03-30
    assert.equal(datesInWindow(w).length, 7);
    assert.deepEqual(datesInWindow(w), ['2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']);
    const fd = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-03-29'] }]), w);
    assert.equal(fd.find(d => d.localDate === '2026-03-29')!.strengthCompleted, true);
  });
});

// ── §43 fitness evidence ───────────────────────────────────────────────
describe('buildFitnessDayEvidence (§7/§43 — ACTUAL, not planned)', () => {
  test('a date with no completion is not a training day', () => {
    const fd = fitnessDays([], W7);
    assert.equal(fd.every(d => !d.isTrainingDay && !d.anyCompleted), true);
  });

  test('completed strength is counted; mobility-only day is active but not a training day', () => {
    const fd = fitnessDays(completions([
      { plan: 'strengthPlan', dates: ['2026-09-10'] },
      { plan: 'mobilityPlan', dates: ['2026-09-12'] },
    ]), W7);
    const d10 = fd.find(d => d.localDate === '2026-09-10')!;
    const d12 = fd.find(d => d.localDate === '2026-09-12')!;
    assert.deepEqual([d10.strengthCompleted, d10.isTrainingDay], [true, true]);
    assert.deepEqual([d12.anyCompleted, d12.isTrainingDay, d12.strengthCompleted], [true, false, false]);
  });

  test('a completion outside the window is ignored', () => {
    const fd = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-08-01'] }]), W7);
    assert.equal(fd.some(d => d.anyCompleted), false);
  });

  test('category is null when the plan is no longer resolvable — counts as activity, not strength/training', () => {
    const fd = buildFitnessDayEvidence(new Map(), completions([{ plan: 'ghost', dates: ['2026-09-10'] }]), new Map(), W7);
    const d = fd.find(x => x.localDate === '2026-09-10')!;
    assert.deepEqual([d.anyCompleted, d.isTrainingDay, d.strengthCompleted], [true, false, false]);
  });

  test('verified duration is summed only for externally-recorded sources', () => {
    const c: CompletedActivityInput[] = [
      { planId: 'strengthPlan', activityIndex: 0, plannedDate: '2026-09-10', completionSource: 'strava' },
      { planId: 'strengthPlan', activityIndex: 1, plannedDate: '2026-09-10', completionSource: 'manual' },
    ];
    const dur = new Map([['strengthPlan#0', 45], ['strengthPlan#1', 60]]);
    const d = buildFitnessDayEvidence(PLANS, c, dur, W7).find(x => x.localDate === '2026-09-10')!;
    assert.equal(d.verifiedDurationMinutes, 45); // manual row's 60 is NOT counted
  });
});

// ── §45 cross-domain cases ─────────────────────────────────────────────
describe('buildCrossDomainObservations (§45 CASE 1–10)', () => {
  const base = {
    window7: W7, window14: W14,
    entriesByLocalDate: NO_ENTRIES,
  };

  test('CASE 1 — 3 completed strength days (last 7 days) + protein below range + 6 logged days → training_protein_context', () => {
    const f7 = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    const f14 = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W14);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f7, fitnessDays14: f14,
      opportunities7: [proteinOpp({ loggedDays: 6 })],
      opportunities14: [proteinOpp({ loggedDays: 6, windowDays: 14 })],
    });
    assert.deepEqual(obs.map(o => o.type), ['training_protein_context']); // no older-half training → not "consistent"
    const c = obs[0];
    assert.match(c.body, /completed 3 strength sessions across the last 7 days/);
    assert.match(c.why, /115–165 g\/day/);
    assert.match(c.why, /Average logged protein was 108 g\/day/);
    assertSafeCrossDomainObservation(c);
  });

  test('CASE 1c — strength across BOTH weeks + protein below → consistency card, protein_context suppressed', () => {
    const f14 = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-02', '2026-09-05', '2026-09-09', '2026-09-11', '2026-09-13'] }]), W14);
    const f7 = f14.filter(d => d.localDate >= W7.startLocalDate);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f7, fitnessDays14: f14,
      opportunities7: [proteinOpp({ loggedDays: 6 })],
      opportunities14: [proteinOpp({ loggedDays: 6, windowDays: 14 })],
    });
    assert.deepEqual(obs.map(o => o.type), ['training_activity_nutrition_consistency']);
    assert.match(obs[0].body, /trained on 5 days across the last 14 days/);
  });

  test('CASE 2 — strength PLANNED but 0 completed → no completed-training observation', () => {
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: fitnessDays([], W7), fitnessDays14: fitnessDays([], W14),
      opportunities7: [proteinOpp()], opportunities14: [proteinOpp({ windowDays: 14 })],
    });
    assert.equal(obs.length, 0);
  });

  test('CASE 3 — 1 workout + 1 nutrition day → insufficient, nothing emitted', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-13'] }]), W7);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [proteinOpp({ loggedDays: 1, readiness: 'limited' })],
      opportunities14: [proteinOpp({ loggedDays: 1, readiness: 'limited', windowDays: 14 })],
    });
    assert.equal(obs.length, 0);
  });

  test('CASE 4 — 3 strength sessions + protein WITHIN range → no corrective protein context', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    // within_range means N4 would not have produced an opportunity at all
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f, opportunities7: [], opportunities14: [],
    });
    assert.equal(obs.length, 0);
  });

  test('CASE 4b — opportunity present but comparison is within_range → rejected', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [proteinOpp({ comparison: 'within_range' })],
      opportunities14: [proteinOpp({ comparison: 'within_range', windowDays: 14 })],
    });
    assert.equal(obs.length, 0);
  });

  test('CASE 5 — training days with no breakfast logged → "not logged" language, never "skipped"', () => {
    const trainingDates = ['2026-09-09', '2026-09-11', '2026-09-13'];
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: trainingDates }]), W7);
    // logged lunch on 4 days, breakfast on none
    const entriesByLocalDate: Record<string, { mealSlot: 'lunch' | 'breakfast' | null }[]> = {
      '2026-09-09': [{ mealSlot: 'lunch' }],
      '2026-09-10': [{ mealSlot: 'lunch' }],
      '2026-09-11': [{ mealSlot: 'lunch' }],
      '2026-09-13': [{ mealSlot: 'lunch' }],
    };
    const obs = buildCrossDomainObservations({
      window7: W7, window14: W14, entriesByLocalDate,
      fitnessDays7: f, fitnessDays14: f,
      opportunities7: [], opportunities14: [],
    });
    const reg = obs.find(o => o.type === 'training_logging_regularity')!;
    assert.ok(reg);
    assert.match(reg.body, /Breakfast wasn.t logged on 3 of the 3 days/);
    assert.match(reg.why, /not necessarily what was eaten/);
    assert.equal(findUnsafeCrossDomainPhrases(reg.body + ' ' + reg.why).length, 0);
    assert.doesNotMatch(reg.body + reg.why, /skipped|missed breakfast/i);
  });

  test('CASE 5b — breakfast logged on most training days → no logging observation', () => {
    const trainingDates = ['2026-09-09', '2026-09-11', '2026-09-13'];
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: trainingDates }]), W7);
    const entriesByLocalDate: Record<string, { mealSlot: 'breakfast' | null }[]> = {
      '2026-09-09': [{ mealSlot: 'breakfast' }],
      '2026-09-10': [{ mealSlot: 'breakfast' }],
      '2026-09-11': [{ mealSlot: 'breakfast' }],
      '2026-09-13': [{ mealSlot: 'breakfast' }],
    };
    const obs = buildCrossDomainObservations({
      window7: W7, window14: W14, entriesByLocalDate, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [], opportunities14: [],
    });
    assert.equal(obs.some(o => o.type === 'training_logging_regularity'), false);
  });

  test('CASE 6 — only 1 strength day (below the ≥2 gate) → no protein context', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-13'] }]), W7);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [proteinOpp({ loggedDays: 6 })],
      opportunities14: [proteinOpp({ loggedDays: 6, windowDays: 14 })],
    });
    assert.equal(obs.some(o => o.type === 'training_protein_context'), false);
  });

  test('CASE 7 — sufficient 14-day training in both halves + fibre below → descriptive consistency observation', () => {
    const dates = ['2026-09-02', '2026-09-04', '2026-09-10', '2026-09-12', '2026-09-13'];
    const f14 = fitnessDays(completions([{ plan: 'cardioPlan', dates }]), W14);
    const f7 = f14.filter(d => d.localDate >= W7.startLocalDate);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f7, fitnessDays14: f14,
      opportunities7: [], opportunities14: [proteinOpp({ nutrient: 'fibreG', loggedDays: 7, windowDays: 14 })],
    });
    const c = obs.find(o => o.type === 'training_activity_nutrition_consistency')!;
    assert.ok(c);
    assert.equal(c.nutrition.nutrient, 'fibreG');
    assert.match(c.body, /trained on 5 days across the last 14 days/);
    assert.match(c.body, /fibre stayed below its reference/);
    assertSafeCrossDomainObservation(c);
  });

  test('CASE 7b — training all in the recent half only → not "consistent", no observation', () => {
    const dates = ['2026-09-09', '2026-09-11', '2026-09-12', '2026-09-13'];
    const f14 = fitnessDays(completions([{ plan: 'cardioPlan', dates }]), W14);
    const f7 = f14.filter(d => d.localDate >= W7.startLocalDate);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f7, fitnessDays14: f14,
      opportunities7: [], opportunities14: [proteinOpp({ nutrient: 'fibreG', loggedDays: 7, windowDays: 14 })],
    });
    assert.equal(obs.some(o => o.type === 'training_activity_nutrition_consistency'), false);
  });

  test('CASE 8 — lose-weight-style context never yields calorie advice (no such path exists)', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [proteinOpp({ loggedDays: 6 })], opportunities14: [proteinOpp({ loggedDays: 6, windowDays: 14 })],
    });
    for (const o of obs) {
      assert.equal(findUnsafeCrossDomainPhrases([o.title, o.body, o.why].join(' ')).length, 0);
      assert.doesNotMatch([o.title, o.body, o.why].join(' '), /calorie|kcal|deficit|eat back|burned/i);
    }
  });

  test('CASE 9 — no calorie/energy field is ever read or emitted (duration is minutes only)', () => {
    // buildCrossDomainObservations has no energy parameter at all — structural guarantee.
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [proteinOpp({ loggedDays: 6 })], opportunities14: [proteinOpp({ loggedDays: 6, windowDays: 14 })],
    });
    assert.ok(obs.length > 0);
    assert.equal(JSON.stringify(obs).match(/calorie|kcal|energy/i), null);
  });

  test('CASE 10 — a micronutrient opportunity (vitamin D) never produces an N7 observation', () => {
    const f = fitnessDays(completions([{ plan: 'strengthPlan', dates: ['2026-09-09', '2026-09-11', '2026-09-13'] }]), W7);
    const vitD = { ...proteinOpp({ loggedDays: 6 }), nutrient: 'vitaminDUg' as unknown as 'proteinG', nutrientLabel: 'Vitamin D', domain: 'micronutrient' as const };
    const obs = buildCrossDomainObservations({
      ...base, fitnessDays7: f, fitnessDays14: f,
      opportunities7: [vitD], opportunities14: [{ ...vitD, evidenceSummary: { ...vitD.evidenceSummary, windowDays: 14 } }],
    });
    assert.equal(obs.length, 0);
  });

  test('at most two observations are ever returned, strongest window first', () => {
    const dates14 = ['2026-09-02', '2026-09-04', '2026-09-09', '2026-09-11', '2026-09-13'];
    const f14 = fitnessDays(completions([{ plan: 'strengthPlan', dates: dates14 }]), W14);
    const f7 = f14.filter(d => d.localDate >= W7.startLocalDate);
    const entriesByLocalDate: Record<string, { mealSlot: 'lunch' | null }[]> = {
      '2026-09-09': [{ mealSlot: 'lunch' }], '2026-09-10': [{ mealSlot: 'lunch' }],
      '2026-09-11': [{ mealSlot: 'lunch' }], '2026-09-13': [{ mealSlot: 'lunch' }],
    };
    const obs = buildCrossDomainObservations({
      window7: W7, window14: W14, entriesByLocalDate, fitnessDays7: f7, fitnessDays14: f14,
      opportunities7: [proteinOpp({ loggedDays: 6 })],
      opportunities14: [proteinOpp({ loggedDays: 7, windowDays: 14 })],
    });
    assert.ok(obs.length <= 2);
    assert.equal(obs[0].type, 'training_activity_nutrition_consistency');
    for (const o of obs) assertSafeCrossDomainObservation(o);
  });
});

// ── §46 safety language ────────────────────────────────────────────────
describe('cross-domain safety language (§46)', () => {
  for (const bad of [
    'your low protein caused poor recovery',
    'because your diet was low you underfuelled',
    'your recovery is impaired',
    'you are deficient in iron which explains your fatigue',
    'eat back the calories you burned',
    'you have a calorie deficit so eat more',
    'you skipped breakfast on 3 days',
    'this is poor nutrition',
    'you should eat 2.2 g/kg on strength days',
    'you must eat more protein',
  ]) {
    test(`flags: "${bad}"`, () => {
      assert.ok(findUnsafeCrossDomainPhrases(bad).length > 0);
    });
  }

  for (const ok of [
    'You completed 3 strength sessions across the last 7 days.',
    'Across 6 logged nutrition days, protein stayed below your current reference range.',
    'Breakfast wasn’t logged on 3 of the 4 days you trained in the last 7 days.',
    'This reflects what was logged, not necessarily what was eaten.',
    'These two patterns may be useful to look at together.',
  ]) {
    test(`allows: "${ok}"`, () => {
      assert.deepEqual(findUnsafeCrossDomainPhrases(ok), []);
    });
  }
});

describe('breakfastLoggedDates helper', () => {
  test('only counts breakfast-slot entries inside the window', () => {
    const set = breakfastLoggedDates({
      '2026-09-10': [{ mealSlot: 'breakfast' }, { mealSlot: 'lunch' }],
      '2026-09-11': [{ mealSlot: 'lunch' }],
      '2026-08-30': [{ mealSlot: 'breakfast' }], // outside W7
    }, W7);
    assert.deepEqual([...set], ['2026-09-10']);
  });
});

describe('gate constants are consistent with N2/N3 tiers', () => {
  test('minimums require real evidence in both domains', () => {
    assert.ok(CROSS_DOMAIN_GATES.proteinContext.minStrengthDays7 >= 2);
    assert.ok(CROSS_DOMAIN_GATES.proteinContext.minLoggedDays >= 4);
    assert.ok(CROSS_DOMAIN_GATES.consistency.minTrainingDays14 >= 4);
    assert.ok(CROSS_DOMAIN_GATES.consistency.minLoggedDays >= 5);
  });
});
