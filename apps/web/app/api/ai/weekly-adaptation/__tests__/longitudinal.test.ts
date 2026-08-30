import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLongitudinalSummary, resolveMemorySync,
  type LongitudinalPlanInput, type LongitudinalCompletionInput,
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

// Note (Day 6 report section G): real ACP plan activities only carry the 5
// canonical categories (strength/cardio/recovery/mobility/sport) — the
// spec's illustrative "Running 25% / Walking 100%" example is finer-grained
// than any real structured field ACP has, and section 7 explicitly forbids
// inferring category from free text. These tests therefore use 'cardio' as
// the category standing in for "running-like" scenarios.
const NOW = new Date('2026-09-01T00:00:00Z'); // after all 4 sample weeks have ended

describe('buildLongitudinalSummary — Scenario A: category success (strength)', () => {
  test('8 planned / 7 completed across 4 weeks -> strong category_success', () => {
    const plans: LongitudinalPlanInput[] = [
      plan({ planId: 'w1', weekStartDate: '2026-08-03', weekEndDate: '2026-08-09', activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })] }),
      plan({ planId: 'w2', weekStartDate: '2026-08-10', weekEndDate: '2026-08-16', activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })] }),
      plan({ planId: 'w3', weekStartDate: '2026-08-17', weekEndDate: '2026-08-23', activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })] }),
      plan({ planId: 'w4', weekStartDate: '2026-08-24', weekEndDate: '2026-08-30', activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })] }),
    ];
    const completions: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w1', activityIndex: 1 },
      { planId: 'w2', activityIndex: 0 }, { planId: 'w2', activityIndex: 1 },
      { planId: 'w3', activityIndex: 0 }, { planId: 'w3', activityIndex: 1 },
      { planId: 'w4', activityIndex: 0 }, // only 1 of 2 this week
    ];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const pattern = summary.patterns.find(p => p.type === 'category_success' && p.subject === 'strength');
    assert.ok(pattern, 'expected a category_success pattern for strength');
    assert.deepEqual(pattern!.evidence, { planned: 8, completed: 7, rate: 0.875, weeks: 4 });
    assert.equal(pattern!.confidence, 'strong'); // 8 observations >= 4, 4 weeks >= 3
  });
});

describe('buildLongitudinalSummary — Scenario B: category difficulty (cardio)', () => {
  test('4 planned / 1 completed across 4 weeks -> difficulty pattern, no causal claim', () => {
    const plans: LongitudinalPlanInput[] = ['w1', 'w2', 'w3', 'w4'].map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      activities: [activity({ day: 'Wednesday', category: 'cardio', activity: 'Running' })],
    }));
    const completions: LongitudinalCompletionInput[] = [{ planId: 'w1', activityIndex: 0 }];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const pattern = summary.patterns.find(p => p.type === 'category_difficulty' && p.subject === 'cardio');
    assert.ok(pattern, 'expected a category_difficulty pattern for cardio');
    assert.deepEqual(pattern!.evidence, { planned: 4, completed: 1, rate: 0.25, weeks: 4 });
    assert.ok(!/cause|because you/i.test(pattern!.user_message), 'must stay observational, never causal');
  });
});

describe('buildLongitudinalSummary — Scenario C: one Saturday miss', () => {
  test('1 planned / 0 completed -> NO day pattern (below emerging threshold)', () => {
    const plans: LongitudinalPlanInput[] = [plan({ planId: 'w1', activities: [activity({ day: 'Saturday', category: 'sport' })] })];
    const summary = buildLongitudinalSummary(plans, [], NOW);
    assert.equal(summary.patterns.find(p => p.subject === 'saturday'), undefined);
  });
});

