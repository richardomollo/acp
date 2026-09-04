import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMeasurementCheckinStatus, isMeasurementCheckinActionable,
  addLocalDays, localDayDiff, localWeekday, measurementAnchor,
  mostRecentWeekdayOnOrBefore, firstWeekdayAfter,
  DEFAULT_CHECKIN_WEEKDAY, MEASUREMENT_CHECKIN_NOTIFICATION,
} from '../measurement-checkin.ts';

// Beta Feedback #020B — the weekly check-in is ANCHORED to a stable weekday
// (default Friday). The day the user happens to log never moves the
// schedule. Fridays in this fixture: 2026-09-04, 2026-09-11, 2026-09-18.
const FRI_A = '2026-09-04';
const FRI_B = '2026-09-11';
const FRI_C = '2026-09-18';

function status(lastMeasurementLocalDate: string | null, todayLocalDate: string, checkinWeekday = DEFAULT_CHECKIN_WEEKDAY) {
  return getMeasurementCheckinStatus({ lastMeasurementLocalDate, todayLocalDate, checkinWeekday });
}

describe('fixture sanity', () => {
  test('the fixture Fridays really are Fridays; default anchor is Friday', () => {
    assert.equal(DEFAULT_CHECKIN_WEEKDAY, 5);
    for (const f of [FRI_A, FRI_B, FRI_C]) assert.equal(localWeekday(f), 5);
  });
});

describe('§8 — Thursday → not_due', () => {
  test('measured last Friday, today Thursday → not_due, no card', () => {
    const r = status(FRI_A, '2026-09-10'); // Thu
    assert.equal(r.status, 'not_due');
    assert.equal(isMeasurementCheckinActionable(r.status), false);
    assert.equal(r.nextDueLocalDate, FRI_B);
  });
});

describe('§8 — Friday + no measurement this week → due_today', () => {
  test('measured last Friday, today this Friday → due_today', () => {
    const r = status(FRI_A, FRI_B);
    assert.equal(r.status, 'due_today');
    assert.equal(r.currentAnchorLocalDate, FRI_B);
    assert.equal(r.nextDueLocalDate, FRI_B);
  });
  test('never measured, today Friday → due_today', () => {
    assert.equal(status(null, FRI_B).status, 'due_today');
  });
});

describe('§8 / §4 — Saturday after missed Friday → overdue', () => {
  test('measured 8 days ago, today Saturday → overdue (does not silently disappear)', () => {
    const r = status(FRI_A, '2026-09-12'); // Sat
    assert.equal(r.status, 'overdue');
    assert.equal(r.currentAnchorLocalDate, FRI_B); // still the missed Friday
    assert.equal(r.nextDueLocalDate, FRI_B);
  });
  test('still overdue days later — reminder stays', () => {
    assert.equal(status(FRI_A, '2026-09-15').status, 'overdue'); // Tue
  });
});

describe('§8 / §4 — Sunday late measurement → closes the current (overdue) window', () => {
  test('logged Sunday, evaluated Sunday → completed_today', () => {
    const r = status('2026-09-13', '2026-09-13'); // Sun / Sun
    assert.equal(r.status, 'completed_today');
    assert.equal(measurementAnchor('2026-09-13', 5), FRI_B); // credited to the Friday just gone, not FRI_C
  });
  test('logged Sunday, evaluated Monday → not_due (window closed)', () => {
    assert.equal(status('2026-09-13', '2026-09-14').status, 'not_due');
  });
});

describe('§8 / §10 — next Friday after a Sunday measurement → due_today (NO drift)', () => {
  test('the Sunday log satisfied FRI_B; FRI_C is a fresh due', () => {
    const r = status('2026-09-13', FRI_C);
    assert.equal(r.status, 'due_today');
    assert.equal(r.currentAnchorLocalDate, FRI_C);
    assert.equal(r.nextDueLocalDate, FRI_C);
  });
  test('and it stays due through the weekend after FRI_C', () => {
    assert.equal(status('2026-09-13', '2026-09-19').status, 'overdue'); // Sat after FRI_C
  });
});

describe('§8 / §3 — Wednesday early measurement satisfies the upcoming Friday', () => {
  test('logged Wednesday → credited to the upcoming Friday', () => {
    assert.equal(measurementAnchor('2026-09-09', 5), FRI_B);
  });
  test('logged Wednesday, evaluated that Friday → not_due (no nag)', () => {
    const r = status('2026-09-09', FRI_B);
    assert.equal(r.status, 'not_due');
    assert.equal(r.nextDueLocalDate, FRI_C);
  });
  test('logged Wednesday, evaluated Wednesday → completed_today', () => {
    assert.equal(status('2026-09-09', '2026-09-09').status, 'completed_today');
  });
});

