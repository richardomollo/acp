import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFitnessDayState, fitnessDayHasActivity, scheduleOccursOnDate,
} from '../fitness-empty-state.ts';

// Beta Feedback #019B — the Fitness empty state depends on BOTH day content
// and #019 marketplace availability, and NEVER hides a self-guided workout.

function state(over: Partial<Parameters<typeof resolveFitnessDayState>[0]> = {}) {
  return resolveFitnessDayState({
    hasMarketplaceSessionOnDay: false,
    hasPlannedWorkoutOnDay: false,
    marketplaceStatus: 'available',
    geoGatingEnabled: true,
    ...over,
  });
}

describe('§10 — Amsterdam, no inventory, empty day → unsupported-market, no "Plan something"', () => {
  test('empty day + no_local_inventory → empty_no_local_inventory', () => {
    assert.equal(state({ marketplaceStatus: 'no_local_inventory' }), 'empty_no_local_inventory');
  });
});

describe('§10 / §4 — Amsterdam, no inventory, self-guided workout exists → workout shown', () => {
  test('a planned workout beats no_local_inventory', () => {
    assert.equal(
      state({ marketplaceStatus: 'no_local_inventory', hasPlannedWorkoutOnDay: true }),
      'has_planned_workout',
    );
  });
  test('a planned workout beats location_unknown too', () => {
    assert.equal(
      state({ marketplaceStatus: 'location_unknown', hasPlannedWorkoutOnDay: true }),
      'has_planned_workout',
    );
  });
  test('the planned-workout outcome counts as "day has activity"', () => {
    assert.equal(fitnessDayHasActivity('has_planned_workout'), true);
  });
});

describe('§10 / §5 — Nairobi, inventory available, empty day → existing "Plan something"', () => {
  test('empty day + available → empty_available', () => {
    assert.equal(state({ marketplaceStatus: 'available' }), 'empty_available');
  });
});

describe('§10 / §7 — location_unknown, empty day → choose city', () => {
  test('empty day + location_unknown → empty_location_unknown', () => {
    assert.equal(state({ marketplaceStatus: 'location_unknown' }), 'empty_location_unknown');
  });
});

describe('§10 / §8 — Amsterdam device manually exploring Nairobi → available-market empty state', () => {
  test('the manual market resolves to "available" upstream → empty_available', () => {
    // The context reports status for the *explored* market; when that is
    // Nairobi (available) this helper just sees marketplaceStatus:'available'.
    assert.equal(state({ marketplaceStatus: 'available' }), 'empty_available');
  });
});

describe('§10 — a real session on the day is never replaced by the notice', () => {
  test('a bookable session on the day → has_marketplace_session even with a stale unsupported status', () => {
    assert.equal(state({ hasMarketplaceSessionOnDay: true, marketplaceStatus: 'no_local_inventory' }), 'has_marketplace_session');
    assert.equal(fitnessDayHasActivity('has_marketplace_session'), true);
  });
});

describe('kill switch — geography never changes the empty state when off', () => {
  test('geoGatingEnabled:false + empty day + no_local_inventory → empty_available (pre-#019 behaviour)', () => {
    assert.equal(state({ geoGatingEnabled: false, marketplaceStatus: 'no_local_inventory' }), 'empty_available');
  });
  test('unresolved status (null) → empty_available (never a false unsupported)', () => {
    assert.equal(state({ marketplaceStatus: null }), 'empty_available');
  });
});

describe('precedence', () => {
  test('planned workout > marketplace session > geography', () => {
    assert.equal(state({ hasPlannedWorkoutOnDay: true, hasMarketplaceSessionOnDay: true, marketplaceStatus: 'no_local_inventory' }), 'has_planned_workout');
    assert.equal(state({ hasMarketplaceSessionOnDay: true, marketplaceStatus: 'location_unknown' }), 'has_marketplace_session');
  });
});

describe('scheduleOccursOnDate — mirrors Home’s scheduleMatchesDate', () => {
  test('once', () => {
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-11', recurrence: 'once', weekdays: [] }, '2026-09-11'), true);
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-11', recurrence: 'once', weekdays: [] }, '2026-09-12'), false);
  });
  test('daily — only from the start date', () => {
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-10', recurrence: 'daily', weekdays: [] }, '2026-09-14'), true);
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-10', recurrence: 'daily', weekdays: [] }, '2026-09-09'), false);
  });
  test('weekly — matching local weekday only, on/after the start date', () => {
    // 2026-09-11 is a Friday (weekday 5); 2026-09-18 also Friday
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-01', recurrence: 'weekly', weekdays: [5] }, '2026-09-18'), true);
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-01', recurrence: 'weekly', weekdays: [5] }, '2026-09-17'), false);
    assert.equal(scheduleOccursOnDate({ start_date: '2026-09-20', recurrence: 'weekly', weekdays: [5] }, '2026-09-18'), false); // before start
  });
});
