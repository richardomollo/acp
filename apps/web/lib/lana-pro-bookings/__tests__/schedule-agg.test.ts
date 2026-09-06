import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleForDate,
  weekDates,
  mondayOf,
  buildWeek,
  bookingToTodayItem,
  todayItemsFrom,
} from '../schedule-agg.ts';
import { rollUpClasses } from '../booking-buckets.ts';
import type { LanaBooking } from '../booking-model.ts';
import { emptyWeek } from '../../lana-pro-services/availability-model.ts';

const appt = (id: string, at: string, client: string, service = 'PT'): LanaBooking => ({
  id, sourceType: 'pt_booking', sourceId: id, kind: 'appointment', status: 'confirmed', rawStatus: 'confirmed',
  paymentStatus: 'pending', paymentDisplay: 'pending', title: service, startAt: at, endAt: undefined,
  clientName: client, serviceName: service, href: `/lana-pro/bookings/appointment/${id}`,
});
const clsBk = (id: string, classId: string, at: string, cap = 8): LanaBooking => ({
  id, sourceType: 'class_booking', sourceId: id, kind: 'class', status: 'confirmed', rawStatus: 'confirmed',
  paymentStatus: 'pending', paymentDisplay: 'pending', title: 'Reformer Pilates', startAt: at, classId, capacity: cap,
  href: `/lana-pro/bookings/class/${id}`,
});

describe('scheduleForDate (§21.11)', () => {
  test('appointments + class roll-ups, chronological, availability leads', () => {
    const rollups = rollUpClasses([
      clsBk('c1', 's1', '2026-09-14T12:00:00'),
      clsBk('c2', 's1', '2026-09-14T12:00:00'),
    ]);
    const entries = scheduleForDate({
      dateStr: '2026-09-14',
      appointments: [appt('a1', '2026-09-14T09:00:00', 'James'), appt('a2', '2026-09-14T10:30:00', 'Sarah')],
      classRollups: rollups,
      availabilitySummary: '09:00–17:00',
    });
    assert.deepEqual(entries.map((e) => e.kind), ['availability', 'appointment', 'appointment', 'class']);
    assert.equal(entries[1].title, 'James');
    const cls = entries.find((e) => e.kind === 'class')!;
    assert.equal(cls.bookedCount, 2);
    assert.equal(cls.capacity, 8);
  });
  test('Unavailable summary produces no availability entry', () => {
    const entries = scheduleForDate({ dateStr: '2026-09-14', appointments: [], classRollups: [], availabilitySummary: 'Unavailable' });
    assert.equal(entries.length, 0);
  });
  test('other days are filtered out', () => {
    const entries = scheduleForDate({
      dateStr: '2026-09-14',
      appointments: [appt('a1', '2026-09-15T09:00:00', 'James')],
      classRollups: [],
    });
    assert.equal(entries.length, 0);
  });
});

describe('week helpers (§21.12, §28)', () => {
  test('mondayOf snaps to the containing Monday', () => {
    assert.equal(mondayOf('2026-09-16'), '2026-09-14'); // Wed → Mon
    assert.equal(mondayOf('2026-09-14'), '2026-09-14');
    assert.equal(mondayOf('2026-09-13'), '2026-09-07'); // Sun → previous Mon
  });
  test('weekDates returns 7 consecutive dates, no DST/UTC drift', () => {
    assert.deepEqual(weekDates('2026-09-14'), [
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
  });
});

describe('buildWeek (§21.12)', () => {
  test('columns Mon→Sun with per-day counts + availability summary', () => {
    const week = emptyWeek();
    week[0] = { day: 0, enabled: true, ranges: [{ start: '09:00', end: '17:00' }] };
    const cols = buildWeek({
      mondayStr: '2026-09-14',
      appointments: [appt('a1', '2026-09-14T09:00:00', 'James'), appt('a2', '2026-09-16T10:00:00', 'Sarah')],
      classBookings: [clsBk('c1', 's1', '2026-09-15T18:00:00'), clsBk('c2', 's1', '2026-09-15T18:00:00')],
      availabilityWeek: week,
    });
    assert.equal(cols.length, 7);
    assert.equal(cols[0].dateStr, '2026-09-14');
    assert.equal(cols[0].appointmentCount, 1);
    assert.equal(cols[0].availabilitySummary, '09:00–17:00');
    assert.equal(cols[1].classCount, 1); // one rolled-up class on Tue
    assert.equal(cols[2].appointmentCount, 1);
    assert.equal(cols[3].availabilitySummary, undefined);
  });
});

describe('the ONE today model (§21.27, §14)', () => {
  test('bookingToTodayItem shape', () => {
    const item = bookingToTodayItem(appt('a1', '2026-09-14T09:00:00', 'James', 'Personal Training'));
    assert.equal(item.kind, 'appointment');
    assert.equal(item.title, 'Personal Training');
    assert.equal(item.clientName, 'James');
    assert.equal(item.href, '/lana-pro/bookings/appointment/a1');
  });
  test('todayItemsFrom = appointments today + rolled-up classes today, sorted, cancelled excluded', () => {
    const items = todayItemsFrom({
      nowIso: '2026-09-14T08:00:00',
      appointments: [
        appt('a1', '2026-09-14T09:00:00', 'James'),
        { ...appt('a2', '2026-09-14T11:00:00', 'X'), status: 'cancelled' },
        appt('a3', '2026-09-15T09:00:00', 'Tomorrow'),
      ],
      classBookings: [clsBk('c1', 's1', '2026-09-14T18:00:00'), clsBk('c2', 's1', '2026-09-14T18:00:00')],
    });
    assert.deepEqual(items.map((i) => i.id), ['a1', 'cls:s1']);
    assert.equal(items[1].bookedCount, 2);
  });
});
