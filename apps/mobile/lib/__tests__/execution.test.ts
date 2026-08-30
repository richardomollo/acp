import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileActivityExecution, summarizeWeekExecution, isFeedbackEligible,
  recordActivityFeedback, recordActivitySkip, clearActivityExecution,
  DIFFICULTY_OPTIONS, SKIP_REASON_OPTIONS,
  type PlanActivityExecutionRow,
} from '../execution.ts';
import type { StartingPlanActivity } from '../ai-assessment.ts';
import type { PlanActivityCompletion } from '../completion.ts';

function act(o: Partial<StartingPlanActivity> = {}): StartingPlanActivity {
  return { day: 'Monday', category: 'strength', activity: 'Gym', duration_minutes: 60, intensity: 'moderate', title: 'x', description: 'x', ...o };
}
function comp(activityIndex: number): PlanActivityCompletion {
  return { id: `c${activityIndex}`, planId: 'p', activityIndex, plannedDate: '2026-08-31', completedAt: '2026-08-31T10:00:00Z', completionSource: 'manual', sourceEntityId: null };
}
const row = (o: Partial<PlanActivityExecutionRow> & { activityIndex: number }): PlanActivityExecutionRow =>
  ({ executionStatus: 'planned', difficulty: null, skipReason: null, actualDurationMinutes: null, ...o });

// ── Execution state transitions (section 55) ────────────────────────────────

describe('reconcileActivityExecution', () => {
  test('planned → completed (binary completion, no row)', () => {
    assert.equal(reconcileActivityExecution(act(), 0, true, undefined).status, 'completed');
  });
  test('planned → skipped (row says skipped, no completion)', () => {
    const ev = reconcileActivityExecution(act(), 0, false, row({ activityIndex: 0, executionStatus: 'skipped', skipReason: 'no_time' }));
    assert.equal(ev.status, 'skipped');
    assert.equal(ev.skipReason, 'no_time');
  });
  test('planned → partial (row says partial + completion)', () => {
    assert.equal(reconcileActivityExecution(act(), 0, true, row({ activityIndex: 0, executionStatus: 'partial' })).status, 'partial');
  });
  test('skipped → completed: a completion now exists → status is completed, skip reason not surfaced (section 48)', () => {
    const ev = reconcileActivityExecution(act(), 0, true, row({ activityIndex: 0, executionStatus: 'skipped', skipReason: 'no_time' }));
    assert.equal(ev.status, 'completed');
    assert.equal(ev.skipReason, undefined);
  });
  test('partial → completed: row updated to completed', () => {
    assert.equal(reconcileActivityExecution(act(), 0, true, row({ activityIndex: 0, executionStatus: 'completed' })).status, 'completed');
  });
  test('feedback absent → difficulty is unknown, never about_right (section 9/54)', () => {
    assert.equal(reconcileActivityExecution(act(), 0, true, undefined).difficulty, undefined);
    assert.equal(reconcileActivityExecution(act(), 0, true, row({ activityIndex: 0, executionStatus: 'completed' })).difficulty, undefined);
  });
  test('feedback present → surfaced', () => {
    assert.equal(reconcileActivityExecution(act(), 0, true, row({ activityIndex: 0, executionStatus: 'completed', difficulty: 'too_hard' })).difficulty, 'too_hard');
  });
});

describe('isFeedbackEligible (section 10)', () => {
  test('strength / cardio / sport / mobility are eligible; recovery is not', () => {
    assert.equal(isFeedbackEligible({ category: 'strength' }), true);
    assert.equal(isFeedbackEligible({ category: 'cardio' }), true);
    assert.equal(isFeedbackEligible({ category: 'recovery' }), false);
  });
});

// ── Weekly execution summary (section 56/59) ───────────────────────────────

