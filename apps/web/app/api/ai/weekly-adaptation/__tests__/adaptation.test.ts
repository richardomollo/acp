import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWeeklyAdaptation, enforceAdaptationMagnitude, buildWeeklyAdaptationUserPrompt,
  preserveMeaningfulActivityContinuity, buildDeterministicFallbackPlan,
  WEEKLY_ADAPTATION_SYSTEM_PROMPT, AI_REQUEST_CONFIG,
  type StartingPlanActivity, type BehaviourSummary, type AIAssessment,
} from '../adaptation.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...overrides };
}

const VALID_RAW = {
  review: { headline: 'Solid week.', summary: 'You completed most of your plan.', wins: ['Consistent strength sessions'], focus_next_week: 'Keep the same structure.' },
  recommendation: { approach: 'self_directed', title: 'Stay the course', reason: 'Adherence was strong.' },
  starting_plan: {
    title: 'Week 2', rationale: 'Consistency was strong, so the structure stays the same.',
    activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday' })],
  },
  weekly_focus: { title: 'Consistency', description: 'Keep showing up on your planned days.' },
  next_steps: ['Log how each session feels'],
  support_opportunities: [],
  nutrition_focus: { type: 'protein_consistency', title: 'Protein consistency', reason: 'Include a protein-rich food with each main meal to support your goal.' },
};

describe('validateWeeklyAdaptation', () => {
  test('accepts a well-formed response', () => {
    assert.equal(validateWeeklyAdaptation(VALID_RAW), true);
  });

  test('rejects a non-object', () => {
    assert.equal(validateWeeklyAdaptation(null), false);
  });

  test('rejects more than 3 wins', () => {
    const bad = { ...VALID_RAW, review: { ...VALID_RAW.review, wins: ['a', 'b', 'c', 'd'] } };
    assert.equal(validateWeeklyAdaptation(bad), false);
  });

  test('rejects an invalid nutrition_focus type', () => {
    const bad = { ...VALID_RAW, nutrition_focus: { ...VALID_RAW.nutrition_focus, type: 'hydration' } };
    assert.equal(validateWeeklyAdaptation(bad), false);
  });

  test('rejects a missing nutrition_focus entirely', () => {
    const { nutrition_focus, ...rest } = VALID_RAW;
    assert.equal(validateWeeklyAdaptation(rest), false);
  });

  test('rejects an old-shaped approach value', () => {
    const bad = { ...VALID_RAW, recommendation: { ...VALID_RAW.recommendation, approach: 'personal_trainer_support' } };
    assert.equal(validateWeeklyAdaptation(bad), false);
  });

  test('accepts both personal_trainer and nutrition support opportunities together', () => {
    const both = {
      ...VALID_RAW,
      support_opportunities: [
        { type: 'personal_trainer', relevance: 'high', reason: 'x' },
        { type: 'nutrition', relevance: 'medium', reason: 'x' },
      ],
    };
    assert.equal(validateWeeklyAdaptation(both), true);
  });

  test('rejects an empty activities array', () => {
    const bad = { ...VALID_RAW, starting_plan: { ...VALID_RAW.starting_plan, activities: [] } };
    assert.equal(validateWeeklyAdaptation(bad), false);
  });
});

