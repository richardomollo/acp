import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLongitudinalSummary, resolveMemorySync,
  type LongitudinalPlanInput, type LongitudinalCompletionInput, type MeasurementInput,
} from '../longitudinal.ts';
import type { StartingPlanActivity } from '../../onboarding-assessment/assessment.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45, intensity: 'moderate', title: 'x', description: 'x', ...overrides };
}

function plan(overrides: Partial<LongitudinalPlanInput> = {}): LongitudinalPlanInput {
  return {
    planId: 'p1', weekStartDate: '2026-08-03', weekEndDate: '2026-08-09',
    activities: [activity()], nutritionFocusType: null, supportTypes: [],
    ...overrides,
  };
}

function measurement(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return { loggedAt: '2026-08-05T08:00:00.000Z', weightKg: null, bodyFatPct: null, muscleMassKg: null, waistCm: null, ...overrides };
}

// Same 4 weekly windows used throughout — Monday-start weeks, matching the
// existing longitudinal.test.ts convention exactly.
const WEEKS = [
  { start: '2026-08-03', end: '2026-08-09' },
  { start: '2026-08-10', end: '2026-08-16' },
  { start: '2026-08-17', end: '2026-08-23' },
  { start: '2026-08-24', end: '2026-08-30' },
];
function fourWeekPlans(): LongitudinalPlanInput[] {
  return WEEKS.map((w, i) => plan({ planId: `w${i + 1}`, weekStartDate: w.start, weekEndDate: w.end }));
}
function highAdherenceCompletions(): LongitudinalCompletionInput[] {
  // 85%-ish across 4 weeks of 1-activity plans isn't representable at
  // exactly 85% with 1 activity/week — use 2 activities/week instead so
  // "strong adherence" scenarios (J/K) can hit a real 85%/90%-class rate.
  return [
    { planId: 'w1', activityIndex: 0 }, { planId: 'w1', activityIndex: 1 },
    { planId: 'w2', activityIndex: 0 }, { planId: 'w2', activityIndex: 1 },
    { planId: 'w3', activityIndex: 0 }, { planId: 'w3', activityIndex: 1 },
    { planId: 'w4', activityIndex: 0 }, // 7/8 = 87.5%
  ];
}
function fourWeekPlansTwoActivities(): LongitudinalPlanInput[] {
  return WEEKS.map((w, i) => plan({
    planId: `w${i + 1}`, weekStartDate: w.start, weekEndDate: w.end,
    activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })],
  }));
}

const NOW = new Date('2026-09-01T00:00:00Z');

function weightAt(weekIndex: number, kg: number): MeasurementInput {
  return measurement({ loggedAt: `${WEEKS[weekIndex].start}T08:00:00.000Z`, weightKg: kg });
}

describe('Outcome Intelligence — Scenario A: one measurement', () => {
  test('baseline only, no trend, no pattern', () => {
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, [weightAt(0, 100)], 'lose_weight');
    assert.equal(summary.outcomes.weight?.direction, 'insufficient_data');
    assert.equal(summary.outcomes.weight?.observations, 1);
    assert.equal(summary.outcome_patterns.some(p => p.metric === 'weight'), false);
  });
});

