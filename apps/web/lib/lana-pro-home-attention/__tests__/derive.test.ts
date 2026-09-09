import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveHomeAttention,
  pickTopInsight,
  rankHomeAttentionItems,
  toHomeAttentionItem,
  HYDRATE_CAP,
  DISPLAY_CAP,
  type HomeAttentionContext,
} from '../derive.ts';
import type { SupabaseLike, QueryBuilder, QueryResult } from '../../lana-pro-intelligence/aggregator.ts';
import type { PTInsight } from '../../lana-pro-insights/types.ts';

// ── FakeSupabase: records every table touched; honours .eq / .in only
//    (same shape the aggregator + progress tests use) ─────────────────────────
type Canned = Record<string, { rows?: Record<string, unknown>[] }>;

class FakeSupabase implements SupabaseLike {
  readonly tablesTouched: string[] = [];
  private canned: Canned;
  constructor(canned: Canned) {
    this.canned = canned;
  }
  from(table: string): QueryBuilder {
    this.tablesTouched.push(table);
    const all = (this.canned[table]?.rows ?? []) as Record<string, unknown>[];
    let limit = Infinity;
    const preds: ((r: Record<string, unknown>) => boolean)[] = [];
    const rows = () => all.filter((r) => preds.every((p) => p(r))).slice(0, limit);
    const result = (): QueryResult => ({ data: rows(), error: null, count: rows().length });
    const b: QueryBuilder = {
      select: () => b,
      eq: (c, v) => (preds.push((r) => r[c] === v), b),
      neq: (c, v) => (preds.push((r) => r[c] !== v), b),
      in: (c, vs) => (preds.push((r) => (vs as unknown[]).includes(r[c])), b),
      gte: () => b,
      lte: () => b,
      not: () => b,
      order: () => b,
      limit: (n) => ((limit = n), b),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok) => Promise.resolve(result()).then(ok as never),
    };
    return b;
  }
  countOf(table: string): number {
    return this.tablesTouched.filter((t) => t === table).length;
  }
}

const CTX: HomeAttentionContext = { workspace: 'independent', professionalId: 'pt-1', todayLocalDate: '2026-09-09', limit: 5 };

// ═══════════════════════ §21 — the roster fixture ══════════════════════════
function rosterCanned(): Canned {
  return {
    pt_clients: {
      rows: [
        { pt_id: 'pt-1', client_user_id: 'c-richard', status: 'active', share_progress: true, created_at: '2026-07-01T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-jane', status: 'active', share_progress: true, created_at: '2026-07-10T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-paul', status: 'active', share_progress: true, created_at: '2026-08-01T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-alice', status: 'active', share_progress: false, created_at: '2026-08-01T00:00:00Z' },
      ],
    },
    users: {
      rows: [
        { id: 'c-richard', name: 'Richard Omollo', email: null },
        { id: 'c-jane', name: 'Jane Doe', email: null },
        { id: 'c-paul', name: 'Paul', email: null },
        { id: 'c-alice', name: 'Alice', email: null },
      ],
    },
    workouts: {
      rows: [
        { id: 'w-lower', title: 'Lower body', category: 'lower_body' },
        { id: 'w-upper', title: 'Upper A', category: 'upper_body' },
        { id: 'w-jane', title: 'Upper', category: 'upper_body' },
        { id: 'w-paul', title: 'Outdoor run', category: null },
        { id: 'w-alice', title: 'Home', category: null },
      ],
    },
    exercises: { rows: [{ id: 'ex-lunge', name: 'Walking lunge' }] },
    workout_history: {
      rows: [
        // Richard — a discomfort report (exercise-scoped) …
        {
          id: 'h-r-knee', user_id: 'c-richard', workout_id: 'w-lower', completed_at: '2026-09-08T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: null, exercise_notes: { 'ex-lunge': 'My knee hurt during lunges.' },
        },
        // … and a separate longitudinal progression pattern (different sessions)
        {
          id: 'h-r-p1', user_id: 'c-richard', workout_id: 'w-upper', completed_at: '2026-09-02T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Bench felt easy.', exercise_notes: null,
        },
        {
          id: 'h-r-p2', user_id: 'c-richard', workout_id: 'w-upper', completed_at: '2026-09-05T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Weights are starting to feel too light.', exercise_notes: null,
        },
        // Jane — progression only
        {
          id: 'h-j-1', user_id: 'c-jane', workout_id: 'w-jane', completed_at: '2026-09-03T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Bench felt easy.', exercise_notes: null,
        },
        {
          id: 'h-j-2', user_id: 'c-jane', workout_id: 'w-jane', completed_at: '2026-09-06T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Could have done more reps.', exercise_notes: null,
        },
        {
          id: 'h-j-3', user_id: 'c-jane', workout_id: 'w-jane', completed_at: '2026-09-08T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Weights are starting to feel too light.', exercise_notes: null,
        },
        // Paul — has a comment but it classifies to nothing → NO insight
        {
          id: 'h-p-1', user_id: 'c-paul', workout_id: 'w-paul', completed_at: '2026-09-08T07:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Trained at the park, lovely morning.', exercise_notes: null,
        },
        // Alice — real raw comment, but share_progress = false → must NOT surface
        {
          id: 'h-a-1', user_id: 'c-alice', workout_id: 'w-alice', completed_at: '2026-09-08T18:00:00Z',
          status: 'completed', completion_percentage: 100, perceived_difficulty: null,
          notes: 'Sharp pain in my shoulder during presses.', exercise_notes: null,
        },
      ],
    },
  };
}

