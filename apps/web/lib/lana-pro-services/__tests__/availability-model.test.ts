import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyWeek,
  weekFromRows,
  weekToRows,
  summariseDay,
  hasAnyAvailability,
  validateWeek,
  timeOptions,
  type WeekSchedule,
} from '../availability-model.ts';

describe('emptyWeek', () => {
  test('7 disabled days, Monday=0', () => {
    const w = emptyWeek();
    assert.equal(w.length, 7);
    assert.equal(w[0].day, 0);
    assert.equal(w.every((d) => !d.enabled && d.ranges.length === 0), true);
  });
});

describe('weekFromRows ↔ weekToRows (pt_availability round-trip)', () => {
  test('rows → grid', () => {
    const w = weekFromRows([
      { day_of_week: 0, start_time: '09:00:00', end_time: '17:00:00' },
      { day_of_week: 3, start_time: '12:00', end_time: '20:00' },
    ]);
    assert.equal(w[0].enabled, true);
    assert.deepEqual(w[0].ranges, [{ start: '09:00', end: '17:00' }]);
    assert.equal(w[1].enabled, false);
    assert.deepEqual(w[3].ranges, [{ start: '12:00', end: '20:00' }]);
  });

  test('grid → insert rows for the general scope (no offering_id)', () => {
    const w = emptyWeek();
    w[0] = { day: 0, enabled: true, ranges: [{ start: '09:00', end: '17:00' }] };
    w[1] = { day: 1, enabled: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] };
    const rows = weekToRows(w, { pt_id: 'pt1' });
    assert.equal(rows.length, 3);
    assert.equal('offering_id' in rows[0], false);
    assert.deepEqual(rows[0], { pt_id: 'pt1', day_of_week: 0, start_time: '09:00', end_time: '17:00' });
  });

  test('grid → insert rows for a service-specific scope', () => {
    const w = emptyWeek();
    w[4] = { day: 4, enabled: true, ranges: [{ start: '10:00', end: '14:00' }] };
    const rows = weekToRows(w, { pt_id: 'pt1', offering_id: 'off9' });
    assert.equal(rows[0].offering_id, 'off9');
  });

  test('invalid ranges (start ≥ end) and disabled/empty days are dropped on write', () => {
    const w = emptyWeek();
    w[0] = { day: 0, enabled: true, ranges: [{ start: '17:00', end: '09:00' }] }; // inverted
    w[1] = { day: 1, enabled: true, ranges: [] }; // empty
    w[2] = { day: 2, enabled: false, ranges: [{ start: '09:00', end: '10:00' }] }; // disabled
    assert.deepEqual(weekToRows(w, { pt_id: 'pt1' }), []);
  });

  test('full round-trip preserves valid data', () => {
    const rows = [
      { day_of_week: 0, start_time: '09:00', end_time: '17:00' },
      { day_of_week: 2, start_time: '08:00', end_time: '12:00' },
    ];
    const back = weekToRows(weekFromRows(rows), { pt_id: 'pt1' }).map((r) => ({
      day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time,
    }));
    assert.deepEqual(back, rows);
  });
});

describe('summariseDay', () => {
  test('single range', () => {
    assert.equal(summariseDay({ day: 0, enabled: true, ranges: [{ start: '09:00', end: '17:00' }] }), '09:00–17:00');
  });
  test('multiple ranges, sorted', () => {
    assert.equal(
      summariseDay({ day: 0, enabled: true, ranges: [{ start: '14:00', end: '18:00' }, { start: '09:00', end: '12:00' }] }),
      '09:00–12:00, 14:00–18:00',
    );
  });
  test('disabled or invalid → Unavailable', () => {
    assert.equal(summariseDay({ day: 0, enabled: false, ranges: [{ start: '09:00', end: '17:00' }] }), 'Unavailable');
    assert.equal(summariseDay({ day: 0, enabled: true, ranges: [{ start: '17:00', end: '09:00' }] }), 'Unavailable');
  });
});

describe('hasAnyAvailability', () => {
  test('true only when a day has a valid range', () => {
    assert.equal(hasAnyAvailability(emptyWeek()), false);
    const w = emptyWeek();
    w[5] = { day: 5, enabled: true, ranges: [{ start: '10:00', end: '11:00' }] };
    assert.equal(hasAnyAvailability(w), true);
    const invalid = emptyWeek();
    invalid[5] = { day: 5, enabled: true, ranges: [{ start: '11:00', end: '10:00' }] };
    assert.equal(hasAnyAvailability(invalid), false);
  });
});

describe('validateWeek', () => {
  const week = (over: Partial<Record<number, WeekSchedule[number]>>): WeekSchedule => {
    const w = emptyWeek();
    for (const [k, v] of Object.entries(over)) w[Number(k)] = v!;
    return w;
  };

  test('clean week → no errors', () => {
    assert.deepEqual(validateWeek(week({ 0: { day: 0, enabled: true, ranges: [{ start: '09:00', end: '17:00' }] } })), []);
  });
  test('inverted range', () => {
    const e = validateWeek(week({ 1: { day: 1, enabled: true, ranges: [{ start: '18:00', end: '09:00' }] } }));
    assert.equal(e[0].message, 'End time must be after start time.');
  });
  test('overlapping ranges', () => {
    const e = validateWeek(week({ 2: { day: 2, enabled: true, ranges: [{ start: '09:00', end: '13:00' }, { start: '12:00', end: '17:00' }] } }));
    assert.ok(e.some((x) => x.message === 'Time ranges overlap.'));
  });
  test('enabled day with no ranges', () => {
    const e = validateWeek(week({ 3: { day: 3, enabled: true, ranges: [] } }));
    assert.equal(e[0].message, 'Add a time range or turn this day off.');
  });
});

describe('timeOptions', () => {
  test('48 half-hour slots', () => {
    const t = timeOptions();
    assert.equal(t.length, 48);
    assert.equal(t[0], '00:00');
    assert.equal(t.at(-1), '23:30');
  });
});