describe('summarizeWeekExecution', () => {
  const plan = [act(), act({ day: 'Wed' }), act({ day: 'Fri', category: 'cardio', activity: 'Run' }), act({ day: 'Sat', category: 'recovery' })];

  test('legacy binary-only week: all completed, no execution evidence', () => {
    const s = summarizeWeekExecution(plan, [comp(0), comp(1), comp(2), comp(3)], []);
    assert.equal(s.completed, 4);
    assert.equal(s.partial, 0);
    assert.equal(s.skipped, 0);
    assert.equal(s.hasExecutionEvidence, false);
  });

  test('partial is counted apart from completed and from skipped (section 56)', () => {
    const s = summarizeWeekExecution(plan, [comp(0), comp(1)], [
      row({ activityIndex: 1, executionStatus: 'partial', difficulty: 'about_right' }),
      row({ activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' }),
    ]);
    assert.equal(s.completed, 1);
    assert.equal(s.partial, 1);
    assert.equal(s.skipped, 1);
    assert.deepEqual(s.difficultyCounts, { too_easy: 0, about_right: 1, too_hard: 0 });
    assert.deepEqual(s.skipReasonCounts, { no_time: 1 });
  });

  test('deterministic', () => {
    const go = () => summarizeWeekExecution(plan, [comp(0)], [row({ activityIndex: 2, executionStatus: 'skipped', skipReason: 'no_time' })]);
    assert.deepEqual(go(), go());
  });
});

// ── Persistence helpers (section 46/57/58/70) ──────────────────────────────

function fakeSupabase() {
  const calls: any[] = [];
  const api = {
    from(table: string) {
      return {
        upsert: async (r: Record<string, unknown>, opts: { onConflict: string }) => {
          calls.push({ op: 'upsert', table, row: r, opts });
          return { error: null };
        },
        delete: () => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => ({
              eq: async (c3: string, v3: unknown) => {
                calls.push({ op: 'delete', table, filters: [[c1, v1], [c2, v2], [c3, v3]] });
                return { error: null };
              },
            }),
          }),
        }),
      };
    },
  };
  return { api: api as any, calls };
}

describe('recordActivityFeedback / recordActivitySkip / clearActivityExecution', () => {
  const ctx = { userId: 'u1', planId: 'p1', activityIndex: 2 };

  test('difficulty feedback upserts on the composite key, marked completed', async () => {
    const { api, calls } = fakeSupabase();
    const res = await recordActivityFeedback(api, ctx, 'too_hard');
    assert.equal(res.ok, true);
    assert.equal(calls[0].table, 'plan_activity_execution');
    assert.equal(calls[0].opts.onConflict, 'user_id,plan_id,activity_index');
    assert.equal(calls[0].row.difficulty, 'too_hard');
    assert.equal(calls[0].row.execution_status, 'completed');
  });

  test('partial:true marks the row partial', async () => {
    const { api, calls } = fakeSupabase();
    await recordActivityFeedback(api, ctx, 'about_right', { partial: true });
    assert.equal(calls[0].row.execution_status, 'partial');
  });

  test('a repeated tap is an upsert, not a second row (idempotent — section 46)', async () => {
    const { api, calls } = fakeSupabase();
    await recordActivityFeedback(api, ctx, 'too_hard');
    await recordActivityFeedback(api, ctx, 'about_right');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.op === 'upsert' && c.opts.onConflict === 'user_id,plan_id,activity_index'));
  });

  test('skip reason upserts execution_status=skipped', async () => {
    const { api, calls } = fakeSupabase();
    await recordActivitySkip(api, ctx, 'no_time');
    assert.equal(calls[0].row.execution_status, 'skipped');
    assert.equal(calls[0].row.skip_reason, 'no_time');
  });

  test('clearActivityExecution deletes by the composite key (undo — section 47)', async () => {
    const { api, calls } = fakeSupabase();
    await clearActivityExecution(api, ctx);
    assert.equal(calls[0].op, 'delete');
    assert.deepEqual(calls[0].filters, [['user_id', 'u1'], ['plan_id', 'p1'], ['activity_index', 2]]);
  });

  test('a persistence error is reported, not thrown (never rolls back a completion — section 70)', async () => {
    const api = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) } as any;
    const res = await recordActivityFeedback(api, ctx, 'too_hard');
    assert.equal(res.ok, false);
  });
});

describe('option lists use stable machine values', () => {
  test('difficulty', () => assert.deepEqual(DIFFICULTY_OPTIONS.map(o => o.value), ['too_easy', 'about_right', 'too_hard']));
  test('skip reasons — no medical categories', () => {
    const vals = SKIP_REASON_OPTIONS.map(o => o.value);
    assert.ok(vals.includes('no_time') && vals.includes('other'));
    assert.ok(!vals.some(v => /injur|pain|sick|ill|medical/.test(v)));
  });
});
