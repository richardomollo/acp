import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSharedLanaPlanOccurrences,
  getSharedLanaPlanWeek,
  groupSharedLanaByClient,
} from '../shared-lana-plan.ts';
import { buildClientProgress, type ProgressContext } from '../progress.ts';
import type { SupabaseLike, QueryBuilder, QueryResult } from '../../lana-pro-intelligence/aggregator.ts';

function fakeRpc(canned: { data?: unknown; error?: unknown; throws?: unknown }) {
  const calls: unknown[] = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (canned.throws) return Promise.reject(canned.throws);
      return Promise.resolve({ data: canned.data ?? null, error: canned.error ?? null });
    },
  };
}

describe('getSharedLanaPlanOccurrences — the one RPC access boundary', () => {
  const row = (o: Partial<Record<string, unknown>>) => ({
    client_user_id: 'c-1', planned_date: '2026-09-07', title: 'Heavy Lower',
    category: 'strength', duration_minutes: 60, completed: true, ...o,
  });

  test('maps RPC rows to SharedLanaOccurrence; passes the exact function + args', async () => {
    const c = fakeRpc({ data: [row({}), row({ planned_date: '2026-09-09', completed: false, category: null, duration_minutes: null })] });
    const out = await getSharedLanaPlanOccurrences(c, ['c-1'], '2026-08-17', '2026-09-13');
    assert.deepEqual(c.calls, [{ fn: 'lana_pro_shared_plan_occurrences', args: { p_clients: ['c-1'], p_from: '2026-08-17', p_to: '2026-09-13' } }]);
    assert.deepEqual(out, [
      { clientUserId: 'c-1', date: '2026-09-07', title: 'Heavy Lower', category: 'strength', durationMinutes: 60, completed: true },
      { clientUserId: 'c-1', date: '2026-09-09', title: 'Heavy Lower', category: null, durationMinutes: null, completed: false },
    ]);
  });

  test('empty id list → no RPC call, [] ', async () => {
    const c = fakeRpc({ data: [row({})] });
    assert.deepEqual(await getSharedLanaPlanOccurrences(c, [], 'a', 'b'), []);
    assert.deepEqual(c.calls, []);
  });

  test('RPC error → [] (never throws — Client Progress must survive)', async () => {
    assert.deepEqual(await getSharedLanaPlanOccurrences(fakeRpc({ error: { message: 'nope' } }), ['c-1'], 'a', 'b'), []);
    assert.deepEqual(await getSharedLanaPlanOccurrences(fakeRpc({ data: 'not-an-array' }), ['c-1'], 'a', 'b'), []);
  });

  test('drops rows missing a date or client id; `completed` only true for boolean true', async () => {
    const c = fakeRpc({ data: [row({ planned_date: null }), row({ client_user_id: null }), row({ completed: 'yes' })] });
    const out = await getSharedLanaPlanOccurrences(c, ['c-1'], 'a', 'b');
    assert.equal(out.length, 1);
    assert.equal(out[0].completed, false);
  });

  test('groupSharedLanaByClient buckets by clientUserId', () => {
    const g = groupSharedLanaByClient([
      { clientUserId: 'a', date: '2026-09-07', title: 'x', category: null, durationMinutes: null, completed: true },
      { clientUserId: 'b', date: '2026-09-08', title: 'y', category: null, durationMinutes: null, completed: false },
      { clientUserId: 'a', date: '2026-09-09', title: 'z', category: null, durationMinutes: null, completed: false },
    ]);
    assert.equal(g.get('a')?.length, 2);
    assert.equal(g.get('b')?.length, 1);
  });
});

// ═══ REGRESSION — "Training this week" empty after the shared-plan RPC ═══════
describe('getSharedLanaPlanWeek — load-failed vs loaded-empty (§15/§21)', () => {
  const row = (o: Partial<Record<string, unknown>> = {}) => ({
    client_user_id: 'c-1', planned_date: '2026-09-07', title: 'Heavy Lower',
    category: 'strength', duration_minutes: 60, completed: false, ...o,
  });

  test('ok:true with rows when the RPC succeeds', async () => {
    const r = await getSharedLanaPlanWeek(fakeRpc({ data: [row(), row({ planned_date: '2026-09-08', title: 'Heavy Upper' })] }), ['c-1'], 'a', 'b');
    assert.equal(r.ok, true);
    assert.equal(r.occurrences.length, 2);
  });

  test('ok:true, [] when the RPC succeeds with no rows (client genuinely has no plan)', async () => {
    const r = await getSharedLanaPlanWeek(fakeRpc({ data: [] }), ['c-1'], 'a', 'b');
    assert.deepEqual(r, { ok: true, occurrences: [] });
  });

  test('§16/§21 — PGRST202 (function not deployed) → ok:false, NOT a factual empty', async () => {
    const r = await getSharedLanaPlanWeek(
      fakeRpc({ error: { code: 'PGRST202', message: 'Could not find the function public.lana_pro_shared_plan_occurrences' } }),
      ['c-1'], 'a', 'b',
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.occurrences, []);
    assert.match((r as { error: string }).error, /PGRST202/);
  });

  test('a thrown/network error → ok:false (never throws)', async () => {
    const r = await getSharedLanaPlanWeek(fakeRpc({ throws: new Error('fetch failed') }), ['c-1'], 'a', 'b');
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /fetch failed/);
  });

  test('non-array data → ok:false', async () => {
    const r = await getSharedLanaPlanWeek(fakeRpc({ data: 'nope' }), ['c-1'], 'a', 'b');
    assert.equal(r.ok, false);
  });

  test('empty id list → ok:true, [] (no RPC call)', async () => {
    const c = fakeRpc({ data: [row()] });
    assert.deepEqual(await getSharedLanaPlanWeek(c, [], 'a', 'b'), { ok: true, occurrences: [] });
    assert.deepEqual(c.calls, []);
  });

  test('the list-only wrapper still returns [] on failure (Home degrade path)', async () => {
    assert.deepEqual(await getSharedLanaPlanOccurrences(fakeRpc({ error: { code: 'PGRST202' } }), ['c-1'], 'a', 'b'), []);
  });
});

