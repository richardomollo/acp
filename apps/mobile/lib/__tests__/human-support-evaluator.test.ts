import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHumanSupport, applySuppression } from '../human-support-evaluator.ts';
import type { HumanSupportEvaluationInput } from '../human-support-types.ts';
import type { ProgressSnapshot, ExercisePerformanceTrend } from '../progress-types.ts';

function exerciseTrend(overrides: Partial<ExercisePerformanceTrend> = {}): ExercisePerformanceTrend {
  return { exerciseId: 'ex1', exerciseName: 'Goblet Squat', metric: 'weight_reps', sessionsCompared: 3, firstDate: '2026-07-01', latestDate: '2026-08-15', firstLoadKg: 20, latestLoadKg: 20, firstReps: 10, latestReps: 10, direction: 'stable', ...overrides };
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

function input(overrides: Partial<HumanSupportEvaluationInput> = {}): HumanSupportEvaluationInput {
  return {
    progress: progress(),
    recentCheckIns: [],
    recentAdaptations: [],
    experienceLevel: 'intermediate',
    programmeSource: 'ACP_GENERATED',
    hasActiveTrainerRelationship: false,
    ...overrides,
  };
}

describe('healthy progress', () => {
  test('good adherence, no issues, no beginner opportunity -> no trigger at all', () => {
    const result = evaluateHumanSupport(input());
    assert.equal(result.primary, null);
    assert.equal(result.signals.length, 0);
  });
});

describe('BEGINNER_TECHNIQUE_SUPPORT', () => {
  test('beginner + no other signal -> low-severity opportunity', () => {
    const result = evaluateHumanSupport(input({ experienceLevel: 'beginner' }));
    assert.equal(result.primary?.trigger, 'BEGINNER_TECHNIQUE_SUPPORT');
    assert.equal(result.primary?.severity, 'INFO');
  });

  test('never suggested once the member already has trainer guidance', () => {
    const result = evaluateHumanSupport(input({ experienceLevel: 'beginner', hasActiveTrainerRelationship: true }));
    assert.ok(!result.signals.some(s => s.trigger === 'BEGINNER_TECHNIQUE_SUPPORT'));
  });
});

describe('PROGRESS_PLATEAU', () => {
  test('stable performance across enough sessions + good adherence -> plateau', () => {
    const result = evaluateHumanSupport(input({ progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }) }));
    assert.equal(result.primary?.trigger, 'PROGRESS_PLATEAU');
  });

  test('never claims a plateau from too few comparable sessions', () => {
    const result = evaluateHumanSupport(input({ progress: progress({ performance: { exerciseTrends: [exerciseTrend({ sessionsCompared: 2 })], activityTrends: [] } }) }));
    assert.notEqual(result.primary?.trigger, 'PROGRESS_PLATEAU');
  });
});

describe('REPEATED_LOW_ADHERENCE', () => {
  test('low adherence AND ACP already tried adjusting twice -> escalate', () => {
    const result = evaluateHumanSupport(input({
      progress: progress({ behavioural: { plannedWorkouts: 6, completedWorkouts: 2, partialWorkouts: 0, missedWorkouts: 4, adherenceRate: 2 / 6, recentCompleted: 2, recentPlanned: 6, currentStreak: 0 } }),
      recentAdaptations: [{ weekNumber: 4, decisionTypes: ['CHANGE_VOLUME'] }, { weekNumber: 3, decisionTypes: ['REGRESS'] }],
    }));
    assert.equal(result.primary?.trigger, 'REPEATED_LOW_ADHERENCE');
  });

  test('a single adjustment attempt is not yet "repeated"', () => {
    const result = evaluateHumanSupport(input({
      progress: progress({ behavioural: { plannedWorkouts: 6, completedWorkouts: 2, partialWorkouts: 0, missedWorkouts: 4, adherenceRate: 2 / 6, recentCompleted: 2, recentPlanned: 6, currentStreak: 0 } }),
      recentAdaptations: [{ weekNumber: 4, decisionTypes: ['CHANGE_VOLUME'] }],
    }));
    assert.notEqual(result.primary?.trigger, 'REPEATED_LOW_ADHERENCE');
  });
});

describe('REPEATED_DIFFICULTY', () => {
  test('2+ too-difficult check-ins -> escalate', () => {
    const result = evaluateHumanSupport(input({
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'REPEATED_DIFFICULTY');
  });

  test('a single difficult week does not escalate', () => {
    const result = evaluateHumanSupport(input({ recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }] }));
    assert.notEqual(result.primary?.trigger, 'REPEATED_DIFFICULTY');
  });
});