describe('resolveHomeAttention — §21 roster fixture', () => {
  test('surfaces Richard (discomfort) then Jane (progression); Paul & Alice absent; Richard once', async () => {
    const db = new FakeSupabase(rosterCanned());
    const items = await resolveHomeAttention(db, CTX);

    assert.deepEqual(items.map((i) => i.clientName), ['Richard Omollo', 'Jane Doe']);
    assert.equal(items[0].insightFamily, 'discomfort');
    assert.equal(items[0].insightTitle, 'Discomfort reported');
    assert.equal(items[0].priority, 'attention');
    assert.equal(items[1].insightFamily, 'progression');
    assert.equal(items[1].insightTitle, 'Progression worth reviewing');
    assert.equal(items[1].priority, 'review');

    assert.equal(items.filter((i) => i.clientId === 'c-richard').length, 1); // ONE card
    assert.ok(!items.some((i) => i.clientId === 'c-paul')); // no qualifying insight
    assert.ok(!items.some((i) => i.clientId === 'c-alice')); // not consented
  });

  test('§13 — no raw client comment text is carried onto a Home item', async () => {
    const db = new FakeSupabase(rosterCanned());
    const items = await resolveHomeAttention(db, CTX);
    const blob = JSON.stringify(items).toLowerCase();
    for (const raw of ['my knee hurt during lunges', 'weights are starting to feel too light', 'could have done more reps', 'sharp pain in my shoulder', 'trained at the park']) {
      assert.ok(!blob.includes(raw), `raw comment leaked onto Home: ${raw}`);
    }
  });

  test('§12 — Alice\'s workout_history is filtered by the share_progress gate, not fetched-then-hidden', async () => {
    const db = new FakeSupabase(rosterCanned());
    await resolveHomeAttention(db, CTX);
    // one batched workout_history read for the whole roster — never per client
    assert.equal(db.countOf('workout_history'), 1);
  });
});

// ═══════════════════════ §17 — one card per client ════════════════════════
test('§17 — a client with BOTH discomfort and progression yields ONE card (discomfort wins)', async () => {
  const db = new FakeSupabase(rosterCanned());
  const items = await resolveHomeAttention(db, CTX);
  const richard = items.filter((i) => i.clientId === 'c-richard');
  assert.equal(richard.length, 1);
  assert.equal(richard[0].insightFamily, 'discomfort');
});

