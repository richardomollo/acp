import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActivityExecutionEvidence, buildWeeklyExecutionSummary, buildCompactExecutionContext, buildExecutionPatterns,
  type ExecutionRecordInput, type WorkoutExecutionSignal, type WeeklyExecutionSummary,
} from '../execution.ts';
import type { StartingPlanActivity } from '../../onboarding-assessment/assessment.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
const rec = (o: Partial<ExecutionRecordInput> & { activityIndex: number }): ExecutionRecordInput =>
  ({ executionStatus: 'planned', ...o });

// ── Execution state (section 55) ────────────────────────────────────────────

describe('buildActivityExecutionEvidence — status resolution', () => {
  test('planned → completed (binary completion, no record)', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, undefined, undefined);
    assert.equal(ev.status, 'completed');
    assert.equal(ev.source, 'completion');
    assert.equal(ev.difficulty, undefined); // missing = unknown, never about_right
  });

  test('planned → skipped (explicit record, no completion)', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, false, rec({ activityIndex: 0, executionStatus: 'skipped', skipReason: 'no_time' }), undefined);
    assert.equal(ev.status, 'skipped');
    assert.equal(ev.skipReason, 'no_time');
  });

  test('planned → partial (explicit record + completion)', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, rec({ activityIndex: 0, executionStatus: 'partial' }), undefined);
    assert.equal(ev.status, 'partial');
  });

  test('partial from a linked workout completion_percentage between floor and 100', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, undefined, { activityIndex: 0, completionPercentage: 60 });
    assert.equal(ev.status, 'partial');
    assert.equal(ev.source, 'workout');
  });

  test('duration difference ALONE never implies partial (section 6)', () => {
    const ev = buildActivityExecutionEvidence(act({ duration_minutes: 60 }), 0, true, rec({ activityIndex: 0, executionStatus: 'completed', actualDurationMinutes: 40 }), undefined);
    assert.equal(ev.status, 'completed');
    assert.equal(ev.actualDurationMinutes, 40);
  });

  test('a very low completion_percentage (mis-tap) still counts as completed, not partial', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, undefined, { activityIndex: 0, completionPercentage: 5 });
    assert.equal(ev.status, 'completed');
  });

  test('skip → complete: a completion row now exists → status reflects completed, not skipped (section 48)', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, rec({ activityIndex: 0, executionStatus: 'skipped', skipReason: 'no_time' }), undefined);
    assert.equal(ev.status, 'completed');
    assert.equal(ev.skipReason, undefined); // skip reason not surfaced on a completed activity
  });

  test('explicit difficulty tap wins over a linked workout signal (section 18)', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, rec({ activityIndex: 0, executionStatus: 'completed', difficulty: 'about_right' }), { activityIndex: 0, perceivedDifficulty: 'difficult' });
    assert.equal(ev.difficulty, 'about_right');
  });

  test('linked guided-workout perceived_difficulty maps in when no explicit tap', () => {
    const ev = buildActivityExecutionEvidence(act(), 0, true, undefined, { activityIndex: 0, perceivedDifficulty: 'difficult' });
    assert.equal(ev.difficulty, 'too_hard');
  });

  test('actual duration prefers explicit user input, else workout/strava duration', () => {
    assert.equal(buildActivityExecutionEvidence(act(), 0, true, rec({ activityIndex: 0, executionStatus: 'completed', actualDurationMinutes: 52 }), { activityIndex: 0, durationMinutes: 60 }).actualDurationMinutes, 52);
    assert.equal(buildActivityExecutionEvidence(act(), 0, true, undefined, { activityIndex: 0, durationMinutes: 47 }).actualDurationMinutes, 47);
    assert.equal(buildActivityExecutionEvidence(act(), 0, true, undefined, undefined).actualDurationMinutes, undefined);
  });
});

// ── Weekly execution summary (section 59) ───────────────────────────────────