describe('enforceAdaptationMagnitude (Part 38 — guard against extreme week-to-week swings)', () => {
  test('leaves a plan untouched when growth is within 50%', () => {
    const previous = [activity(), activity(), activity()]; // 3 sessions, 180 min
    const next = [activity(), activity(), activity(), activity()]; // 4 sessions, 240 min (+33%)
    const result = enforceAdaptationMagnitude(next, previous);
    assert.equal(result.length, 4);
  });

  test('trims an extreme session-count jump (3 -> 7) back toward a reasonable ceiling', () => {
    const previous = [activity(), activity(), activity()]; // 3 sessions
    const next = Array.from({ length: 7 }, () => activity());
    const result = enforceAdaptationMagnitude(next, previous);
    assert.ok(result.length < 7);
    assert.ok(result.length <= Math.ceil(3 * 1.5) || result.length <= 3 + 2);
  });

  test('trims an extreme minutes jump (150 -> 400) even with a reasonable session count', () => {
    const previous = [activity({ duration_minutes: 50 }), activity({ duration_minutes: 50 }), activity({ duration_minutes: 50 })]; // 150 min
    const next = [activity({ duration_minutes: 150 }), activity({ duration_minutes: 150 }), activity({ duration_minutes: 100 })]; // 400 min
    const result = enforceAdaptationMagnitude(next, previous);
    const totalMinutes = result.reduce((s, a) => s + a.duration_minutes, 0);
    assert.ok(totalMinutes <= 150 * 1.5);
  });

  test('a tiny previous plan can still grow by the flat allowance', () => {
    const previous = [activity({ duration_minutes: 100 })]; // 1 session, 100 min
    const next = [
      activity({ duration_minutes: 40 }), activity({ duration_minutes: 40 }), activity({ duration_minutes: 40 }),
    ]; // 3 sessions (+2, within the flat session allowance), 120 min total (within the 150 min ceiling too)
    const result = enforceAdaptationMagnitude(next, previous);
    assert.equal(result.length, 3);
  });

  test('never trims below one activity', () => {
    const previous = [activity()];
    const next = Array.from({ length: 7 }, () => activity({ duration_minutes: 500 }));
    const result = enforceAdaptationMagnitude(next, previous);
    assert.ok(result.length >= 1);
  });

  test('an empty previous plan is treated as no baseline — no growth guard applies', () => {
    const next = Array.from({ length: 7 }, () => activity());
    const result = enforceAdaptationMagnitude(next, []);
    assert.equal(result.length, 7);
  });
});

describe('buildWeeklyAdaptationUserPrompt', () => {
  const behaviourSummary: BehaviourSummary = {
    planned_sessions: 4, completed_sessions: 3, planned_minutes: 210, completed_known_minutes: 0,
    has_known_duration: false, adherence_rate: 0.75,
    completed_by_category: { strength: 2, cardio: 1 }, missed_by_category: { sport: 1 },
    completion_sources: { manual: 3 },
  };

  test('includes the behaviour summary as JSON, verbatim — never recomputed', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: ['time'], preferredActivities: ['gym'],
      weeklyMinutesBudget: 210, previousWeeklyFocus: { title: 'x', description: 'y' },
      previousSupportOpportunities: [], behaviourSummary,
    });
    assert.ok(prompt.includes('"adherence_rate":0.75'));
    assert.ok(prompt.includes('"completed_sessions":3'));
  });

  test('states the weekly time budget explicitly', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
    });
    assert.ok(prompt.includes('180 minutes'));
  });
});

describe('WEEKLY_ADAPTATION_SYSTEM_PROMPT guardrails', () => {
  test('explicitly instructs against overreacting to one week', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('prefer small changes over large ones'));
    assert.ok(lower.includes('never overreact'));
  });

  test('explicitly instructs not to reward high adherence with more volume', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('never increase session count or total minutes just because adherence was high'));
  });

  test('explicitly instructs the model never to calculate facts itself', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('never calculate counts, minutes, or adherence yourself'));
  });

  test('explicitly instructs nutrition_focus is intent only, never a nutrient value', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('never invent a specific gram/calorie amount'));
  });

  test('preserves the personal_training-preference-alone guardrail', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('personal_training') && lower.includes('not by itself enough'));
  });
});

describe('AI_REQUEST_CONFIG (latency optimisation, same discipline as onboarding)', () => {
  test('uses minimal reasoning effort and a bounded token cap', () => {
    assert.equal(AI_REQUEST_CONFIG.reasoning_effort, 'minimal');
    assert.ok(AI_REQUEST_CONFIG.max_completion_tokens > 0 && AI_REQUEST_CONFIG.max_completion_tokens < 3000);
  });
});