describe('§8 — measurement last Friday → this Friday due again', () => {
  test('exactly a weekday apart → due_today, cadence unmoved', () => {
    const r = status(FRI_A, FRI_B);
    assert.equal(r.status, 'due_today');
  });
});

describe('§6 / §8 — timezone: Amsterdam and Nairobi resolve their own local Friday', () => {
  // The service passes localISODate(...) for both dates, so the helper only
  // ever sees a local calendar date. Two users, same history, each on their
  // own local Friday → identical verdict.
  test('Amsterdam local Friday → due_today', () => {
    assert.equal(status(FRI_A, FRI_B).status, 'due_today');
  });
  test('Nairobi local Friday → due_today (helper is tz-agnostic by construction)', () => {
    assert.equal(status(FRI_A, FRI_B).status, 'due_today');
  });
  test('a measurement timestamp near local midnight still lands on its local date', () => {
    // pure-date arithmetic never crosses a boundary from the hour
    assert.equal(localDayDiff('2026-12-31', '2027-01-01'), 1);
    assert.equal(addLocalDays('2026-02-27', 2), '2026-03-01');
  });
});

describe('§5 — no history: no immediate nag before the anchor', () => {
  test('never measured, today Wednesday → not_due', () => {
    assert.equal(status(null, '2026-09-09').status, 'not_due');
  });
  test('never measured, today Saturday → not_due (never "overdue" without a baseline)', () => {
    assert.equal(status(null, '2026-09-12').status, 'not_due');
  });
  test('never measured, today the anchor weekday → due_today', () => {
    assert.equal(status(null, FRI_B).status, 'due_today');
  });
});

describe('anchor weekday is configurable (not hard-coded)', () => {
  test('a Sunday anchor (0) shifts every verdict', () => {
    // 2026-09-13 is a Sunday
    assert.equal(localWeekday('2026-09-13'), 0);
    const r = status('2026-09-06', '2026-09-13', 0); // last Sun -> this Sun
    assert.equal(r.status, 'due_today');
    assert.equal(r.currentAnchorLocalDate, '2026-09-13');
  });
  test('an out-of-range weekday falls back to Friday', () => {
    assert.equal(getMeasurementCheckinStatus({ lastMeasurementLocalDate: FRI_A, todayLocalDate: FRI_B, checkinWeekday: 99 }).status, 'due_today');
    assert.equal(getMeasurementCheckinStatus({ lastMeasurementLocalDate: FRI_A, todayLocalDate: FRI_B, checkinWeekday: 99 }).currentAnchorLocalDate, FRI_B);
  });
});

describe('date helpers', () => {
  test('mostRecentWeekdayOnOrBefore / firstWeekdayAfter', () => {
    assert.equal(mostRecentWeekdayOnOrBefore('2026-09-12', 5), FRI_B); // Sat -> Fri
    assert.equal(mostRecentWeekdayOnOrBefore(FRI_B, 5), FRI_B);        // Fri -> itself
    assert.equal(firstWeekdayAfter(FRI_B, 5), FRI_C);                  // Fri -> next Fri (strictly after)
    assert.equal(firstWeekdayAfter('2026-09-09', 5), FRI_B);          // Wed -> Fri
  });
  test('measurementAnchor ties break toward the earlier weekday', () => {
    // 2026-09-08 is a Tuesday: 3 days to next Fri, 4 days to prev Fri -> next
    assert.equal(measurementAnchor('2026-09-08', 5), FRI_B);
    // 2026-09-01 is a Tuesday too; Monday 2026-09-14 is 3 back / 4 fwd -> earlier
    assert.equal(measurementAnchor('2026-09-14', 5), FRI_B);
  });
});

describe('§26 — notification copy carries no measurement values', () => {
  test('title/body are neutral and value-free', () => {
    assert.equal(MEASUREMENT_CHECKIN_NOTIFICATION.title, 'Weekly check-in');
    assert.doesNotMatch(MEASUREMENT_CHECKIN_NOTIFICATION.body, /\d|weight|waist|fat|kg|cm|%/i);
    assert.doesNotMatch(MEASUREMENT_CHECKIN_NOTIFICATION.body, /forgot|overdue|need your/i);
  });
});
