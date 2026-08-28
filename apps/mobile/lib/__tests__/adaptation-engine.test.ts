import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAdaptation } from '../adaptation-engine.ts';
import type { AdaptationContext } from '../adaptation-types.ts';
import type { ProgressSnapshot, ExercisePerformanceTrend } from '../progress-types.ts';

function exerciseTrend(overrides: Partial<ExercisePerformanceTrend> = {}): ExercisePerformanceTrend {
  return { exerciseId: 'ex1', exerciseName: 'Goblet Squat', metric: 'weight_reps', sessionsCompared: 3, firstDate: '2026-07-01', latestDate: '2026-08-15', firstLoadKg: 16, latestLoadKg: 20, firstReps: 10, latestReps: 10, direction: 'increased', ...overrides };
}

function progress(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    period: { start: '2026-07-01', end: '2026-08-20' },
    behavioural: { plannedWorkouts: 6, completedWorkouts: 6, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: 1, recentCompleted: 6, recentPlanned: 6, currentStreak: 6 },
    performance: { exerciseTrends: [], activityTrends: [] },
    outcomes: {},
    programme: { goal: 'lose_weight', source: 'ACP_GENERATED', startedAt: '2026-07-01' },
    dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: false, hasEnoughOutcomeData: false },
    ...overrides,
  };
}

function context(overrides: Partial<AdaptationContext> = {}): AdaptationContext {
  return {
    progress: progress(),
    checkIn: { difficulty: 'about_right', energy: 'normal', painReported: false, scheduleChanged: false },
    programme: { source: 'ACP_GENERATED', sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: null },
    ...overrides,
  };
}

describe('Persona A — doing well', () => {
  test('good adherence + about-right + stable/improving -> KEEP', () => {
    const result = evaluateAdaptation(context({
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }),
    }));
    assert.equal(result.decisions[0].type, 'KEEP');
    assert.equal(result.canApplyAutomatically, true);
  });
});

describe('Persona B — ready to progress', () => {
  test('strong adherence + easy + improving -> PROGRESS', () => {
    const result = evaluateAdaptation(context({
      checkIn: { difficulty: 'easy', energy: 'high', painReported: false, scheduleChanged: false },
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] }, dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: false } }),
    }));
    assert.ok(['PROGRESS', 'CHANGE_INTENSITY'].includes(result.decisions[0].type));
  });
});

describe('Persona C — struggling with adherence', () => {
  test('low completion + too difficult -> CHANGE_VOLUME (never progression)', () => {
    const result = evaluateAdaptation(context({
      checkIn: { difficulty: 'too_difficult', energy: 'low', painReported: false, scheduleChanged: false },
      progress: progress({ behavioural: { plannedWorkouts: 6, completedWorkouts: 2, partialWorkouts: 0, missedWorkouts: 4, adherenceRate: 2 / 6, recentCompleted: 2, recentPlanned: 6, currentStreak: 0 } }),
    }));
    assert.ok(['CHANGE_VOLUME', 'REGRESS'].includes(result.decisions[0].type));
    assert.notEqual(result.decisions[0].type, 'PROGRESS');
    assert.notEqual(result.decisions[0].type, 'CHANGE_INTENSITY');
  });
});

describe('Persona D — schedule mismatch', () => {
  test('scheduleChanged -> RESCHEDULE, regardless of other signals', () => {
    const result = evaluateAdaptation(context({ checkIn: { difficulty: 'about_right', energy: 'normal', painReported: false, scheduleChanged: true } }));
    assert.equal(result.decisions[0].type, 'RESCHEDULE');
  });
});

describe('Persona E — pain reported', () => {
  test('pain always overrides every other signal -> never a progression decision', () => {
    const result = evaluateAdaptation(context({
      checkIn: { difficulty: 'easy', energy: 'high', painReported: true, scheduleChanged: false },
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }),
    }));
    assert.equal(result.decisions[0].type, 'KEEP');
    assert.match(result.decisions[0].reason, /pain|discomfort/i);
    assert.notEqual(result.decisions[0].type, 'PROGRESS');
  });
});

