process.env.TZ = 'America/New_York'; // UTC-5 / UTC-4 (DST) — WEST of UTC, DST zone

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCalendarDate, parseCalendarDate } from '../calendar-date.ts';
import { runCalendarDateRoundTrip } from './calendar-date-cases.ts';

runCalendarDateRoundTrip('America/New_York');

test('[America/New_York] west-of-UTC: local midnight is still SAME UTC day, toCalendarDate agrees', () => {
  const picked = parseCalendarDate('2026-12-08'); // EST (UTC-5) → 2026-12-08 05:00 UTC
  // West of UTC, toISOString() happens to keep the day here — but the fix must
  // still hold for every case, including DST edges below.
  assert.equal(picked.toISOString().split('T')[0], '2026-12-08');
  assert.equal(toCalendarDate(picked), '2026-12-08');
});

test('[America/New_York] DST-transition days round-trip cleanly', () => {
  for (const iso of ['2026-03-08', '2026-11-01']) {
    assert.equal(toCalendarDate(parseCalendarDate(iso)), iso);
  }
});
