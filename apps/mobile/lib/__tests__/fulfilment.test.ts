import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActivity, getSelfDirectedSource, nextDateForWeekday,
  matchPlanActivityToInventory, getFulfilmentForActivity, isGymAccessListing,
  type MarketplaceInventoryItem,
} from '../fulfilment.ts';

function makeItem(overrides: Partial<MarketplaceInventoryItem> = {}): MarketplaceInventoryItem {
  return {
    id: 'item-1', type: 'session', name: 'Session', category: null,
    date: '2026-09-02', startTime: '18:00:00', durationMinutes: 60,
    gymName: 'Test Gym', isActive: true, spotsLeft: 5,
    ...overrides,
  };
}

describe('normalizeActivity', () => {
  test('recognizes gym/strength keywords', () => {
    assert.equal(normalizeActivity('Gym — full-body strength', 'strength'), 'gym');
    assert.equal(normalizeActivity('Strength Training', 'strength'), 'gym');
  });

  test('recognizes running/walking/cycling', () => {
    assert.equal(normalizeActivity('Easy run', 'cardio'), 'running');
    assert.equal(normalizeActivity('Brisk walk', 'cardio'), 'walking');
    assert.equal(normalizeActivity('Cycling session', 'cardio'), 'cycling');
  });

  test('recognizes football, swimming, boxing, yoga, mobility', () => {
    assert.equal(normalizeActivity('Football session', 'sport'), 'football');
    assert.equal(normalizeActivity('Swim', 'cardio'), 'swimming');
    assert.equal(normalizeActivity('Boxing class', 'sport'), 'boxing');
    assert.equal(normalizeActivity('Gentle yoga', 'recovery'), 'yoga');
    assert.equal(normalizeActivity('Mobility and foam rolling', 'mobility'), 'mobility');
  });

  test('a compound description resolves to whichever activity is named first', () => {
    assert.equal(normalizeActivity('Football or brisk walk (enjoyment day)', 'sport'), 'football');
  });

  test('falls back on category when no keyword is recognizable', () => {
    assert.equal(normalizeActivity('Something unusual', 'strength'), 'gym');
    assert.equal(normalizeActivity('Something unusual', 'mobility'), 'mobility');
    assert.equal(normalizeActivity('Something unusual', 'cardio'), 'walking');
    assert.equal(normalizeActivity('Something unusual', 'sport'), 'other');
  });
});

describe('getSelfDirectedSource (routing table)', () => {
  test('gym/strength routes to exercise_db', () => {
    const result = getSelfDirectedSource('gym', false);
    assert.equal(result?.source, 'exercise_db');
    assert.equal(result?.navigationTarget, '/browse-exercises');
  });

  test('running/walking/cycling route to strava, never exercise_db', () => {
    for (const key of ['running', 'walking', 'cycling'] as const) {
      const result = getSelfDirectedSource(key, true);
      assert.equal(result?.source, 'strava');
    }
  });

  test('strava CTA reflects connection status without ever implying Strava can "start" anything', () => {
    const disconnected = getSelfDirectedSource('running', false);
    const connected = getSelfDirectedSource('running', true);
    assert.equal(disconnected?.navigationTarget, '/strava-settings');
    assert.equal(connected?.navigationTarget, '/outdoor-activities');
    for (const r of [disconnected, connected]) {
      assert.ok(!r!.title.toLowerCase().startsWith('start'), 'Strava is read-only — copy must never say "Start"');
    }
  });

  test('yoga, football, swimming, boxing, mobility have no self-directed source (no genuine ExerciseDB taxonomy match)', () => {
    for (const key of ['yoga', 'football', 'swimming', 'boxing', 'mobility', 'other'] as const) {
      assert.equal(getSelfDirectedSource(key, false), undefined);
    }
  });
});

describe('nextDateForWeekday', () => {
  test('matches the spec example exactly: generated on a Tuesday', () => {
    const tuesday = new Date('2026-09-01T09:00:00'); // a Tuesday
    assert.equal(tuesday.getDay(), 2);
    assert.equal(nextDateForWeekday('Wednesday', tuesday), '2026-09-02'); // tomorrow
    assert.equal(nextDateForWeekday('Saturday', tuesday), '2026-09-05'); // this Saturday
    assert.equal(nextDateForWeekday('Monday', tuesday), '2026-09-07'); // NEXT Monday, not the one already passed
  });

  test('if the anchor day itself matches, returns the anchor date (today counts as upcoming)', () => {
    const wednesday = new Date('2026-09-02T09:00:00');
    assert.equal(nextDateForWeekday('Wednesday', wednesday), '2026-09-02');
  });

  test('returns null for an unrecognized day name', () => {
    assert.equal(nextDateForWeekday('Someday', new Date()), null);
  });
});

