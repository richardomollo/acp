import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { StartingPlanActivity } from '../ai-assessment.ts';
import type { PlanActivityCompletion } from '../completion.ts';
import { resolveActivityDate } from '../home-intelligence.ts';
import {
  resolvePlannedActivityForDate,
  isActivityCompleted,
  isCheckInEligibleForDate,
  checkInEligibleBookingsForDate,
  FITNESS_UPCOMING_BOOKING_STATUSES,
  type FitnessBookingRow,
} from '../fitness-tab.ts';
import { runFitnessTabDateChecks } from './fitness-tab-cases.ts';

function act(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return {
    day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45,
    intensity: 'moderate', title: 'Strength session', description: 'Compound lifts.', ...overrides,
  };
}

function completion(activityIndex: number, plannedDate = '2026-12-07'): PlanActivityCompletion {
  return {
    id: `c${activityIndex}`, planId: 'p1', activityIndex, plannedDate,
    completedAt: '2026-12-07T10:00:00Z', completionSource: 'manual', sourceEntityId: null,
  };
}

// The process-default timezone still exercises the same code paths.
runFitnessTabDateChecks('process-default');

describe('resolvePlannedActivityForDate — canonical selected-day workout (§3/§4)', () => {
  const activities = [
    act({ planned_date: '2026-12-07', title: 'Mon strength', category: 'strength' }),
    act({ planned_date: '2026-12-09', title: 'Wed cardio', category: 'cardio', day: 'Wednesday' }),
    act({ planned_date: '2026-12-11', title: 'Fri mobility', category: 'mobility', day: 'Friday' }),
  ];

  test('Monday selected → Monday workout', () => {
    const r = resolvePlannedActivityForDate(activities, '2026-12-07');
    assert.equal(r?.activity.title, 'Mon strength');
    assert.equal(r?.activityIndex, 0);
  });

  test('Wednesday selected → Wednesday workout', () => {
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-09')?.activity.title, 'Wed cardio');
  });

  test('Friday selected → Friday workout', () => {
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-11')?.activity.title, 'Fri mobility');
  });

  test('a day with no workout → null (honest empty state, never a fabricated workout) (§2)', () => {
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-08'), null);
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-10'), null);
    assert.equal(resolvePlannedActivityForDate([], '2026-12-07'), null);
  });

  test('changing the selected day changes the workout — never keeps a stale one', () => {
    const days = ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'];
    const titles = days.map(d => resolvePlannedActivityForDate(activities, d)?.activity.title ?? null);
    assert.deepEqual(titles, ['Mon strength', null, 'Wed cardio', null, 'Fri mobility']);
  });

  test('deterministic and pure — same inputs, same output, activities not mutated', () => {
    const copy = JSON.parse(JSON.stringify(activities));
    for (let i = 0; i < 10; i++) {
      assert.equal(resolvePlannedActivityForDate(activities, '2026-12-09')?.activityIndex, 1);
    }
    assert.deepEqual(activities, copy);
  });

  test('takes no location/booking input — plan resolution is structurally independent of both (§9/§10)', () => {
    // 2 params + optional anchor; nothing marketplace/geo/booking-shaped.
    assert.equal(resolvePlannedActivityForDate.length, 2);
  });
});

describe('canonical plan identity matches other plan surfaces (§11)', () => {
  test('the date→activity mapping is exactly resolveActivityDate — no second schedule rule', () => {
    const anchor = new Date(2026, 11, 7); // local-midnight Monday
    const activities = [
      act({ day: 'Tuesday', planned_date: undefined }),
      act({ day: 'Thursday', planned_date: undefined }),
      act({ planned_date: '2026-12-20' }),
    ];
    for (let i = 0; i < activities.length; i++) {
      const iso = resolveActivityDate(activities[i], anchor)!;
      const resolved = resolvePlannedActivityForDate(activities, iso, anchor);
      assert.equal(resolved?.activityIndex, i, `activity ${i} should round-trip through its own resolved date`);
    }
  });
});

describe('isActivityCompleted — completion state (§5), matched like This Week / My Plan', () => {
  test('true when a completion row carries that activity index', () => {
    assert.equal(isActivityCompleted(1, [completion(0), completion(1)]), true);
  });
  test('false when no completion row carries that index', () => {
    assert.equal(isActivityCompleted(2, [completion(0), completion(1)]), false);
    assert.equal(isActivityCompleted(0, []), false);
  });
  test('matched by activityIndex alone — same rule as weekly-plan.tsx (plannedDate ignored)', () => {
    assert.equal(isActivityCompleted(0, [completion(0, '2099-01-01')]), true);
  });
});

describe('check-in eligibility — mirrors app/(tabs)/check-in.tsx (§6/§7)', () => {
  const uid = 'user-1';
  function booking(o: Partial<FitnessBookingRow> = {}): FitnessBookingRow {
    return { id: 'b1', booking_date: '2026-12-09', status: 'confirmed', checked_in: false, user_id: uid, ...o };
  }

  test('the "upcoming" status set is exactly the one Home + Check-in use', () => {
    assert.deepEqual([...FITNESS_UPCOMING_BOOKING_STATUSES], ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in']);
  });

  test('confirmed + not checked in + date match + owned by user → eligible', () => {
    assert.equal(isCheckInEligibleForDate(booking(), '2026-12-09', uid), true);
  });

  test('a different selected day → not eligible (CTA only on the matching day)', () => {
    assert.equal(isCheckInEligibleForDate(booking({ booking_date: '2026-12-09' }), '2026-12-10', uid), false);
  });

  test('non-confirmed statuses (deposit_paid / pending_payment / checked_in / cancelled) → not eligible', () => {
    for (const status of ['deposit_paid', 'pending_payment', 'checked_in', 'cancelled', 'refunded', 'no_show']) {
      assert.equal(isCheckInEligibleForDate(booking({ status }), '2026-12-09', uid), false, status);
    }
  });

  test('already checked in → not eligible', () => {
    assert.equal(isCheckInEligibleForDate(booking({ checked_in: true }), '2026-12-09', uid), false);
  });

  test('booking belonging to another user → not eligible', () => {
    assert.equal(isCheckInEligibleForDate(booking({ user_id: 'someone-else' }), '2026-12-09', uid), false);
  });

  test('no eligible booking for the day → empty list → caller shows no CTA', () => {
    const bookings = [booking({ id: 'b1', status: 'deposit_paid' }), booking({ id: 'b2', booking_date: '2026-12-05' })];
    assert.deepEqual(checkInEligibleBookingsForDate(bookings, '2026-12-09', uid), []);
  });

  test('MULTIPLE eligible bookings on one day → all returned, none silently dropped (§8)', () => {
    const bookings = [
      booking({ id: 'b1' }),
      booking({ id: 'b2' }),
      booking({ id: 'b3', status: 'checked_in' }), // not eligible
    ];
    assert.deepEqual(checkInEligibleBookingsForDate(bookings, '2026-12-09', uid).map(b => b.id), ['b1', 'b2']);
  });
});
