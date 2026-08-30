import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWeeklyAdaptation, enforceAdaptationMagnitude, buildWeeklyAdaptationUserPrompt,
  preserveMeaningfulActivityContinuity, buildDeterministicFallbackPlan,
  enforceAdaptationSupportLogic, isSupportOpportunityEligible, isFutureRegenerationEligible,
  WEEKLY_ADAPTATION_SYSTEM_PROMPT, AI_REQUEST_CONFIG,
  type StartingPlanActivity, type BehaviourSummary, type AIAssessment,
} from '../adaptation.ts';

function activity(overrides: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...overrides };
}

const VALID_RAW = {
  decision: 'keep',
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

  test('Day 7.4 — rejects a missing decision field', () => {
    const { decision, ...rest } = VALID_RAW;
    assert.equal(validateWeeklyAdaptation(rest), false);
  });

  test('Day 7.4 — rejects an invalid decision value', () => {
    const bad = { ...VALID_RAW, decision: 'overhaul' };
    assert.equal(validateWeeklyAdaptation(bad), false);
  });

  test('Day 7.4 — accepts every valid decision value', () => {
    for (const decision of ['keep', 'progress', 'simplify', 'rebalance', 'adjust']) {
      assert.equal(validateWeeklyAdaptation({ ...VALID_RAW, decision }), true, decision);
    }
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

  test('Day 7.4 — includes the knowledge context as its own section when provided', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      knowledgeContext: 'RELEVANT ACP KNOWLEDGE\n\nTraining:\n[K1] Beginners should progress load gradually.',
    });
    assert.ok(prompt.includes('RELEVANT ACP KNOWLEDGE'));
    assert.ok(prompt.includes('[K1] Beginners should progress load gradually.'));
  });

  test('Day 7.4 — omits the knowledge section entirely when nothing was retrieved', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      knowledgeContext: '',
    });
    assert.ok(!prompt.includes('RELEVANT ACP KNOWLEDGE'));
  });

  test('Day 9 — includes the execution context as its own section when provided', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      executionContext: 'EXECUTION EVIDENCE (already computed from this week — interpret, do not recompute)\nPlanned: 4 | Completed: 2 | Partial: 1 | Skipped: 1\nDifficulty feedback: too_hard 2',
    });
    assert.ok(prompt.includes('EXECUTION EVIDENCE'));
    assert.ok(prompt.includes('Completed: 2 | Partial: 1 | Skipped: 1'));
  });

  test('Day 9 — omits the execution section entirely for a legacy binary-only week', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      executionContext: '',
    });
    assert.ok(!prompt.includes('EXECUTION EVIDENCE'));
  });

  test('Day 9 — execution section is placed before the longitudinal / knowledge sections (evidence precedence)', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'beginner', barriers: [], preferredActivities: [],
      weeklyMinutesBudget: 180, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      longitudinalContext: { weeks_observed: 3, patterns: [{ type: 'category_success', subject: 'strength', confidence: 'strong', evidence: 'x' }] },
      executionContext: 'EXECUTION EVIDENCE (already computed from this week — interpret, do not recompute)\nPlanned: 4 | Completed: 4 | Partial: 0 | Skipped: 0',
      knowledgeContext: 'RELEVANT ACP KNOWLEDGE\n\nTraining:\n[K1] x.',
    });
    assert.ok(prompt.indexOf('EXECUTION EVIDENCE') < prompt.indexOf('Longitudinal coaching evidence'));
    assert.ok(prompt.indexOf('EXECUTION EVIDENCE') < prompt.indexOf('RELEVANT ACP KNOWLEDGE'));
  });

  // Beta Feedback #002 — training schedule preference
  test('emits a preferred-training-days section (with day count and strong-but-bounded framing) when 2+ days are given', () => {
    const prompt = buildWeeklyAdaptationUserPrompt({
      goal: 'build_muscle', experience: 'advanced', barriers: [], preferredActivities: ['gym'],
      preferredTrainingDays: ['Mon', 'tuesday', 'WEDNESDAY', 'thu', 'friday'],
      weeklyMinutesBudget: 300, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
    });
    assert.ok(prompt.includes('Preferred training days (user-stated, 5 days/week): Monday, Tuesday, Wednesday, Thursday, Friday'));
    assert.ok(prompt.toLowerCase().includes('keep the others free'));
    assert.ok(prompt.toLowerCase().includes('do not add total minutes'));
    assert.ok(prompt.toLowerCase().includes('do not narrow this preference'));
  });

  test('omits the schedule section for null / empty / single-day / all-invalid input', () => {
    for (const v of [undefined, null, [], ['friday'], ['nonsense', 'x']]) {
      const prompt = buildWeeklyAdaptationUserPrompt({
        goal: 'build_muscle', experience: 'advanced', barriers: [], preferredActivities: [],
        preferredTrainingDays: v as unknown,
        weeklyMinutesBudget: 300, previousWeeklyFocus: null, previousSupportOpportunities: [], behaviourSummary,
      });
      assert.ok(!prompt.includes('Preferred training days (user-stated'), `absent for ${JSON.stringify(v)}`);
    }
  });
});

