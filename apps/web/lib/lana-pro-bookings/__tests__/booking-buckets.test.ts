import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortBookings,
  bucketOf,
  bucketBookings,
  searchBookings,
  countActiveOn,
  countByKindOn,
  visibilityFor,
  filterVisible,
  rollUpClasses,
} from '../booking-buckets.ts';
import type { LanaBooking } from '../booking-model.ts';

const b = (o: Partial<LanaBooking>): LanaBooking => ({
  id: o.id ?? 'x',
  sourceType: 'pt_booking',
  sourceId: o.sourceId ?? o.id ?? 'x',
  kind: o.kind ?? 'appointment',
  status: o.status ?? 'confirmed',
  rawStatus: o.status ?? 'confirmed',
  paymentStatus: 'pending',
  paymentDisplay: 'pending',
  title: o.title ?? 'Appt',
  startAt: o.startAt ?? '2026-09-14T09:00:00',
  endAt: o.endAt,
  clientName: o.clientName,
  serviceName: o.serviceName,
  venueName: o.venueName,
  classId: o.classId,
  capacity: o.capacity,
  checkedIn: o.checkedIn,
  href: '#',
  ...o,
});

const NOW = '2026-09-14T10:00:00';

describe('sortBookings — deterministic (§21.9)', () => {
  test('chronological, id-tiebroken', () => {
    const items = [
      b({ id: 'z', startAt: '2026-09-14T09:00:00' }),
      b({ id: 'a', startAt: '2026-09-14T09:00:00' }),
      b({ id: 'm', startAt: '2026-09-14T08:00:00' }),
    ];
    assert.deepEqual(sortBookings(items).map((x) => x.id), ['m', 'a', 'z']);
    assert.equal(items[0].id, 'z'); // not mutated
  });
});

describe('bucketOf (§21.5-8)', () => {
  test('today = active + same day', () => {
    assert.equal(bucketOf(b({ startAt: '2026-09-14T15:00:00' }), NOW), 'today');
    assert.equal(bucketOf(b({ startAt: '2026-09-14T08:00:00' }), NOW), 'today'); // earlier today still "today"
  });
  test('upcoming = active + future day', () => {
    assert.equal(bucketOf(b({ startAt: '2026-09-20T09:00:00' }), NOW), 'upcoming');
  });
  test('past = completed OR ended on a previous day', () => {
    assert.equal(bucketOf(b({ status: 'completed', startAt: '2026-09-14T09:00:00' }), NOW), 'past');
    assert.equal(bucketOf(b({ startAt: '2026-09-10T09:00:00', endAt: '2026-09-10T10:00:00' }), NOW), 'past');
  });
  test('cancelled / rescheduled → cancelled bucket (§21.8, §21.26)', () => {
    assert.equal(bucketOf(b({ status: 'cancelled' }), NOW), 'cancelled');
    assert.equal(bucketOf(b({ status: 'rescheduled' }), NOW), 'cancelled');
  });
  test('no_show → past, not cancelled', () => {
    assert.equal(bucketOf(b({ status: 'no_show', startAt: '2026-09-14T09:00:00' }), NOW), 'past');
  });
});

describe('bucketBookings', () => {
  test('splits + past is newest-first', () => {
    const res = bucketBookings(
      [
        b({ id: 'today', startAt: '2026-09-14T15:00:00' }),
        b({ id: 'soon', startAt: '2026-09-16T09:00:00' }),
        b({ id: 'old1', status: 'completed', startAt: '2026-09-01T09:00:00' }),
        b({ id: 'old2', status: 'completed', startAt: '2026-09-05T09:00:00' }),
        b({ id: 'x', status: 'cancelled', startAt: '2026-09-14T12:00:00' }),
      ],
      NOW,
    );
    assert.deepEqual(res.today.map((x) => x.id), ['today']);
    assert.deepEqual(res.upcoming.map((x) => x.id), ['soon']);
    assert.deepEqual(res.past.map((x) => x.id), ['old2', 'old1']);
    assert.deepEqual(res.cancelled.map((x) => x.id), ['x']);
    assert.equal(res.all.length, 5);
  });
});

