import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import { nutritionEvidenceTier, buildNutritionPatterns } from '../nutrition/nutrition-patterns.ts';

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

describe('evidence tiers (§11)', () => {
  test('threshold boundaries', () => {
    assert.equal(nutritionEvidenceTier(0), 'daily_observation');
    assert.equal(nutritionEvidenceTier(1), 'daily_observation');
    assert.equal(nutritionEvidenceTier(2), 'early_observation');
    assert.equal(nutritionEvidenceTier(3), 'early_observation');
    assert.equal(nutritionEvidenceTier(4), 'emerging_pattern');
    assert.equal(nutritionEvidenceTier(6), 'emerging_pattern');
    assert.equal(nutritionEvidenceTier(7), 'recent_pattern');
    assert.equal(nutritionEvidenceTier(30), 'recent_pattern');
  });

  test('one logged day never produces pattern observations', () => {
    const p = buildNutritionPatterns([entry('2026-09-01', 'breakfast', { energyKcal: 400, proteinG: 20 })], { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.equal(p.tier, 'daily_observation');
    assert.deepEqual(p.observations, []);
    assert.equal(p.loggedDayCount, 1);
  });

  test('2–3 logged days → early_observation with observations', () => {
    const p = buildNutritionPatterns([
      entry('2026-09-01', 'breakfast', { energyKcal: 400, proteinG: 20 }),
      entry('2026-08-31', 'dinner', { energyKcal: 600, proteinG: 30 }),
    ], { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.equal(p.tier, 'early_observation');
    assert.ok(p.observations.length > 0);
    assert.ok(p.observations[0].includes('2 of the last 7 days'));
  });
});

describe('deterministic pattern facts', () => {
  // 6 logged days, breakfast on 5 of them, dinner biggest energy.
  const days = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'];
  const entries: FoodLogEntry[] = [];
  days.forEach((d, i) => {
    if (i < 5) entries.push(entry(d, 'breakfast', { energyKcal: 300, proteinG: 15, fibreG: 4 }));
    entries.push(entry(d, 'lunch', { energyKcal: 500, proteinG: 25, fibreG: 6 }));
    entries.push(entry(d, 'dinner', { energyKcal: 800, proteinG: 45, fibreG: 8 }));
  });

  const p = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: '2026-09-01' });

  test('tier + logged day count', () => {
    assert.equal(p.loggedDayCount, 6);
    assert.equal(p.tier, 'emerging_pattern');
  });
  test('breakfast day frequency = 5 of 6', () => {
    assert.equal(p.mealSlotDayFrequency.breakfast, 5);
    assert.equal(p.mealSlotDayFrequency.lunch, 6);
    assert.equal(p.mealSlotDayFrequency.dinner, 6);
    assert.ok(p.observations.some(o => o.includes('Breakfast was logged on 5 of 6 logged days')));
  });
  test('meal-slot energy share sums to ~1 and dinner is largest', () => {
    const sum = p.mealSlotEnergyShare.breakfast + p.mealSlotEnergyShare.lunch + p.mealSlotEnergyShare.dinner + p.mealSlotEnergyShare.snack + p.mealSlotEnergyShare.unassigned;
    assert.ok(Math.abs(sum - 1) < 0.02, `share sum ${sum}`);
    assert.ok(p.mealSlotEnergyShare.dinner > p.mealSlotEnergyShare.lunch);
    assert.ok(p.mealSlotEnergyShare.dinner > p.mealSlotEnergyShare.breakfast);
    assert.ok(p.observations.some(o => o.startsWith('Dinner accounted for the largest share')));
  });
  test('per-logged-day averages', () => {
    // breakfast total over 6 days = 5*300 = 1500 ; lunch 6*500 ; dinner 6*800
    // energy per logged day = (1500 + 3000 + 4800) / 6 = 1550
    assert.equal(p.averagesPerLoggedDay.energyKcal, 1550);
    // protein per logged day = (5*15 + 6*25 + 6*45) / 6 = (75+150+270)/6 = 82.5
    assert.equal(p.averagesPerLoggedDay.proteinG, 82.5);
    assert.ok(p.observations.some(o => o.includes('Average logged protein was 82.5 g/day')));
    assert.ok(p.observations.some(o => o.includes('Average logged fibre')));
  });
});

describe('nutrient coverage across the window', () => {
  test('iron known for 2 of 3 entries → coverageRatio 0.67', () => {
    const p = buildNutritionPatterns([
      entry('2026-09-01', 'breakfast', { energyKcal: 300, ironMg: 2 }),
      entry('2026-08-31', 'lunch', { energyKcal: 500, ironMg: 3 }),
      entry('2026-08-30', 'dinner', { energyKcal: 700 }),
    ], { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.equal(p.nutrientCoverage.ironMg!.knownEntryCount, 2);
    assert.equal(p.nutrientCoverage.ironMg!.totalEntryCount, 3);
    assert.equal(p.nutrientCoverage.ironMg!.coverageRatio, 0.67);
    assert.equal(p.nutrientCoverage.vitaminDUg!.knownEntryCount, 0);
  });
});

describe('observational language boundaries (§12/§13/§15)', () => {
  const BANNED = [
    'deficient', 'deficiency', 'excessive', 'too much', 'too little', 'unhealthy', 'healthy diet',
    'poor diet', 'optimal', 'you should', 'you skip', 'skipped breakfast', 'skipped lunch', 'skipped dinner',
    'you need more', 'eat more', 'eat less', 'recommend',
  ];
  function assertClean(lines: string[]) {
    for (const line of lines) {
      const low = line.toLowerCase();
      for (const b of BANNED) assert.ok(!low.includes(b), `banned phrase "${b}" in: ${line}`);
    }
  }

  test('a missing breakfast log never becomes "skipped breakfast"', () => {
    // 4 logged days, breakfast on NONE of them.
    const entries = ['2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29']
      .flatMap(d => [entry(d, 'lunch', { energyKcal: 500, proteinG: 25 }), entry(d, 'dinner', { energyKcal: 700, proteinG: 35 })]);
    const p = buildNutritionPatterns(entries, { windowDays: 7, endLocalDate: '2026-09-01' });
    assert.ok(p.observations.some(o => o === 'No breakfast was logged in this window.'));
    assertClean(p.observations);
  });

  test('no deficiency / judgement terms in any observation, across tiers', () => {
    // consecutive local dates ending 2026-09-14, one entry per day
    const dates = Array.from({ length: 10 }, (_, i) => {
      const dt = new Date(Date.UTC(2026, 8, 14 - i));
      return dt.toISOString().slice(0, 10);
    });
    for (const nDays of [2, 4, 7, 10]) {
      const entries = dates.slice(0, nDays).map((date, i) =>
        entry(date, i % 2 ? 'dinner' : 'breakfast', { energyKcal: 400 + i * 10, proteinG: 20, fibreG: 5, ironMg: 2 }));
      const p = buildNutritionPatterns(entries, { windowDays: 14, endLocalDate: '2026-09-14' });
      assertClean(p.observations);
    }
  });
});