// ── Beta Feedback #003 — explicit future-plan regeneration eligibility ──────

describe('isFutureRegenerationEligible (Beta Feedback #003)', () => {
  const base = { regenerateFuturePlan: true, isAdvanceGeneration: true, existingStatus: 'scheduled', shouldPromote: false };

  test('accepts only when: flag true + future week + existing scheduled plan + not promoting', () => {
    assert.equal(isFutureRegenerationEligible(base), true);
  });

  test('rejects a normal call (no flag) — normal idempotency is unaffected (test 14)', () => {
    assert.equal(isFutureRegenerationEligible({ ...base, regenerateFuturePlan: undefined }), false);
    assert.equal(isFutureRegenerationEligible({ ...base, regenerateFuturePlan: false }), false);
    assert.equal(isFutureRegenerationEligible({ ...base, regenerateFuturePlan: 'true' }), false); // must be strict boolean true
  });

  test('rejects when the target week has already started — current week is never replaced (test 6 / §D)', () => {
    assert.equal(isFutureRegenerationEligible({ ...base, isAdvanceGeneration: false }), false);
  });

  test('rejects when there is no already-scheduled plan for the target week', () => {
    assert.equal(isFutureRegenerationEligible({ ...base, existingStatus: undefined }), false);
    assert.equal(isFutureRegenerationEligible({ ...base, existingStatus: 'active' }), false);
    assert.equal(isFutureRegenerationEligible({ ...base, existingStatus: 'superseded' }), false);
  });

  test('rejects when this same call is promoting the scheduled plan (week has begun)', () => {
    assert.equal(isFutureRegenerationEligible({ ...base, shouldPromote: true }), false);
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

  test('Day 7.4 — defines all five decision values and the KEEP stability bias', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    for (const decision of ['keep', 'progress', 'simplify', 'rebalance', 'adjust']) {
      assert.ok(lower.includes(decision), `missing decision definition: ${decision}`);
    }
    assert.ok(lower.includes('if the evidence does not clearly justify a change, choose keep'));
  });

  test('Day 7.4 — explicitly subordinates ACP knowledge to user evidence', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('relevant acp knowledge'));
    assert.ok(lower.includes('never overrides') || lower.includes('the evidence above wins'));
  });

  test('Day 7.4 — never mentions retrieval/vector/embedding implementation details (section 32/91)', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    for (const leaky of ['embedding', 'vector', 'similarity', '\\brag\\b', 'chunk']) {
      assert.ok(!new RegExp(leaky).test(lower), `system prompt leaks implementation term: ${leaky}`);
    }
  });

  // Beta Feedback #002 — training schedule preference
  test('has a TRAINING SCHEDULE PREFERENCE block: strong-but-bounded, and never rewrites the stated preference', () => {
    assert.ok(WEEKLY_ADAPTATION_SYSTEM_PROMPT.includes('TRAINING SCHEDULE PREFERENCE'));
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('strongly respect'));
    assert.ok(lower.includes('time budget') && lower.includes('magnitude') && lower.includes('continuity'));
    assert.ok(lower.includes('not a reason to increase session count'));
    // §14 — adapt the plan, not the user's stated preference.
    assert.ok(lower.includes('never rewrite or narrow it'));
    assert.ok(lower.includes('adapt the plan') && lower.includes('not the stated preference'));
  });

  test('does not turn "preferred days" into "demanding session every day"', () => {
    const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();
    assert.ok(lower.includes('do not assume every preferred day needs a demanding session'));
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

  // Beta Feedback #002 §19/§33/§38 — fallback respects a training schedule preference
  test('with NO preference, activity days are carried forward unchanged (legacy behaviour)', () => {
    const fallback = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999);
    assert.deepEqual(fallback.starting_plan.activities.map(a => a.day), ['Monday', 'Thursday']);
  });

  test('with a preference, carried-forward activities are moved onto the preferred weekdays', () => {
    const current = currentAssessment({
      starting_plan: {
        title: 'x', rationale: 'x',
        activities: [
          activity({ day: 'Monday' }), activity({ day: 'Tuesday' }),
          activity({ day: 'Wednesday' }), activity({ day: 'Saturday' }),
        ],
      },
    });
    const fallback = buildDeterministicFallbackPlan(current, '2026-09-07', 999, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    assert.deepEqual(fallback.starting_plan.activities.map(a => a.day), ['Monday', 'Tuesday', 'Wednesday', 'Thursday']);
    // Same count, same activities, same durations — only `day` reassigned.
    assert.equal(fallback.starting_plan.activities.length, 4);
    assert.ok(fallback.starting_plan.activities.every(a => a.activity === 'Gym'));
  });

  test('a preference never expands the plan or the weekly minutes', () => {
    const current = currentAssessment(); // 2 activities, 60+60=120 min
    const before = current.starting_plan.activities.length;
    const beforeMin = current.starting_plan.activities.reduce((s, a) => s + a.duration_minutes, 0);
    const fallback = buildDeterministicFallbackPlan(current, '2026-09-07', 999, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    assert.equal(fallback.starting_plan.activities.length, before);
    assert.equal(fallback.starting_plan.activities.reduce((s, a) => s + a.duration_minutes, 0), beforeMin);
  });

  test('mixed-form / out-of-range preference input is ignored safely (no preference applied)', () => {
    const fallbackSingle = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999, ['monday']);
    assert.deepEqual(fallbackSingle.starting_plan.activities.map(a => a.day), ['Monday', 'Thursday']);
    const fallbackJunk = buildDeterministicFallbackPlan(currentAssessment(), '2026-09-07', 999, 'monday' as unknown as string[]);
    assert.deepEqual(fallbackJunk.starting_plan.activities.map(a => a.day), ['Monday', 'Thursday']);
  });
});

