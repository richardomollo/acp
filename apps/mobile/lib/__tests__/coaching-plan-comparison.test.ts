import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareWeeklyPlans, describePlanChanges, normalizeWeekday } from '../coaching/plan-comparison.ts';
import { assertUserSafeCoachingText } from '../coaching/copy-safety.ts';
import type { StartingPlanActivity } from '../ai-assessment.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
const safe = (lines: string[]) => lines.forEach(l => assertUserSafeCoachingText(l, 'plan change line'));

describe('normalizeWeekday', () => {
  test('known weekday variants normalize', () => {
    assert.equal(normalizeWeekday('Monday'), 'Monday');
    assert.equal(normalizeWeekday('mon'), 'Monday');
    assert.equal(normalizeWeekday(' WEDNESDAY '), 'Wednesday');
    assert.equal(normalizeWeekday('Fri.'), 'Friday');
  });
  test('unknown / free-form strings normalize to null (section 21)', () => {
    assert.equal(normalizeWeekday('whenever I can'), null);
    assert.equal(normalizeWeekday('day 1'), null);
    assert.equal(normalizeWeekday(''), null);
    assert.equal(normalizeWeekday(undefined), null);
  });
});

describe('compareWeeklyPlans', () => {
  test('identical plans → materiallyUnchanged, no deltas', () => {
    const plan = [act({ day: 'Monday' }), act({ day: 'Thursday', category: 'cardio', activity: 'Run' })];
    const d = compareWeeklyPlans(plan, plan);
    assert.equal(d.materiallyUnchanged, true);
    assert.equal(d.minutesDelta, 0);
    assert.equal(d.sessionCountDelta, 0);
    assert.deepEqual(describePlanChanges(d), ['Not much — your current plan is working well enough to continue.']);
  });

  test('a tiny minutes delta (< floor and < ratio) is not meaningful', () => {
    const prev = [act({ duration_minutes: 60 }), act({ day: 'Thu', duration_minutes: 60 })];
    const curr = [act({ duration_minutes: 62 }), act({ day: 'Thu', duration_minutes: 60 })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.minutesDelta, 2);
    assert.equal(d.materiallyUnchanged, true);
  });

  test('weekly minutes meaningfully decreased', () => {
    const prev = [act({ duration_minutes: 90 }), act({ day: 'Thu', duration_minutes: 90 })];
    const curr = [act({ duration_minutes: 55 }), act({ day: 'Thu', duration_minutes: 55 })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.minutesDelta, -70);
    assert.equal(d.materiallyUnchanged, false);
    const lines = describePlanChanges(d);
    safe(lines);
    assert.ok(lines.some(l => /training time is about 70 minutes lower/.test(l)));
  });

  test('weekly minutes meaningfully increased', () => {
    const prev = [act({ duration_minutes: 40 }), act({ day: 'Thu', duration_minutes: 40 })];
    const curr = [act({ duration_minutes: 65 }), act({ day: 'Thu', duration_minutes: 65 })];
    const d = compareWeeklyPlans(prev, curr);
    assert.ok(describePlanChanges(d).some(l => /about 50 minutes higher/.test(l)));
  });

  test('a session added', () => {
    const prev = [act({ day: 'Monday' }), act({ day: 'Thursday' })];
    const curr = [act({ day: 'Monday' }), act({ day: 'Wednesday' }), act({ day: 'Friday' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.sessionCountDelta, 1);
    assert.equal(d.addedActivities.length, 1);
    const lines = describePlanChanges(d);
    safe(lines);
    assert.ok(lines.some(l => /1 more session this week/.test(l)));
  });

  test('a session removed', () => {
    const prev = [act({ day: 'Monday' }), act({ day: 'Wednesday' }), act({ day: 'Friday' })];
    const curr = [act({ day: 'Monday' }), act({ day: 'Thursday' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.sessionCountDelta, -1);
    assert.ok(describePlanChanges(d).some(l => /1 fewer session this week/.test(l)));
  });

  test('a different activity type added and one removed (category mix change)', () => {
    const prev = [act({ day: 'Monday', category: 'strength', activity: 'Gym' }), act({ day: 'Thursday', category: 'strength', activity: 'Gym' })];
    const curr = [act({ day: 'Monday', category: 'strength', activity: 'Gym' }), act({ day: 'Thursday', category: 'cardio', activity: 'Run' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.addedActivities[0].activity, 'Run');
    assert.equal(d.removedActivities[0].activity, 'Gym');
    assert.equal(d.sessionCountDelta, 0);
    const lines = describePlanChanges(d);
    safe(lines);
    assert.ok(lines.some(l => /still have 2 sessions/.test(l)));
  });

  test('activity retained but moved to a different known weekday', () => {
    const prev = [act({ day: 'Tuesday', category: 'strength', activity: 'Gym' })];
    const curr = [act({ day: 'Wednesday', category: 'strength', activity: 'Gym' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.scheduleChanges.length, 1);
    assert.deepEqual(d.scheduleChanges[0], { category: 'strength', activity: 'Gym', fromDay: 'Tuesday', toDay: 'Wednesday' });
    const lines = describePlanChanges(d);
    safe(lines);
    assert.ok(lines.some(l => /Tuesday gym session moved to Wednesday/.test(l)));
  });

  test('unknown/free-form day is not turned into a "moved" sentence', () => {
    const prev = [act({ day: 'whenever', category: 'strength', activity: 'Gym' })];
    const curr = [act({ day: 'sometime else', category: 'strength', activity: 'Gym' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.scheduleChanges.length, 0);
  });

  test('intensity stepped up on a retained session → one more demanding session', () => {
    const prev = [act({ day: 'Monday', intensity: 'moderate' }), act({ day: 'Wednesday', intensity: 'challenging' })];
    const curr = [act({ day: 'Monday', intensity: 'challenging' }), act({ day: 'Wednesday', intensity: 'challenging' })];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.intensityChanges.length, 1);
    assert.equal(d.intensityChanges[0].from, 'moderate');
    assert.equal(d.intensityChanges[0].to, 'challenging');
    assert.ok(describePlanChanges(d).some(l => /1 more demanding session/.test(l)));
  });

  test('H1-shaped change: same minutes, sessions re-spaced + one intensity bump → not "unchanged", describable, safe', () => {
    const prev = [
      act({ day: 'Monday', intensity: 'challenging', duration_minutes: 70 }),
      act({ day: 'Tuesday', intensity: 'challenging', duration_minutes: 70 }),
      act({ day: 'Thursday', intensity: 'moderate', duration_minutes: 60 }),
      act({ day: 'Saturday', category: 'recovery', activity: 'Walk', intensity: 'light', duration_minutes: 30 }),
    ];
    const curr = [
      act({ day: 'Monday', intensity: 'challenging', duration_minutes: 60 }),
      act({ day: 'Wednesday', intensity: 'challenging', duration_minutes: 60 }),
      act({ day: 'Friday', intensity: 'challenging', duration_minutes: 60 }),
      act({ day: 'Sunday', category: 'recovery', activity: 'Walk', intensity: 'light', duration_minutes: 52 }),
    ];
    const d = compareWeeklyPlans(prev, curr);
    assert.equal(d.materiallyUnchanged, false);
    assert.equal(d.sessionCountDelta, 0);
    const lines = describePlanChanges(d);
    safe(lines);
    assert.ok(lines.length >= 1 && lines.length <= 4);
    // never surfaces the internal label
    assert.ok(!lines.join(' ').toLowerCase().includes('rebalance'));
    assert.ok(!lines.join(' ').toLowerCase().includes('progress'));
  });
});