// ═══ REGRESSION — the 5 Lana occurrences must reach trainingProgress (§20) ══
describe('buildClientProgress — Lana-plan-only client, RPC returns 5 (§20/§23)', () => {
  type Canned = Record<string, { rows?: Record<string, unknown>[] }>;
  class FakeSupabase implements SupabaseLike {
    private canned: Canned;
    constructor(canned: Canned) { this.canned = canned; }
    from(table: string): QueryBuilder {
      const all = (this.canned[table]?.rows ?? []) as Record<string, unknown>[];
      let limit = Infinity;
      const preds: ((r: Record<string, unknown>) => boolean)[] = [];
      const rows = () => all.filter((r) => preds.every((p) => p(r))).slice(0, limit);
      const result = (): QueryResult => ({ data: rows(), error: null, count: rows().length });
      const b: QueryBuilder = {
        select: () => b, eq: (c, v) => (preds.push((r) => r[c] === v), b),
        neq: () => b, in: (c, vs) => (preds.push((r) => (vs as unknown[]).includes(r[c])), b),
        gte: () => b, lte: () => b, not: () => b, order: () => b, limit: (n) => ((limit = n), b),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (ok) => Promise.resolve(result()).then(ok as never),
      };
      return b;
    }
  }
  const CTX: ProgressContext = { workspace: 'independent', professionalId: 'pt-1', clientUserId: 'c-1', todayLocalDate: '2026-09-09' };
  const canned: Canned = {
    pt_clients: { rows: [{ pt_id: 'pt-1', client_user_id: 'c-1', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' }] },
    users: { rows: [{ id: 'c-1', name: 'Richard', email: null }] },
    workout_schedules: { rows: [] }, // no PT plan — same as the affected client
    workout_history: { rows: [] },
  };
  // exactly what the deployed RPC returns for the affected week
  const five = [
    { date: '2026-09-07', title: 'Heavy Lower', category: 'strength', durationMinutes: 60, completed: true },
    { date: '2026-09-08', title: 'Heavy Upper', category: 'strength', durationMinutes: 60, completed: true },
    { date: '2026-09-09', title: 'Conditioning + Mobility', category: 'cardio', durationMinutes: 40, completed: true },
    { date: '2026-09-10', title: 'Lower Volume', category: 'strength', durationMinutes: 50, completed: false },
    { date: '2026-09-11', title: 'Upper Volume + Short Cardio', category: 'strength', durationMinutes: 55, completed: false },
  ];

  test('trainingProgress.planned === 5 and sessions.length === 5 (all lana_plan)', async () => {
    const out = await buildClientProgress(new FakeSupabase(canned), CTX, five);
    assert.equal(out.state, 'ok');
    assert.equal(out.trainingProgress.planned, 5);
    assert.equal(out.trainingProgress.sessions.length, 5);
    assert.ok(out.trainingProgress.sessions.every((s) => s.source === 'lana_plan'));
    assert.deepEqual(out.trainingProgress.sessions.map((s) => s.workoutTitle), five.map((f) => f.title));
    // today = Wed 09-09: Mon/Tue done → completed, Wed done → completed, Thu/Fri future → upcoming
    assert.deepEqual(out.trainingProgress.sessions.map((s) => s.status), ['completed', 'completed', 'completed', 'upcoming', 'upcoming']);
  });

  test('RPC-failed path: [] occurrences → planned 0 (buildClientProgress fabricates nothing)', async () => {
    const out = await buildClientProgress(new FakeSupabase(canned), CTX, []);
    assert.equal(out.trainingProgress.planned, 0);
    assert.equal(out.trainingProgress.sessions.length, 0);
  });
});