describe('matchPlanActivityToInventory (Scenario A: strength/gym)', () => {
  const anchor = new Date('2026-09-01T09:00:00'); // Tuesday

  test('matches a relevant strength session, ranks same-day above alternate-day', () => {
    const inventory = [
      makeItem({ id: 'same-day', name: 'Strength Training', date: '2026-09-03', category: 'Strength Training' }), // Thursday - not the target day
      makeItem({ id: 'exact-day', name: 'Gym Strength Class', date: '2026-09-02', category: 'Strength Training' }), // Wednesday = target
    ];
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', inventory, anchor);
    assert.equal(matches[0].id, 'exact-day');
    assert.ok(matches[0].matchReasons.includes('same_day'));
  });

  test('never surfaces unrelated inventory (e.g. yoga) for a gym activity', () => {
    const inventory = [makeItem({ name: 'Yoga Flow', category: 'Yoga', date: '2026-09-02' })];
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', inventory, anchor);
    assert.deepEqual(matches, []);
  });

  test('Day 5 fix: a stored planned_date is used verbatim instead of recomputing the weekday against "today"', () => {
    // Recomputing "Wednesday" from `anchor` (2026-09-01, a Tuesday) would
    // resolve to THIS week's Wednesday (2026-09-02) — but this activity's
    // planned_date fixes it two weeks further out (2026-09-16, also a
    // Wednesday), e.g. because it belongs to a plan being previewed ahead
    // of its own week. Only the inventory on the CORRECT, stored date
    // should be treated as the exact-day match.
    const inventory = [
      makeItem({ id: 'wrong-week', name: 'Gym Strength Class', date: '2026-09-02', category: 'Strength Training' }),
      makeItem({ id: 'right-week', name: 'Gym Strength Class', date: '2026-09-16', category: 'Strength Training' }),
    ];
    const matches = matchPlanActivityToInventory(
      { day: 'Wednesday', duration_minutes: 60, planned_date: '2026-09-16' },
      'gym', inventory, anchor,
    );
    assert.equal(matches[0]?.id, 'right-week');
    assert.ok(matches[0].matchReasons.includes('same_day'));
  });
});

describe('matchPlanActivityToInventory (Scenario B/D: no generic-category substitution)', () => {
  const anchor = new Date('2026-09-01T09:00:00');

  test('running: a "HIIT class" must never substitute for a running plan item', () => {
    const inventory = [makeItem({ name: 'HIIT Class', category: 'HIIT', date: '2026-09-05' })];
    const matches = matchPlanActivityToInventory({ day: 'Saturday', duration_minutes: 45 }, 'running', inventory, anchor);
    assert.deepEqual(matches, []);
  });

  test('football: a generic cardio class must never substitute for football', () => {
    const inventory = [
      makeItem({ name: 'Generic Cardio Class', category: 'cardio', date: '2026-09-05' }),
      makeItem({ id: 'football-1', name: 'Saturday Football', category: 'Football', date: '2026-09-05' }),
    ];
    const matches = matchPlanActivityToInventory({ day: 'Saturday', duration_minutes: 60 }, 'football', inventory, anchor);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'football-1');
  });

  test('running: a genuinely relevant "Running Club" IS matched', () => {
    const inventory = [makeItem({ id: 'run-club', name: 'Saturday Running Club', category: 'running', date: '2026-09-05' })];
    const matches = matchPlanActivityToInventory({ day: 'Saturday', duration_minutes: 45 }, 'running', inventory, anchor);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 'run-club');
  });
});

describe('matchPlanActivityToInventory (Scenario E: no marketplace inventory)', () => {
  test('mobility with no relevant inventory returns an empty array, not a forced match', () => {
    const anchor = new Date('2026-09-01T09:00:00');
    const inventory = [makeItem({ name: 'Zumba Party', category: 'Zumba', date: '2026-09-02' })];
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 20 }, 'mobility', inventory, anchor);
    assert.deepEqual(matches, []);
  });
});