describe('buildLongitudinalSummary — Scenario D: repeated Saturday difficulty', () => {
  test('4 planned / 1 completed across 4 weeks -> legitimate day_difficulty pattern', () => {
    const plans: LongitudinalPlanInput[] = ['w1', 'w2', 'w3', 'w4'].map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      activities: [activity({ day: 'Saturday', category: 'sport', activity: 'Football' })],
    }));
    const completions: LongitudinalCompletionInput[] = [{ planId: 'w1', activityIndex: 0 }];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const pattern = summary.patterns.find(p => p.type === 'day_difficulty' && p.subject === 'saturday');
    assert.ok(pattern, 'expected a legitimate day_difficulty pattern for Saturday');
    assert.deepEqual(pattern!.evidence, { planned: 4, completed: 1, rate: 0.25, weeks: 4 });
  });
});

describe('buildLongitudinalSummary — Scenario E: short-session success', () => {
  test('9 short (<=30min) planned / 8 completed -> duration_success', () => {
    const weeks = ['w1', 'w2', 'w3', 'w4'];
    const plans: LongitudinalPlanInput[] = weeks.map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      activities: i < 3
        ? [activity({ duration_minutes: 20 }), activity({ day: 'Wednesday', duration_minutes: 25 })]
        : [activity({ duration_minutes: 20 }), activity({ day: 'Wednesday', duration_minutes: 25 }), activity({ day: 'Friday', duration_minutes: 15 })],
    }));
    const completions: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w1', activityIndex: 1 },
      { planId: 'w2', activityIndex: 0 }, { planId: 'w2', activityIndex: 1 },
      { planId: 'w3', activityIndex: 0 }, { planId: 'w3', activityIndex: 1 },
      { planId: 'w4', activityIndex: 0 }, { planId: 'w4', activityIndex: 1 }, // w4's 3rd (index 2) not completed
    ];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const pattern = summary.patterns.find(p => p.type === 'duration_success' && p.subject === 'short');
    assert.ok(pattern, 'expected a duration_success pattern for short sessions');
    assert.equal(pattern!.evidence.planned, 9);
    assert.equal(pattern!.evidence.completed, 8);
  });
});

describe('buildLongitudinalSummary — Scenario F: mixed/ambiguous evidence', () => {
  test('strength 4/8 = 50% -> no success/difficulty conclusion', () => {
    const weeks = ['w1', 'w2', 'w3', 'w4'];
    const plans: LongitudinalPlanInput[] = weeks.map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      activities: [activity(), activity({ day: 'Thursday' })],
    }));
    const completions: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w1', activityIndex: 1 },
      { planId: 'w2', activityIndex: 0 }, { planId: 'w2', activityIndex: 1 },
      // w3, w4 both fully missed -> 4/8 = 50%
    ];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    assert.equal(summary.patterns.find(p => p.subject === 'strength'), undefined, 'ambiguous rate must not produce a pattern');
  });
});

describe('buildLongitudinalSummary — Scenario G/H: trend detection', () => {
  function weeklyRatePlans(rates: number[]): { plans: LongitudinalPlanInput[]; completions: LongitudinalCompletionInput[] } {
    // 4 planned activities/week; `rate` determines how many are completed (rounded).
    const plans: LongitudinalPlanInput[] = [];
    const completions: LongitudinalCompletionInput[] = [];
    rates.forEach((rate, i) => {
      const id = `w${i + 1}`;
      const activities = [0, 1, 2, 3].map(n => activity({ day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][n] }));
      plans.push(plan({
        planId: id,
        weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
        weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
        activities,
      }));
      const completedCount = Math.round(rate * 4);
      for (let n = 0; n < completedCount; n++) completions.push({ planId: id, activityIndex: n });
    });
    return { plans, completions };
  }

  test('Scenario G: 40% / 55% / 70% / 85% -> improving', () => {
    const { plans, completions } = weeklyRatePlans([0.40, 0.55, 0.70, 0.85]);
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    assert.equal(summary.recent_trend.direction, 'improving');
  });

  test('Scenario H: 78% / 82% / 79% / 81% -> stable (noise, not a real trend)', () => {
    const { plans, completions } = weeklyRatePlans([0.78, 0.82, 0.79, 0.81]);
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    assert.equal(summary.recent_trend.direction, 'stable');
  });
});