describe('searchBookings', () => {
  const set = [
    b({ id: '1', clientName: 'James Mwangi', serviceName: 'Personal Training' }),
    b({ id: '2', clientName: 'Sarah Kamau', serviceName: 'Nutrition Consultation' }),
    b({ id: '3', title: 'Reformer Pilates', kind: 'class' }),
  ];
  test('matches client / service / class name, case-insensitive', () => {
    assert.deepEqual(searchBookings(set, 'james').map((x) => x.id), ['1']);
    assert.deepEqual(searchBookings(set, 'nutrition').map((x) => x.id), ['2']);
    assert.deepEqual(searchBookings(set, 'reformer').map((x) => x.id), ['3']);
    assert.equal(searchBookings(set, '').length, 3);
  });
});

describe('safe counts (§21.26)', () => {
  test('cancelled + completed excluded from active counts', () => {
    const set = [
      b({ startAt: '2026-09-14T09:00:00' }),
      b({ id: 'c', status: 'cancelled', startAt: '2026-09-14T10:00:00' }),
      b({ id: 'd', status: 'completed', startAt: '2026-09-14T11:00:00' }),
      b({ id: 'cls', kind: 'class', classId: 's1', startAt: '2026-09-14T18:00:00' }),
    ];
    assert.equal(countActiveOn(set, NOW), 2); // the confirmed appt + the class
    assert.equal(countByKindOn(set, NOW, 'appointment'), 1);
    assert.equal(countByKindOn(set, NOW, 'class'), 1);
  });
});

describe('capability visibility (§21 / §17)', () => {
  test('solo PT sees appointments only', () => {
    const v = visibilityFor({ isIndependentPro: true, isStaffTrainer: false, ownsVenue: false, venueDoesClasses: false, venueDoesAccess: false });
    assert.deepEqual(v, { appointments: true, classes: false, access: false });
  });
  test('studio sees classes only', () => {
    const v = visibilityFor({ isIndependentPro: false, isStaffTrainer: false, ownsVenue: true, venueDoesClasses: true, venueDoesAccess: false });
    assert.deepEqual(v, { appointments: false, classes: true, access: false });
  });
  test('filterVisible drops what the account cannot see', () => {
    const v = { appointments: true, classes: false, access: false };
    const set = [b({ id: 'a', kind: 'appointment' }), b({ id: 'c', kind: 'class', classId: 's' })];
    assert.deepEqual(filterVisible(set, v).map((x) => x.id), ['a']);
  });
});

describe('rollUpClasses — attendee counts (§21.10, §23)', () => {
  test('active attendees counted; cancelled/no-show excluded; over-capacity flagged', () => {
    const set = [
      b({ id: 'a1', kind: 'class', classId: 's1', capacity: 2, checkedIn: true, startAt: '2026-09-14T18:00:00' }),
      b({ id: 'a2', kind: 'class', classId: 's1', capacity: 2, startAt: '2026-09-14T18:00:00' }),
      b({ id: 'a3', kind: 'class', classId: 's1', capacity: 2, status: 'cancelled', startAt: '2026-09-14T18:00:00' }),
      b({ id: 'a4', kind: 'class', classId: 's1', capacity: 2, status: 'no_show', startAt: '2026-09-14T18:00:00' }),
    ];
    const [r] = rollUpClasses(set);
    assert.equal(r.bookedCount, 2);
    assert.equal(r.checkedInCount, 1);
    assert.equal(r.attendees.length, 4); // detail view still shows everyone
    assert.equal(r.overCapacity, false);

    const over = rollUpClasses([...set.slice(0, 2), b({ id: 'a5', kind: 'class', classId: 's1', capacity: 2, startAt: '2026-09-14T18:00:00' })]);
    assert.equal(over[0].overCapacity, true);
  });
});
