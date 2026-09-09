// LH-36 — shared timezone spec for the Fitness tab's selected-day resolution.
//
// Not a *.test.ts file, so `node --test` does not run it directly; each
// per-timezone test file sets `process.env.TZ` (before importing anything that
// constructs a Date) and then calls `runFitnessTabDateChecks`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StartingPlanActivity } from '../ai-assessment.ts';
import { resolvePlannedActivityForDate } from '../fitness-tab.ts';

function act(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return {
    day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45,
    intensity: 'moderate', title: 'Strength session', description: 'x', ...overrides,
  };
}

export function runFitnessTabDateChecks(tzLabel: string) {
  test(`[${tzLabel}] a planned_date activity resolves for that exact calendar day — no UTC shift`, () => {
    const activities = [
      act({ day: 'Monday', planned_date: '2026-12-07', title: 'Mon strength' }),
      act({ day: 'Wednesday', planned_date: '2026-12-09', title: 'Wed cardio', category: 'cardio' }),
    ];
    // Africa/Nairobi (UTC+3) is where LH-26's one-day loss showed up.
    const wed = resolvePlannedActivityForDate(activities, '2026-12-09');
    assert.equal(wed?.activity.title, 'Wed cardio');
    assert.equal(wed?.activityIndex, 1);
    // The day before must NOT match it (would happen under a UTC slice).
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-08'), null);
  });

  test(`[${tzLabel}] weekday-fallback (legacy plan, no planned_date) resolves to the right local day`, () => {
    // Local-midnight Monday 2026-12-07 in every timezone (getDay() === 1).
    const monday = new Date(2026, 11, 7);
    const activities = [act({ day: 'Wednesday', planned_date: undefined, title: 'Wed session' })];
    // Wednesday of that same week is the 9th.
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-09', monday)?.activity.title, 'Wed session');
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-07', monday), null);
  });

  test(`[${tzLabel}] selecting a different day returns that day's activity, never a stale one`, () => {
    const activities = [
      act({ planned_date: '2026-12-07', title: 'Mon' }),
      act({ planned_date: '2026-12-09', title: 'Wed' }),
      act({ planned_date: '2026-12-11', title: 'Fri' }),
    ];
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-07')?.activity.title, 'Mon');
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-09')?.activity.title, 'Wed');
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-11')?.activity.title, 'Fri');
    assert.equal(resolvePlannedActivityForDate(activities, '2026-12-10'), null);
  });
}