describe('buildLongitudinalSummary — Scenario I: insufficient trend data', () => {
  test('one completed week -> insufficient_data', () => {
    const summary = buildLongitudinalSummary([plan({ planId: 'w1' })], [], NOW);
    assert.equal(summary.recent_trend.direction, 'insufficient_data');
  });
});

describe('buildLongitudinalSummary — Scenario K: missing week', () => {
  test('no canonical plan for week 3 -> not treated as a failed week', () => {
    const plans: LongitudinalPlanInput[] = [
      plan({ planId: 'w1', weekStartDate: '2026-08-03', weekEndDate: '2026-08-09' }),
      plan({ planId: 'w2', weekStartDate: '2026-08-10', weekEndDate: '2026-08-16' }),
      // week 3 (2026-08-17 - 2026-08-23) intentionally absent
      plan({ planId: 'w4', weekStartDate: '2026-08-24', weekEndDate: '2026-08-30' }),
    ];
    const completions: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w2', activityIndex: 0 }, { planId: 'w4', activityIndex: 0 },
    ];
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    assert.equal(summary.window.weeks_available, 3); // never inflated to 4 by a phantom week
    assert.equal(summary.overall.planned_sessions, 3); // 1 activity/week x 3 real weeks, never x4
    assert.equal(summary.overall.completed_sessions, 3);
  });
});

describe('buildLongitudinalSummary — Scenario M: future/incomplete current week', () => {
  test('a plan whose week has not ended yet contributes nothing', () => {
    const completedWeek = plan({ planId: 'w1', weekStartDate: '2026-08-24', weekEndDate: '2026-08-30' });
    const currentIncompleteWeek = plan({
      planId: 'w2', weekStartDate: '2026-08-31', weekEndDate: '2026-09-06', // ends after NOW (2026-09-01)
      activities: [activity({ day: 'Wednesday' }), activity({ day: 'Friday' })], // "future" activities, not yet due
    });
    const summary = buildLongitudinalSummary([completedWeek, currentIncompleteWeek], [], NOW);
    assert.equal(summary.window.weeks_available, 1);
    assert.equal(summary.overall.planned_sessions, 1); // only the completed week's single activity
  });
});

describe('buildLongitudinalSummary — nutrition/support persistence facts (sections 32-33)', () => {
  test('same nutrition_focus.type for 3 consecutive weeks -> moderate persistence fact, never an adherence claim', () => {
    const plans: LongitudinalPlanInput[] = ['w1', 'w2', 'w3'].map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      nutritionFocusType: 'protein_consistency',
    }));
    const summary = buildLongitudinalSummary(plans, [], NOW);
    const fact = summary.persistence_facts.find(f => f.type === 'nutrition_focus_persistence');
    assert.ok(fact, 'expected a nutrition_focus_persistence fact');
    assert.equal(fact!.evidence.weeks, 3);
    assert.equal(fact!.confidence, 'moderate');
    assert.ok(!/consistently eat|adherence/i.test(fact!.user_message), 'must never claim meal adherence');
  });

  test('support_opportunities containing personal_trainer for 2 consecutive weeks -> emerging persistence fact, never a "you need" claim', () => {
    const plans: LongitudinalPlanInput[] = ['w1', 'w2'].map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      supportTypes: ['personal_trainer'],
    }));
    const summary = buildLongitudinalSummary(plans, [], NOW);
    const fact = summary.persistence_facts.find(f => f.type === 'support_opportunity_persistence');
    assert.ok(fact, 'expected a support_opportunity_persistence fact');
    assert.equal(fact!.evidence.weeks, 2);
    assert.equal(fact!.confidence, 'emerging');
    assert.ok(!/you need|should get/i.test(fact!.user_message), 'must never frame as a need');
  });

  test('no persistence fact when nutrition_focus is null throughout (never inferred from meal-suggestion display)', () => {
    const plans: LongitudinalPlanInput[] = [plan({ planId: 'w1', nutritionFocusType: null }), plan({ planId: 'w2', weekStartDate: '2026-08-10', weekEndDate: '2026-08-16', nutritionFocusType: null })];
    const summary = buildLongitudinalSummary(plans, [], NOW);
    assert.equal(summary.persistence_facts.find(f => f.type === 'nutrition_focus_persistence'), undefined);
  });
});

