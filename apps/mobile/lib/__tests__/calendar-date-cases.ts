// LH-26 — shared round-trip spec for calendar-date serialization.
//
// Not a *.test.ts file, so `node --test` does not run it directly; each
// per-timezone test file sets `process.env.TZ` (before importing anything
// that constructs a Date) and then calls `runCalendarDateRoundTrip`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCalendarDate, parseCalendarDate, calendarDaysBetween } from '../calendar-date.ts';

/** Calendar dates that must survive every round trip unchanged. Includes
 *  month/year boundaries and DST-transition days for Europe/Amsterdam and
 *  America/New_York. */
export const CASES = [
  '2026-12-08', // the exact device-reported case
  '2026-01-01', // year boundary
  '2025-12-31', // year boundary (eve)
  '2026-12-31', // year boundary (eve)
  '2026-02-28', // month boundary (non-leap Feb)
  '2026-03-01', // month boundary
  '2026-03-08', // US DST begins (America/New_York, 02:00 → 03:00)
  '2026-03-29', // EU DST begins (Europe/Amsterdam, 02:00 → 03:00)
  '2026-10-25', // EU DST ends (Europe/Amsterdam, 03:00 → 02:00)
  '2026-11-01', // US DST ends (America/New_York, 02:00 → 01:00)
  '2026-06-15', // ordinary mid-year day
  '2027-02-28', // non-leap year Feb end
  '2028-02-29', // leap day
];

/**
 * The core invariant (LH-26 §5): a stored calendar date, deserialized into a
 * picker Date and re-serialized, must be byte-identical — and must stay so
 * across arbitrarily many "open picker → press OK unchanged" round trips,
 * in whatever timezone the process is running.
 */
export function runCalendarDateRoundTrip(tzLabel: string) {
  test(`[${tzLabel}] serialize → deserialize → serialize is a fixed point`, () => {
    for (const iso of CASES) {
      const back = toCalendarDate(parseCalendarDate(iso));
      assert.equal(back, iso, `${iso} changed to ${back} in ${tzLabel}`);
    }
  });

  test(`[${tzLabel}] 10 consecutive "press OK unchanged" round trips never drift`, () => {
    for (const iso of CASES) {
      let current = iso;
      for (let i = 0; i < 10; i++) {
        current = toCalendarDate(parseCalendarDate(current));
      }
      assert.equal(current, iso, `${iso} drifted to ${current} after 10 round trips in ${tzLabel}`);
    }
  });

  test(`[${tzLabel}] the picker Date reproduces the same local calendar day`, () => {
    for (const iso of CASES) {
      const d = parseCalendarDate(iso);
      const [y, m, day] = iso.split('-').map(Number);
      assert.equal(d.getFullYear(), y);
      assert.equal(d.getMonth() + 1, m);
      assert.equal(d.getDate(), day);
      assert.equal(d.getHours(), 0, `${iso} is not local midnight in ${tzLabel}`);
    }
  });

  test(`[${tzLabel}] calendarDaysBetween is timezone-independent`, () => {
    assert.equal(calendarDaysBetween('2026-12-08', '2026-12-08'), 0);
    assert.equal(calendarDaysBetween('2026-12-01', '2026-12-08'), 7);
    assert.equal(calendarDaysBetween('2026-01-01', '2026-03-29'), 87);   // spans EU spring-forward
    assert.equal(calendarDaysBetween('2026-10-01', '2026-11-01'), 31);   // spans US fall-back
    assert.equal(calendarDaysBetween('2026-12-08', '2026-12-01'), -7);
  });
}
