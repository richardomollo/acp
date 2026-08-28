import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBehaviouralProgress, calculateExerciseTrend, calculateActivityTrend,
  selectBaselineMeasurement, calculateMetricTrend, groupSetLogsBySessionAndExercise,
  classifyWorkout, COMPLETED_THRESHOLD_PCT,
} from '../progress-calculations.ts';
import { parseLocalDateOnly } from '../workout-execution.ts';

describe('classifyWorkout', () => {
  test('no history at all -> missed', () => {
    assert.equal(classifyWorkout(undefined), 'missed');
  });
  test('in_progress (never finished) -> missed', () => {
    assert.equal(classifyWorkout({ status: 'in_progress', completionPercentage: null }), 'missed');
  });
  test(`completed at exactly ${COMPLETED_THRESHOLD_PCT}% -> completed`, () => {
    assert.equal(classifyWorkout({ status: 'completed', completionPercentage: COMPLETED_THRESHOLD_PCT }), 'completed');
  });
  test('completed at 50% -> partial', () => {
    assert.equal(classifyWorkout({ status: 'completed', completionPercentage: 50 }), 'partial');
  });
  test('completed at 0% -> missed (nothing was actually done)', () => {
    assert.equal(classifyWorkout({ status: 'completed', completionPercentage: 0 }), 'missed');
  });
});

describe('calculateBehaviouralProgress', () => {
  test('planned/completed/partial/missed counted correctly, adherence = completed/planned only', () => {
    const workouts = [
      { id: 'a', date: '2026-08-01' }, { id: 'b', date: '2026-08-03' },
      { id: 'c', date: '2026-08-05' }, { id: 'd', date: '2026-08-08' },
    ];
    const history = new Map([
      ['a', { status: 'completed', completionPercentage: 100 }],
      ['b', { status: 'completed', completionPercentage: 50 }],
      // c: missed (no row)
      ['d', { status: 'completed', completionPercentage: 90 }],
    ]);
    const result = calculateBehaviouralProgress(workouts, history, 3);
    assert.equal(result.plannedWorkouts, 4);
    assert.equal(result.completedWorkouts, 2);
    assert.equal(result.partialWorkouts, 1);
    assert.equal(result.missedWorkouts, 1);
    assert.equal(result.adherenceRate, 0.5); // 2/4 — partial does NOT count toward the numerator (documented Option A)
    assert.equal(result.currentStreak, 3);
  });

  test('zero planned workouts -> adherenceRate is null, not NaN/0', () => {
    const result = calculateBehaviouralProgress([], new Map(), 0);
    assert.equal(result.adherenceRate, null);
    assert.equal(result.plannedWorkouts, 0);
  });

  test('recentCompleted/recentPlanned only looks at the last RECENT_WINDOW (6) workouts', () => {
    const workouts = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, date: `2026-08-${String(i + 1).padStart(2, '0')}` }));
    const history = new Map(workouts.slice(0, 2).map(w => [w.id, { status: 'completed', completionPercentage: 100 }] as const)); // only the two OLDEST are done
    const result = calculateBehaviouralProgress(workouts, history, 0);
    assert.equal(result.plannedWorkouts, 8);
    assert.equal(result.completedWorkouts, 2);
    assert.equal(result.recentPlanned, 6);
    assert.equal(result.recentCompleted, 0); // the 2 completed ones are outside the most-recent-6 window
  });
});

describe('calculateExerciseTrend', () => {
  test('a single session is insufficient data — never a trend from one session', () => {
    const t = calculateExerciseTrend('ex1', 'Goblet Squat', [{ date: '2026-08-01', topLoadKg: 16, repsAtTopLoad: 10 }]);
    assert.equal(t.direction, 'insufficient_data');
    assert.equal(t.sessionsCompared, 1);
  });

  test('load increased across sessions with weight data', () => {
    const t = calculateExerciseTrend('ex1', 'Goblet Squat', [
      { date: '2026-08-01', topLoadKg: 16, repsAtTopLoad: 10 },
      { date: '2026-08-08', topLoadKg: 18, repsAtTopLoad: 10 },
      { date: '2026-08-15', topLoadKg: 20, repsAtTopLoad: 10 },
    ]);
    assert.equal(t.direction, 'increased');
    assert.equal(t.metric, 'weight_reps');
    assert.equal(t.firstLoadKg, 16);
    assert.equal(t.latestLoadKg, 20);
    assert.equal(t.sessionsCompared, 3);
  });

  test('load decreased', () => {
    const t = calculateExerciseTrend('ex1', 'Bench Press', [
      { date: '2026-08-01', topLoadKg: 40, repsAtTopLoad: 8 },
      { date: '2026-08-08', topLoadKg: 35, repsAtTopLoad: 8 },
    ]);
    assert.equal(t.direction, 'decreased');
  });

  test('reps-only exercise (never logged a weight) compares reps instead', () => {
    const t = calculateExerciseTrend('ex2', 'Push Up', [
      { date: '2026-08-01', topLoadKg: null, repsAtTopLoad: 8 },
      { date: '2026-08-08', topLoadKg: null, repsAtTopLoad: 12 },
    ]);
    assert.equal(t.metric, 'reps_only');
    assert.equal(t.direction, 'increased');
  });

  test('unchanged load/reps -> stable', () => {
    const t = calculateExerciseTrend('ex1', 'Squat', [
      { date: '2026-08-01', topLoadKg: 20, repsAtTopLoad: 10 },
      { date: '2026-08-08', topLoadKg: 20, repsAtTopLoad: 10 },
    ]);
    assert.equal(t.direction, 'stable');
  });
});