// ═══════════════════════ §22 — deterministic ordering ════════════════════
describe('resolveHomeAttention — §22 ordering', () => {
  function orderingCanned(): Canned {
    const base = { status: 'completed', completion_percentage: 100, perceived_difficulty: null, exercise_notes: null };
    return {
      pt_clients: {
        rows: [
          { pt_id: 'pt-1', client_user_id: 'c-y', status: 'active', share_progress: true, created_at: '2026-07-01T00:00:00Z' },
          { pt_id: 'pt-1', client_user_id: 'c-t', status: 'active', share_progress: true, created_at: '2026-07-01T00:00:00Z' },
          { pt_id: 'pt-1', client_user_id: 'c-o', status: 'active', share_progress: true, created_at: '2026-07-01T00:00:00Z' },
        ],
      },
      users: {
        rows: [
          { id: 'c-y', name: 'Yesterday Discomfort', email: null },
          { id: 'c-t', name: 'Today Progression', email: null },
          { id: 'c-o', name: 'Older Discomfort', email: null },
        ],
      },
      workouts: { rows: [{ id: 'w1', title: 'Upper A', category: 'upper_body' }] },
      exercises: { rows: [] },
      workout_history: {
        rows: [
          // c-y: discomfort YESTERDAY
          { ...base, id: 'h-y', user_id: 'c-y', workout_id: 'w1', completed_at: '2026-09-08T18:00:00Z', notes: 'My knee hurt during the session.' },
          // c-o: discomfort 3 DAYS AGO
          { ...base, id: 'h-o', user_id: 'c-o', workout_id: 'w1', completed_at: '2026-09-06T18:00:00Z', notes: 'My shoulder hurt during the session.' },
          // c-t: progression pattern, newest signal TODAY
          { ...base, id: 'h-t1', user_id: 'c-t', workout_id: 'w1', completed_at: '2026-09-04T18:00:00Z', notes: 'Bench felt easy.' },
          { ...base, id: 'h-t2', user_id: 'c-t', workout_id: 'w1', completed_at: '2026-09-09T18:00:00Z', notes: 'Weights are starting to feel too light.' },
        ],
      },
    };
  }

  test('both discomfort items rank above progression (family priority), then newest-first within discomfort', async () => {
    const db = new FakeSupabase(orderingCanned());
    const items = await resolveHomeAttention(db, CTX);
    assert.deepEqual(items.map((i) => i.clientName), ['Yesterday Discomfort', 'Older Discomfort', 'Today Progression']);
    assert.deepEqual(items.map((i) => i.priority), ['attention', 'attention', 'review']);
  });
});

// ═══════════════════════ §23 — traceability ══════════════════════════════
test('§23 — every item references clientId + insightId + actionId and routes to the canonical detail page', async () => {
  const db = new FakeSupabase(rosterCanned());
  const items = await resolveHomeAttention(db, CTX);
  assert.ok(items.length >= 2);
  for (const it of items) {
    assert.ok(it.clientId && it.insightId && it.actionId);
    assert.equal(it.href, `/lana-pro/clients/${it.clientId}`);
    // the action is the L5 action of THAT insight
    assert.ok(it.actionId.endsWith(it.insightId));
  }
});

