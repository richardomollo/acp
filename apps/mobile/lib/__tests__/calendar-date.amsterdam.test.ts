process.env.TZ = 'Europe/Amsterdam'; // UTC+1 / UTC+2 (DST) — east of UTC, DST zone

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCalendarDate, parseCalendarDate } from '../calendar-date.ts';
import { runCalendarDateRoundTrip } from './calendar-date-cases.ts';

runCalendarDateRoundTrip('Europe/Amsterdam');

test('[Europe/Amsterdam] a day chosen in winter offset serializes to itself (would lose a day pre-fix)', () => {
  const picked = parseCalendarDate('2026-12-08'); // CET (UTC+1) → 2026-12-07 23:00 UTC
  assert.equal(picked.toISOString().split('T')[0], '2026-12-07'); // pre-fix bug
  assert.equal(toCalendarDate(picked), '2026-12-08');             // post-fix
});

test('[Europe/Amsterdam] DST-transition days round-trip cleanly', () => {
  for (const iso of ['2026-03-29', '2026-10-25']) {
    assert.equal(toCalendarDate(parseCalendarDate(iso)), iso);
  }
});
