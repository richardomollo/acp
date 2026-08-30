import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressExplanation } from '../coaching/progress-explanation.ts';
import { assertUserSafeCoachingText } from '../coaching/copy-safety.ts';
import type { CoachingMemoryRow } from '../coaching-memory.ts';

const row = (o: Partial<CoachingMemoryRow>): CoachingMemoryRow => ({
  memory_type: 'category_success', subject: 'strength', confidence: 'strong', evidence: {}, user_message: null, ...o,
});
const checkSafe = (r: ReturnType<typeof buildProgressExplanation>) => {
  r.items.forEach(i => assertUserSafeCoachingText(i.text, 'progress item'));
  if (r.noticed) { assertUserSafeCoachingText(r.noticed.headline); assertUserSafeCoachingText(r.noticed.body); }
};

describe('buildProgressExplanation (section 25 hierarchy)', () => {
  test('lose_weight + aligned positive trend surfaces first', () => {
    const memory = [
      row({ memory_type: 'overall_summary', evidence: { window: { weeks_used: 3 }, overall: { planned_sessions: 12, completed_sessions: 10 }, trend: { direction: 'improving' } } }),
      row({ memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong', evidence: { direction: 'outcome_progressing', first: 84, latest: 82, observations: 4 }, user_message: 'Your weight has moved toward your goal' }),
    ];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.equal(r.insufficientData, false);
    assert.match(r.items[0].text, /weight has moved toward your goal/);
    assert.equal(r.items[0].provenance.source, 'outcome');
    assert.ok(r.items.some(i => /Across your last 12 planned activities, you completed 10/.test(i.text)));
    checkSafe(r);
  });

  test('build_muscle + aligned muscle-mass trend', () => {
    const memory = [row({ memory_type: 'outcome_progress', subject: 'muscle_mass', confidence: 'moderate', evidence: { direction: 'body_composition_progressing', first: 40, latest: 41, observations: 3 }, user_message: 'Your muscle mass is trending up' })];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.match(r.items[0].text, /muscle mass is trending up/);
    checkSafe(r);
  });

  test('conflicting metrics: a non-positive outcome read is still shown factually, after positives', () => {
    const memory = [
      row({ memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong', evidence: { direction: 'outcome_stable', first: 80, latest: 80, observations: 4 }, user_message: 'Your weight has held steady' }),
      row({ memory_type: 'outcome_progress', subject: 'waist', confidence: 'strong', evidence: { direction: 'body_composition_progressing', first: 90, latest: 87, observations: 4 }, user_message: 'Your waist is trending down' }),
    ];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.match(r.items[0].text, /waist is trending down/); // positive first
    assert.match(r.items[1].text, /held steady/);
    checkSafe(r);
  });

  test('insufficient evidence → no items, no noticed, flag set', () => {
    const r = buildProgressExplanation({ coachingMemory: [] });
    assert.equal(r.insufficientData, true);
    assert.equal(r.items.length, 0);
    assert.equal(r.noticed, null);
  });

  test('emerging-only memory is treated as insufficient', () => {
    const memory = [row({ memory_type: 'category_success', confidence: 'emerging', evidence: { rate: 1, planned: 2, completed: 2 }, user_message: 'early pattern' })];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.equal(r.insufficientData, true);
  });

  test('strong coaching memory produces an "ACP noticed" line and a success item', () => {
    const memory = [row({ memory_type: 'category_success', subject: 'strength', confidence: 'strong', evidence: { rate: 1, planned: 6, completed: 6 }, user_message: "You've stayed consistent with strength training" })];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.ok(r.noticed);
    assert.match(r.noticed!.headline, /consistent with strength training/);
    assert.ok(r.items.some(i => /stayed consistent with strength training/.test(i.text)));
    checkSafe(r);
  });

  test('inactive/stale memory is never passed in — helper only sees active rows (documented contract)', () => {
    // The caller filters .eq('active', true); this asserts the shape assumption:
    // difficulty rows are not shown as "noticed" positives.
    const memory = [row({ memory_type: 'category_difficulty', subject: 'cardio', confidence: 'strong', evidence: { rate: 0.2 }, user_message: 'cardio has been hard' })];
    const r = buildProgressExplanation({ coachingMemory: memory });
    assert.equal(r.noticed, null);
    assert.ok(!r.items.some(i => /hard/i.test(i.text)));
  });

  test('no causal language anywhere', () => {
    const memory = [
      row({ memory_type: 'overall_summary', evidence: { overall: { planned_sessions: 9, completed_sessions: 8 }, trend: { direction: 'improving' } } }),
      row({ memory_type: 'outcome_progress', subject: 'weight', confidence: 'strong', evidence: { direction: 'outcome_progressing', first: 84, latest: 81, observations: 5 }, user_message: 'Your weight has moved toward your goal' }),
    ];
    const r = buildProgressExplanation({ coachingMemory: memory, weeklyProgress: { completed: 2, total: 4 } });
    const all = r.items.map(i => i.text).join(' ') + ' ' + (r.noticed?.body ?? '');
    assert.ok(!/because (your|the|these) (workout|training|exercise)/i.test(all));
    assert.ok(!/\bcaused\b/i.test(all));
  });
});
