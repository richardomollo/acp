import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCompletionProgress, findStravaCandidates, findExerciseDbCandidates, findAcpBookingCandidates, findHealthKitCandidates,
  type PlanActivityCompletion, type StravaActivityRow, type WorkoutHistoryRow, type AcpCheckedInRow, type HealthKitWorkoutRow,
} from '../completion.ts';
import type { StartingPlanActivity } from '../ai-assessment.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 45, intensity: 'moderate', title: 'Run', description: 'x', ...overrides };
}

function completion(overrides: Partial<PlanActivityCompletion> = {}): PlanActivityCompletion {
  return { id: 'c1', planId: 'plan-1', activityIndex: 0, plannedDate: '2026-09-05', completedAt: '2026-09-05T10:00:00Z', completionSource: 'manual', sourceEntityId: null, ...overrides };
}

describe('getCompletionProgress (Part 8 — deterministic, never AI)', () => {
  test('computes completed/total/percent from actual completion records', () => {
    const progress = getCompletionProgress(5, [completion({ activityIndex: 0 }), completion({ activityIndex: 2 })]);
    assert.deepEqual(progress, { completed: 2, total: 5, percent: 40 });
  });

  test('never counts the same activity twice even with duplicate records', () => {
    const progress = getCompletionProgress(5, [completion({ activityIndex: 0 }), completion({ activityIndex: 0 })]);
    assert.equal(progress.completed, 1);
  });

  test('zero completions is zero percent, not NaN', () => {
    assert.deepEqual(getCompletionProgress(5, []), { completed: 0, total: 5, percent: 0 });
  });
});

describe('Scenario C — Strava exact-day match', () => {
  const anchor = new Date('2026-09-01T09:00:00'); // Tuesday; "Saturday" -> 2026-09-05

  test('a same-day, same-type Strava run is a strong candidate', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const strava: StravaActivityRow[] = [{ id: 'strava-1', activityType: 'run', startTime: '2026-09-05T07:00:00Z', durationSeconds: 42 * 60 }];
    const candidates = findStravaCandidates(activities, new Set(), new Set(), strava, anchor);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].sourceEntityId, 'strava-1');
    assert.ok(candidates[0].reasons.includes('exact_day'));
  });

  test('Day 5 fix: a stored planned_date anchors matching to the correct historical week, not the current one', () => {
    // "Saturday" would normally resolve against `anchor` to 2026-09-05 (this
    // week), but planned_date fixes it to LAST week's Saturday instead —
    // exactly the scenario Day 4 flagged as a limitation.
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45, planned_date: '2026-08-29' })];
    const strava: StravaActivityRow[] = [{ id: 'strava-last-week', activityType: 'run', startTime: '2026-08-29T07:00:00Z', durationSeconds: 42 * 60 }];
    const candidates = findStravaCandidates(activities, new Set(), new Set(), strava, anchor);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].sourceEntityId, 'strava-last-week');
    assert.ok(candidates[0].reasons.includes('exact_day'));
  });
});

describe('Scenario D — Strava nearby-day match', () => {
  const anchor = new Date('2026-09-01T09:00:00');

  test('a ±1 day match is proposed as a candidate, never auto-completed', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    // Friday 2026-09-04, one day before the target Saturday 2026-09-05
    const strava: StravaActivityRow[] = [{ id: 'strava-2', activityType: 'run', startTime: '2026-09-04T07:00:00Z', durationSeconds: 40 * 60 }];
    const candidates = findStravaCandidates(activities, new Set(), new Set(), strava, anchor);
    assert.equal(candidates.length, 1); // still surfaced...
    assert.ok(!candidates[0].reasons.includes('exact_day')); // ...but clearly not ranked as an exact match
  });

  test('more than ±1 day away is not a candidate at all', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const strava: StravaActivityRow[] = [{ id: 'strava-3', activityType: 'run', startTime: '2026-09-02T07:00:00Z', durationSeconds: 40 * 60 }]; // Wednesday, 3 days off
    assert.deepEqual(findStravaCandidates(activities, new Set(), new Set(), strava, anchor), []);
  });
});

describe('Scenario E — wrong Strava activity type never matches', () => {
  const anchor = new Date('2026-09-01T09:00:00');

  test('a cycling activity never counts toward a planned walk', () => {
    const activities = [activity({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 30 })];
    const strava: StravaActivityRow[] = [{ id: 'strava-4', activityType: 'cycle', startTime: '2026-09-02T07:00:00Z', durationSeconds: 30 * 60 }];
    assert.deepEqual(findStravaCandidates(activities, new Set(), new Set(), strava, anchor), []);
  });
});

describe('Scenario F — duplicate Strava usage prevented', () => {
  const anchor = new Date('2026-09-01T09:00:00');

  test('an already-used Strava activity id is excluded from further candidates', () => {
    const activities = [
      activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 }),
      activity({ day: 'Saturday', activity: 'Running', duration_minutes: 20 }), // a second running slot, same day, for this test
    ];
    const strava: StravaActivityRow[] = [{ id: 'strava-5', activityType: 'run', startTime: '2026-09-05T07:00:00Z', durationSeconds: 42 * 60 }];
    const usedIds = new Set(['strava-5']); // already consumed by a prior completion
    assert.deepEqual(findStravaCandidates(activities, new Set(), usedIds, strava, anchor), []);
  });

  test('a very short GPS-blip activity is not a plausible candidate', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const strava: StravaActivityRow[] = [{ id: 'strava-6', activityType: 'run', startTime: '2026-09-05T07:00:00Z', durationSeconds: 60 }]; // 1 minute
    assert.deepEqual(findStravaCandidates(activities, new Set(), new Set(), strava, anchor), []);
  });

  test('an already-completed plan activity is never offered a candidate', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const strava: StravaActivityRow[] = [{ id: 'strava-7', activityType: 'run', startTime: '2026-09-05T07:00:00Z', durationSeconds: 42 * 60 }];
    assert.deepEqual(findStravaCandidates(activities, new Set([0]), new Set(), strava, anchor), []);
  });
});