describe('preserveMeaningfulActivityContinuity (Day 5.5 Problem A)', () => {
  const weekStartDate = '2026-09-07'; // a Monday

  test('Scenario A: time barrier + a missed long session — reintroduces the category, shortened (90 -> 60)', () => {
    const previous = [
      activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90, intensity: 'challenging' }),
    ];
    const next = [activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 })]; // model dropped 'sport' entirely
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['gym', 'football'], barriers: ['time'], weekStartDate,
    });
    const reintroduced = result.find(a => a.category === 'sport');
    assert.ok(reintroduced, 'football should be reintroduced');
    assert.equal(reintroduced!.duration_minutes, 60); // 90 * 2/3
    assert.equal(reintroduced!.intensity, 'moderate'); // stepped down from challenging
    assert.equal(reintroduced!.planned_date, '2026-09-12'); // the Saturday of weekStartDate's week
  });

  test('Scenario B: one missed run with no specific barrier — still reintroduced, at the gentler 75% reduction', () => {
    const previous = [
      activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Wednesday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Friday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 40, intensity: 'moderate' }),
    ];
    const next = previous.slice(0, 3); // model dropped cardio/running after the one miss
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { cardio: 1 }, preferredActivities: ['gym', 'running'], barriers: [], weekStartDate,
    });
    const reintroduced = result.find(a => a.category === 'cardio');
    assert.ok(reintroduced, 'running should not be eliminated from one miss');
    assert.equal(reintroduced!.duration_minutes, 30); // 40 * 0.75, rounded to nearest 5
  });

  test('Scenario C: user no longer prefers running — continuity does NOT reinsert it', () => {
    const previous = [
      activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Saturday', category: 'cardio', activity: 'Running', duration_minutes: 40 }),
    ];
    const next = [previous[0]];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { cardio: 1 }, preferredActivities: ['gym'], barriers: [], weekStartDate, // 'running' no longer listed
    });
    assert.equal(result.find(a => a.category === 'cardio'), undefined);
  });

  test('Scenario D: a fully-completed category the model correctly kept is left untouched; a missed one is simplified back in', () => {
    const previous = [
      activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Tuesday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Wednesday', category: 'mobility', activity: 'Yoga', duration_minutes: 30 }),
      activity({ day: 'Friday', category: 'cardio', activity: 'Running', duration_minutes: 30 }),
      activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 60 }),
    ];
    // Model already preserved the successfully-completed strength sessions,
    // simplified by dropping mobility/cardio/sport.
    const next = [previous[0], previous[1]];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { mobility: 1, cardio: 1, sport: 1 },
      preferredActivities: ['gym', 'yoga', 'running', 'football'], barriers: ['consistency'], weekStartDate,
    });
    assert.equal(result.filter(a => a.category === 'strength').length, 2); // untouched
    assert.ok(result.some(a => a.category === 'mobility'));
    assert.ok(result.some(a => a.category === 'cardio'));
    assert.ok(result.some(a => a.category === 'sport'));
  });

  test('never reintroduces a category the model already kept', () => {
    const previous = [activity({ category: 'strength' })];
    const next = [activity({ category: 'strength' })];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { strength: 1 }, preferredActivities: ['gym'], barriers: [], weekStartDate,
    });
    assert.equal(result.length, 1);
  });

  test('does not reintroduce a category with zero misses even if the model dropped it (out of this narrow backstop\'s scope)', () => {
    const previous = [activity({ category: 'strength' })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: {}, preferredActivities: ['gym'], barriers: [], weekStartDate,
    });
    assert.equal(result.length, 0);
  });

  test('never reintroduces an activity already at/below the reduction floor', () => {
    const previous = [activity({ category: 'mobility', activity: 'Yoga', duration_minutes: 15 })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { mobility: 1 }, preferredActivities: ['yoga'], barriers: [], weekStartDate,
    });
    assert.equal(result.length, 0);
  });

  test('reintroduced activities carry a valid planned_date inside the next week, never derived from "today"', () => {
    const previous = [activity({ day: 'Thursday', category: 'sport', activity: 'Football', duration_minutes: 60 })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['football'], barriers: [], weekStartDate,
    });
    assert.equal(result[0].planned_date, '2026-09-10'); // the Thursday of weekStartDate's week
  });

  // Day 6, Part 29 — longitudinal evidence override.
  test('Scenario N: weak (one-week) evidence still protects — the guardrail bypass never fires from missedByCategory alone', () => {
    const previous = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['football'], barriers: [], weekStartDate,
      // no strongDifficultyCategories/Days passed — same as every existing call site today
    });
    assert.ok(result.some(a => a.category === 'sport'), 'one miss alone must still trigger the normal continuity protection');
  });

  test('Scenario O: strong longitudinal difficulty allows the drop to stand', () => {
    const previous = [activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 })];
    const next: StartingPlanActivity[] = [];
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['football'], barriers: [], weekStartDate,
      strongDifficultyDays: new Set(['saturday']), // 4-week strong evidence: Saturday sessions 1/4 completed
    });
    assert.equal(result.find(a => a.category === 'sport'), undefined, 'strong evidence justifies letting the removal stand');
  });

  test('Scenario P: preference preservation — bypassing reintroduction is a schedule-fit finding, not a preference verdict (other preferred activities are untouched)', () => {
    const previous = [
      activity({ day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 45 }),
      activity({ day: 'Saturday', category: 'sport', activity: 'Football', duration_minutes: 90 }),
    ];
    const next = [previous[0]]; // model dropped Saturday football, kept Monday gym
    const result = preserveMeaningfulActivityContinuity({
      previousActivities: previous, nextActivities: next,
      missedByCategory: { sport: 1 }, preferredActivities: ['gym', 'football'], barriers: [], weekStartDate,
      strongDifficultyDays: new Set(['saturday']),
    });
    // The bypass only concerns the Saturday/sport slot — it must never touch
    // an unrelated category/day the user is still doing successfully.
    assert.equal(result.filter(a => a.category === 'strength').length, 1);
    assert.equal(result.find(a => a.category === 'sport'), undefined);
  });
});

