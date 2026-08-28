import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { interpretProgress } from '../progress-interpreter.ts';
import type { ProgressSnapshot, MetricTrend, ExercisePerformanceTrend } from '../progress-types.ts';

const TODAY = new Date(2026, 7, 20); // 2026-08-20

function emptyTrend(overrides: Partial<MetricTrend> = {}): MetricTrend {
  return { metric: 'weight', baseline: null, baselineDate: null, latest: null, latestDate: null, absoluteChange: null, percentChange: null, direction: 'insufficient_data', isStale: false, measurementCount: 0, ...overrides };
}

function exerciseTrend(overrides: Partial<ExercisePerformanceTrend> = {}): ExercisePerformanceTrend {
  return { exerciseId: 'ex1', exerciseName: 'Goblet Squat', metric: 'weight_reps', sessionsCompared: 3, firstDate: '2026-07-01', latestDate: '2026-08-15', firstLoadKg: 16, latestLoadKg: 20, firstReps: 10, latestReps: 10, direction: 'increased', ...overrides };
}

function snapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    period: { start: '2026-07-01', end: '2026-08-20' },
    behavioural: { plannedWorkouts: 0, completedWorkouts: 0, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: null, recentCompleted: 0, recentPlanned: 0, currentStreak: 0 },
    performance: { exerciseTrends: [], activityTrends: [] },
    outcomes: {},
    programme: { goal: 'lose_weight', source: 'ACP_GENERATED', startedAt: '2026-07-01' },
    dataQuality: { hasEnoughBehaviouralData: false, hasEnoughPerformanceData: false, hasEnoughOutcomeData: false },
    ...overrides,
  };
}

describe('Persona A — consistent + improving performance + improving outcome', () => {
  test('produces ON_TRACK as the primary state', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 6, completedWorkouts: 5, partialWorkouts: 0, missedWorkouts: 1, adherenceRate: 5 / 6, recentCompleted: 5, recentPlanned: 6, currentStreak: 4 },
      performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] },
      outcomes: { weight: emptyTrend({ baseline: 90, baselineDate: '2026-07-01', latest: 88.8, latestDate: '2026-08-15', absoluteChange: -1.2, percentChange: -1.33, direction: 'down', measurementCount: 3 }) },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: true },
    });
    const result = interpretProgress(s, TODAY);
    assert.equal(result.state, 'ON_TRACK');
    assert.ok(result.supporting.length > 0);
  });
});

describe('Persona B — consistent but outcome stalled', () => {
  test('outcome plateau (or mixed) is surfaced, never a false positive claim', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 12, completedWorkouts: 11, partialWorkouts: 0, missedWorkouts: 1, adherenceRate: 11 / 12, recentCompleted: 6, recentPlanned: 6, currentStreak: 6 },
      performance: { exerciseTrends: [exerciseTrend({ direction: 'stable', firstLoadKg: 20, latestLoadKg: 20 })], activityTrends: [] },
      outcomes: { weight: emptyTrend({ baseline: 90, baselineDate: '2026-07-01', latest: 90.1, latestDate: '2026-08-18', absoluteChange: 0.1, percentChange: 0.11, direction: 'stable', measurementCount: 4 }) },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: true },
    });
    const result = interpretProgress(s, TODAY);
    assert.ok(['OUTCOME_PLATEAU', 'MIXED_PROGRESS'].includes(result.state), result.state);
    // Never falsely claims the outcome is improving.
    assert.notEqual(result.state, 'ON_TRACK');
    assert.notEqual(result.state, 'OUTCOME_IMPROVING');
  });
});

describe('Persona C — outcome improving but adherence declining', () => {
  test('prioritises declining consistency over the positive outcome', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 6, completedWorkouts: 3, partialWorkouts: 0, missedWorkouts: 3, adherenceRate: 0.5, recentCompleted: 3, recentPlanned: 6, currentStreak: 0 },
      outcomes: { weight: emptyTrend({ baseline: 90, baselineDate: '2026-07-01', latest: 88, latestDate: '2026-08-15', absoluteChange: -2, percentChange: -2.2, direction: 'down', measurementCount: 3 }) },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: false, hasEnoughOutcomeData: true },
    });
    const result = interpretProgress(s, TODAY);
    assert.equal(result.state, 'ADHERENCE_DECLINING');
    // The positive outcome is still acknowledged as supporting evidence, not hidden.
    assert.ok(result.supporting.some(line => line.toLowerCase().includes('weight')));
  });
});

