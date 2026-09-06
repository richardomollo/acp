import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseBusinessShape,
  classesRelevant,
  facilityRelevant,
  appointmentsRelevant,
  setupGaps,
  classCapacitySignals,
  upcomingLoadFact,
  classDemandVsPattern,
  bucketWeekdayFill,
  weekdayLabelOf,
  isoWeekKey,
  addDays,
  MIN_DEMAND_WEEKS,
  type UpcomingClass,
} from '../business-signals.ts';
import { findBannedPhrases } from '../../lana-pro-delivery/copy-safety.ts';

const TODAY = '2026-09-07'; // a Monday

describe('business-signals — shape (from ops, not a hardcoded label)', () => {
  test('maps common venue types to a coarse shape', () => {
    assert.equal(normaliseBusinessShape('gym'), 'gym');
    assert.equal(normaliseBusinessShape('Fitness Studio'), 'gym'); // "fitness" hint
    assert.equal(normaliseBusinessShape('pilates'), 'studio');
    assert.equal(normaliseBusinessShape('Yoga & Barre'), 'studio');
    assert.equal(normaliseBusinessShape('Spa & Wellness'), 'spa');
    assert.equal(normaliseBusinessShape('something else'), 'mixed');
    assert.equal(normaliseBusinessShape(null), 'mixed');
    assert.equal(normaliseBusinessShape(''), 'mixed');
  });

  test('relevance helpers gate signals by venue shape', () => {
    assert.equal(classesRelevant('spa'), false);
    assert.equal(classesRelevant('studio'), true);
    assert.equal(facilityRelevant('studio'), false);
    assert.equal(facilityRelevant('gym'), true);
    assert.equal(facilityRelevant('spa'), true);
    assert.equal(appointmentsRelevant('studio'), false);
    assert.equal(appointmentsRelevant('spa'), true);
  });
});

describe('business-signals — setup gaps', () => {
  const base = {
    shape: 'gym' as const,
    hasService: true,
    hasSchedule: true,
    hasTeam: true,
    teamRelevant: true,
    hasFacilityAccess: true,
  };

  test('brand-new business → only "no services" (nothing else is meaningful yet)', () => {
    const gaps = setupGaps({ ...base, hasService: false, hasSchedule: false, hasTeam: false, hasFacilityAccess: false });
    assert.deepEqual(gaps.map((g) => g.id), ['no_service']);
  });

  test('has a service but no schedule / team / access → the remaining gaps', () => {
    const gaps = setupGaps({ ...base, hasSchedule: false, hasTeam: false, hasFacilityAccess: false });
    assert.deepEqual(gaps.map((g) => g.id).sort(), ['no_facility_access', 'no_schedule', 'no_team'].sort());
  });

  test('class-only studio → NO facility-access gap even when unset', () => {
    const gaps = setupGaps({ ...base, shape: 'studio', hasFacilityAccess: false });
    assert.equal(gaps.some((g) => g.id === 'no_facility_access'), false);
  });

  test('appointment-led spa → NO "no upcoming classes" gap', () => {
    const gaps = setupGaps({ ...base, shape: 'spa', hasSchedule: false });
    assert.equal(gaps.some((g) => g.id === 'no_schedule'), false);
  });

  test('team gap suppressed until there is a service to deliver', () => {
    const noSvc = setupGaps({ ...base, hasService: false, hasTeam: false });
    assert.equal(noSvc.some((g) => g.id === 'no_team'), false);
    const withSvc = setupGaps({ ...base, hasTeam: false });
    assert.equal(withSvc.some((g) => g.id === 'no_team'), true);
  });

  test('teamRelevant=false → never a team gap', () => {
    const gaps = setupGaps({ ...base, teamRelevant: false, hasTeam: false });
    assert.equal(gaps.some((g) => g.id === 'no_team'), false);
  });

  test('every gap string is copy-safe', () => {
    const gaps = setupGaps({ ...base, hasService: false, hasSchedule: false, hasTeam: false, hasFacilityAccess: false, shape: 'gym' });
    for (const g of gaps) {
      assert.deepEqual(findBannedPhrases(g.text), []);
      assert.deepEqual(findBannedPhrases(g.detail), []);
    }
  });
});

describe('business-signals — class capacity (real booking count, never spots_left)', () => {
  const mk = (over: Partial<UpcomingClass>): UpcomingClass => ({
    id: 'c1',
    name: 'Pilates',
    startAt: `${addDays(TODAY, 5)}T10:00:00`, // a Saturday
    capacity: 10,
    booked: 8,
    ...over,
  });

  test('nearly-full → OBSERVATION with the exact counts', () => {
    const s = classCapacitySignals([mk({})]);
    assert.equal(s.length, 1);
    assert.equal(s[0].tag, 'observation');
    assert.match(s[0].text, /nearly full — 8 of 10 places booked/);
    assert.match(s[0].text, /Saturday/);
  });

  test('full → FACT', () => {
    const s = classCapacitySignals([mk({ booked: 10 })]);
    assert.equal(s[0].tag, 'fact');
    assert.match(s[0].text, /is full — 10 of 10/);
  });

  test('below the threshold → nothing', () => {
    assert.deepEqual(classCapacitySignals([mk({ booked: 4 })]), []);
  });

  test('malformed / zero / null capacity → silently skipped', () => {
    assert.deepEqual(classCapacitySignals([mk({ capacity: 0 }), mk({ capacity: null }), mk({ capacity: Number.NaN })]), []);
  });

  test('numerator is clamped to capacity (no >100%)', () => {
    const s = classCapacitySignals([mk({ booked: 99 })]);
    assert.match(s[0].text, /10 of 10/);
  });

  test('caps the number of lines and orders soonest-first', () => {
    const soon = mk({ id: 'a', name: 'Spin', startAt: `${addDays(TODAY, 1)}T07:00:00`, booked: 9 });
    const later = mk({ id: 'b', name: 'Yoga', startAt: `${addDays(TODAY, 6)}T18:00:00`, booked: 9 });
    const evenLater = mk({ id: 'c', name: 'HIIT', startAt: `${addDays(TODAY, 6)}T19:00:00`, booked: 10 });
    const s = classCapacitySignals([later, evenLater, soon], { max: 2 });
    assert.equal(s.length, 2);
    assert.match(s[0].text, /Spin/); // soonest first
  });

  test('every produced string is copy-safe', () => {
    const s = classCapacitySignals([mk({}), mk({ id: 'c2', name: 'Barre', booked: 10 })]);
    for (const it of s) assert.deepEqual(findBannedPhrases(it.text), []);
  });
});