describe('matchPlanActivityToInventory (Scenario F: wrong-day alternative)', () => {
  test('an alternate-day match is shown but clearly marked, never silently swapped', () => {
    const anchor = new Date('2026-09-01T09:00:00'); // Tuesday
    const inventory = [makeItem({ id: 'sunday-yoga', name: 'Sunday Morning Yoga', category: 'Yoga', date: '2026-09-06' })]; // Sunday, not Saturday
    const matches = matchPlanActivityToInventory({ day: 'Saturday', duration_minutes: 45 }, 'yoga', inventory, anchor);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].isAlternateDay, true);
    assert.equal(matches[0].date, '2026-09-06');
    // The canonical plan day itself is never touched by this — the caller
    // still renders "Saturday" for the plan activity; this match object
    // only carries its own actual date for display alongside it.
  });
});

describe('matchPlanActivityToInventory (Scenario G: unavailable inventory excluded)', () => {
  const anchor = new Date('2026-09-01T09:00:00');
  const base = { name: 'Strength Class', category: 'Strength Training', date: '2026-09-02' };

  test('excludes sold-out (spotsLeft <= 0)', () => {
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', [makeItem({ ...base, spotsLeft: 0 })], anchor);
    assert.deepEqual(matches, []);
  });

  test('excludes inactive/unpublished', () => {
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', [makeItem({ ...base, isActive: false })], anchor);
    assert.deepEqual(matches, []);
  });

  test('excludes past sessions', () => {
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', [makeItem({ ...base, date: '2026-08-01' })], anchor);
    assert.deepEqual(matches, []);
  });
});

describe('matchPlanActivityToInventory (limit + priority)', () => {
  test('never returns more than 2 matches, even with many relevant candidates', () => {
    const anchor = new Date('2026-09-01T09:00:00');
    const inventory = Array.from({ length: 6 }, (_, i) => makeItem({ id: `s${i}`, name: `Strength Class ${i}`, category: 'Strength Training', date: '2026-09-02' }));
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', inventory, anchor);
    assert.ok(matches.length <= 2);
  });
});

describe('commercial neutrality (Scenario I)', () => {
  test('scoring never reads any commercial field — two "equivalent" items with different (absent) commercial data score identically', () => {
    const anchor = new Date('2026-09-01T09:00:00');
    const itemA = makeItem({ id: 'a', name: 'Strength Class', category: 'Strength Training', date: '2026-09-02' });
    const itemB = makeItem({ id: 'b', name: 'Strength Class', category: 'Strength Training', date: '2026-09-02' });
    const matches = matchPlanActivityToInventory({ day: 'Wednesday', duration_minutes: 60 }, 'gym', [itemA, itemB], anchor);
    assert.equal(matches[0].score, matches[1].score);
    // MarketplaceInventoryItem's type has no commission/revenue/sponsorship
    // field at all — there is nothing for the scorer to read even if it wanted to.
  });
});

// ── Beta Feedback #005 — Open Gym / gym-access fulfilment ──────────────────

describe('isGymAccessListing (Beta #005)', () => {
  test('recognises the live "Open Gym" listing (name or name+category)', () => {
    assert.equal(isGymAccessListing('Open Gym'), true);
    assert.equal(isGymAccessListing('Open Gym', 'strength'), true);
    assert.equal(isGymAccessListing('Evening Open Gym'), true);
    assert.equal(isGymAccessListing('Gym Access — Day Pass'), true);
    assert.equal(isGymAccessListing('Gym Day Pass'), true);
  });

  test('a coached class is NOT gym access, even with "gym" or "strength" in the name (§25 C — no over-match)', () => {
    for (const n of ['Gym Strength Class', 'Strength Bootcamp', 'CrossFit WOD', 'Powerlifting Club', 'HIIT & Strength', 'Yoga Flow', 'Morning Run', 'Spin Class']) {
      assert.equal(isGymAccessListing(n), false, n);
    }
  });

  test('null / empty is not gym access', () => {
    assert.equal(isGymAccessListing(null), false);
    assert.equal(isGymAccessListing(undefined, null), false);
    assert.equal(isGymAccessListing('', ''), false);
  });
});

