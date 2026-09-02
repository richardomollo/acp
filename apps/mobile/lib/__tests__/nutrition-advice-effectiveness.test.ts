import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  opportunityKey, episodeKey, buildBeforeSnapshot, evaluateEffectiveness,
  afterWindowStart, afterWindowDays, afterWindowEntries, afterReadiness,
  findUnsafeEffectivenessPhrases, assertSafeEffectiveness,
  EXPOSURE_HORIZON_DAYS, MEANINGFUL_CHANGE,
  type ExposureRecord, type ExposureBeforeSnapshot,
} from '../nutrition/nutrition-advice-effectiveness.ts';
import type { DayNutrition } from '../nutrition/nutrition-history.ts';
import type { NutritionCoachingOpportunity } from '../nutrition/nutrition-coaching-opportunity.ts';
import type { NutritionReferenceComparison } from '../nutrition/nutrition-reference-engine.ts';

// ── fixtures ────────────────────────────────────────────────────────────
function day(localDate: string, proteinG: number, fibreG = 0, hasLogs = true): DayNutrition {
  return {
    localDate, hasLogs, entryCount: hasLogs ? 2 : 0, foodEntryCount: hasLogs ? 2 : 0,
    energyKcal: 0, proteinG, carbohydrateG: 0, fatG: 0, fibreG,
    micros: {}, completeness: {} as DayNutrition['completeness'],
  };
}

function proteinOpp(over: Partial<NutritionCoachingOpportunity['evidenceSummary']> & { comparison?: NutritionCoachingOpportunity['comparison']; readiness?: NutritionCoachingOpportunity['readiness']; nutrient?: 'proteinG' | 'fibreG' | 'vitaminDUg' } = {}): NutritionCoachingOpportunity {
  const nutrient = (over.nutrient ?? 'proteinG') as NutritionCoachingOpportunity['nutrient'];
  return {
    id: `${nutrient}-${over.comparison ?? 'below_range'}`,
    nutrient, nutrientLabel: 'Protein',
    comparison: over.comparison ?? 'below_range',
    readiness: over.readiness ?? 'high',
    eligibility: 'eligible', domain: 'macro',
    evidenceSummary: {
      averageLogged: over.averageLogged ?? 108,
      averageLoggedLabel: '108 g/day', referenceLabel: '115–165 g/day',
      loggedDays: over.loggedDays ?? 6, windowDays: over.windowDays ?? 7,
      coverageBand: over.coverageBand ?? 'high',
    },
    eligibleFoods: [], why: '', deterministicTitle: '', deterministicSuggestion: '',
    action: { label: 'Review recent nutrition', route: '/nutrition-history' },
  };
}
function rangeComparison(min = 115, max = 165): NutritionReferenceComparison {
  return {
    nutrient: 'proteinG',
    actual: { value: 108, basis: 'average_logged_day', loggedDays: 6, windowDays: 7, coverage: 0.9 },
    reference: { status: 'available', reference: { nutrient: 'proteinG', kind: 'personalised_performance_target', referenceType: 'range', min, max, unit: 'g', source: 'ISSN 2017', personalised: true } },
    state: 'below_range', readiness: 'high',
  };
}
function floorComparison(value = 30): NutritionReferenceComparison {
  return {
    nutrient: 'fibreG',
    actual: { value: 15, basis: 'average_logged_day', loggedDays: 6, windowDays: 7, coverage: 0.9 },
    reference: { status: 'available', reference: { nutrient: 'fibreG', kind: 'population_reference', referenceType: 'exact', value, unit: 'g', source: 'EFSA', personalised: false } },
    state: 'below_reference', readiness: 'high',
  };
}

const SHOWN = '2026-09-01';
function exposure(over: Partial<ExposureRecord> = {}): ExposureRecord {
  const base: ExposureRecord = {
    id: 'ex1', episodeKey: episodeKey('nutrition:proteinG:below_range', SHOWN), shownLocalDate: SHOWN,
    opportunityKey: 'nutrition:proteinG:below_range', nutrient: 'proteinG', comparison: 'below_range',
    actionKind: '/nutrition-history',
    beforeAverage: 108, beforeLoggedDays: 6, beforeWindowDays: 7,
    beforeCoverageBand: 'high', beforeReadiness: 'high',
    referenceType: 'range', referenceLow: 115, referenceHigh: 165, referenceUnit: 'g',
  };
  return { ...base, ...over };
}

