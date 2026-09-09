process.env.TZ = 'Africa/Nairobi'; // UTC+3, no DST — the exact device repro (LH-26)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCalendarDate, parseCalendarDate } from '../calendar-date.ts';
import { runCalendarDateRoundTrip } from './calendar-date-cases.ts';

runCalendarDateRoundTrip('Africa/Nairobi');

test('[Africa/Nairobi] reproduces the device bug and proves the fix', () => {
  // The picker hands back the chosen day at LOCAL midnight.
  const picked = parseCalendarDate('2026-12-08'); // 2026-12-08 00:00 EAT == 2026-12-07 21:00 UTC
  // Pre-fix serialization lost a day:
  assert.equal(picked.toISOString().split('T')[0], '2026-12-07');
  // Post-fix serialization preserves it:
  assert.equal(toCalendarDate(picked), '2026-12-08');
});