describe('Scenario G — ExerciseDB completion candidates', () => {
  const anchor = new Date('2026-09-01T09:00:00'); // Tuesday; "Wednesday" -> 2026-09-02

  test('a same-day strength workout_history row is a candidate', () => {
    const activities = [activity({ day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60 })];
    const history: WorkoutHistoryRow[] = [{ id: 'wh-1', workoutCategory: 'strength', completedAt: '2026-09-02T18:00:00Z' }];
    const candidates = findExerciseDbCandidates(activities, new Set(), new Set(), history, anchor);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].sourceEntityId, 'wh-1');
  });

  test('a hiit/mobility workout does not count as a strength candidate', () => {
    const activities = [activity({ day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60 })];
    const history: WorkoutHistoryRow[] = [{ id: 'wh-2', workoutCategory: 'hiit', completedAt: '2026-09-02T18:00:00Z' }];
    assert.deepEqual(findExerciseDbCandidates(activities, new Set(), new Set(), history, anchor), []);
  });

  test('completion existence alone is the signal — no separate "did they really finish" check needed', () => {
    // workout_history rows are only ever created by finishWorkout() in the
    // existing product, so mere presence in this array already satisfies
    // ACP's own definition of "completed" (see module header comment).
    const activities = [activity({ day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60 })];
    const history: WorkoutHistoryRow[] = [{ id: 'wh-3', workoutCategory: 'full_body', completedAt: '2026-09-02T06:00:00Z' }];
    assert.equal(findExerciseDbCandidates(activities, new Set(), new Set(), history, anchor).length, 1);
  });
});

describe('Scenario I — Apple Health (HealthKit) completion candidates', () => {
  const anchor = new Date('2026-09-01T09:00:00'); // Tuesday; "Saturday" -> 2026-09-05

  test('a same-day, same-type HealthKit run is a strong candidate', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const workouts: HealthKitWorkoutRow[] = [{ id: 'hk-1', activityType: 'running', startDate: '2026-09-05T07:00:00Z', durationSeconds: 42 * 60 }];
    const candidates = findHealthKitCandidates(activities, new Set(), new Set(), workouts, anchor);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].sourceEntityId, 'hk-1');
    assert.equal(candidates[0].source, 'healthkit');
    assert.ok(candidates[0].reasons.includes('exact_day'));
  });

  test('either HealthKit strength-training type counts toward a planned gym session', () => {
    const activities = [activity({ day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 60 })];
    const workouts: HealthKitWorkoutRow[] = [{ id: 'hk-2', activityType: 'functionalStrengthTraining', startDate: '2026-09-02T18:00:00Z', durationSeconds: 40 * 60 }];
    const candidates = findHealthKitCandidates(activities, new Set(), new Set(), workouts, anchor);
    assert.equal(candidates.length, 1);
  });

  test('a cycling workout never counts toward a planned walk', () => {
    const activities = [activity({ day: 'Wednesday', category: 'cardio', activity: 'Walking', duration_minutes: 30 })];
    const workouts: HealthKitWorkoutRow[] = [{ id: 'hk-3', activityType: 'cycling', startDate: '2026-09-02T07:00:00Z', durationSeconds: 30 * 60 }];
    assert.deepEqual(findHealthKitCandidates(activities, new Set(), new Set(), workouts, anchor), []);
  });

  test('an already-used HealthKit workout id is excluded from further candidates', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const workouts: HealthKitWorkoutRow[] = [{ id: 'hk-4', activityType: 'running', startDate: '2026-09-05T07:00:00Z', durationSeconds: 42 * 60 }];
    assert.deepEqual(findHealthKitCandidates(activities, new Set(), new Set(['hk-4']), workouts, anchor), []);
  });

  test('a very short workout is not a plausible candidate', () => {
    const activities = [activity({ day: 'Saturday', activity: 'Running', duration_minutes: 45 })];
    const workouts: HealthKitWorkoutRow[] = [{ id: 'hk-5', activityType: 'running', startDate: '2026-09-05T07:00:00Z', durationSeconds: 60 }];
    assert.deepEqual(findHealthKitCandidates(activities, new Set(), new Set(), workouts, anchor), []);
  });
});

describe('Scenario H — ACP booking without attendance yields no candidate', () => {
  const anchor = new Date('2026-09-01T09:00:00');

  test('no checked-in rows at all means manual completion is the only path', () => {
    const activities = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 60 })];
    assert.deepEqual(findAcpBookingCandidates(activities, new Set(), new Set(), [], anchor), []);
  });

  test('a genuinely checked-in football booking IS a candidate', () => {
    const activities = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 60 })];
    const rows: AcpCheckedInRow[] = [{ id: 'booking-1', type: 'acp_session', name: 'Saturday Football', category: 'Football', checkedInDate: '2026-09-05' }];
    const candidates = findAcpBookingCandidates(activities, new Set(), new Set(), rows, anchor);
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].reasons.includes('checked_in'));
  });

  test('an unrelated checked-in booking (e.g. yoga) does not count toward football', () => {
    const activities = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 60 })];
    const rows: AcpCheckedInRow[] = [{ id: 'booking-2', type: 'acp_session', name: 'Yoga Flow', category: 'Yoga', checkedInDate: '2026-09-05' }];
    assert.deepEqual(findAcpBookingCandidates(activities, new Set(), new Set(), rows, anchor), []);
  });
});
