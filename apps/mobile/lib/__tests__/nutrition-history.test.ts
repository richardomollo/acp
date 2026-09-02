import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyNutrients, type FoodLogEntry, type Nutrients, type MealSlot } from '../nutrition/food-types.ts';
import {
  summariseDay, buildHistory, addLocalDays,
} from '../nutrition/nutrition-history.ts';

// ── fixture ─────────────────────────────────────────────────────────────────
let seq = 0;
function entry(opts: {
  localDate: string;
  slot?: MealSlot | null;
  nutrients?: Partial<Nutrients>;
  /** name-only custom entry: no grams, no nutrients */
  custom?: boolean;
  loggedAt?: string;
  tz?: string | null;
}): FoodLogEntry {
  const n = emptyNutrients();
  if (!opts.custom && opts.nutrients) for (const [k, v] of Object.entries(opts.nutrients)) (n as any)[k] = v;
  return {
    id: `e${++seq}`, userId: 'u1',
    loggedAt: opts.loggedAt ?? `${opts.localDate}T12:00:00.000Z`,
    localDate: opts.localDate,
    timezone: opts.tz ?? 'Africa/Nairobi',
    mealSlot: opts.slot ?? null,
    foodId: opts.custom ? null : 'f1',
    displayName: 'Test food', brand: null,
    quantity: opts.custom ? 1 : 100, unit: opts.custom ? 'serving' : 'g',
    servingLabel: null,
    quantityGrams: opts.custom ? null : 100,
    captureMethod: 'search', source: opts.custom ? null : 'USDA FoodData Central',
    sourceType: opts.custom ? null : 'trusted_food_database', note: null,
    nutrients: n,
  };
}

describe('summariseDay — totals from one day', () => {
  test('single food', () => {
    const d = summariseDay('2026-09-01', [entry({ localDate: '2026-09-01', slot: 'breakfast', nutrients: { energyKcal: 147.5, proteinG: 25.5, fibreG: 0 } })]);
    assert.equal(d.hasLogs, true);
    assert.equal(d.entryCount, 1);
    assert.equal(d.energyKcal, 147.5);
    assert.equal(d.proteinG, 25.5);
    assert.equal(d.fibreG, 0);
  });

  test('multiple foods, multiple meal slots', () => {
    const d = summariseDay('2026-09-01', [
      entry({ localDate: '2026-09-01', slot: 'breakfast', nutrients: { energyKcal: 147.5, proteinG: 25.5 } }),
      entry({ localDate: '2026-09-01', slot: 'breakfast', nutrients: { energyKcal: 105, proteinG: 1.3 } }),
      entry({ localDate: '2026-09-01', slot: 'dinner', nutrients: { energyKcal: 600, proteinG: 40 } }),
    ]);
    assert.equal(d.energyKcal, 852.5);
    assert.equal(d.proteinG, 66.8);
    assert.equal(d.foodEntryCount, 3);
  });

  test('edit is reflected — same fixture with a changed snapshot', () => {
    const before = summariseDay('2026-09-01', [entry({ localDate: '2026-09-01', nutrients: { energyKcal: 147.5 } })]);
    const after = summariseDay('2026-09-01', [entry({ localDate: '2026-09-01', nutrients: { energyKcal: 177 } })]);
    assert.equal(before.energyKcal, 147.5);
    assert.equal(after.energyKcal, 177);
  });

  test('delete is reflected — fewer entries', () => {
    const two = summariseDay('2026-09-01', [
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100 } }),
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 50 } }),
    ]);
    const one = summariseDay('2026-09-01', [entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100 } })]);
    assert.equal(two.energyKcal, 150);
    assert.equal(one.energyKcal, 100);
    assert.equal(one.entryCount, 1);
  });
});

describe('NULL ≠ zero + completeness (§7)', () => {
  test('a micronutrient no food supplied stays null, not 0', () => {
    const d = summariseDay('2026-09-01', [
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100, ironMg: 2.1 } }),
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 50 } }), // no iron
    ]);
    assert.equal(d.micros.ironMg, 2.1);         // summed over the entry that knew it
    assert.equal(d.micros.vitaminDUg, null);    // nobody supplied it → unknown, not 0
  });

  test('coverage ratio: iron known for 1 of 2 food entries', () => {
    const d = summariseDay('2026-09-01', [
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100, ironMg: 2.1 } }),
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 50 } }),
    ]);
    assert.equal(d.completeness.ironMg.knownEntryCount, 1);
    assert.equal(d.completeness.ironMg.totalEntryCount, 2);
    assert.equal(d.completeness.ironMg.coverageRatio, 0.5);
    assert.equal(d.completeness.ironMg.level, 'partial');
    assert.equal(d.completeness.energyKcal.level, 'complete'); // both had energy
    assert.equal(d.completeness.vitaminDUg.level, 'none');
  });

  test('a measured 0 counts as known (level complete), not missing', () => {
    const d = summariseDay('2026-09-01', [entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100, fibreG: 0 } })]);
    assert.equal(d.completeness.fibreG.knownEntryCount, 1);
    assert.equal(d.completeness.fibreG.level, 'complete');
    assert.equal(d.fibreG, 0);
  });

  test('name-only custom entries do not count toward completeness denominator', () => {
    const d = summariseDay('2026-09-01', [
      entry({ localDate: '2026-09-01', nutrients: { energyKcal: 100, ironMg: 2 } }),
      entry({ localDate: '2026-09-01', custom: true }), // "chapati" name only
    ]);
    assert.equal(d.entryCount, 2);
    assert.equal(d.foodEntryCount, 1);
    assert.equal(d.completeness.ironMg.totalEntryCount, 1);
    assert.equal(d.completeness.ironMg.level, 'complete');
  });
});