describe('business-signals — upcoming load fact', () => {
  test('both present', () => {
    const f = upcomingLoadFact({ classCount: 12, appointmentCount: 3, windowDays: 7 });
    assert.equal(f!.tag, 'fact');
    assert.match(f!.text, /12 classes and 3 appointments are booked in the next 7 days\./);
  });
  test('singular grammar + one type only', () => {
    assert.match(upcomingLoadFact({ classCount: 1, appointmentCount: 0, windowDays: 7 })!.text, /1 class is booked/);
    assert.match(upcomingLoadFact({ classCount: 0, appointmentCount: 1, windowDays: 7 })!.text, /1 appointment is booked/);
  });
  test('nothing booked → null', () => {
    assert.equal(upcomingLoadFact({ classCount: 0, appointmentCount: 0, windowDays: 7 }), null);
  });
});

describe('business-signals — demand vs pattern (NO trend without history, §14)', () => {
  test('below MIN_DEMAND_WEEKS → null regardless of gap', () => {
    assert.equal(
      classDemandVsPattern({ weekdayLabel: 'Saturday', thisWeekFill: 0.9, priorMeanFill: 0.3, weeksObserved: MIN_DEMAND_WEEKS - 1 }),
      null,
    );
  });
  test('enough history + meaningful gap → a supported, soft observation', () => {
    const hi = classDemandVsPattern({ weekdayLabel: 'Saturday', thisWeekFill: 0.9, priorMeanFill: 0.65, weeksObserved: 4 });
    assert.equal(hi!.tag, 'observation');
    assert.match(hi!.text, /Saturday classes have been busier than your recent pattern/);
    assert.match(hi!.text, /around 65% of capacity/);

    const lo = classDemandVsPattern({ weekdayLabel: 'Tuesday', thisWeekFill: 0.2, priorMeanFill: 0.6, weeksObserved: 3 });
    assert.match(lo!.text, /fewer bookings than your recent Tuesday average/);
  });
  test('gap too small → null (facts before interpretation)', () => {
    assert.equal(
      classDemandVsPattern({ weekdayLabel: 'Monday', thisWeekFill: 0.55, priorMeanFill: 0.5, weeksObserved: 5 }),
      null,
    );
  });
  test('never contains a verdict word', () => {
    const s = classDemandVsPattern({ weekdayLabel: 'Friday', thisWeekFill: 0.1, priorMeanFill: 0.7, weeksObserved: 4 })!;
    assert.equal(/underperform|failing|bad|demand is low/i.test(s.text), false);
    assert.deepEqual(findBannedPhrases(s.text), []);
  });
});

describe('business-signals — weekday bucketing', () => {
  test('isoWeekKey anchors to Monday', () => {
    assert.equal(isoWeekKey('2026-09-07'), '2026-09-07'); // Monday
    assert.equal(isoWeekKey('2026-09-12'), '2026-09-07'); // Saturday same week
    assert.equal(isoWeekKey('2026-09-14'), '2026-09-14'); // next Monday
  });

  test('weekdayLabelOf', () => {
    assert.equal(weekdayLabelOf(0), 'Sunday');
    assert.equal(weekdayLabelOf(6), 'Saturday');
  });

  test('only weekdays present THIS week AND in history are returned, with a real mean', () => {
    // Saturdays: this week 1 class 10/10 (fill 1.0); prior 3 Saturdays ~0.5 each.
    const classes = [
      { startAt: '2026-09-12T10:00:00', capacity: 10, booked: 10 }, // this week Sat
      { startAt: '2026-09-05T10:00:00', capacity: 10, booked: 5 },
      { startAt: '2026-08-29T10:00:00', capacity: 10, booked: 4 },
      { startAt: '2026-08-22T10:00:00', capacity: 10, booked: 6 },
      // a Wednesday only in history → excluded (not present this week)
      { startAt: '2026-09-02T18:00:00', capacity: 8, booked: 8 },
    ];
    const buckets = bucketWeekdayFill({ classes, todayLocalDate: TODAY, historyWeeks: 4 });
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].weekday, 6);
    assert.equal(buckets[0].weeksObserved, 3);
    assert.ok(Math.abs(buckets[0].thisWeekFill - 1.0) < 1e-9);
    assert.ok(Math.abs(buckets[0].priorMeanFill - 0.5) < 1e-9);
  });

  test('zero / null capacity rows are ignored', () => {
    const buckets = bucketWeekdayFill({
      classes: [
        { startAt: '2026-09-12T10:00:00', capacity: 0, booked: 3 },
        { startAt: '2026-09-05T10:00:00', capacity: null, booked: 2 },
      ],
      todayLocalDate: TODAY,
      historyWeeks: 4,
    });
    assert.deepEqual(buckets, []);
  });
});
