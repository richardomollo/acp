import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyCoachingBrief } from '../coaching/coaching-brief.ts';
import { assertUserSafeCoachingText } from '../coaching/copy-safety.ts';
import type { AIAssessment, StartingPlanActivity } from '../ai-assessment.ts';
import type { CoachingMemoryRow, OverallProgress } from '../coaching-memory.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
function mkAssessment(o: Partial<AIAssessment> = {}): AIAssessment {
  return {
    headline: 'x', summary: 'x',
    starting_point: { experience: 'beginner', available_time: '4 hours', main_barriers: [] },
    recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
    support_opportunities: [],
    starting_plan: { title: 'x', rationale: 'x', activities: [act({ day: 'Monday' }), act({ day: 'Wednesday' }), act({ day: 'Friday' })] },
    weekly_focus: { title: 'Consistency', description: 'Complete each planned session before adding anything.' },
    next_steps: ['x'],
    ...o,
  };
}
function assertBriefSafe(b: ReturnType<typeof buildWeeklyCoachingBrief>) {
  assertUserSafeCoachingText(b.headline, 'brief headline');
  assertUserSafeCoachingText(b.observation, 'brief observation');
  assertUserSafeCoachingText(b.guidance, 'brief guidance');
  b.evidence.forEach(e => assertUserSafeCoachingText(e.text, 'brief evidence'));
  // never leak the internal label
  const all = `${b.headline} ${b.observation} ${b.guidance} ${b.evidence.map(e => e.text).join(' ')}`.toLowerCase();
  for (const w of ['rebalance', 'decision:', 'adaptation decision']) assert.ok(!all.includes(w), `leaked "${w}"`);
}

const overall = (o: Partial<OverallProgress>): OverallProgress => ({
  weeksUsed: 3, planned: 12, completed: 10, completionRate: 0.83,
  trendDirection: 'stable', trendEvidence: 'x', ...o,
});

describe('buildWeeklyCoachingBrief (section 40 ranking)', () => {
  test('first week — no history', () => {
    const b = buildWeeklyCoachingBrief({ assessment: mkAssessment(), isFirstWeek: true });
    assert.match(b.headline, /first plan/i);
    assert.equal(b.provenance.detail, 'first_week');
    assert.equal(b.primaryAction.route, '/my-plan');
    assertBriefSafe(b);
  });

  test('rank 1 — low adherence beats everything else', () => {
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      lastWeek: { completed: 1, planned: 4 },
      overall: overall({ trendDirection: 'improving' }),
    });
    assert.match(b.headline, /easier to complete/i);
    assert.match(b.observation, /difficult to complete/i);
    assert.match(b.guidance, /first \d+ session/i);
    assert.ok(!/only completed/i.test(b.observation));
    assert.equal(b.evidence[0].text, 'You completed 1 of 4 planned activities last week.'); // number kept in evidence, not headline
    assertBriefSafe(b);
  });

  test('rank 1 — declining trend also triggers the executability brief', () => {
    const b = buildWeeklyCoachingBrief({ assessment: mkAssessment(), overall: overall({ trendDirection: 'declining' }) });
    assert.match(b.headline, /easier to complete/i);
    assertBriefSafe(b);
  });

  test('rank 2 — meaningful plan change (re-spaced) when adherence is fine', () => {
    const prev = [act({ day: 'Monday', intensity: 'challenging' }), act({ day: 'Tuesday', intensity: 'challenging' }), act({ day: 'Thursday' })];
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment({ starting_plan: { title: 'x', rationale: 'x', activities: [act({ day: 'Monday', intensity: 'challenging' }), act({ day: 'Wednesday', intensity: 'challenging' }), act({ day: 'Friday' })] } }),
      previousActivities: prev,
      lastWeek: { completed: 3, planned: 3 },
    });
    assert.match(b.headline, /recovery|manageable|step forward/i);
    assert.equal(b.provenance.source, 'plan_change');
    assertBriefSafe(b);
  });

  test('rank 3 — positive outcome evidence when plan is stable', () => {
    const memory: CoachingMemoryRow[] = [{
      memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong',
      evidence: { direction: 'outcome_progressing', first: 84, latest: 82, observations: 4 },
      user_message: 'Your weight has moved toward your goal',
    }];
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 3, planned: 3 },
      coachingMemory: memory,
    });
    assert.match(b.headline, /progress is showing/i);
    assert.equal(b.observation, 'Your weight has moved toward your goal');
    assertBriefSafe(b);
  });

  test('rank 4 — coaching-memory pattern when no outcome', () => {
    const memory: CoachingMemoryRow[] = [{
      memory_type: 'category_success', subject: 'strength', confidence: 'strong',
      evidence: { rate: 1, planned: 6, completed: 6 },
      user_message: "You've stayed consistent with strength training for three weeks",
    }];
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 3, planned: 3 },
      coachingMemory: memory,
    });
    assert.match(b.headline, /noticed a pattern/i);
    assertBriefSafe(b);
  });

  test('rank 5 — high adherence / consistency', () => {
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 4, planned: 4 },
    });
    assert.match(b.headline, /strong week/i);
    assert.match(b.guidance, /consistency rather than adding more/i);
    assertBriefSafe(b);
  });

  test('rank 6 — neutral fallback (no memory, stable plan, mid adherence)', () => {
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 2, planned: 3 },
      coachingMemory: [],
    });
    assert.match(b.headline, /focus this week/i);
    assertBriefSafe(b);
  });

  test('insufficient outcome evidence is never surfaced as a trend', () => {
    const memory: CoachingMemoryRow[] = [{
      memory_type: 'outcome_progress', subject: 'weight', confidence: 'emerging',
      evidence: { direction: 'outcome_progressing', first: 84, latest: 83, observations: 2 },
      user_message: 'weight moving',
    }];
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 3, planned: 3 },
      coachingMemory: memory,
    });
    assert.ok(!/weight moving/i.test(b.observation)); // emerging confidence excluded
    assertBriefSafe(b);
  });
});
