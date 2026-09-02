import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import { buildHistory } from '../nutrition/nutrition-history.ts';
import { buildNutritionPatterns } from '../nutrition/nutrition-patterns.ts';
import {
  getNutritionReferences, compareNutritionEvidence, buildNutritionReferenceComparisons, computeAgeYears,
  type UserReferenceContext, type ContextField,
} from '../nutrition/nutrition-reference-engine.ts';
import { POPULATION_REFERENCES, NUTRIENT_REF_KEYS } from '../nutrition/nutrition-reference-data.ts';

// ── fixtures ────────────────────────────────────────────────────────────────
let seq = 0;
function entry(localDate: string, slot: MealSlot | null, nutrients: Partial<Nutrients>): FoodLogEntry {
  const n = emptyNutrients();
  for (const [k, v] of Object.entries(nutrients)) (n as any)[k] = v;
  return {
    id: `e${++seq}`, userId: 'u1', loggedAt: `${localDate}T12:00:00.000Z`, localDate,
    timezone: 'Africa/Nairobi', mealSlot: slot, foodId: 'f1', displayName: 'x', brand: null,
    quantity: 100, unit: 'g', servingLabel: null, quantityGrams: 100, captureMethod: 'search',
    source: 'USDA FoodData Central', sourceType: 'trusted_food_database', note: null, nutrients: n,
  };
}
const avail = <T,>(value: T): ContextField<T> => ({ status: 'available', value });
const missing = <T,>(reason = 'missing'): ContextField<T> => ({ status: 'insufficient_context', reason });

function ctx(opts: Partial<UserReferenceContext> = {}): UserReferenceContext {
  return {
    age: avail(30),
    sex: avail('male'),
    weight: avail({ kg: 80, source: 'client_measurement', recordedAt: '2026-08-30' }),
    ...opts,
  };
}