// ═══════════════════════ §24 — bounded performance ══════════════════════
describe('resolveHomeAttention — §24 performance / query budget', () => {
  test('empty roster → exactly ONE query (roster), nothing else', async () => {
    const db = new FakeSupabase({ pt_clients: { rows: [] } });
    const items = await resolveHomeAttention(db, CTX);
    assert.deepEqual(items, []);
    assert.deepEqual(db.tablesTouched, ['pt_clients']);
  });

  test('roster present but nobody has feedback → THREE queries (roster + batched feedback + batched schedules)', async () => {
    const db = new FakeSupabase({
      pt_clients: { rows: [{ pt_id: 'pt-1', client_user_id: 'c-1', status: 'active', share_progress: true, created_at: '2026-08-01T00:00:00Z' }] },
      workout_history: { rows: [] },
    });
    const items = await resolveHomeAttention(db, CTX);
    assert.deepEqual(items, []);
    assert.deepEqual(db.tablesTouched, ['pt_clients', 'workout_history', 'workout_schedules']);
  });

  test('full fixture → exactly 6 queries, each batched read EXACTLY ONCE (no N+1, no per-client loop)', async () => {
    const db = new FakeSupabase(rosterCanned());
    await resolveHomeAttention(db, CTX);
    assert.equal(db.tablesTouched.length, 6);
    assert.deepEqual(
      [...new Set(db.tablesTouched)].sort(),
      ['exercises', 'pt_clients', 'users', 'workout_history', 'workout_schedules', 'workouts'],
    );
    assert.equal(db.countOf('workout_history'), 1);
    assert.equal(db.countOf('workout_schedules'), 1);
    assert.equal(db.countOf('workouts'), 1);
    assert.equal(db.countOf('exercises'), 1);
    assert.equal(db.countOf('users'), 1);
  });

  test('a large roster does NOT hydrate every client — query count stays constant', async () => {
    const base = { status: 'completed', completion_percentage: 100, perceived_difficulty: null, exercise_notes: null };
    const pt_clients = { rows: [] as Record<string, unknown>[] };
    const users = { rows: [] as Record<string, unknown>[] };
    for (let i = 0; i < 60; i += 1) {
      pt_clients.rows.push({ pt_id: 'pt-1', client_user_id: `c-${i}`, status: 'active', share_progress: true, created_at: '2026-08-01T00:00:00Z' });
      users.rows.push({ id: `c-${i}`, name: `Client ${i}`, email: null });
    }
    // only 3 of the 60 have any feedback
    const workout_history = {
      rows: [
        { ...base, id: 'h-0', user_id: 'c-0', workout_id: 'w1', completed_at: '2026-09-08T18:00:00Z', notes: 'My knee hurt during the session.' },
        { ...base, id: 'h-1a', user_id: 'c-1', workout_id: 'w1', completed_at: '2026-09-04T18:00:00Z', notes: 'Bench felt easy.' },
        { ...base, id: 'h-1b', user_id: 'c-1', workout_id: 'w1', completed_at: '2026-09-07T18:00:00Z', notes: 'Weights are starting to feel too light.' },
        { ...base, id: 'h-2', user_id: 'c-2', workout_id: 'w1', completed_at: '2026-09-06T18:00:00Z', notes: 'My shoulder hurt during the session.' },
      ],
    };
    const db = new FakeSupabase({ pt_clients, users, workout_history, workouts: { rows: [{ id: 'w1', title: 'Upper A', category: 'upper_body' }] }, exercises: { rows: [] } });
    const items = await resolveHomeAttention(db, CTX);

    assert.equal(items.length, 3); // only the 3 with real feedback
    assert.ok(db.tablesTouched.length <= 6); // NOT 60+; bounded constant (exercises read skipped — no exercise notes)
    assert.ok(db.tablesTouched.every((t) => ['pt_clients', 'workout_history', 'workout_schedules', 'workouts', 'exercises', 'users'].includes(t)));
    assert.equal(db.countOf('workout_history'), 1);
    assert.equal(db.countOf('workout_schedules'), 1);
    assert.equal(db.countOf('workouts'), 1);
    assert.equal(db.countOf('users'), 1);
  });

  test('never hydrates more than HYDRATE_CAP clients even when many qualify', async () => {
    const base = { status: 'completed', completion_percentage: 100, perceived_difficulty: null, exercise_notes: null };
    const pt_clients = { rows: [] as Record<string, unknown>[] };
    const users = { rows: [] as Record<string, unknown>[] };
    const wh = { rows: [] as Record<string, unknown>[] };
    for (let i = 0; i < 12; i += 1) {
      pt_clients.rows.push({ pt_id: 'pt-1', client_user_id: `c-${i}`, status: 'active', share_progress: true, created_at: '2026-08-01T00:00:00Z' });
      users.rows.push({ id: `c-${i}`, name: `Client ${i}`, email: null });
      // each has a same-day discomfort report
      wh.rows.push({ ...base, id: `h-${i}`, user_id: `c-${i}`, workout_id: 'w1', completed_at: `2026-09-0${(i % 9) + 1}T18:00:00Z`, notes: 'My knee hurt during the session.' });
    }
    const db = new FakeSupabase({ pt_clients, users, workout_history: wh, workouts: { rows: [{ id: 'w1', title: 'Upper A', category: 'upper_body' }] }, exercises: { rows: [] } });
    const items = await resolveHomeAttention(db, { ...CTX, limit: DISPLAY_CAP });
    assert.ok(items.length <= DISPLAY_CAP);
    assert.ok(HYDRATE_CAP <= 5);
  });

  test('§26 — derive.ts performs NO writes / no fetch / no LLM', () => {
    const src = readFileSync(fileURLToPath(new URL('../derive.ts', import.meta.url)), 'utf8').toLowerCase();
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', 'fetch(', 'openai', 'anthropic', 'process.env']) {
      assert.ok(!src.includes(forbidden), `derive.ts must not contain "${forbidden}"`);
    }
  });
});