describe('buildHistory — window, no-log days, ordering (§8)', () => {
  const entries = [
    entry({ localDate: '2026-09-01', nutrients: { energyKcal: 500 } }),
    entry({ localDate: '2026-09-01', nutrients: { energyKcal: 300 } }),
    entry({ localDate: '2026-08-30', nutrients: { energyKcal: 700 } }),
    entry({ localDate: '2026-08-28', custom: true }),
  ];

  test('7-day window ending 2026-09-01, newest first', () => {
    const h = buildHistory(entries, 7, '2026-09-01');
    assert.equal(h.length, 7);
    assert.deepEqual(h.map(d => d.localDate), [
      '2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26',
    ]);
  });

  test('no-log day ≠ 0-kcal day', () => {
    const h = buildHistory(entries, 7, '2026-09-01');
    const aug31 = h.find(d => d.localDate === '2026-08-31')!;
    assert.equal(aug31.hasLogs, false);           // nothing logged
    assert.equal(aug31.energyKcal, 0);            // total is 0 but…
    assert.equal(aug31.entryCount, 0);            // …because there are no entries

    const aug28 = h.find(d => d.localDate === '2026-08-28')!;
    assert.equal(aug28.hasLogs, true);            // a custom entry WAS logged
    assert.equal(aug28.energyKcal, 0);            // it carries no nutrients
    assert.equal(aug28.entryCount, 1);
  });

  test('logged days aggregate their own entries only', () => {
    const h = buildHistory(entries, 7, '2026-09-01');
    assert.equal(h.find(d => d.localDate === '2026-09-01')!.energyKcal, 800);
    assert.equal(h.find(d => d.localDate === '2026-08-30')!.energyKcal, 700);
  });

  test('14-day window is just a wider bound', () => {
    const h = buildHistory(entries, 14, '2026-09-01');
    assert.equal(h.length, 14);
    assert.equal(h[0].localDate, '2026-09-01');
    assert.equal(h[13].localDate, '2026-08-19');
  });
});

describe('timezone / local-date semantics (§20)', () => {
  test('entries are bucketed by their client-authored localDate, never re-derived from loggedAt (UTC)', () => {
    // Logged 01:30 Africa/Nairobi on the 3rd == 22:30 UTC on the 2nd.
    const nairobi = entry({ localDate: '2026-09-03', tz: 'Africa/Nairobi', loggedAt: '2026-09-02T22:30:00.000Z', nutrients: { energyKcal: 300 } });
    // Logged 23:30 Europe/Amsterdam on the 1st == 22:30 UTC on the 1st (CEST).
    const amsterdam = entry({ localDate: '2026-09-01', tz: 'Europe/Amsterdam', loggedAt: '2026-09-01T21:30:00.000Z', nutrients: { energyKcal: 400 } });
    const h = buildHistory([nairobi, amsterdam], 4, '2026-09-03');
    assert.equal(h.find(d => d.localDate === '2026-09-03')!.energyKcal, 300);
    assert.equal(h.find(d => d.localDate === '2026-09-02')!.hasLogs, false);
    assert.equal(h.find(d => d.localDate === '2026-09-01')!.energyKcal, 400);
  });

  test('addLocalDays stays in the calendar domain across month/DST boundaries', () => {
    assert.equal(addLocalDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addLocalDays('2026-10-25', -1), '2026-10-24'); // EU DST night — no shift
    assert.equal(addLocalDays('2026-01-01', -1), '2025-12-31');
  });
});

describe('historical snapshot stability (§9)', () => {
  test('summariseDay only reads entry.nutrients — canonical food changes cannot alter it', () => {
    const frozen = entry({ localDate: '2026-08-15', nutrients: { energyKcal: 147.5, proteinG: 25.475 } });
    const d1 = summariseDay('2026-08-15', [frozen]);
    // Simulate an N2 canonical re-sync by NOT changing the entry (there is no
    // path from canonical foods into this function). Same input ⇒ same output.
    const d2 = summariseDay('2026-08-15', [frozen]);
    assert.deepEqual(d1, d2);
    assert.equal(d1.energyKcal, 147.5);
  });
});
