import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOccurrenceDates,
  buildSessionInserts,
  validateClassSchedule,
  classScheduleValid,
  type ClassDefInput,
} from '../class-scheduling.ts';

describe('generateOccurrenceDates', () => {
  test('none → just the start date', () => {
    assert.deepEqual(generateOccurrenceDates({ mode: 'none', startDate: '2026-09-10' }), ['2026-09-10']);
  });
  test('none with no start → []', () => {
    assert.deepEqual(generateOccurrenceDates({ mode: 'none', startDate: '' }), []);
  });
  test('weekly on Tue/Thu across two weeks', () => {
    // 2026-09-08 is a Tuesday
    const dates = generateOccurrenceDates({
      mode: 'weekly',
      startDate: '2026-09-08',
      endDate: '2026-09-21',
      weekdays: [2, 4], // Tue, Thu
    });
    assert.deepEqual(dates, ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17']);
  });
  test('weekly with no weekdays → every day in range', () => {
    const dates = generateOccurrenceDates({ mode: 'weekly', startDate: '2026-09-10', endDate: '2026-09-12' });
    assert.deepEqual(dates, ['2026-09-10', '2026-09-11', '2026-09-12']);
  });
  test('capped so a typo cannot create thousands of rows', () => {
    const dates = generateOccurrenceDates({ mode: 'weekly', startDate: '2026-01-01', endDate: '2030-01-01', cap: 10 });
    assert.equal(dates.length, 10);
  });
  test('weekly missing endDate degrades to a single occurrence', () => {
    assert.deepEqual(generateOccurrenceDates({ mode: 'weekly', startDate: '2026-09-10' }), ['2026-09-10']);
  });
});

describe('buildSessionInserts', () => {
  const def: ClassDefInput = {
    gymId: 'g1',
    name: 'Reformer Pilates',
    description: '',
    durationMinutes: 50,
    capacity: 8,
    priceKes: 2200,
    category: 'pilates',
    instructorId: 'gt1',
    time: '18:00',
  };

  test('one row per date; single date → not recurring', () => {
    const rows = buildSessionInserts(def, ['2026-09-10']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].recurring, false);
    assert.equal(rows[0].gym_id, 'g1');
    assert.equal(rows[0].max_capacity, 8);
    assert.equal(rows[0].spots_left, 8);
    assert.equal(rows[0].instructor_id, 'gt1');
    assert.equal(rows[0].drop_in_price, 2200);
    assert.equal(rows[0].is_active, true);
  });

  test('multiple dates → recurring series flag', () => {
    const rows = buildSessionInserts(def, ['2026-09-10', '2026-09-17']);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.recurring === true));
    assert.deepEqual(rows.map((r) => r.date), ['2026-09-10', '2026-09-17']);
  });
});

describe('validateClassSchedule', () => {
  const okOnce = { name: 'Reformer', time: '18:00', startDate: '2026-09-10', capacity: 8, mode: 'none' as const };

  test('clean one-off passes', () => {
    assert.deepEqual(validateClassSchedule(okOnce), {});
    assert.equal(classScheduleValid(okOnce), true);
  });
  test('missing pieces flagged', () => {
    const e = validateClassSchedule({ name: '', time: 'x', startDate: '', capacity: null, mode: 'none' });
    assert.ok(e.name && e.time && e.date && e.capacity);
  });
  test('weekly needs end date, order and weekdays', () => {
    assert.ok(validateClassSchedule({ ...okOnce, mode: 'weekly' }).repeat);
    assert.ok(
      validateClassSchedule({ ...okOnce, mode: 'weekly', endDate: '2026-09-05', weekdays: [2] }).repeat,
    );
    assert.equal(
      validateClassSchedule({ ...okOnce, mode: 'weekly', endDate: '2026-10-10', weekdays: [2] }).repeat,
      undefined,
    );
  });
});