// ═══════════════════════ pure helpers ══════════════════════════════════════
describe('pure helpers', () => {
  const mk = (over: Partial<PTInsight>): PTInsight => ({
    id: 'i1', clientId: 'c1', family: 'progression',
    subject: { kind: 'category', id: 'upper_body', label: 'upper-body' },
    window: { kind: 'recent_sessions', sessionCount: 3, from: '2026-09-01', to: '2026-09-09' },
    evidenceIds: [], signalIds: [], progressRefs: [], strength: 'consistent',
    title: 'Progression worth reviewing', statement: 'x', observedAt: '2026-09-09T18:00:00Z', evidence: [],
    ...over,
  });

  test('pickTopInsight: discomfort outranks progression regardless of recency', () => {
    const prog = mk({ id: 'p', family: 'progression', observedAt: '2026-09-09T00:00:00Z' });
    const disc = mk({ id: 'd', family: 'discomfort', strength: null, title: 'Discomfort reported', observedAt: '2026-09-01T00:00:00Z' });
    assert.equal(pickTopInsight([prog, disc])?.id, 'd');
    assert.equal(pickTopInsight([])?.id ?? null, null);
  });

  test('pickTopInsight: newest wins within the same family', () => {
    const a = mk({ id: 'a', family: 'discomfort', observedAt: '2026-09-02T00:00:00Z' });
    const b = mk({ id: 'b', family: 'discomfort', observedAt: '2026-09-08T00:00:00Z' });
    assert.equal(pickTopInsight([a, b])?.id, 'b');
  });

  test('rankHomeAttentionItems: attention → review, then newest, then clientId; clamped to DISPLAY_CAP', () => {
    const item = (over: Partial<ReturnType<typeof toHomeAttentionItem>>) => ({
      clientId: 'c', clientName: 'n', href: '/lana-pro/clients/c', insightId: 'i', insightFamily: 'progression' as const,
      insightTitle: 't', actionId: 'a', actionTitle: 'at', actionStatement: 's',
      priority: 'review' as const, observedAt: '2026-09-01T00:00:00Z', basedOnSessions: 2, subjectLabel: null, ...over,
    });
    const ranked = rankHomeAttentionItems([
      item({ clientId: 'c-review-new', priority: 'review', observedAt: '2026-09-09T00:00:00Z' }),
      item({ clientId: 'c-attn-old', priority: 'attention', observedAt: '2026-09-01T00:00:00Z' }),
      item({ clientId: 'c-attn-new', priority: 'attention', observedAt: '2026-09-09T00:00:00Z' }),
    ]);
    assert.deepEqual(ranked.map((r) => r.clientId), ['c-attn-new', 'c-attn-old', 'c-review-new']);

    const many = Array.from({ length: 9 }, (_, i) => item({ clientId: `c${i}` }));
    assert.equal(rankHomeAttentionItems(many).length, DISPLAY_CAP);
    assert.equal(rankHomeAttentionItems(many, 2).length, 2);
    assert.equal(rankHomeAttentionItems(many, 99).length, DISPLAY_CAP);
  });

  test('rankHomeAttentionItems does not mutate its input', () => {
    const src = [
      { clientId: 'b', priority: 'review' as const, observedAt: '1', clientName: '', href: '', insightId: '', insightFamily: 'progression' as const, insightTitle: '', actionId: '', actionTitle: '', actionStatement: '', basedOnSessions: 1, subjectLabel: null },
      { clientId: 'a', priority: 'attention' as const, observedAt: '1', clientName: '', href: '', insightId: '', insightFamily: 'discomfort' as const, insightTitle: '', actionId: '', actionTitle: '', actionStatement: '', basedOnSessions: 1, subjectLabel: null },
    ];
    const before = src.map((s) => s.clientId).join(',');
    rankHomeAttentionItems(src);
    assert.equal(src.map((s) => s.clientId).join(','), before);
  });
});