describe('Persona F — trainer-owned programme', () => {
  test('identifies a real progression opportunity but flags it as non-applicable', () => {
    const result = evaluateAdaptation(context({
      programme: { source: 'TRAINER_CREATED', sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: null },
      checkIn: { difficulty: 'easy', energy: 'high', painReported: false, scheduleChanged: false },
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] }, dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: false } }),
    }));
    assert.equal(result.canApplyAutomatically, false);
    assert.ok(['PROGRESS', 'CHANGE_INTENSITY'].includes(result.decisions[0].type));
  });

  test('TRAINER_MODIFIED is protected the same as TRAINER_CREATED, absent an explicit permission model', () => {
    const result = evaluateAdaptation(context({ programme: { source: 'TRAINER_MODIFIED', sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: null } }));
    assert.equal(result.canApplyAutomatically, false);
  });
});

describe('safety and insufficient data', () => {
  test('insufficient evidence never produces a confident structural change', () => {
    const result = evaluateAdaptation(context({
      progress: progress({ behavioural: { plannedWorkouts: 1, completedWorkouts: 1, partialWorkouts: 0, missedWorkouts: 0, adherenceRate: 1, recentCompleted: 1, recentPlanned: 1, currentStreak: 1 }, dataQuality: { hasEnoughBehaviouralData: false, hasEnoughPerformanceData: false, hasEnoughOutcomeData: false } }),
    }));
    assert.equal(result.decisions[0].type, 'INSUFFICIENT_EVIDENCE');
  });

  test('a declining exercise with nothing else improving triggers SUBSTITUTE', () => {
    const result = evaluateAdaptation(context({
      progress: progress({ performance: { exerciseTrends: [exerciseTrend({ direction: 'decreased' })], activityTrends: [] }, dataQuality: { hasEnoughBehaviouralData: true, hasEnoughPerformanceData: true, hasEnoughOutcomeData: false } }),
    }));
    assert.equal(result.decisions[0].type, 'SUBSTITUTE');
  });
});

describe('over-adaptation guard (section 21)', () => {
  test('does not re-progress/regress the same week twice — holds instead', () => {
    const result = evaluateAdaptation(context({
      checkIn: { difficulty: 'easy', energy: 'high', painReported: false, scheduleChanged: false },
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }),
      programme: { source: 'ACP_GENERATED', sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: 3 },
    }));
    assert.equal(result.decisions[0].type, 'KEEP');
  });

  test('an explicit schedule change still reschedules even if already adapted this week', () => {
    const result = evaluateAdaptation(context({
      checkIn: { difficulty: 'about_right', energy: 'normal', painReported: false, scheduleChanged: true },
      programme: { source: 'ACP_GENERATED', sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: 3 },
    }));
    assert.equal(result.decisions[0].type, 'RESCHEDULE');
  });
});

describe('ownership', () => {
  test('every programme source produces a valid AdaptationResult', () => {
    for (const source of ['ACP_GENERATED', 'TRAINER_CREATED', 'TRAINER_MODIFIED'] as const) {
      const result = evaluateAdaptation(context({ programme: { source, sessionsPerWeek: 3, sessionDurationMinutes: 30, currentWeek: 3, durationWeeks: 8, lastAdaptedWeek: null } }));
      assert.ok(result.decisions.length > 0);
      assert.equal(result.canApplyAutomatically, source === 'ACP_GENERATED');
    }
  });
});

describe('decision output never leaks raw internals inappropriately', () => {
  test('every decision has a non-empty, member-safe reason string', () => {
    const scenarios: AdaptationContext[] = [
      context({ checkIn: { difficulty: 'about_right', energy: 'normal', painReported: false, scheduleChanged: false } }),
      context({ checkIn: { difficulty: 'easy', energy: 'high', painReported: false, scheduleChanged: false }, progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }) }),
      context({ checkIn: { difficulty: 'too_difficult', energy: 'low', painReported: false, scheduleChanged: false } }),
      context({ checkIn: { difficulty: 'about_right', energy: 'normal', painReported: true, scheduleChanged: false } }),
    ];
    for (const s of scenarios) {
      const result = evaluateAdaptation(s);
      for (const d of result.decisions) {
        assert.ok(d.reason.length > 10);
        assert.doesNotMatch(d.reason, /^[A-Z_]+$/); // never just a raw enum value
      }
    }
  });
});
