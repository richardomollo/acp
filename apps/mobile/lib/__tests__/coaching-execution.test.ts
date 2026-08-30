import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressExplanation } from '../coaching/progress-explanation.ts';
import { buildWeeklyCoachingBrief } from '../coaching/coaching-brief.ts';
import { buildPlanExplanation } from '../coaching/plan-explanation.ts';
import { assertUserSafeCoachingText, findBannedPhrases } from '../coaching/copy-safety.ts';
import type { AIAssessment, StartingPlanActivity } from '../ai-assessment.ts';
import type { CoachingMemoryRow } from '../coaching-memory.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
function mkAssessment(o: Partial<AIAssessment> = {}): AIAssessment {
  return {
    headline: 'x', summary: 'x',
    starting_point: { experience: 'intermediate', available_time: '4 hours', main_barriers: [] },
    recommendation: { approach: 'self_directed', title: 'x', reason: 'x' },
    support_opportunities: [],
    starting_plan: { title: 'x', rationale: 'x', activities: [act({ day: 'Monday' }), act({ day: 'Wednesday' }), act({ day: 'Friday' })] },
    weekly_focus: { title: 'x', description: 'x' },
    next_steps: ['x'],
    ...o,
  };
}
const execMem = (direction: 'too_hard' | 'time_barrier', confidence: 'emerging' | 'moderate' | 'strong', msg: string): CoachingMemoryRow => ({
  memory_type: 'execution_pattern',
  subject: direction === 'too_hard' ? 'difficulty_fit' : 'time_fit',
  confidence,
  evidence: { direction, weeks_observed: 3 },
  user_message: msg,
});

const DIFFICULTY_MEM = execMem('too_hard', 'moderate', 'Several recent sessions have felt harder than expected.');
const TIME_MEM = execMem('time_barrier', 'strong', 'Time has been the most common reason activities were hard to fit into recent weeks.');

describe('Day 9 — execution memory in Day 8 surfaces', () => {
  test('progress explanation: execution pattern becomes an item AND the "ACP noticed" line', () => {
    const r = buildProgressExplanation({ coachingMemory: [DIFFICULTY_MEM] });
    assert.ok(r.items.some(i => /harder than expected/.test(i.text)));
    assert.ok(r.noticed);
    assert.match(r.noticed!.headline, /harder than expected/);
    r.items.forEach(i => assertUserSafeCoachingText(i.text));
    assertUserSafeCoachingText(r.noticed!.headline);
  });

  test('progress explanation: emerging execution memory is NOT surfaced (section 26)', () => {
    const r = buildProgressExplanation({ coachingMemory: [execMem('too_hard', 'emerging', 'early signal')] });
    assert.ok(!r.items.some(i => /early signal/.test(i.text)));
    assert.equal(r.noticed, null);
  });

  test('coaching brief: repeated execution pattern surfaces as an "ACP noticed" focus, safely', () => {
    const b = buildWeeklyCoachingBrief({
      assessment: mkAssessment(),
      previousActivities: mkAssessment().starting_plan.activities,
      lastWeek: { completed: 3, planned: 3 },
      coachingMemory: [TIME_MEM],
    });
    assert.match(b.headline, /noticed a pattern/i);
    assert.equal(b.provenance.detail, 'execution_pattern');
    for (const s of [b.headline, b.observation, b.guidance, ...b.evidence.map(e => e.text)]) assertUserSafeCoachingText(s);
  });

  test('why-this-plan: difficulty execution pattern → "stays manageable" reason (section 41)', () => {
    const reasons = buildPlanExplanation({ assessment: mkAssessment(), goal: 'build_muscle', coachingMemory: [DIFFICULTY_MEM] });
    const [exec] = reasons.filter(r => r.type === 'execution');
    assert.ok(exec);
    assert.match(exec.explanation, /harder than expected/);
    assert.match(exec.explanation, /manageable/);
    assert.ok(!/muscle|recover(y)? time|under-recovered|overtrained/i.test(exec.explanation));
  });

  test('why-this-plan: time execution pattern → "shorter blocks" reason', () => {
    const reasons = buildPlanExplanation({ assessment: mkAssessment(), goal: 'lose_weight', coachingMemory: [TIME_MEM] });
    const [exec] = reasons.filter(r => r.type === 'execution');
    assert.ok(exec);
    assert.match(exec.explanation, /shorter blocks/);
  });

  test('why-this-plan: no execution memory → no execution reason', () => {
    const reasons = buildPlanExplanation({ assessment: mkAssessment(), goal: 'build_muscle', coachingMemory: [] });
    assert.equal(reasons.filter(r => r.type === 'execution').length, 0);
  });

  test('no execution memory → Day 8 surfaces unchanged (no shame, no medical, no invented pattern)', () => {
    const r = buildProgressExplanation({ coachingMemory: [] });
    assert.equal(r.insufficientData, true);
  });
});

describe('Day 9 — copy-safety extensions (section 72)', () => {
  test('flags execution-judgement / body-verdict phrasing', () => {
    for (const bad of [
      'You are lazy and unmotivated',
      'You lack motivation',
      'You failed again this week',
      'Your fitness is poor',
      "You're overtrained",
      "You're injured",
      'You need more recovery',
      'ACP detected fatigue this week',
      'You skipped running 3 times',
    ]) assert.ok(findBannedPhrases(bad).length > 0, bad);
  });
  test('passes the neutral, factual framings we actually generate', () => {
    for (const ok of [
      'Several recent sessions have felt harder than expected.',
      'Time has been the most common reason activities were hard to fit into recent weeks.',
      'Recent sessions have mostly felt on the easy side.',
      'This week stays manageable while keeping your key work in place.',
    ]) assert.deepEqual(findBannedPhrases(ok), [], ok);
  });
});