describe('PAIN_REPORTED', () => {
  test('any pain report -> HIGH severity, always the primary signal', () => {
    const result = evaluateHumanSupport(input({
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: true }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'PAIN_REPORTED');
    assert.equal(result.primary?.severity, 'HIGH');
    assert.doesNotMatch(result.primary!.reason, /injur|diagnos/i);
  });
});

describe('REPEATED_ADAPTATION', () => {
  test('3+ real (non-KEEP) adaptations without resolution -> escalate', () => {
    const result = evaluateHumanSupport(input({
      recentAdaptations: [
        { weekNumber: 5, decisionTypes: ['CHANGE_INTENSITY'] }, { weekNumber: 4, decisionTypes: ['REGRESS'] }, { weekNumber: 3, decisionTypes: ['CHANGE_VOLUME'] },
      ],
    }));
    assert.equal(result.primary?.trigger, 'REPEATED_ADAPTATION');
  });

  test('KEEP/INSUFFICIENT_EVIDENCE weeks never count toward the repeated-adaptation tally', () => {
    const result = evaluateHumanSupport(input({
      recentAdaptations: [{ weekNumber: 5, decisionTypes: ['KEEP'] }, { weekNumber: 4, decisionTypes: ['KEEP'] }, { weekNumber: 3, decisionTypes: ['INSUFFICIENT_EVIDENCE'] }],
    }));
    assert.notEqual(result.primary?.trigger, 'REPEATED_ADAPTATION');
  });
});

describe('priority (section 9)', () => {
  test('pain outranks a plateau', () => {
    const result = evaluateHumanSupport(input({
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }),
      recentCheckIns: [{ weekNumber: 4, difficulty: 'about_right', painReported: true }],
    }));
    assert.equal(result.primary?.trigger, 'PAIN_REPORTED');
  });

  test('repeated difficulty outranks the beginner opportunity', () => {
    const result = evaluateHumanSupport(input({
      experienceLevel: 'beginner',
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'REPEATED_DIFFICULTY');
  });

  test('exactly one primary signal is ever returned, even with several present', () => {
    const result = evaluateHumanSupport(input({
      experienceLevel: 'beginner',
      progress: progress({ performance: { exerciseTrends: [exerciseTrend()], activityTrends: [] } }),
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: true }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'PAIN_REPORTED');
    assert.ok(result.signals.length > 1); // several signals detected internally...
    assert.equal([result.primary].length, 1); // ...but exactly one surfaced as primary
  });
});

describe('trainer-owned relabeling (sections 17/18)', () => {
  test('TRAINER_CREATED relabels the primary signal to TRAINER_REVIEW_RECOMMENDED, never a fresh PT', () => {
    const result = evaluateHumanSupport(input({
      programmeSource: 'TRAINER_CREATED',
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'TRAINER_REVIEW_RECOMMENDED');
    assert.equal(result.trainerOwned, true);
  });

  test('an existing active trainer relationship on an ACP_GENERATED programme still relabels to review-with-trainer', () => {
    const result = evaluateHumanSupport(input({
      hasActiveTrainerRelationship: true,
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.equal(result.primary?.trigger, 'TRAINER_REVIEW_RECOMMENDED');
  });

  test('the underlying evidence/reason is preserved, only the trigger label changes', () => {
    const result = evaluateHumanSupport(input({
      programmeSource: 'TRAINER_CREATED',
      recentCheckIns: [{ weekNumber: 4, difficulty: 'too_difficult', painReported: false }, { weekNumber: 3, difficulty: 'too_difficult', painReported: false }],
    }));
    assert.match(result.primary!.reason, /difficult/i);
  });
});

describe('suppression (section 7/21)', () => {
  const now = new Date('2026-08-20T00:00:00Z');

  test('a recently dismissed RECOMMENDED signal is suppressed', () => {
    const signal = { trigger: 'PROGRESS_PLATEAU' as const, severity: 'RECOMMENDED' as const, reason: 'x', evidence: {} };
    const result = applySuppression(signal, [{ trigger: 'PROGRESS_PLATEAU', dismissedAt: '2026-08-15T00:00:00Z' }], now);
    assert.equal(result, null);
  });

  test('a dismissal older than the cooldown no longer suppresses', () => {
    const signal = { trigger: 'PROGRESS_PLATEAU' as const, severity: 'RECOMMENDED' as const, reason: 'x', evidence: {} };
    const result = applySuppression(signal, [{ trigger: 'PROGRESS_PLATEAU', dismissedAt: '2026-07-01T00:00:00Z' }], now);
    assert.deepEqual(result, signal);
  });

  test('a HIGH severity signal is never suppressed by a dismissal', () => {
    const signal = { trigger: 'PAIN_REPORTED' as const, severity: 'HIGH' as const, reason: 'x', evidence: {} };
    const result = applySuppression(signal, [{ trigger: 'PAIN_REPORTED', dismissedAt: '2026-08-19T00:00:00Z' }], now);
    assert.deepEqual(result, signal);
  });

  test('dismissing one trigger does not suppress a different, currently-active trigger', () => {
    const signal = { trigger: 'REPEATED_DIFFICULTY' as const, severity: 'RECOMMENDED' as const, reason: 'x', evidence: {} };
    const result = applySuppression(signal, [{ trigger: 'PROGRESS_PLATEAU', dismissedAt: '2026-08-19T00:00:00Z' }], now);
    assert.deepEqual(result, signal);
  });
});
