import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes,
  fromMinutes,
  isoWeekday,
  windowsForDate,
  generateSlots,
  slotIsWithinAvailability,
  slotClashes,
  checkDirectBookingEligibility,
  classHasSpace,
  busyFromBookings,
  type AvailWindow,
} from '../slots.ts';
import type { LanaBooking } from '../booking-model.ts';

describe('time helpers', () => {
  test('toMinutes / fromMinutes round-trip', () => {
    assert.equal(toMinutes('09:30'), 570);
    assert.equal(fromMinutes(570), '09:30');
    assert.ok(Number.isNaN(toMinutes('nonsense')));
  });
  test('isoWeekday: 0=Mon…6=Sun, no local-time day shift (§28)', () => {
    assert.equal(isoWeekday('2026-09-14'), 0); // Monday
    assert.equal(isoWeekday('2026-09-13'), 6); // Sunday
    assert.equal(isoWeekday('2026-09-08'), 1); // Tuesday
  });
});

const win = (day: number, start: string, end: string): AvailWindow => ({ day, start, end });

describe('windowsForDate', () => {
  test('picks pt_availability rows for that weekday', () => {
    const rows = [
      { day_of_week: 0, start_time: '09:00:00', end_time: '17:00:00' },
      { day_of_week: 3, start_time: '12:00:00', end_time: '20:00:00' },
    ];
    assert.deepEqual(windowsForDate(rows, '2026-09-14'), [{ day: 0, start: '09:00', end: '17:00' }]);
    assert.deepEqual(windowsForDate(rows, '2026-09-15'), []); // Tuesday, nothing
  });
});

describe('generateSlots (§17-19)', () => {
  test('slots fit entirely inside the window; last partial slot dropped', () => {
    // 09:00–10:15 window, 60-min service → only 09:00 (09:15+60=10:15 fits exactly too)
    assert.deepEqual(generateSlots([win(0, '09:00', '10:15')], { durationMinutes: 60 }), ['09:00']);
  });
  test('duration fit — a 90-min service in a 60-min window yields nothing (§18)', () => {
    assert.deepEqual(generateSlots([win(0, '09:00', '10:00')], { durationMinutes: 90 }), []);
  });
  test('notBefore hides earlier slots (today)', () => {
    assert.deepEqual(
      generateSlots([win(0, '09:00', '12:00')], { durationMinutes: 60, notBefore: '10:30' }),
      ['11:00'],
    );
  });
  test('overlapping existing bookings are excluded (§20)', () => {
    const slots = generateSlots([win(0, '09:00', '13:00')], {
      durationMinutes: 60,
      busy: [{ start: '10:00', durationMinutes: 60 }],
    });
    assert.deepEqual(slots, ['09:00', '11:00', '12:00']);
  });
  test('blocked date → no slots', () => {
    assert.deepEqual(generateSlots([win(0, '09:00', '17:00')], { durationMinutes: 60, dateBlocked: true }), []);
  });
  test('two windows in a day, de-duped + sorted', () => {
    const slots = generateSlots([win(0, '09:00', '11:00'), win(0, '14:00', '16:00')], { durationMinutes: 60 });
    assert.deepEqual(slots, ['09:00', '10:00', '14:00', '15:00']);
  });
});

describe('slotIsWithinAvailability / slotClashes', () => {
  test('exact-fit slot is inside', () => {
    assert.equal(slotIsWithinAvailability([win(0, '09:00', '10:00')], '09:00', 60), true);
    assert.equal(slotIsWithinAvailability([win(0, '09:00', '10:00')], '09:30', 60), false);
  });
  test('clash detection is half-open interval', () => {
    assert.equal(slotClashes([{ start: '09:00', durationMinutes: 60 }], '10:00', 60), false); // back-to-back OK
    assert.equal(slotClashes([{ start: '09:00', durationMinutes: 60 }], '09:59', 60), true);
  });
});

describe('checkDirectBookingEligibility (§21.13-19, §23)', () => {
  const win9to5 = [win(0, '09:00', '17:00')];
  const okInput = {
    clientRelationship: 'active' as const,
    serviceStatus: 'active' as const,
    chosenDate: '2026-09-14',
    chosenTime: '09:00',
    durationMinutes: 60,
    availabilityWindows: win9to5,
    busyOnDate: [],
    todayStr: '2026-09-01',
  };

  test('active client + active service + valid slot → ok', () => {
    assert.deepEqual(checkDirectBookingEligibility(okInput), { ok: true, reasons: [] });
  });
  test('§14 inactive client rejected', () => {
    assert.deepEqual(checkDirectBookingEligibility({ ...okInput, clientRelationship: 'pending' }).reasons, ['client_not_active']);
    assert.deepEqual(checkDirectBookingEligibility({ ...okInput, clientRelationship: 'none' }).reasons, ['client_not_active']);
  });
  test('§15 draft / inactive service rejected', () => {
    assert.ok(checkDirectBookingEligibility({ ...okInput, serviceStatus: 'draft' }).reasons.includes('service_not_active'));
    assert.ok(checkDirectBookingEligibility({ ...okInput, serviceStatus: 'inactive' }).reasons.includes('service_not_active'));
  });
  test('§16 programme service rejected', () => {
    assert.ok(checkDirectBookingEligibility({ ...okInput, serviceIsProgramme: true }).reasons.includes('service_is_programme'));
  });
  test('§19 slot outside availability rejected', () => {
    assert.ok(checkDirectBookingEligibility({ ...okInput, chosenTime: '18:00' }).reasons.includes('outside_availability'));
  });
  test('§20 overlapping slot rejected', () => {
    assert.ok(
      checkDirectBookingEligibility({ ...okInput, busyOnDate: [{ start: '09:30', durationMinutes: 60 }] }).reasons.includes('slot_taken'),
    );
  });
  test('past date rejected', () => {
    assert.ok(checkDirectBookingEligibility({ ...okInput, chosenDate: '2025-01-01' }).reasons.includes('date_in_past'));
  });
});

describe('classHasSpace (§17, §23)', () => {
  test('respects capacity; uncapped when null', () => {
    assert.equal(classHasSpace({ bookedActive: 7, capacity: 8 }), true);
    assert.equal(classHasSpace({ bookedActive: 8, capacity: 8 }), false);
    assert.equal(classHasSpace({ bookedActive: 999, capacity: null }), true);
  });
});

describe('busyFromBookings', () => {
  test('only active bookings on the date become busy blocks', () => {
    const set: LanaBooking[] = [
      { id: 'a', sourceType: 'pt_booking', sourceId: 'a', kind: 'appointment', status: 'confirmed', rawStatus: 'confirmed', paymentStatus: 'pending', paymentDisplay: 'pending', title: 'A', startAt: '2026-09-14T09:00:00', endAt: '2026-09-14T10:00:00', href: '#' },
      { id: 'b', sourceType: 'pt_booking', sourceId: 'b', kind: 'appointment', status: 'cancelled', rawStatus: 'cancelled', paymentStatus: 'pending', paymentDisplay: 'pending', title: 'B', startAt: '2026-09-14T11:00:00', endAt: '2026-09-14T12:00:00', href: '#' },
      { id: 'c', sourceType: 'pt_booking', sourceId: 'c', kind: 'appointment', status: 'confirmed', rawStatus: 'confirmed', paymentStatus: 'pending', paymentDisplay: 'pending', title: 'C', startAt: '2026-09-15T09:00:00', href: '#' },
    ];
    assert.deepEqual(busyFromBookings(set, '2026-09-14'), [{ start: '09:00', durationMinutes: 60 }]);
  });
});