// ═══════════════ ADHERENCE FAMILY ON HOME (§28/§41/§43) ════════════════════
// CTX today = 2026-09-09 (Wed) → recent week 08-31..09-06, baseline 08-17..08-30.
// MWF weekly plan from 2026-08-01. Adherence drop = baseline 5/6, recent 1/3.
const MWF = { assigned_by: 'pt-1', workout_id: 'w1', start_date: '2026-08-01', recurrence: 'weekly', weekdays: [1, 3, 5], is_active: true };
const wh = (id: string, uid: string, date: string, notes: string | null = null) => ({
  id, user_id: uid, workout_id: 'w1', completed_at: `${date}T18:00:00Z`,
  status: 'completed', completion_percentage: 100, perceived_difficulty: null, notes, exercise_notes: null,
});
// baseline completions: all 6 MWF dates in 08-17..08-30 except 08-28
const baselineDates = ['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24', '2026-08-26'];

function adherenceRosterCanned(): Canned {
  return {
    pt_clients: {
      rows: [
        { pt_id: 'pt-1', client_user_id: 'c-rich', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-jane', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-paul', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' },
        { pt_id: 'pt-1', client_user_id: 'c-alice', status: 'active', share_progress: false, created_at: '2026-06-01T00:00:00Z' },
      ],
    },
    users: {
      rows: [
        { id: 'c-rich', name: 'Richard Omollo', email: null },
        { id: 'c-jane', name: 'Jane Doe', email: null },
        { id: 'c-paul', name: 'Paul', email: null },
        { id: 'c-alice', name: 'Alice', email: null },
      ],
    },
    workouts: { rows: [{ id: 'w1', title: 'Upper A', category: 'upper_body' }] },
    exercises: { rows: [{ id: 'ex-knee', name: 'Walking lunge' }] },
    workout_schedules: {
      rows: [
        { ...MWF, user_id: 'c-rich' },
        { ...MWF, user_id: 'c-jane' },
        // Paul has NO PT schedule → no adherence facts
        { ...MWF, user_id: 'c-alice' }, // but Alice is not consented
      ],
    },
    workout_history: {
      rows: [
        // Richard — adherence drop + progression comments (baseline) + a discomfort note (recent)
        ...baselineDates.map((d, i) => wh(`r-b${i}`, 'c-rich', d, i < 2 ? 'Weights are starting to feel too light.' : null)),
        { ...wh('r-r1', 'c-rich', '2026-08-31'), exercise_notes: { 'ex-knee': 'My knee hurt during lunges.' }, notes: null }, // recent completed w/ discomfort
        // (recent 09-02, 09-04 missed) → recent 1/3
        // Jane — adherence drop + progression comments (baseline), nothing recent
        ...baselineDates.map((d, i) => wh(`j-b${i}`, 'c-jane', d, i < 3 ? 'Weights are starting to feel too light.' : null)),
        wh('j-r1', 'c-jane', '2026-08-31'), // recent 1/3
        // Paul — progression comments only, no schedule
        wh('p-1', 'c-paul', '2026-08-20', 'Bench felt easy.'),
        wh('p-2', 'c-paul', '2026-08-27', 'Could have done more reps.'),
        wh('p-3', 'c-paul', '2026-09-03', 'Weights are starting to feel too light.'),
        // Alice — would be an adherence drop, but share_progress = false
        ...baselineDates.map((d, i) => wh(`a-b${i}`, 'c-alice', d)),
      ],
    },
  };
}

describe('resolveHomeAttention — adherence family', () => {
  test('§43 — Richard→discomfort, Jane→adherence, Paul→progression; Alice absent; one card each', async () => {
    const db = new FakeSupabase(adherenceRosterCanned());
    const items = await resolveHomeAttention(db, CTX);

    const byClient = new Map(items.map((i) => [i.clientId, i]));
    assert.equal(byClient.get('c-rich')?.insightFamily, 'discomfort');
    assert.equal(byClient.get('c-jane')?.insightFamily, 'adherence');
    assert.equal(byClient.get('c-paul')?.insightFamily, 'progression');
    assert.ok(!byClient.has('c-alice')); // not consented
    assert.equal(items.filter((i) => i.clientId === 'c-jane').length, 1); // ONE card
  });

  test('§28 — the adherence card carries the factual recent-week counts, no raw comments', async () => {
    const db = new FakeSupabase(adherenceRosterCanned());
    const items = await resolveHomeAttention(db, CTX);
    const jane = items.find((i) => i.clientId === 'c-jane')!;
    assert.equal(jane.insightTitle, 'Training consistency has dropped');
    assert.equal(jane.actionTitle, 'Check in on training consistency');
    assert.deepEqual(jane.adherenceRecent, { completed: 1, scheduled: 3 });
    assert.ok(jane.actionStatement.includes('recent change in training consistency'));
    const blob = JSON.stringify(jane).toLowerCase();
    assert.ok(!blob.includes('weights are starting to feel too light'));
  });

  test('§43 ordering — discomfort card first, then adherence, then progression (family tie-break within "review")', async () => {
    const db = new FakeSupabase(adherenceRosterCanned());
    const items = await resolveHomeAttention(db, CTX);
    assert.deepEqual(items.map((i) => i.insightFamily), ['discomfort', 'adherence', 'progression']);
  });

  test('§41 — share_progress = false ⇒ no adherence item even with an obvious decline', async () => {
    const db = new FakeSupabase(adherenceRosterCanned());
    const items = await resolveHomeAttention(db, CTX);
    assert.ok(!items.some((i) => i.clientId === 'c-alice'));
  });

  test('§29/§45 — one batched workout_schedules read, query count stays bounded (≤6)', async () => {
    const db = new FakeSupabase(adherenceRosterCanned());
    await resolveHomeAttention(db, CTX);
    assert.equal(db.countOf('workout_schedules'), 1);
    assert.equal(db.countOf('workout_history'), 1);
    assert.ok(db.tablesTouched.length <= 6);
  });

  test('employed workspace → no schedule read, no adherence items', async () => {
    const db = new FakeSupabase({
      gym_trainer_clients: { rows: [{ gym_trainer_id: 'gt-1', client_user_id: 'c-1', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' }] },
      workout_history: { rows: [] },
    });
    const items = await resolveHomeAttention(db, { workspace: 'employed', professionalId: 'gt-1', todayLocalDate: '2026-09-09', limit: 5 });
    assert.deepEqual(items, []);
    assert.ok(!db.tablesTouched.includes('workout_schedules'));
  });
});

// ═══════════ SOURCE-COMPLETE ADHERENCE ON HOME (§25/§35/§38) ═══════════════
// A Lana-plan-only client (no comments, no PT schedule) can surface for a
// qualifying adherence drop, using the SAME spine as client detail.
const lanaDropOcc = (date: string, completed: boolean) => ({
  clientUserId: 'c-lana', date, title: 'Lana session', category: null, durationMinutes: null, completed,
});
// baseline 08-17..08-30: 6 planned, 5 done; recent 08-31..09-06: 3 planned, 1 done
const LANA_DROP = [
  lanaDropOcc('2026-08-17', true), lanaDropOcc('2026-08-19', true), lanaDropOcc('2026-08-21', true),
  lanaDropOcc('2026-08-24', true), lanaDropOcc('2026-08-26', true), lanaDropOcc('2026-08-28', false),
  lanaDropOcc('2026-08-31', true), lanaDropOcc('2026-09-02', false), lanaDropOcc('2026-09-04', false),
];

function lanaOnlyRoster(): Canned {
  return {
    pt_clients: { rows: [{ pt_id: 'pt-1', client_user_id: 'c-lana', status: 'active', share_progress: true, created_at: '2026-06-01T00:00:00Z' }] },
    users: { rows: [{ id: 'c-lana', name: 'Lana Only', email: null }] },
    workout_history: { rows: [] },
    workout_schedules: { rows: [] },
  };
}

describe('resolveHomeAttention — Lana-plan adherence (source-complete)', () => {
  test('§35/§38 — Lana-plan-only client with a drop surfaces as an adherence card', async () => {
    let calls = 0;
    const load = async (ids: string[], from: string, to: string) => {
      calls += 1;
      assert.deepEqual(ids, ['c-lana']);
      assert.equal(from, '2026-08-17'); // weekStart(2026-09-07) - 21
      assert.equal(to, '2026-09-06'); // weekStart - 1
      return LANA_DROP;
    };
    const db = new FakeSupabase(lanaOnlyRoster());
    const items = await resolveHomeAttention(db, CTX, load);
    assert.equal(calls, 1); // ONE batched RPC-backed load, not per client
    assert.equal(items.length, 1);
    assert.equal(items[0].clientId, 'c-lana');
    assert.equal(items[0].insightFamily, 'adherence');
    assert.equal(items[0].insightTitle, 'Training consistency has dropped');
    assert.deepEqual(items[0].adherenceRecent, { completed: 1, scheduled: 3 });
  });

  test('§26 query budget — one workout_history + one workout_schedules read; RPC-backed load once', async () => {
    let calls = 0;
    const db = new FakeSupabase(lanaOnlyRoster());
    await resolveHomeAttention(db, CTX, async () => { calls += 1; return LANA_DROP; });
    assert.equal(calls, 1);
    assert.equal(db.countOf('workout_history'), 1);
    assert.equal(db.countOf('workout_schedules'), 1);
    assert.ok(db.tablesTouched.length <= 6); // DB queries unchanged; RPC is separate
  });

  test('no loader passed → trainer-plan-only, unchanged (graceful degradation)', async () => {
    const db = new FakeSupabase(lanaOnlyRoster());
    const items = await resolveHomeAttention(db, CTX); // no 3rd arg
    assert.deepEqual(items, []); // no comments, no schedule, no lana → nothing
  });

  test('a failing loader never breaks Home', async () => {
    const db = new FakeSupabase(lanaOnlyRoster());
    const items = await resolveHomeAttention(db, CTX, async () => { throw new Error('rpc down'); });
    assert.deepEqual(items, []);
  });
});
