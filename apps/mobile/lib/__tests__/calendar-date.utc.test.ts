process.env.TZ = 'UTC'; // before any Date is constructed

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCalendarDate, parseCalendarDate, parseCalendarDateOrNull, calendarDaysBetween,
} from '../calendar-date.ts';
import { runCalendarDateRoundTrip } from './calendar-date-cases.ts';

runCalendarDateRoundTrip('UTC');

describe('calendar-date — unit (timezone-independent)', () => {
  test('toCalendarDate uses local Y-M-D, zero-padded', () => {
    assert.equal(toCalendarDate(new Date(2026, 11, 8)), '2026-12-08');
    assert.equal(toCalendarDate(new Date(2026, 0, 1)), '2026-01-01');
    assert.equal(toCalendarDate(new Date(2026, 8, 9, 23, 59, 59)), '2026-09-09');
  });

  test('parseCalendarDate rejects anything that is not YYYY-MM-DD', () => {
    for (const bad of ['', '2026-12-8', '2026/12/08', '08-12-2026', 'not-a-date', '2026-13-01', '2026-02-30']) {
      assert.throws(() => parseCalendarDate(bad), RangeError, `expected throw for ${JSON.stringify(bad)}`);
    }
  });

  test('parseCalendarDateOrNull returns null (never throws) for bad / empty input', () => {
    for (const bad of [null, undefined, '', 'nope', '2026-99-99']) {
      assert.equal(parseCalendarDateOrNull(bad as any), null);
    }
    assert.ok(parseCalendarDateOrNull('2026-12-08') instanceof Date);
  });

  test('the pre-fix bug is real: toISOString().split("T")[0] disagrees with toCalendarDate off-UTC only', () => {
    // In UTC they agree; the per-timezone suites prove they diverge elsewhere.
    const d = parseCalendarDate('2026-12-08');
    assert.equal(d.toISOString().split('T')[0], '2026-12-08');
    assert.equal(toCalendarDate(d), '2026-12-08');
  });

  test('calendarDaysBetween basic spans', () => {
    assert.equal(calendarDaysBetween('2026-01-01', '2026-01-01'), 0);
    assert.equal(calendarDaysBetween('2026-01-01', '2026-02-01'), 31);
    assert.equal(calendarDaysBetween('2026-12-08', '2027-01-01'), 24);
  });
});