describe('Outcome Intelligence — Scenario B: weight decreasing, lose_weight goal', () => {
  test('103 -> 102 -> 101 -> 100 -> progressing-toward-goal, strong confidence', () => {
    const measurements = [weightAt(0, 103), weightAt(1, 102), weightAt(2, 101), weightAt(3, 100)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    const pattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.ok(pattern, 'expected a weight outcome pattern');
    assert.equal(pattern!.type, 'outcome_progressing');
    assert.equal(pattern!.confidence, 'strong');
    assert.equal(pattern!.evidence.change, -3);
  });
});

describe('Outcome Intelligence — Scenario C: weight increasing, lose_weight goal', () => {
  test('100 -> 101 -> 102 -> away-from-target', () => {
    const measurements = [weightAt(0, 100), weightAt(1, 101), weightAt(2, 102)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    const pattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.ok(pattern);
    assert.equal(pattern!.type, 'outcome_away_from_target');
  });
});

describe('Outcome Intelligence — Scenario D: weight increasing toward a stated (higher) target weight', () => {
  test('86 -> 88 -> 90 with goal_weight_kg 100 -> progressing-toward-goal, not "weight up = bad"', () => {
    const measurements = [weightAt(0, 86), weightAt(1, 88), weightAt(2, 90)];
    // No literal 'gain_weight' PrimaryGoal exists — the stated target
    // (goal_weight_kg > starting weight) is what carries the signal.
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'build_muscle', 100);
    const pattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.ok(pattern, 'expected a weight outcome pattern driven by the stated target');
    assert.equal(pattern!.type, 'outcome_progressing');
  });
});

describe('Outcome Intelligence — Scenario E: stable weight, maintain_weight goal', () => {
  test('80 -> 80.2 -> 79.9 -> 80.1 -> stable, treated as aligned', () => {
    const measurements = [weightAt(0, 80), weightAt(1, 80.2), weightAt(2, 79.9), weightAt(3, 80.1)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'maintain_weight');
    assert.equal(summary.outcomes.weight?.direction, 'stable');
    const pattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.ok(pattern);
    assert.equal(pattern!.type, 'outcome_stable');
  });
});

describe('Outcome Intelligence — Scenario F: reduce_stress goal', () => {
  test('weight changes never produce a high-priority weight outcome pattern for this goal', () => {
    const measurements = [weightAt(0, 90), weightAt(1, 88), weightAt(2, 86), weightAt(3, 84)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'reduce_stress');
    // The raw trend is still visible (for display), but no pattern/coaching-memory-worthy conclusion is drawn from it.
    assert.ok(summary.outcomes.weight);
    assert.equal(summary.outcome_patterns.some(p => p.metric === 'weight'), false);
  });
});

describe('Outcome Intelligence — Scenario G: body fat missing', () => {
  test('missing values are unknown, never treated as 0', () => {
    const measurements = [weightAt(0, 100), weightAt(1, 99)]; // no bodyFatPct on either
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    assert.equal(summary.outcomes.body_fat, undefined);
  });
});

describe('Outcome Intelligence — Scenario H: multiple measurements in the same plan week', () => {
  test('normalizes to the latest measurement within that week, not an average', () => {
    const measurements = [
      measurement({ loggedAt: '2026-08-24T08:00:00.000Z', weightKg: 100 }),   // Monday
      measurement({ loggedAt: '2026-08-26T08:00:00.000Z', weightKg: 99.6 }),  // Wednesday
      measurement({ loggedAt: '2026-08-29T08:00:00.000Z', weightKg: 99.8 }),  // Saturday (latest)
      weightAt(0, 103), weightAt(1, 102), weightAt(2, 101), // earlier weeks, so 4 weekly observations exist
    ];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    assert.equal(summary.outcomes.weight?.latest, 99.8);
    assert.equal(summary.outcomes.weight?.observations, 4);
  });
});

describe('Outcome Intelligence — Scenario I: tiny fluctuation reads as stable, not a false trend', () => {
  test('100 -> 100.2 -> 99.9 -> 100.1 (within epsilon) -> stable, not increasing/decreasing', () => {
    const measurements = [weightAt(0, 100), weightAt(1, 100.2), weightAt(2, 99.9), weightAt(3, 100.1)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    assert.equal(summary.outcomes.weight?.direction, 'stable');
  });
});

describe('Outcome Intelligence — Scenario J: strong adherence + positive outcome trend', () => {
  test('combined compact context reflects both behaviour and outcome evidence', () => {
    const measurements = [weightAt(0, 103), weightAt(1, 102), weightAt(2, 101), weightAt(3, 100)];
    const summary = buildLongitudinalSummary(fourWeekPlansTwoActivities(), highAdherenceCompletions(), NOW, measurements, 'lose_weight');
    assert.ok(summary.overall.completion_rate > 0.8);
    const outcomePattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.equal(outcomePattern?.type, 'outcome_progressing');
  });
});

describe('Outcome Intelligence — Scenario K: strong adherence + flat outcome', () => {
  test('no automatic "increase volume" signal — flat outcome is just outcome_stable, not a difficulty pattern', () => {
    const measurements = [weightAt(0, 80), weightAt(1, 80.1), weightAt(2, 79.9), weightAt(3, 80)];
    const summary = buildLongitudinalSummary(fourWeekPlansTwoActivities(), highAdherenceCompletions(), NOW, measurements, 'lose_weight');
    assert.ok(summary.overall.completion_rate > 0.8);
    const outcomePattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    // Flat + lose_weight goal is neutral (not "aligned"), so it surfaces as
    // outcome_stable — never a behavioural difficulty/volume-increase signal.
    assert.equal(outcomePattern?.type, 'outcome_stable');
    assert.equal(summary.patterns.some(p => p.type.includes('difficulty')), false);
  });
});

describe('Outcome Intelligence — Scenario L: low adherence + flat outcome', () => {
  test('plan-fit/consistency evidence remains the primary signal; outcome stays a separate, non-alarming fact', () => {
    const lowAdherence: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w2', activityIndex: 0 },
    ]; // 2 of 8 = 25%
    const measurements = [weightAt(0, 90), weightAt(1, 90.1), weightAt(2, 89.9), weightAt(3, 90)];
    const summary = buildLongitudinalSummary(fourWeekPlansTwoActivities(), lowAdherence, NOW, measurements, 'lose_weight');
    assert.ok(summary.overall.completion_rate < 0.4);
    const outcomePattern = summary.outcome_patterns.find(p => p.metric === 'weight');
    assert.equal(outcomePattern?.type, 'outcome_stable');
  });
});

describe('Outcome Intelligence — Scenario M: measurement history changes invalidate the old memory', () => {
  test('a metric that no longer clears the pattern bar is deactivated, not left stale', () => {
    const plans = fourWeekPlans();
    const decreasing = buildLongitudinalSummary(plans, [], NOW, [weightAt(0, 103), weightAt(1, 102), weightAt(2, 101), weightAt(3, 100)], 'lose_weight');
    const { toUpsert: firstUpsert } = resolveMemorySync(decreasing, []);
    assert.ok(firstUpsert.some(r => r.memory_type === 'outcome_progress' && r.subject === 'weight'));

    // Now only a single (edited/re-fetched) measurement remains for weight.
    const afterEdit = buildLongitudinalSummary(plans, [], NOW, [weightAt(3, 100)], 'lose_weight');
    const existingActive = firstUpsert.map(r => ({ memory_type: r.memory_type, subject: r.subject }));
    const { toUpsert: secondUpsert, toDeactivate } = resolveMemorySync(afterEdit, existingActive);
    assert.equal(secondUpsert.some(r => r.memory_type === 'outcome_progress' && r.subject === 'weight'), false);
    assert.ok(toDeactivate.some(d => d.memory_type === 'outcome_progress' && d.subject === 'weight'));
  });
});

describe('Outcome Intelligence — Scenario N: one logical active memory per metric', () => {
  test('resyncing the same evidence twice never produces a duplicate identity', () => {
    const measurements = [weightAt(0, 103), weightAt(1, 102), weightAt(2, 101), weightAt(3, 100)];
    const summary = buildLongitudinalSummary(fourWeekPlans(), [], NOW, measurements, 'lose_weight');
    const { toUpsert: first } = resolveMemorySync(summary, []);
    const existingActive = first.map(r => ({ memory_type: r.memory_type, subject: r.subject }));
    const { toUpsert: second } = resolveMemorySync(summary, existingActive);
    const weightRowsSecondRun = second.filter(r => r.memory_type === 'outcome_progress' && r.subject === 'weight');
    assert.equal(weightRowsSecondRun.length, 1);
  });
});
