import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findBannedPhrases, assertUserSafeCoachingText } from '../coaching/copy-safety.ts';
import { buildWeeklyCoachingBrief } from '../coaching/coaching-brief.ts';
import { buildPlanExplanation } from '../coaching/plan-explanation.ts';
import { buildProgressExplanation } from '../coaching/progress-explanation.ts';
import { describePlanChanges, compareWeeklyPlans } from '../coaching/plan-comparison.ts';
import type { AIAssessment, StartingPlanActivity } from '../ai-assessment.ts';
import type { CoachingMemoryRow } from '../coaching-memory.ts';

describe('copy-safety guard itself', () => {
  test('flags causal / certain / prescriptive / label / impl-term phrases', () => {
    assert.ok(findBannedPhrases('You lost weight because your workouts burned calories').length > 0);
    assert.ok(findBannedPhrases('This will build muscle faster').length > 0);
    assert.ok(findBannedPhrases('ACP knows this plan works').length > 0);
    assert.ok(findBannedPhrases('You need a personal trainer').length > 0);
    assert.ok(findBannedPhrases('You failed to complete the week').length > 0);
    assert.ok(findBannedPhrases('Decision: progress').length > 0);
    assert.ok(findBannedPhrases('We rebalance your plan').length > 0);
    assert.ok(findBannedPhrases('Our embedding similarity retrieval found this').length > 0);
    assert.ok(findBannedPhrases('Your muscles need 48 hours to recover').length > 0);
    assert.ok(findBannedPhrases('ACP detected that you were under-recovered').length > 0);
  });
  test('passes normal, evidence-grounded coaching copy', () => {
    for (const ok of [
      'You completed 3 of your 4 planned activities last week.',
      "I've spaced your strength sessions further apart while keeping your training time similar.",
      'Your weight has moved toward your goal across the last three recorded weeks.',
      'This week, focus on consistency rather than adding more.',
      'Your harder sessions are spread across different days of the week.',
      'If you would like more guidance, ACP can help you find a personal trainer.',
    ]) assert.deepEqual(findBannedPhrases(ok), [], ok);
  });
});

// ── Fixture matrix: every user-facing string from every builder is safe ──────

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
function mkAssessment(o: Partial<AIAssessment> = {}): AIAssessment {
  return {
    headline: 'x', summary: 'x',
    starting_point: { experience: 'beginner', available_time: '4 hours', main_barriers: ['time', 'consistency'] },
    recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
    support_opportunities: [],
    starting_plan: { title: 'x', rationale: 'x', activities: [act({ day: 'Monday', intensity: 'challenging' }), act({ day: 'Wednesday', intensity: 'challenging' }), act({ day: 'Friday', category: 'cardio', activity: 'Run', intensity: 'light' }) ] },
    weekly_focus: { title: 'Consistency', description: 'Complete each planned session before adding anything new.' },
    next_steps: ['x'],
    ...o,
  };
}
const OUTCOME: CoachingMemoryRow[] = [{ memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong', evidence: { direction: 'outcome_progressing', first: 84, latest: 82, observations: 4 }, user_message: 'Your weight has moved toward your goal' }];
const SUCCESS: CoachingMemoryRow[] = [{ memory_type: 'category_success', subject: 'strength', confidence: 'strong', evidence: { rate: 1, planned: 6, completed: 6 }, user_message: "You've stayed consistent with strength training" }];
const OVERALL: CoachingMemoryRow[] = [{ memory_type: 'overall_summary', subject: 'all', confidence: 'moderate', evidence: { window: { weeks_used: 3 }, overall: { planned_sessions: 12, completed_sessions: 5 }, trend: { direction: 'declining' } }, user_message: null }];

const prevPlan = [act({ day: 'Monday', intensity: 'challenging', duration_minutes: 70 }), act({ day: 'Tuesday', intensity: 'challenging', duration_minutes: 70 }), act({ day: 'Thursday', intensity: 'moderate', duration_minutes: 60 })];

describe('every generated user-facing string passes the guard', () => {
  const goals = [null, 'build_muscle', 'lose_weight', 'general_fitness', 'reduce_stress'];
  const weeks: ({ completed: number; planned: number } | null)[] = [null, { completed: 4, planned: 4 }, { completed: 2, planned: 4 }, { completed: 1, planned: 5 }];

  test('buildWeeklyCoachingBrief across the matrix', () => {
    for (const isFirstWeek of [true, false]) for (const lastWeek of weeks) for (const memory of [[], OUTCOME, SUCCESS, OVERALL]) {
      const b = buildWeeklyCoachingBrief({ assessment: mkAssessment(), previousActivities: prevPlan, lastWeek, coachingMemory: memory, isFirstWeek });
      for (const s of [b.headline, b.observation, b.guidance, ...b.evidence.map(e => e.text)]) assertUserSafeCoachingText(s, 'brief');
    }
  });

  test('buildPlanExplanation across the matrix', () => {
    for (const goal of goals) for (const lastWeek of weeks) for (const memory of [[], OUTCOME, SUCCESS]) {
      const reasons = buildPlanExplanation({ assessment: mkAssessment(), goal, lastWeek, previousActivities: prevPlan, completedCategoriesLastWeek: ['strength'], coachingMemory: memory, preferredActivities: ['gym', 'running'] });
      assert.ok(reasons.length <= 4);
      for (const r of reasons) { assertUserSafeCoachingText(r.title, 'reason title'); assertUserSafeCoachingText(r.explanation, 'reason explanation'); }
    }
  });

  test('describePlanChanges across a range of deltas', () => {
    const currs = [
      prevPlan, // identical
      [act({ day: 'Monday', duration_minutes: 40 }), act({ day: 'Wednesday', duration_minutes: 40 }), act({ day: 'Friday', duration_minutes: 40 })], // lighter + re-spaced
      [act({ day: 'Monday', intensity: 'challenging' }), act({ day: 'Wednesday', intensity: 'challenging' }), act({ day: 'Friday', intensity: 'challenging' }), act({ day: 'Sunday', category: 'recovery', activity: 'Walk', intensity: 'light', duration_minutes: 30 })], // session added
      [act({ day: 'Monday' })], // sessions removed
    ];
    for (const curr of currs) for (const l of describePlanChanges(compareWeeklyPlans(prevPlan, curr))) assertUserSafeCoachingText(l, 'plan change');
  });

  test('buildProgressExplanation across the matrix', () => {
    for (const memory of [[], OUTCOME, SUCCESS, [...OUTCOME, ...SUCCESS, ...OVERALL]]) {
      const r = buildProgressExplanation({ coachingMemory: memory, weeklyProgress: { completed: 1, total: 4 } });
      for (const i of r.items) assertUserSafeCoachingText(i.text, 'progress item');
      if (r.noticed) { assertUserSafeCoachingText(r.noticed.headline); assertUserSafeCoachingText(r.noticed.body); }
    }
  });
});