describe('buildWeeklyExecutionSummary', () => {
  const plan = [
    act({ day: 'Monday', category: 'strength' }),
    act({ day: 'Wednesday', category: 'strength' }),
    act({ day: 'Friday', category: 'cardio', activity: 'Run' }),
    act({ day: 'Saturday', category: 'recovery', activity: 'Walk' }),
  ];

  test('legacy binary-only week: all completed, no execution evidence', () => {
    const s = buildWeeklyExecutionSummary(plan, new Set([0, 1, 2, 3]), []);
    assert.equal(s.completedActivities, 4);
    assert.equal(s.partialActivities, 0);
    assert.equal(s.skippedActivities, 0);
    assert.equal(s.hasNoExecutionEvidence, true);
    assert.equal(s.actualMinutes, undefined);
  });

  test('mixed completed / partial / skipped with difficulty + skip reasons', () => {
    const s = buildWeeklyExecutionSummary(plan, new Set([0, 1]), [
      rec({ activityIndex: 0, executionStatus: 'completed', difficulty: 'too_hard' }),
      rec({ activityIndex: 1, executionStatus: 'partial', difficulty: 'about_right' }),
      rec({ activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' }),
      rec({ activityIndex: 3, executionStatus: 'skipped', skipReason: 'low_energy' }),
    ]);
    assert.equal(s.completedActivities, 1);
    assert.equal(s.partialActivities, 1);
    assert.equal(s.skippedActivities, 2);
    assert.deepEqual(s.difficultyCounts, { too_easy: 0, about_right: 1, too_hard: 1 });
    assert.deepEqual(s.skipReasonCounts, { no_time: 1, low_energy: 1 });
    assert.equal(s.categoryEvidence.strength.tooHard, 1);
    assert.equal(s.hasNoExecutionEvidence, false);
  });

  test('actual minutes only reported when at least one activity has a known duration', () => {
    const s = buildWeeklyExecutionSummary(plan, new Set([0, 1, 2, 3]), [
      rec({ activityIndex: 2, executionStatus: 'completed', actualDurationMinutes: 34 }),
    ]);
    assert.equal(s.actualMinutes, 34);
    assert.equal(s.knownDurationActivities, 1);
  });

  test('deterministic — same input, same output', () => {
    const args = () => buildWeeklyExecutionSummary(plan, new Set([0, 1]), [rec({ activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' })]);
    assert.deepEqual(args(), args());
  });
});

// ── Compact prompt context (section 35/61) ──────────────────────────────────

describe('buildCompactExecutionContext', () => {
  const plan = [act(), act({ day: 'Wed' }), act({ day: 'Fri', category: 'cardio', activity: 'Run' }), act({ day: 'Sat', category: 'recovery' })];

  test('empty string for a legacy binary-only week (changes nothing about the prompt)', () => {
    const s = buildWeeklyExecutionSummary(plan, new Set([0, 1, 2, 3]), []);
    assert.equal(buildCompactExecutionContext(s), '');
  });

  test('bounded block with counts, difficulty and skip tallies — no IDs / timestamps', () => {
    const s = buildWeeklyExecutionSummary(plan, new Set([0, 1]), [
      rec({ activityIndex: 0, executionStatus: 'completed', difficulty: 'too_hard' }),
      rec({ activityIndex: 1, executionStatus: 'completed', difficulty: 'about_right' }),
      rec({ activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' }),
      rec({ activityIndex: 3, executionStatus: 'skipped', skipReason: 'no_time' }),
    ]);
    const ctx = buildCompactExecutionContext(s);
    assert.match(ctx, /EXECUTION EVIDENCE/);
    assert.match(ctx, /Planned: 4 \| Completed: 2 \| Partial: 0 \| Skipped: 2/);
    assert.match(ctx, /Difficulty feedback: about_right 1, too_hard 1/);
    assert.match(ctx, /Skip reasons: no_time 2/);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(ctx), 'no UUIDs');
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(ctx), 'no ISO timestamps');
  });
});

// ── Pattern detection (section 60) ─────────────────────────────────────────

describe('buildExecutionPatterns — repeated evidence only', () => {
  const week = (o: Partial<WeeklyExecutionSummary>): WeeklyExecutionSummary => ({
    plannedActivities: 4, completedActivities: 4, partialActivities: 0, skippedActivities: 0,
    plannedMinutes: 240, knownDurationActivities: 0,
    difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 0 }, skipReasonCounts: {},
    categoryEvidence: {}, hasNoExecutionEvidence: false, ...o,
  });

  test('one "too_hard" week → no pattern', () => {
    const p = buildExecutionPatterns([week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 1 } }), week({})]);
    assert.equal(p.length, 0);
  });

  test('two "too_hard" weeks → moderate difficulty_fit pattern', () => {
    const p = buildExecutionPatterns([
      week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 2 } }),
      week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 1 } }),
    ]);
    assert.equal(p.length, 1);
    assert.equal(p[0].subject, 'difficulty_fit');
    assert.equal(p[0].confidence, 'moderate');
    assert.equal((p[0].evidence as any).direction, 'too_hard');
    assert.match(p[0].user_message, /harder than expected/);
  });

  test('three "too_hard" weeks → strong', () => {
    const p = buildExecutionPatterns([
      week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 1 } }),
      week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 1 } }),
      week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 1 } }),
    ]);
    assert.equal(p[0].confidence, 'strong');
  });

  test('one no_time skip → no pattern; repeated no_time skips → time_fit pattern', () => {
    assert.equal(buildExecutionPatterns([week({ skipReasonCounts: { no_time: 1 } }), week({})]).length, 0);
    const p = buildExecutionPatterns([
      week({ skippedActivities: 1, skipReasonCounts: { no_time: 1 } }),
      week({ skippedActivities: 1, skipReasonCounts: { schedule_changed: 1 } }),
    ]);
    assert.ok(p.some(x => x.subject === 'time_fit' && x.confidence === 'moderate'));
  });

  test('conflicting difficulty evidence → repeated too_hard wins, no over-confident too_easy pattern', () => {
    const p = buildExecutionPatterns([
      week({ difficultyCounts: { too_easy: 1, about_right: 0, too_hard: 1 } }),
      week({ difficultyCounts: { too_easy: 1, about_right: 0, too_hard: 1 } }),
    ]);
    assert.equal(p.filter(x => x.subject === 'difficulty_fit').length, 1);
    assert.equal((p.find(x => x.subject === 'difficulty_fit')!.evidence as any).direction, 'too_hard');
  });

  test('a single week of history → never a pattern', () => {
    assert.equal(buildExecutionPatterns([week({ difficultyCounts: { too_easy: 0, about_right: 0, too_hard: 3 } })]).length, 0);
  });
});