describe('matchPlanActivityToInventory — Open Gym for a strength activity (Beta #005)', () => {
  // Mirrors the live data: sessions.name = "Open Gym", category = "strength",
  // duration 120 min, KES 1188 drop-in.
  const openGym = (o: Partial<MarketplaceInventoryItem> = {}) => makeItem({
    id: 'open-gym-1', name: 'Open Gym', category: 'strength',
    durationMinutes: 120, priceKes: 1188, spotsLeft: 20, ...o,
  });
  const anchor = new Date('2026-08-30T09:00:00'); // Sunday

  test('A/B — a strength activity surfaces Open Gym, same-day preferred, price carried through', () => {
    const inv = [
      openGym({ id: 'mon', date: '2026-08-31' }),  // the planned day
      openGym({ id: 'wed', date: '2026-09-02' }),  // alternate day
    ];
    const matches = matchPlanActivityToInventory(
      { day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'gym', inv, anchor,
    );
    assert.ok(matches.length >= 1);
    assert.equal(matches[0].id, 'mon');
    assert.ok(matches[0].matchReasons.includes('same_day'));
    assert.equal(matches[0].priceKes, 1188);
  });

  test('§26 — a 120-min Open Gym is NOT rejected for a 35-min workout (longer access window is fine)', () => {
    const matches = matchPlanActivityToInventory(
      { day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'gym',
      [openGym({ date: '2026-08-31', durationMinutes: 120 })], anchor,
    );
    assert.equal(matches.length, 1);
  });

  test('§25 D — a RUNNING activity never surfaces Open Gym (keyword gate, not experience)', () => {
    const matches = matchPlanActivityToInventory(
      { day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'running',
      [openGym({ date: '2026-08-31' })], anchor,
    );
    assert.deepEqual(matches, []);
  });

  test('§25 E — no Open Gym supply: strength match list is simply empty, never a forced result', () => {
    const matches = matchPlanActivityToInventory(
      { day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'gym', [], anchor,
    );
    assert.deepEqual(matches, []);
  });

  test('§27 — a future planned_date resolves to Open Gym on THAT date, not this week', () => {
    const inv = [
      openGym({ id: 'this-wed', date: '2026-09-02' }),
      openGym({ id: 'next-wed', date: '2026-09-09' }),
    ];
    const matches = matchPlanActivityToInventory(
      { day: 'Wednesday', duration_minutes: 40, planned_date: '2026-09-09' }, 'gym', inv, anchor,
    );
    assert.equal(matches[0].id, 'next-wed');
    assert.ok(matches[0].matchReasons.includes('same_day'));
  });

  test('§25 F/G — eligibility is experience-agnostic: matchPlanActivityToInventory takes no experience_level at all', () => {
    // The function signature has no user/experience parameter — an advanced
    // and an intermediate self-directed strength user get the identical
    // result for identical inventory. (The card gate is also experience-free.)
    const inv = [openGym({ date: '2026-08-31' })];
    const a = matchPlanActivityToInventory({ day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'gym', inv, anchor);
    const b = matchPlanActivityToInventory({ day: 'Monday', duration_minutes: 35, planned_date: '2026-08-31' }, 'gym', inv, anchor);
    assert.deepEqual(a, b);
    assert.equal(a.length, 1);
  });
});

describe('getFulfilmentForActivity (integration)', () => {
  test('combines self-directed + marketplace for a full plan activity', () => {
    const anchor = new Date('2026-09-01T09:00:00');
    const planActivity = { day: 'Wednesday', category: 'strength' as const, activity: 'Gym', duration_minutes: 60, intensity: 'challenging' as const, title: 'Strength session', description: 'x' };
    const inventory = [makeItem({ name: 'Strength Training', category: 'Strength Training', date: '2026-09-02' })];
    const result = getFulfilmentForActivity(planActivity, 0, inventory, false, anchor);
    assert.equal(result.planActivityIndex, 0);
    assert.equal(result.selfDirected?.source, 'exercise_db');
    assert.equal(result.marketplaceMatches.length, 1);
  });

  test('a fulfilment source failure (empty inventory) never removes the activity itself — caller still has selfDirected', () => {
    const anchor = new Date('2026-09-01T09:00:00');
    const planActivity = { day: 'Wednesday', category: 'strength' as const, activity: 'Gym', duration_minutes: 60, intensity: 'challenging' as const, title: 'Strength session', description: 'x' };
    const result = getFulfilmentForActivity(planActivity, 0, [], false, anchor);
    assert.equal(result.selfDirected?.source, 'exercise_db');
    assert.deepEqual(result.marketplaceMatches, []);
  });
});