// ── identity (§8/§9) ───────────────────────────────────────────────────
describe('identity', () => {
  test('opportunityKey is a stable semantic string with no food names / LLM text', () => {
    assert.equal(opportunityKey('proteinG', 'below_range'), 'nutrition:proteinG:below_range');
    assert.equal(episodeKey('nutrition:proteinG:below_range', '2026-09-01'), 'nutrition:proteinG:below_range:2026-09-01');
  });
});

// ── §48 before snapshot ────────────────────────────────────────────────
describe('buildBeforeSnapshot (§11/§19/§48)', () => {
  test('valid protein below_range opportunity → frozen numeric snapshot', () => {
    const s = buildBeforeSnapshot(proteinOpp(), rangeComparison())!;
    assert.equal(s.opportunityKey, 'nutrition:proteinG:below_range');
    assert.deepEqual(
      { avg: s.beforeAverage, ld: s.beforeLoggedDays, wd: s.beforeWindowDays, cb: s.beforeCoverageBand, rt: s.referenceType, lo: s.referenceLow, hi: s.referenceHigh },
      { avg: 108, ld: 6, wd: 7, cb: 'high', rt: 'range', lo: 115, hi: 165 },
    );
  });

  test('fibre exact/floor reference → referenceLow = floor value, referenceHigh = null', () => {
    const s = buildBeforeSnapshot(proteinOpp({ nutrient: 'fibreG', comparison: 'below_reference' }), floorComparison(30))!;
    assert.equal(s.nutrient, 'fibreG');
    assert.equal(s.referenceType, 'exact');
    assert.equal(s.referenceLow, 30);
    assert.equal(s.referenceHigh, null);
  });

  test('a micronutrient opportunity is NOT trackable → null (§19/§S)', () => {
    const vitD = { ...proteinOpp({ nutrient: 'vitaminDUg' }), domain: 'micronutrient' as const };
    assert.equal(buildBeforeSnapshot(vitD, undefined), null);
  });

  test('a non-below comparison state → null', () => {
    assert.equal(buildBeforeSnapshot(proteinOpp({ comparison: 'within_range' }), rangeComparison()), null);
  });

  test('missing / unavailable N3 comparison → null (cannot freeze a reference)', () => {
    assert.equal(buildBeforeSnapshot(proteinOpp(), undefined), null);
  });
});

// ── §12/§49/§50 after-window ───────────────────────────────────────────
describe('after-window semantics (§12/§14/§49/§50)', () => {
  test('after window begins the NEXT local calendar day — the exposure day is excluded', () => {
    assert.equal(afterWindowStart('2026-09-01'), '2026-09-02');
    const days = [day('2026-09-01', 200), day('2026-09-02', 130), day('2026-09-03', 140)];
    const after = afterWindowDays(days, '2026-09-01', '2026-09-05');
    assert.deepEqual(after.map(d => d.localDate), ['2026-09-02', '2026-09-03']);
  });

  test('no-log days are not counted and never treated as zero intake (§50)', () => {
    const days = [
      day('2026-09-02', 130), day('2026-09-03', 0, 0, false), day('2026-09-04', 0, 0, false),
      day('2026-09-05', 140), day('2026-09-07', 150),
    ];
    const after = afterWindowDays(days, '2026-09-01', '2026-09-08');
    const logged = after.filter(d => d.hasLogs);
    assert.equal(logged.length, 3); // Tue/Fri/Sun — Wed/Thu excluded, not zeroed
  });

  test('the after window is capped at the horizon', () => {
    const far = day('2026-10-10', 130);
    const near = day('2026-09-05', 130);
    const after = afterWindowDays([near, far], '2026-09-01', '2026-10-20');
    assert.deepEqual(after.map(d => d.localDate), ['2026-09-05']); // 2026-10-10 is > horizon
  });

  test('afterWindowEntries mirrors the same bounds', () => {
    const e = (localDate: string) => ({ localDate } as any);
    const out = afterWindowEntries([e('2026-09-01'), e('2026-09-02'), e('2026-09-25')], '2026-09-01', '2026-09-30');
    assert.deepEqual(out.map((x: any) => x.localDate), ['2026-09-02']); // day-of excluded, beyond horizon excluded
  });
});