describe('buildDeterministicFallbackPlan (Day 5.5 Problem B)', () => {
  function currentAssessment(overrides: Partial<AIAssessment> = {}): AIAssessment {
    return {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'x', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: [{ type: 'nutrition', relevance: 'medium', reason: 'x' }],
      starting_plan: {
        title: 'Week 1', rationale: 'x',
        activities: [activity({ day: 'Monday' }), activity({ day: 'Thursday', category: 'cardio', activity: 'Running', duration_minutes: 30 })],
      },
      weekly_focus: { title: 'Consistency', description: 'x' },
      next_steps: ['x'],
      nutrition_focus: { type: 'protein_consistency', title: 'Protein', reason: 'x' },
      review: null,
      ...overrides,
    };
  }

  test('carries the previous plan structure forward verbatim (no new activities)', () => {
    const current = currentAssessment();
    const fallback = buildDeterministicFallbackPlan(current, '2026-09-07', 999);
    assert.equal(fallback.starting_plan.activities.length, 2);
    assert.equal(fallback.starting_plan.activities[0].activity, 'Gym');
    assert.equal(fallback.starting_plan.activities[1].activity, 'Running');
  });

  test('assigns new, correctly-dated week bounds — never derived from "today"', () => {
    const fallback = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999);
    assert.equal(fallback.starting_plan.week_start_date, '2026-09-07');
    assert.equal(fallback.starting_plan.week_end_date, '2026-09-13');
    assert.equal(fallback.starting_plan.activities[0].planned_date, '2026-09-07'); // Monday
    assert.equal(fallback.starting_plan.activities[1].planned_date, '2026-09-10'); // Thursday
  });

  test('respects the current weekly time budget even if it has since changed', () => {
    const current = currentAssessment({
      starting_plan: {
        title: 'x', rationale: 'x',
        activities: [
          activity({ duration_minutes: 60 }), activity({ day: 'Tuesday', duration_minutes: 60 }),
          activity({ day: 'Thursday', duration_minutes: 60 }), activity({ day: 'Saturday', duration_minutes: 60 }),
        ], // 240 min total, 4 sessions
      },
    });
    const fallback = buildDeterministicFallbackPlan(current, '2026-09-07', 100); // budget shrank to 100 min
    const total = fallback.starting_plan.activities.reduce((s, a) => s + a.duration_minutes, 0);
    assert.ok(total <= 100 * 1.15);
    assert.ok(fallback.starting_plan.activities.length < 4); // some sessions trimmed to fit
  });

  test('Scenario K: carries forward a valid nutrition_focus rather than inventing a new one', () => {
    const fallback = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999);
    assert.equal(fallback.nutrition_focus?.type, 'protein_consistency');
  });

  test('Scenario L: carries forward existing support_opportunities unchanged', () => {
    const fallback = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999);
    assert.deepEqual(fallback.support_opportunities, [{ type: 'nutrition', relevance: 'medium', reason: 'x' }]);
  });

  test('is clearly marked as a deterministic fallback, and never labelled as an AI weekly review', () => {
    const fallback = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999);
    assert.equal(fallback.generation_source, 'deterministic_fallback');
    assert.equal(fallback.review?.wins.length, 0);
    assert.ok(!fallback.headline.toLowerCase().includes('acp intelligence'));
  });
});
