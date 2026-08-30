import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanExplanation } from '../coaching/plan-explanation.ts';
import { assertUserSafeCoachingText } from '../coaching/copy-safety.ts';
import type { AIAssessment, StartingPlanActivity } from '../ai-assessment.ts';
import type { CoachingMemoryRow } from '../coaching-memory.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
function mkAssessment(o: Partial<AIAssessment> = {}): AIAssessment {
  return {
    headline: 'x', summary: 'x',
    starting_point: { experience: 'beginner', available_time: '4 hours', main_barriers: ['time'] },
    recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
    support_opportunities: [],
    starting_plan: { title: 'x', rationale: 'x', activities: [
      act({ day: 'Monday', intensity: 'challenging' }),
      act({ day: 'Wednesday', intensity: 'challenging' }),
      act({ day: 'Friday', category: 'cardio', activity: 'Run', intensity: 'light' }),
    ] },
    weekly_focus: { title: 'x', description: 'x' },
    next_steps: ['x'],
    ...o,
  };
}
const checkSafe = (reasons: ReturnType<typeof buildPlanExplanation>) => reasons.forEach(r => {
  assertUserSafeCoachingText(r.title, 'reason title');
  assertUserSafeCoachingText(r.explanation, 'reason explanation');
});

describe('buildPlanExplanation (Why this plan?)', () => {
  test('at most 4 reasons, each typed and evidence-backed', () => {
    const reasons = buildPlanExplanation({
      assessment: mkAssessment(),
      goal: 'build_muscle',
      lastWeek: { completed: 3, planned: 4 },
      preferredActivities: ['gym', 'running'],
    });
    assert.ok(reasons.length > 0 && reasons.length <= 4);
    reasons.forEach(r => assert.ok(r.provenance && r.type && r.explanation));
    checkSafe(reasons);
  });

  test('goal reason names the goal and the foundation category, with no outcome guarantee', () => {
    const [goal] = buildPlanExplanation({ assessment: mkAssessment(), goal: 'build_muscle' }).filter(r => r.type === 'goal');
    assert.ok(goal);
    assert.match(goal.explanation, /build strength/);
    assert.match(goal.explanation, /strength training/);
    assert.ok(!/faster|guarantee|will build muscle/i.test(goal.explanation));
  });

  test('schedule reason quotes the stated availability, never invents it', () => {
    const [sched] = buildPlanExplanation({ assessment: mkAssessment(), goal: null }).filter(r => r.type === 'schedule');
    assert.ok(sched);
    assert.match(sched.explanation, /around 4 hours/);
  });
  test('no schedule reason when availability is blank', () => {
    const a = mkAssessment({ starting_point: { experience: 'x', available_time: '', main_barriers: [] } });
    assert.equal(buildPlanExplanation({ assessment: a, goal: null }).filter(r => r.type === 'schedule').length, 0);
  });

  // Beta Feedback #002 — training schedule preference (§25)
  test('when preferred days are set AND the plan sits within them, the schedule reason is the user-stated structure', () => {
    const reasons = buildPlanExplanation({
      assessment: mkAssessment(), // activities on Mon / Wed / Fri
      goal: null,
      preferredTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    });
    const [sched] = reasons.filter(r => r.type === 'schedule');
    assert.ok(sched);
    assert.match(sched.title, /days you prefer to train/i);
    assert.match(sched.explanation, /you told acp you prefer training monday to friday/i);
    assert.equal(sched.provenance.source, 'profile');
    assert.equal(sched.provenance.detail, 'training_schedule');
    assert.ok(!/optimal|acp determined|best for you/i.test(sched.explanation));
    checkSafe(reasons);
  });

  test('non-contiguous preferred days read as a plain list', () => {
    const [sched] = buildPlanExplanation({
      assessment: mkAssessment(),
      goal: null,
      preferredTrainingDays: ['monday', 'wednesday', 'friday'],
    }).filter(r => r.type === 'schedule');
    assert.match(sched.explanation, /monday, wednesday and friday/i);
  });

  test('falls back to the time-budget schedule reason when the plan does NOT fit the preferred days', () => {
    const a = mkAssessment({ starting_plan: { title: 'x', rationale: 'x', activities: [
      act({ day: 'Monday' }), act({ day: 'Saturday', category: 'cardio' }),
    ] } });
    const [sched] = buildPlanExplanation({
      assessment: a, goal: null,
      preferredTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], // Saturday not in here
    }).filter(r => r.type === 'schedule');
    assert.ok(sched);
    assert.match(sched.explanation, /around 4 hours/); // the time-budget reason
  });

  test('only one schedule reason is ever emitted', () => {
    const reasons = buildPlanExplanation({
      assessment: mkAssessment(),
      goal: null,
      preferredTrainingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    });
    assert.equal(reasons.filter(r => r.type === 'schedule').length, 1);
  });

  test('a single preferred day (below the 2-day minimum) is ignored — time reason stands', () => {
    const [sched] = buildPlanExplanation({
      assessment: mkAssessment(), goal: null, preferredTrainingDays: ['monday'],
    }).filter(r => r.type === 'schedule');
    assert.match(sched.explanation, /around 4 hours/);
  });

  test('adherence reason reflects last week (high → kept stable)', () => {
    const [adh] = buildPlanExplanation({ assessment: mkAssessment(), goal: null, lastWeek: { completed: 4, planned: 4 } }).filter(r => r.type === 'adherence');
    assert.match(adh.explanation, /completed 4 of 4/);
    assert.match(adh.explanation, /stable rather than adding more/);
  });
  test('adherence reason for a hard week is forward-framed, not shaming', () => {
    const [adh] = buildPlanExplanation({ assessment: mkAssessment(), goal: null, lastWeek: { completed: 1, planned: 4 } }).filter(r => r.type === 'adherence');
    assert.match(adh.explanation, /difficult to fit in/);
    assert.ok(!/only completed|you failed/i.test(adh.explanation));
  });

  test('recovery reason only appears when demanding sessions are on distinct known days (scheduling, not medical)', () => {
    const [rec] = buildPlanExplanation({ assessment: mkAssessment(), goal: null }).filter(r => r.type === 'recovery');
    assert.ok(rec);
    assert.match(rec.explanation, /spread across different days/);
    assert.ok(!/muscle|recover(y)? time|48 hours|under-recovered/i.test(rec.explanation));
  });
  test('no recovery reason when challenging sessions share a day or have unknown days', () => {
    const a = mkAssessment({ starting_plan: { title: 'x', rationale: 'x', activities: [
      act({ day: 'whenever', intensity: 'challenging' }), act({ day: 'whenever', intensity: 'challenging' }),
    ] } });
    assert.equal(buildPlanExplanation({ assessment: a, goal: null }).filter(r => r.type === 'recovery').length, 0);
  });

  test('barrier reason only when a difficulty memory or a low-adherence week makes it relevant', () => {
    const noEvidence = buildPlanExplanation({ assessment: mkAssessment(), goal: null, lastWeek: { completed: 4, planned: 4 } });
    assert.equal(noEvidence.filter(r => r.type === 'barrier').length, 0);

    const memory: CoachingMemoryRow[] = [{ memory_type: 'duration_difficulty', subject: 'long', confidence: 'moderate', evidence: { rate: 0.3 }, user_message: 'longer sessions have been harder to complete' }];
    const withEvidence = buildPlanExplanation({ assessment: mkAssessment(), goal: null, coachingMemory: memory });
    const [barrier] = withEvidence.filter(r => r.type === 'barrier');
    assert.ok(barrier);
    assert.match(barrier.explanation, /fitting exercise into your schedule/);
  });

  test('outcome reason surfaces only a positive trend, framed as an observation', () => {
    const memory: CoachingMemoryRow[] = [{ memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong', evidence: { direction: 'outcome_progressing', first: 84, latest: 82, observations: 4 }, user_message: 'weight toward goal' }];
    const [out] = buildPlanExplanation({ assessment: mkAssessment(), goal: 'lose_weight', coachingMemory: memory }).filter(r => r.type === 'outcome');
    assert.ok(out);
    assert.ok(!/because|caused|you are losing/i.test(out.explanation));
  });

  test('never contains a raw decision label', () => {
    const reasons = buildPlanExplanation({ assessment: mkAssessment(), goal: 'build_muscle', lastWeek: { completed: 3, planned: 4 }, preferredActivities: ['gym'] });
    const all = reasons.map(r => `${r.title} ${r.explanation}`).join(' ').toLowerCase();
    for (const w of ['rebalance', 'decision:', 'keep\n', 'adaptation decision']) assert.ok(!all.includes(w));
  });
});