// ── §51–§57 evaluation ────────────────────────────────────────────────
describe('evaluateEffectiveness', () => {
  const NOW = '2026-09-10';

  test('§51 TOWARD_REFERENCE — 108 → 114 (Δ6 clears the ~5.4 g threshold), still below', () => {
    const after = [day('2026-09-02', 112), day('2026-09-04', 114), day('2026-09-06', 116), day('2026-09-08', 114)];
    const r = evaluateEffectiveness(exposure(), after, NOW)!;
    assert.equal(r.direction, 'toward_reference');
    assert.match(r.summary, /moved closer to your current reference range/);
    assert.doesNotMatch(r.summary + r.why, /worked|caused|effective/i);
    assert.match(r.why, /average logged protein was 108 g\/day across 6 logged days/);
    assert.match(r.why, /it averaged 114 g\/day/);
    assert.match(r.why, /115–165 g\/day/);
    assertSafeEffectiveness(r);
  });

  test('§52 WITHIN_REFERENCE — 108 → 121', () => {
    const after = [day('2026-09-02', 120), day('2026-09-04', 122), day('2026-09-06', 121), day('2026-09-08', 121)];
    const r = evaluateEffectiveness(exposure(), after, NOW)!;
    assert.equal(r.direction, 'within_reference');
    assert.match(r.summary, /is now within your current reference range/);
    assert.doesNotMatch(r.summary, /worked|success|great job/i);
  });

  test('§53 NO_CLEAR_CHANGE — 108 → 108.2 (noise) and 108 → 111 (below threshold)', () => {
    const noise = [day('2026-09-02', 108), day('2026-09-04', 108.4), day('2026-09-06', 108.2), day('2026-09-08', 108.2)];
    assert.equal(evaluateEffectiveness(exposure(), noise, NOW)!.direction, 'no_clear_change');
    const small = [day('2026-09-02', 110), day('2026-09-04', 111), day('2026-09-06', 112), day('2026-09-08', 111)];
    assert.equal(evaluateEffectiveness(exposure(), small, NOW)!.direction, 'no_clear_change');
  });

  test('§54 INSUFFICIENT — only 1 subsequent logged day → not surfaced (null)', () => {
    assert.equal(evaluateEffectiveness(exposure(), [day('2026-09-04', 130)], NOW), null);
  });

  test('§34 EXPIRED — exposure older than the horizon → null', () => {
    const old = exposure({ shownLocalDate: '2026-08-01' });
    const after = [day('2026-08-05', 130), day('2026-08-07', 140), day('2026-08-09', 150)];
    assert.equal(evaluateEffectiveness(old, after, NOW), null);
  });

  test('§28 AWAY_FROM_REFERENCE is computed but NOT surfaced (null)', () => {
    const after = [day('2026-09-02', 95), day('2026-09-04', 92), day('2026-09-06', 90), day('2026-09-08', 93)];
    assert.equal(evaluateEffectiveness(exposure(), after, NOW), null);
  });

  test('§55 REFERENCE CHANGE — evaluation uses the FROZEN exposure reference, not any current one', () => {
    // frozen 115–165; even if "today" N3 would say 120–171, the result cites 115–165
    const after = [day('2026-09-02', 118), day('2026-09-04', 119), day('2026-09-06', 119), day('2026-09-08', 118)];
    const r = evaluateEffectiveness(exposure({ referenceLow: 115, referenceHigh: 165 }), after, NOW)!;
    assert.deepEqual([r.before.referenceLow, r.before.referenceHigh], [115, 165]);
    assert.equal(r.direction, 'within_reference'); // 118.5 avg is within the FROZEN 115–165
    assert.match(r.why, /115–165 g\/day/);
  });

  test('§56 FIBRE — floor semantics: below 30, moved meaningfully higher but still below → toward_reference', () => {
    const fx = exposure({ nutrient: 'fibreG', comparison: 'below_reference', beforeAverage: 15, referenceType: 'exact', referenceLow: 30, referenceHigh: null });
    const after = [day('2026-09-02', 0, 20), day('2026-09-04', 0, 22), day('2026-09-06', 0, 21), day('2026-09-08', 0, 22)];
    const r = evaluateEffectiveness(fx, after, NOW)!;
    assert.equal(r.direction, 'toward_reference'); // 21.25 vs 15, Δ ~6 ≥ max(3, 0.75)
    assert.match(r.summary, /fibre has moved closer/);
    assert.match(r.why, /30 g\/day/);
  });

  test('§57 ABOVE-RANGE — protein now above the upper bound → neutral above_reference, never "excess"', () => {
    const after = [day('2026-09-02', 178), day('2026-09-04', 182), day('2026-09-06', 180), day('2026-09-08', 179)];
    const r = evaluateEffectiveness(exposure(), after, NOW)!;
    assert.equal(r.direction, 'above_reference');
    assert.match(r.summary, /is now above your current reference range/);
    assert.doesNotMatch(r.summary + r.why, /excess|excessive|harmful|too much|worse|unhealthy/i);
    assertSafeEffectiveness(r);
  });

  test('§58 MULTIPLE CARDS — protein and fibre evaluate independently, no cross reference', () => {
    const pAfter = [day('2026-09-02', 120, 12), day('2026-09-04', 121, 13), day('2026-09-06', 122, 12), day('2026-09-08', 121, 12)];
    const p = evaluateEffectiveness(exposure(), pAfter, NOW)!;
    const f = evaluateEffectiveness(
      exposure({ id: 'ex2', nutrient: 'fibreG', comparison: 'below_reference', beforeAverage: 12, referenceType: 'exact', referenceLow: 30, referenceHigh: null }),
      pAfter, NOW)!;
    assert.equal(p.nutrient, 'proteinG');
    assert.equal(f.nutrient, 'fibreG');
    // each card speaks only about its own nutrient — no cross-nutrient link
    assert.doesNotMatch(p.summary + ' ' + p.why, /fibre|both|caused|together/i);
    assert.doesNotMatch(f.summary + ' ' + f.why, /protein|both|caused|together/i);
    assertSafeEffectiveness(p);
    assertSafeEffectiveness(f);
  });

  test('readiness buckets follow the after-logged-day count', () => {
    assert.equal(afterReadiness(1), 'insufficient');
    assert.equal(afterReadiness(2), 'early');
    assert.equal(afterReadiness(4), 'moderate');
    assert.equal(afterReadiness(6), 'strong');
  });

  test('the before snapshot in the result is frozen — matches the exposure, not recomputed', () => {
    const after = [day('2026-09-02', 120), day('2026-09-04', 121), day('2026-09-06', 122), day('2026-09-08', 121)];
    const r = evaluateEffectiveness(exposure({ beforeAverage: 108, beforeLoggedDays: 6 }), after, NOW)!;
    assert.equal(r.before.average, 108);
    assert.equal(r.before.loggedDays, 6);
  });
});