describe('resolveMemorySync — Scenario J: memory update/replace, no contradictory actives', () => {
  test('a prior category_difficulty is deactivated when this window newly classifies as category_success', () => {
    const plans: LongitudinalPlanInput[] = ['w1', 'w2', 'w3', 'w4'].map((id, i) => plan({
      planId: id,
      weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
      weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
      activities: [activity({ category: 'cardio', activity: 'Running' })],
    }));
    const completions: LongitudinalCompletionInput[] = [
      { planId: 'w1', activityIndex: 0 }, { planId: 'w2', activityIndex: 0 },
      { planId: 'w3', activityIndex: 0 }, { planId: 'w4', activityIndex: 0 },
    ]; // 4/4 = 100% this window -> category_success
    const summary = buildLongitudinalSummary(plans, completions, NOW);
    const existingActive = [{ memory_type: 'category_difficulty', subject: 'cardio' }];
    const { toUpsert, toDeactivate } = resolveMemorySync(summary, existingActive);

    assert.ok(toUpsert.some(r => r.memory_type === 'category_success' && r.subject === 'cardio'));
    assert.ok(toDeactivate.some(r => r.memory_type === 'category_difficulty' && r.subject === 'cardio'));
    // No contradictory actives: the fresh set never contains both success and difficulty for the same subject.
    const freshTypesForCardio = toUpsert.filter(r => r.subject === 'cardio').map(r => r.memory_type);
    assert.ok(!(freshTypesForCardio.includes('category_success') && freshTypesForCardio.includes('category_difficulty')));
  });

  test('Day 9 — extra execution memory rows are folded into toUpsert and follow the same deactivate-if-absent lifecycle', () => {
    const summary = buildLongitudinalSummary([], [], NOW); // empty window
    const existingActive = [{ memory_type: 'execution_pattern', subject: 'time_fit' }];
    const executionRows = [{ memory_type: 'execution_pattern', subject: 'difficulty_fit', confidence: 'moderate' as const, evidence: { direction: 'too_hard' }, user_message: 'Several recent sessions have felt harder than expected.' }];
    const { toUpsert, toDeactivate } = resolveMemorySync(summary, existingActive, executionRows);
    assert.ok(toUpsert.some(r => r.memory_type === 'execution_pattern' && r.subject === 'difficulty_fit'));
    // the previously-active time_fit pattern is no longer confirmed this run → deactivated
    assert.ok(toDeactivate.some(r => r.memory_type === 'execution_pattern' && r.subject === 'time_fit'));
  });

  test('Day 9 — no execution rows passed → identical behaviour to before (default param)', () => {
    const summary = buildLongitudinalSummary([], [], NOW);
    assert.deepEqual(resolveMemorySync(summary, []), resolveMemorySync(summary, [], []));
  });

  test('a subject that becomes ambiguous deactivates whichever conclusion was previously active', () => {
    const summary = buildLongitudinalSummary(
      ['w1', 'w2'].map((id, i) => plan({
        planId: id,
        weekStartDate: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
        weekEndDate: `2026-08-${String(9 + i * 7).padStart(2, '0')}`,
        activities: [activity({ category: 'mobility' })],
      })),
      [{ planId: 'w1', activityIndex: 0 }], // 1/2 = 50% -> ambiguous, no pattern at all
      NOW,
    );
    const existingActive = [{ memory_type: 'category_success', subject: 'mobility' }];
    const { toUpsert, toDeactivate } = resolveMemorySync(summary, existingActive);
    assert.equal(toUpsert.find(r => r.subject === 'mobility'), undefined);
    assert.ok(toDeactivate.some(r => r.memory_type === 'category_success' && r.subject === 'mobility'));
  });
});