describe('groupSetLogsBySessionAndExercise', () => {
  test('picks the heaviest set as the session\'s representative performance', () => {
    const logs = [
      { workoutHistoryId: 'h1', exerciseId: 'ex1', weightKg: 16, reps: 10 },
      { workoutHistoryId: 'h1', exerciseId: 'ex1', weightKg: 20, reps: 8 },
      { workoutHistoryId: 'h1', exerciseId: 'ex1', weightKg: 18, reps: 9 },
    ];
    const grouped = groupSetLogsBySessionAndExercise(logs, new Map([['h1', '2026-08-01']]));
    const sessions = grouped.get('ex1')!;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].topLoadKg, 20);
    assert.equal(sessions[0].repsAtTopLoad, 8);
  });

  test('falls back to max reps when no set in the session has a logged weight', () => {
    const logs = [
      { workoutHistoryId: 'h1', exerciseId: 'ex2', weightKg: null, reps: 10 },
      { workoutHistoryId: 'h1', exerciseId: 'ex2', weightKg: null, reps: 14 },
    ];
    const grouped = groupSetLogsBySessionAndExercise(logs, new Map([['h1', '2026-08-01']]));
    assert.equal(grouped.get('ex2')![0].topLoadKg, null);
    assert.equal(grouped.get('ex2')![0].repsAtTopLoad, 14);
  });

  test('separates sessions correctly across multiple history ids', () => {
    const logs = [
      { workoutHistoryId: 'h1', exerciseId: 'ex1', weightKg: 16, reps: 10 },
      { workoutHistoryId: 'h2', exerciseId: 'ex1', weightKg: 18, reps: 10 },
    ];
    const grouped = groupSetLogsBySessionAndExercise(logs, new Map([['h1', '2026-08-01'], ['h2', '2026-08-08']]));
    assert.equal(grouped.get('ex1')!.length, 2);
  });
});

describe('calculateActivityTrend', () => {
  test('fewer than 2 planned occurrences is insufficient data', () => {
    const t = calculateActivityTrend('run_easy', 'run', 1, 1, [25]);
    assert.equal(t.direction, 'insufficient_data');
  });
  test('>=70% completion rate is consistent', () => {
    const t = calculateActivityTrend('run_easy', 'run', 4, 3, [25, 28, 22]);
    assert.equal(t.direction, 'consistent');
    assert.equal(t.avgActualDurationMinutes, 25);
  });
  test('<70% completion rate is inconsistent', () => {
    const t = calculateActivityTrend('run_easy', 'run', 5, 2, [25, 30]);
    assert.equal(t.direction, 'inconsistent');
  });
  test('never fabricates a duration average with no completed sessions', () => {
    const t = calculateActivityTrend('run_easy', 'run', 3, 0, []);
    assert.equal(t.avgActualDurationMinutes, null);
  });
});

describe('selectBaselineMeasurement', () => {
  test('prefers the earliest measurement on/after programme start', () => {
    const measurements = [{ date: '2026-07-01', value: 90 }, { date: '2026-08-01', value: 89 }, { date: '2026-08-15', value: 88 }];
    const baseline = selectBaselineMeasurement(measurements, parseLocalDateOnly('2026-07-28'));
    assert.equal(baseline?.date, '2026-08-01');
  });
  test('falls back to the closest measurement before start when none exist on/after it', () => {
    const measurements = [{ date: '2026-06-01', value: 92 }, { date: '2026-07-01', value: 90 }];
    const baseline = selectBaselineMeasurement(measurements, parseLocalDateOnly('2026-08-01'));
    assert.equal(baseline?.date, '2026-07-01');
  });
  test('no measurements -> null', () => {
    assert.equal(selectBaselineMeasurement([], parseLocalDateOnly('2026-08-01')), null);
  });
});

describe('calculateMetricTrend', () => {
  const today = parseLocalDateOnly('2026-08-20');

  test('a single measurement is insufficient for a trend, but latest/staleness still reported', () => {
    const measurements = [{ date: '2026-08-10', value: 90 }];
    const t = calculateMetricTrend('weight', measurements, null, today);
    assert.equal(t.direction, 'insufficient_data');
    assert.equal(t.latest, 90);
    assert.equal(t.measurementCount, 1);
  });

  test('absolute and percent change computed correctly against the selected baseline', () => {
    const measurements = [{ date: '2026-07-20', value: 90 }, { date: '2026-08-15', value: 88.2 }];
    const baseline = measurements[0];
    const t = calculateMetricTrend('weight', measurements, baseline, today);
    assert.ok(Math.abs(t.absoluteChange! - -1.8) < 0.001);
    assert.ok(Math.abs(t.percentChange! - -2) < 0.1);
    assert.equal(t.direction, 'down');
  });

  test('a change smaller than the stable threshold reads as stable, not up/down noise', () => {
    const measurements = [{ date: '2026-07-01', value: 90 }, { date: '2026-08-15', value: 89.7 }];
    const t = calculateMetricTrend('weight', measurements, measurements[0], today);
    assert.equal(t.direction, 'stable');
  });

  test('a measurement older than 14 days is flagged stale', () => {
    const measurements = [{ date: '2026-07-01', value: 90 }, { date: '2026-08-01', value: 89 }];
    const t = calculateMetricTrend('weight', measurements, measurements[0], today);
    assert.equal(t.isStale, true);
  });

  test('a recent measurement is not stale', () => {
    const measurements = [{ date: '2026-07-01', value: 90 }, { date: '2026-08-18', value: 89 }];
    const t = calculateMetricTrend('weight', measurements, measurements[0], today);
    assert.equal(t.isStale, false);
  });

  test('no measurements at all', () => {
    const t = calculateMetricTrend('weight', [], null, today);
    assert.equal(t.direction, 'insufficient_data');
    assert.equal(t.measurementCount, 0);
  });
});