// ── §27/§61 safety language ────────────────────────────────────────────
describe('advice-effectiveness safety language (§27/§61)', () => {
  for (const bad of [
    'this advice worked',
    'ACP improved your diet',
    'because ACP suggested it your protein rose',
    'the recommendation was effective',
    'you complied with the advice',
    'you followed our advice',
    'this fixed your low protein',
    'you were deficient before',
    'your diet was unhealthy',
    'you must eat more protein',
    'you should have eaten more',
  ]) {
    test(`flags: "${bad}"`, () => assert.ok(findUnsafeEffectivenessPhrases(bad).length > 0));
  }
  for (const ok of [
    'Since this suggestion was shown, your average logged protein has moved closer to your current reference range.',
    'Across your recent logged days, protein is now within your current reference range.',
    'Your recent logged protein is similar to the period before this suggestion.',
    'When this suggestion was first shown, average logged protein was 108 g/day across 6 logged days. Across 5 subsequent logged days it averaged 119 g/day. The reference used for this comparison is 115–165 g/day.',
  ]) {
    test(`allows: "${ok.slice(0, 40)}…"`, () => assert.deepEqual(findUnsafeEffectivenessPhrases(ok), []));
  }
});

describe('constants', () => {
  test('horizon + thresholds are conservative', () => {
    assert.equal(EXPOSURE_HORIZON_DAYS, 21);
    assert.ok(MEANINGFUL_CHANGE.proteinG.abs >= 5);
    assert.ok(MEANINGFUL_CHANGE.fibreG.abs >= 3);
  });
  test('buildBeforeSnapshot is unused-import guard for ExposureBeforeSnapshot type', () => {
    const s: ExposureBeforeSnapshot | null = buildBeforeSnapshot(proteinOpp(), rangeComparison());
    assert.ok(s);
  });
});