describe('Persona D — insufficient data', () => {
  test('one workout and one measurement never produces a confident trend claim', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 1, completedWorkouts: 1, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: 1, recentCompleted: 1, recentPlanned: 1, currentStreak: 1 },
      outcomes: { weight: emptyTrend({ latest: 90, latestDate: '2026-08-15', measurementCount: 1 }) },
      dataQuality: { hasEnoughBehaviouralData: false, hasEnoughPerformanceData: false, hasEnoughOutcomeData: false },
    });
    const result = interpretProgress(s, TODAY);
    assert.equal(result.state, 'INSUFFICIENT_DATA');
    assert.equal(result.supporting.length, 1);
    assert.match(result.supporting[0], /baseline|more workouts|measurements/i);
  });
});

describe('additional states', () => {
  test('a real performance plateau with nothing else positive -> PERFORMANCE_PLATEAU', () => {
    const s = snapshot({
      // High adherence and no outcome data at all — the only signal available is the performance plateau.
      behavioural: { plannedWorkouts: 6, completedWorkouts: 5, partialWorkouts: 1, missedWorkouts: 0, adherenceRate: 5 / 6, recentCompleted: 5, recentPlanned: 6, currentStreak: 4 },
      performance: { exerciseTrends: [exerciseTrend({ direction: 'stable', sessionsCompared: 3 })], activityTrends: [] },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: false },
    });
    const result = interpretProgress(s, TODAY);
    assert.equal(result.state, 'PERFORMANCE_PLATEAU');
  });

  test('a plateau is never claimed from only 2 comparable sessions', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 4, completedWorkouts: 4, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: 1, recentCompleted: 4, recentPlanned: 4, currentStreak: 4 },
      performance: { exerciseTrends: [exerciseTrend({ direction: 'stable', sessionsCompared: 2 })], activityTrends: [] },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: false },
    });
    const result = interpretProgress(s, TODAY);
    assert.notEqual(result.state, 'PERFORMANCE_PLATEAU');
  });

  test('build_muscle goal never reads weight direction as positive/negative on its own', () => {
    const s = snapshot({
      programme: { goal: 'build_muscle', source: 'ACP_GENERATED', startedAt: '2026-07-01' },
      behavioural: { plannedWorkouts: 6, completedWorkouts: 6, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: 1, recentCompleted: 6, recentPlanned: 6, currentStreak: 6 },
      outcomes: { weight: emptyTrend({ baseline: 80, baselineDate: '2026-07-01', latest: 81, latestDate: '2026-08-15', absoluteChange: 1, percentChange: 1.25, direction: 'up', measurementCount: 3 }) },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: false, hasEnoughOutcomeData: true },
    });
    const result = interpretProgress(s, TODAY);
    // Strong adherence with no usable performance/outcome signal (weight is neutral for this goal) -> ON_TRACK never fires.
    assert.notEqual(result.state, 'ON_TRACK');
  });

  test('programme ownership never changes the interpretation — observation only, never adapts', () => {
    const base = snapshot({
      behavioural: { plannedWorkouts: 6, completedWorkouts: 5, partialWorkouts: 0, missedWorkouts: 1, adherenceRate: 5 / 6, recentCompleted: 5, recentPlanned: 6, currentStreak: 4 },
      performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] },
      outcomes: { weight: emptyTrend({ baseline: 90, baselineDate: '2026-07-01', latest: 88.8, latestDate: '2026-08-15', absoluteChange: -1.2, percentChange: -1.33, direction: 'down', measurementCount: 3 }) },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: true },
    });
    const results = (['ACP_GENERATED', 'TRAINER_CREATED', 'TRAINER_MODIFIED'] as const).map(source =>
      interpretProgress({ ...base, programme: { ...base.programme!, source } }, TODAY));
    assert.ok(results.every(r => r.state === results[0].state && r.headline === results[0].headline));
  });

  test('adherence around 60-79% with nothing else to report -> BUILDING_CONSISTENCY', () => {
    const s = snapshot({
      behavioural: { plannedWorkouts: 10, completedWorkouts: 6, partialWorkouts: 1, missedWorkouts: 3, adherenceRate: 0.6, recentCompleted: 4, recentPlanned: 6, currentStreak: 2 },
      dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: false, hasEnoughOutcomeData: false },
    });
    const result = interpretProgress(s, TODAY);
    assert.equal(result.state, 'BUILDING_CONSISTENCY');
  });
});