const BANNED = [
  'deficient', 'deficiency', 'excessive', 'unhealthy', 'healthy diet', 'poor diet', 'optimal',
  'you should', 'eat more', 'eat less', 'add more', 'reduce your', 'swap', 'try eating',
  'supplement', 'good', 'bad',
];
function assertNoBannedLanguage(text: string) {
  const low = text.toLowerCase();
  for (const b of BANNED) assert.ok(!low.includes(b), `banned phrase "${b}" in: ${text}`);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('computeAgeYears — deterministic, birthday-boundary aware (§24)', () => {
  test('birthday already passed this year', () => {
    assert.equal(computeAgeYears('1996-05-01', new Date(2026, 8, 1)), 30); // Sep 1, born May 1
  });
  test('birthday later this year — not yet incremented', () => {
    assert.equal(computeAgeYears('1996-12-25', new Date(2026, 8, 1)), 29); // Sep 1, born Dec 25
  });
  test('exact birthday — age increments same day', () => {
    assert.equal(computeAgeYears('1996-09-01', new Date(2026, 8, 1)), 30);
  });
  test('day before birthday — not yet incremented', () => {
    assert.equal(computeAgeYears('1996-09-02', new Date(2026, 8, 1)), 29);
  });
  test('leap-year DOB (Feb 29) is handled without throwing', () => {
    assert.equal(computeAgeYears('2000-02-29', new Date(2026, 7, 1)), 26);
  });
});

describe('reference selection — age (§7/§24/§27)', () => {
  test('age 18 exactly is adult-eligible', () => {
    const refs = getNutritionReferences(ctx({ age: avail(18) }));
    assert.equal(refs.fibreG.status, 'available');
  });
  test('age 17 → not_applicable, not a guessed adult value', () => {
    const refs = getNutritionReferences(ctx({ age: avail(17) }));
    assert.equal(refs.fibreG.status, 'not_applicable');
    assert.equal(refs.proteinG.status, 'not_applicable');
    if (refs.fibreG.status === 'not_applicable') assertNoBannedLanguage(refs.fibreG.reason);
  });
  test('missing DOB/age → insufficient_context for every nutrient, never a silent adult default', () => {
    const refs = getNutritionReferences(ctx({ age: missing('no dob') }));
    for (const k of NUTRIENT_REF_KEYS) assert.equal(refs[k].status, 'insufficient_context', k);
  });
});

describe('reference selection — sex (§7/§25)', () => {
  test('unisex nutrients (fibre, potassium, vitamin D, folate, B12) do not require sex', () => {
    const refs = getNutritionReferences(ctx({ sex: missing('not set') }));
    for (const k of ['fibreG', 'potassiumMg', 'vitaminDUg', 'folateB9Ug', 'vitaminB12Ug'] as const) {
      assert.equal(refs[k].status, 'available', k);
    }
  });
  test('sex-specific nutrients require sex; missing sex → insufficient_context, not a guess', () => {
    const refs = getNutritionReferences(ctx({ sex: missing('not set') }));
    for (const k of ['magnesiumMg', 'vitaminAUg', 'vitaminCMg'] as const) {
      assert.equal(refs[k].status, 'insufficient_context', k);
    }
  });
  test('male vs female resolve to their own published PRI', () => {
    const male = getNutritionReferences(ctx({ sex: avail('male') })).magnesiumMg;
    const female = getNutritionReferences(ctx({ sex: avail('female') })).magnesiumMg;
    assert.equal(male.status, 'available'); assert.equal(female.status, 'available');
    if (male.status === 'available' && female.status === 'available') {
      assert.equal(male.reference.value, 350);
      assert.equal(female.reference.value, 300);
    }
  });
  test('female iron is explicitly unsupported (menopausal status not tracked) — not silently 16 or 11', () => {
    const refs = getNutritionReferences(ctx({ sex: avail('female') }));
    assert.equal(refs.ironMg.status, 'unsupported');
  });
  test('male iron resolves to 11 mg/d', () => {
    const refs = getNutritionReferences(ctx({ sex: avail('male') }));
    assert.equal(refs.ironMg.status, 'available');
    if (refs.ironMg.status === 'available') assert.equal(refs.ironMg.reference.value, 11);
  });
});

describe('reference selection — no zinc (unsupported nutrient)', () => {
  test('zincMg is not in NUTRIENT_REF_KEYS at all', () => {
    assert.ok(!(NUTRIENT_REF_KEYS as readonly string[]).includes('zincMg'));
  });
});

describe('reference metadata carries source provenance', () => {
  test('every available reference exposes its source', () => {
    const refs = getNutritionReferences(ctx());
    for (const k of NUTRIENT_REF_KEYS) {
      const r = refs[k];
      if (r.status === 'available') {
        assert.ok(r.reference.source.organisation.length > 0, k);
        assert.ok(r.reference.source.url.startsWith('https://'), k);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('protein — weight-based personalised range (§8)', () => {
  test('80 kg → 112.0–160.0 g/day (1.4–2.0 g/kg), correctly rounded', () => {
    const refs = getNutritionReferences(ctx({ weight: avail({ kg: 80, source: 'client_measurement', recordedAt: null }) }));
    assert.equal(refs.proteinG.status, 'available');
    if (refs.proteinG.status === 'available') {
      assert.equal(refs.proteinG.reference.min, 112);
      assert.equal(refs.proteinG.reference.max, 160);
      assert.equal(refs.proteinG.reference.personalised, true);
    }
  });
  test('63.5 kg → correct rounding to 1 dp (88.9–127.0)', () => {
    const refs = getNutritionReferences(ctx({ weight: avail({ kg: 63.5, source: 'health_daily_stats', recordedAt: null }) }));
    if (refs.proteinG.status === 'available') {
      assert.equal(refs.proteinG.reference.min, 88.9);
      assert.equal(refs.proteinG.reference.max, 127);
    }
  });
  test('missing weight → insufficient_context, never falls back to a default weight', () => {
    const refs = getNutritionReferences(ctx({ weight: missing('no weight logged') }));
    assert.equal(refs.proteinG.status, 'insufficient_context');
  });
  test('minor (age 16) → not_applicable regardless of weight being available', () => {
    const refs = getNutritionReferences(ctx({ age: avail(16) }));
    assert.equal(refs.proteinG.status, 'not_applicable');
  });
  test('the range is identical for every weight input other than the weight itself — no goal/experience influence (engine takes no such input)', () => {
    const a = getNutritionReferences(ctx({ weight: avail({ kg: 70, source: 'client_measurement', recordedAt: null }) })).proteinG;
    const b = getNutritionReferences(ctx({ weight: avail({ kg: 70, source: 'fitness_profile', recordedAt: null }) })).proteinG;
    assert.deepEqual(a, b, 'source of the weight value must not change the resolved range, only its own provenance record');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('fibre — population reference (§9)', () => {
  test('reference is 25 g/day, unisex', () => {
    const refs = getNutritionReferences(ctx({ sex: missing() }));
    assert.equal(refs.fibreG.status, 'available');
    if (refs.fibreG.status === 'available') assert.equal(refs.fibreG.reference.value, 25);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('comparison states — exact-type references (fibre)', () => {
  const fibreRef = getNutritionReferences(ctx()).fibreG;

  function daysWith(fibrePerEntry: number, nDays: number) {
    const dates = Array.from({ length: nDays }, (_, i) => `2026-08-${String(25 - i).padStart(2, '0')}`);
    const entries = dates.map(d => entry(d, 'lunch', { energyKcal: 500, fibreG: fibrePerEntry }));
    return { days: buildHistory(entries, 7, dates[0]), patterns: buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] }) };
  }

  test('below reference: logged average under 25 g/day', () => {
    const { days, patterns } = daysWith(10, 5); // 10 g/day average
    const c = compareNutritionEvidence('fibreG', days, patterns, fibreRef);
    assert.equal(c.state, 'below_reference');
    assert.equal(c.actual.value, 10);
  });
  test('meets/exceeds reference: logged average at or above 25 g/day', () => {
    const { days, patterns } = daysWith(30, 5);
    const c = compareNutritionEvidence('fibreG', days, patterns, fibreRef);
    assert.equal(c.state, 'meets_or_exceeds_reference');
  });
  test('exact boundary — average exactly 25 g/day counts as meeting the reference', () => {
    const { days, patterns } = daysWith(25, 5);
    const c = compareNutritionEvidence('fibreG', days, patterns, fibreRef);
    assert.equal(c.state, 'meets_or_exceeds_reference');
  });
});

describe('comparison states — range-type reference (protein)', () => {
  function daysWithProtein(proteinPerDay: number, nDays: number) {
    const dates = Array.from({ length: nDays }, (_, i) => `2026-08-${String(25 - i).padStart(2, '0')}`);
    const entries = dates.map(d => entry(d, 'lunch', { energyKcal: 500, proteinG: proteinPerDay }));
    return { days: buildHistory(entries, 7, dates[0]), patterns: buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] }) };
  }
  const proteinRef = getNutritionReferences(ctx({ weight: avail({ kg: 80, source: 'client_measurement', recordedAt: null }) })).proteinG; // 112–160

  test('below range', () => {
    const { days, patterns } = daysWithProtein(90, 5);
    assert.equal(compareNutritionEvidence('proteinG', days, patterns, proteinRef).state, 'below_range');
  });
  test('within range', () => {
    const { days, patterns } = daysWithProtein(130, 5);
    assert.equal(compareNutritionEvidence('proteinG', days, patterns, proteinRef).state, 'within_range');
  });
  test('above range', () => {
    const { days, patterns } = daysWithProtein(200, 5);
    assert.equal(compareNutritionEvidence('proteinG', days, patterns, proteinRef).state, 'above_range');
  });
  test('exact lower boundary (112) is within_range', () => {
    const { days, patterns } = daysWithProtein(112, 5);
    assert.equal(compareNutritionEvidence('proteinG', days, patterns, proteinRef).state, 'within_range');
  });
  test('exact upper boundary (160) is within_range', () => {
    const { days, patterns } = daysWithProtein(160, 5);
    assert.equal(compareNutritionEvidence('proteinG', days, patterns, proteinRef).state, 'within_range');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('logged-day gate (§12) — reuses N2 evidence tiers', () => {
  const fibreRef = getNutritionReferences(ctx()).fibreG;

  test('0 logged days → insufficient_days, no average shown', () => {
    const days = buildHistory([], 7, '2026-09-01');
    const patterns = buildNutritionPatterns([], { windowDays: 7, endLocalDate: '2026-09-01' });
    const c = compareNutritionEvidence('fibreG', days, patterns, fibreRef);
    assert.equal(c.state, 'insufficient_days');
    assert.equal(c.readiness, 'unavailable');
  });
  test('1 logged day → insufficient_days (below MIN_LOGGED_DAYS_FOR_COMPARISON = 2)', () => {
    const entries = [entry('2026-09-01', 'lunch', { energyKcal: 500, fibreG: 20 })];
    const days = buildHistory(entries, 7, '2026-09-01');
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.equal(compareNutritionEvidence('fibreG', days, patterns, fibreRef).state, 'insufficient_days');
  });
  test('2 logged days → comparison proceeds (readiness limited)', () => {
    const entries = ['2026-09-01', '2026-08-31'].map(d => entry(d, 'lunch', { energyKcal: 500, fibreG: 20 }));
    const days = buildHistory(entries, 7, '2026-09-01');
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: '2026-09-01' });
    const c = compareNutritionEvidence('fibreG', days, patterns, fibreRef);
    assert.equal(c.state, 'below_reference');
    assert.equal(c.readiness, 'limited');
  });
  test('7+ logged days with high coverage → readiness high', () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-08-${String(25 - i).padStart(2, '0')}`);
    const entries = dates.map(d => entry(d, 'lunch', { energyKcal: 500, fibreG: 20 }));
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    assert.equal(compareNutritionEvidence('fibreG', days, patterns, fibreRef).readiness, 'high');
  });
});

describe('nutrient coverage gate (§11)', () => {
  const ironRef = getNutritionReferences(ctx({ sex: avail('male') })).ironMg;

  test('coverage < 0.5 → insufficient_data, comparison suppressed', () => {
    // 5 logged days, iron known on only 1 of 5 food entries (0.2 coverage)
    const dates = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28'];
    const entries = dates.map((d, i) => entry(d, 'lunch', { energyKcal: 500, ironMg: i === 0 ? 3 : undefined }));
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const c = compareNutritionEvidence('ironMg', days, patterns, ironRef);
    assert.equal(c.state, 'insufficient_data');
    assert.equal(c.actual.coverage, 0.2);
  });

  test('coverage 0.5–0.79 → comparison shown, readiness limited (partial qualification)', () => {
    const dates = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'];
    // iron known on 3 of 6 entries (deliberately 0.5, still >= threshold → allowed)
    const entries = dates.map((d, i) => entry(d, 'lunch', { energyKcal: 500, ironMg: i < 3 ? 3 : undefined }));
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const c = compareNutritionEvidence('ironMg', days, patterns, ironRef);
    assert.notEqual(c.state, 'insufficient_data');
    assert.equal(c.actual.coverage, 0.5);
    assert.equal(c.readiness, 'limited');
  });

  test('coverage >= 0.8 → readiness not held back by coverage', () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-08-${String(25 - i).padStart(2, '0')}`);
    const entries = dates.map(d => entry(d, 'lunch', { energyKcal: 500, ironMg: 3 })); // 100% coverage
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const c = compareNutritionEvidence('ironMg', days, patterns, ironRef);
    assert.equal(c.readiness, 'high'); // 7 logged days (high) AND coverage 1.0 (high) → high
  });

  test('no food entries at all in the window → insufficient_data (coverage null), not a fabricated comparison', () => {
    // still < 2 logged days with a single entry, so insufficient_days would fire first — use 2 custom-only days to isolate coverage=null
    const entries2 = [entry('2026-09-01', null, {}), entry('2026-08-31', null, {})].map(e => ({ ...e, foodId: null, quantityGrams: null }));
    const days2 = buildHistory(entries2 as any, 7, '2026-09-01');
    const patterns2 = buildNutritionPatterns(entries2 as any, { windowDays: 7, endLocalDate: '2026-09-01' });
    const c = compareNutritionEvidence('ironMg', days2, patterns2, ironRef);
    assert.equal(c.actual.coverage, null);
    assert.equal(c.state, 'insufficient_data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('N2 integration — NULL ≠ 0, no-log days excluded (§34/§35)', () => {
  test('micronutrient average excludes days where it was unknown, never treats them as 0', () => {
    const dates = ['2026-09-01', '2026-08-31', '2026-08-30'];
    // iron known 4 mg on day 1, unknown on day 2, known 6 mg on day 3 → average should be (4+6)/2 = 5, NOT (4+0+6)/3
    const entries = [
      entry(dates[0], 'lunch', { energyKcal: 500, ironMg: 4 }),
      entry(dates[1], 'lunch', { energyKcal: 500 }), // no iron this day
      entry(dates[2], 'lunch', { energyKcal: 500, ironMg: 6 }),
    ];
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const ironRef = getNutritionReferences(ctx({ sex: avail('male') })).ironMg;
    const c = compareNutritionEvidence('ironMg', days, patterns, ironRef);
    assert.equal(c.actual.value, 5, 'must average only the 2 days that knew iron, not divide by 3');
  });

  test('a no-log day is excluded from the average denominator entirely (not 0 intake)', () => {
    const entries = [
      entry('2026-09-01', 'lunch', { energyKcal: 500, fibreG: 20 }),
      entry('2026-08-30', 'lunch', { energyKcal: 500, fibreG: 30 }),
      // 2026-08-31 has no entries at all
    ];
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.equal(patterns.loggedDayCount, 2, 'the no-log day must not count as a logged day');
    assert.equal(patterns.averagesPerLoggedDay.fibreG, 25, '(20+30)/2, never /3');
  });

  test('frozen snapshots: comparison never imports or touches canonical foods', () => {
    // Structural guarantee — the engine module has no import of food-provider / supabase.
    const path = new URL('../nutrition/nutrition-reference-engine.ts', import.meta.url);
    const src = readFileSync(path, 'utf8');
    assert.ok(!/food-provider|supabase/i.test(src));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('safety boundaries (§28/§30)', () => {
  test('energyKcal is not a supported reference nutrient — no calorie target exists', () => {
    assert.ok(!(NUTRIENT_REF_KEYS as readonly string[]).includes('energyKcal'));
  });
  test('no reference row or engine reason string contains a recommendation verb or diagnosis word', () => {
    for (const row of POPULATION_REFERENCES) {
      if (row.notes) assertNoBannedLanguage(row.notes);
      if (row.unsupportedReason) assertNoBannedLanguage(row.unsupportedReason);
    }
    const ctxs = [
      ctx({ age: missing() }), ctx({ age: avail(15) }), ctx({ sex: missing() }),
      ctx({ weight: missing() }), ctx({ sex: avail('female') }),
    ];
    for (const c of ctxs) {
      const refs = getNutritionReferences(c);
      for (const k of NUTRIENT_REF_KEYS) {
        const r = refs[k];
        if (r.status !== 'available') assertNoBannedLanguage(r.reason);
      }
    }
  });
  test('comparison states never include an "excessive"/"deficient" label — only relational states', () => {
    const states = [
      'below_reference', 'meets_or_exceeds_reference', 'below_range', 'within_range', 'above_range',
      'insufficient_days', 'insufficient_data', 'insufficient_context', 'not_applicable', 'unsupported',
    ];
    for (const s of states) assertNoBannedLanguage(s.replace(/_/g, ' '));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('buildNutritionReferenceComparisons — full pipeline', () => {
  test('returns all NUTRIENT_REF_KEYS in order, each with actual + reference + state + readiness', () => {
    const dates = Array.from({ length: 6 }, (_, i) => `2026-08-${String(25 - i).padStart(2, '0')}`);
    const entries = dates.map(d => entry(d, 'lunch', {
      energyKcal: 500, proteinG: 30, fibreG: 8, ironMg: 3, calciumMg: 200,
      potassiumMg: 400, magnesiumMg: 60, vitaminAUg: 100, vitaminCMg: 20, vitaminDUg: 2, folateB9Ug: 50, vitaminB12Ug: 1,
    }));
    const days = buildHistory(entries, 7, dates[0]);
    const patterns = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: dates[0] });
    const results = buildNutritionReferenceComparisons(ctx(), days, patterns);
    assert.deepEqual(results.map(r => r.nutrient), NUTRIENT_REF_KEYS);
    for (const r of results) {
      assert.ok('actual' in r && 'reference' in r && 'state' in r && 'readiness' in r);
    }
  });
});