// ── Day 7.5C Correction A — deterministic support suppression ────────────────

describe('enforceAdaptationSupportLogic (Day 7.5C — support-opportunity eligibility gate)', () => {
  function assessmentWithSupport(support: AIAssessment['support_opportunities']): AIAssessment {
    return {
      headline: 'x', summary: 'x',
      starting_point: { experience: 'beginner', available_time: 'x', main_barriers: [] },
      recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
      support_opportunities: support,
      starting_plan: { title: 'x', rationale: 'x', activities: [activity()] },
      weekly_focus: { title: 'x', description: 'x' },
      next_steps: ['x'],
      nutrition_focus: null,
      review: null,
    };
  }

  test('A1 exact regression — no-barrier, high-adherence beginner: model-emitted PT + nutrition support are both removed', () => {
    const draft = assessmentWithSupport([
      { type: 'personal_trainer', relevance: 'high', reason: 'A beginner could benefit from guidance.' },
      { type: 'nutrition', relevance: 'medium', reason: 'Nutrition could support the goal.' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'beginner', barriers: [] });
    assert.deepEqual(result.support_opportunities, []);
  });

  test('personal_training as a mere preference is never promoted to a support opportunity', () => {
    const draft = assessmentWithSupport([
      { type: 'personal_trainer', relevance: 'medium', reason: 'The user listed personal training as a preferred activity.' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'beginner', barriers: ['personal_training'] as unknown as string[] });
    assert.equal(result.support_opportunities.length, 0);
  });

  test('a real confidence/knowledge barrier keeps an eligible personal_trainer opportunity', () => {
    const draft = assessmentWithSupport([
      { type: 'personal_trainer', relevance: 'high', reason: 'Beginner with confidence and knowledge barriers.' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'beginner', barriers: ['confidence', 'knowledge'] });
    const pt = result.support_opportunities.find(o => o.type === 'personal_trainer');
    assert.equal(pt?.relevance, 'high');
  });

  test('a lose_weight goal alone does not keep an automatic nutritionist opportunity (no nutrition barrier)', () => {
    const draft = assessmentWithSupport([
      { type: 'nutrition', relevance: 'high', reason: 'Weight-loss goals benefit from nutrition support.' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'intermediate', barriers: [] });
    assert.equal(result.support_opportunities.find(o => o.type === 'nutrition'), undefined);
  });

  test('a stated nutrition barrier keeps a real nutrition support opportunity', () => {
    const draft = assessmentWithSupport([
      { type: 'nutrition', relevance: 'medium', reason: 'Nutrition is a stated barrier.' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'intermediate', barriers: ['nutrition'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'nutrition')?.relevance, 'medium');
  });

  test('after filtering everything out, the approach/recommendation is left untouched (never forced to guided)', () => {
    const draft = assessmentWithSupport([
      { type: 'personal_trainer', relevance: 'high', reason: 'x' },
      { type: 'nutrition', relevance: 'high', reason: 'x' },
    ]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'intermediate', barriers: [] });
    assert.deepEqual(result.support_opportunities, []);
    assert.equal(result.recommendation.approach, 'self_directed');
  });

  test('the shared additive backstop still adds a warranted personal_trainer:high the model omitted', () => {
    const draft = assessmentWithSupport([]);
    const result = enforceAdaptationSupportLogic(draft, { strengthExperience: 'beginner', barriers: ['confidence', 'knowledge'] });
    assert.equal(result.support_opportunities.find(o => o.type === 'personal_trainer')?.relevance, 'high');
  });

  test('isSupportOpportunityEligible — PT needs the deterministic experience/barrier rule, not beginner experience alone', () => {
    assert.equal(
      isSupportOpportunityEligible({ type: 'personal_trainer', relevance: 'high', reason: 'x' }, { strengthExperience: 'beginner', barriers: [] }),
      false,
    );
    assert.equal(
      isSupportOpportunityEligible({ type: 'personal_trainer', relevance: 'high', reason: 'x' }, { strengthExperience: 'beginner', barriers: ['confidence'] }),
      true,
    );
    assert.equal(
      isSupportOpportunityEligible({ type: 'nutrition', relevance: 'high', reason: 'x' }, { strengthExperience: 'intermediate', barriers: ['nutrition'] }),
      true,
    );
    assert.equal(
      isSupportOpportunityEligible({ type: 'nutrition', relevance: 'high', reason: 'x' }, { strengthExperience: 'intermediate', barriers: [] }),
      false,
    );
  });
});

// ── Day 7.5C Corrections B & C — decision-precedence prompt language ─────────

describe('WEEKLY_ADAPTATION_SYSTEM_PROMPT — Day 9 execution evidence semantics', () => {
  const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();

  test('defines an EXECUTION EVIDENCE section', () => {
    assert.ok(lower.includes('execution evidence (if provided)'));
  });
  test('completion alone does not prove appropriate difficulty', () => {
    assert.ok(lower.includes('completion alone does not prove'));
  });
  test('partial completion is not the same as a skip', () => {
    assert.ok(lower.includes('partial completion is useful positive evidence, not the same as a skip'));
  });
  test('repeated too_hard favours executability before progression; one isolated event is not a pattern', () => {
    assert.ok(lower.includes('repeated "too_hard" feedback favours improving executability before any progression'));
    assert.ok(lower.includes('one isolated feedback event is not a pattern'));
  });
  test('repeated time-related skips favour fitting the plan to available time, not removing an activity', () => {
    assert.ok(lower.includes('repeated time-related skips favour fitting the plan'));
    assert.ok(lower.includes('not removing an activity type outright'));
  });
  test('execution evidence stays observational and never licenses a medical inference', () => {
    assert.ok(lower.includes('does not license a medical inference'));
  });
});

describe('WEEKLY_ADAPTATION_SYSTEM_PROMPT — Day 7.5C precedence rules', () => {
  const lower = WEEKLY_ADAPTATION_SYSTEM_PROMPT.toLowerCase();

  test('B — a positive outcome trend does not by itself justify a plan change', () => {
    assert.ok(lower.includes('adherence / executability precedence'));
    assert.ok(lower.includes('positive outcome trend never, on its own, justifies changing the plan'));
  });

  test('B — low adherence + positive outcome must not be treated as permission to progress or restructure', () => {
    assert.ok(lower.includes('low adherence with a positive outcome'));
    assert.ok(lower.includes('do not progress'));
    assert.ok(lower.includes('do not restructure (rebalance)'));
  });

  test('B — outcome evidence is framed as observational, not causal', () => {
    assert.ok(lower.includes('outcome evidence is observational'));
  });

  test('C — recovery precedence: high adherence alone is not evidence for progression', () => {
    assert.ok(lower.includes('recovery precedence'));
    assert.ok(lower.includes('high adherence is not, by itself, evidence for progression'));
  });

  test('C — closely scheduled demanding sessions call for redistribution before added workload', () => {
    assert.ok(lower.includes('do not add workload just because the sessions were completed'));
    assert.ok(lower.includes('redistributed'));
    assert.ok(lower.includes('choose progress only when session spacing is already appropriate'));
  });

  test('C — recovery language makes no medical claims', () => {
    assert.ok(lower.includes('make no medical claims'));
  });

  test('still keeps the existing KEEP stability bias line intact', () => {
    assert.ok(lower.includes('if the evidence does not clearly justify a change, choose keep'));
  });

  test('never leaks retrieval implementation terms', () => {
    for (const leaky of ['embedding', 'vector', 'similarity', '\\brag\\b', 'chunk']) {
      assert.ok(!new RegExp(leaky).test(lower), `system prompt leaks implementation term: ${leaky}`);
    }
  });
});
