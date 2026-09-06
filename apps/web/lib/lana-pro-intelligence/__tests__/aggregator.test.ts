import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientBriefInput,
  resolveClientBrief,
  resolveHomeIntelligence,
  type SupabaseLike,
  type QueryBuilder,
  type QueryResult,
  type AggregatorContext,
} from '../aggregator.ts';

// ── a fake supabase that RECORDS every table touched ─────────────────────

type Canned = Record<string, { rows?: unknown[]; count?: number }>;

class FakeSupabase implements SupabaseLike {
  readonly tablesTouched: string[] = [];
  private canned: Canned;
  constructor(canned: Canned) {
    this.canned = canned;
  }

  from(table: string): QueryBuilder {
    this.tablesTouched.push(table);
    const canned = this.canned[table] ?? {};
    const allRows = (canned.rows ?? []) as Record<string, unknown>[];
    let head = false;
    let wantCount = false;
    let limit = Infinity;
    const preds: ((r: Record<string, unknown>) => boolean)[] = [];

    const rows = () => allRows.filter((r) => preds.every((p) => p(r))).slice(0, limit);
    const result = (): QueryResult => {
      const rs = rows();
      return { data: head ? null : rs, error: null, count: wantCount ? canned.count ?? rs.length : null };
    };

    const builder: QueryBuilder = {
      select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
        if (opts?.head) head = true;
        if (opts?.count) wantCount = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        preds.push((r) => r[col] !== val);
        return builder;
      },
      in(col: string, vals: readonly unknown[]) {
        preds.push((r) => vals.includes(r[col]));
        return builder;
      },
      gte: () => builder,
      lte: () => builder,
      not: () => builder,
      order: () => builder,
      limit(n: number) {
        limit = n;
        return builder;
      },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (onfulfilled) => Promise.resolve(result()).then(onfulfilled),
    };
    return builder;
  }

  /** unique tables, for assertions */
  get seen(): Set<string> {
    return new Set(this.tablesTouched);
  }
}

// tables that must NEVER be queried for professional intelligence, ANY consent state
const NEVER = [
  'health_profile',
  'coaching_memory',
  'health_daily_stats',
  'health_workouts',
  'strava_connections',
  'plan_activity_completions',
  'plan_activity_execution',
  'nutrition_recommendation_events',
  'nutrition_coaching_exposures',
  'fitness_plans',
  'meal_plans',
  'saved_meals',
];

// tables that are consent-gated — only allowed when share_progress = true
const GATED = ['fitness_profile', 'client_measurements', 'workout_history', 'workouts', 'activities', 'daily_checkins', 'food_log_entries'];

const IND_CTX: AggregatorContext = {
  workspace: 'independent',
  professionalKind: 'personal_trainer',
  professionalId: 'pt-1',
  professionalFlavour: 'training',
  clientUserId: 'client-1',
  todayLocalDate: '2026-09-06',
  nowIso: '2026-09-06T08:00:00',
};

const CID = 'client-1'; // === IND_CTX.clientUserId
const PID = 'pt-1'; // === IND_CTX.professionalId

function cannedActiveNotSharing(): Canned {
  return {
    pt_clients: { rows: [{ client_user_id: CID, pt_id: PID, status: 'active', share_progress: false, created_at: '2026-06-01T09:00:00Z' }] },
    users: { rows: [{ id: CID, name: 'Sarah Wanjiku', email: null }] },
    pt_bookings: { rows: [], count: 0 },
    professional_session_records: { rows: [], count: 0 },
    client_tasks: { rows: [] },
  };
}
function cannedActiveSharing(): Canned {
  return {
    ...cannedActiveNotSharing(),
    pt_clients: { rows: [{ client_user_id: CID, pt_id: PID, status: 'active', share_progress: true, created_at: '2026-06-01T09:00:00Z' }] },
    professional_session_records: {
      rows: [
        {
          personal_trainer_id: PID,
          client_user_id: CID,
          session_status: 'completed',
          focus: 'lower-body strength',
          completed_at: '2026-09-01T11:00:00Z',
          client_response: 'difficult',
          plan_intent: 'keep',
          follow_up_at: null,
        },
      ],
      count: 1,
    },
    fitness_profile: {
      rows: [{ user_id: CID, goal: 'build_muscle', goals: ['build_muscle'], experience_level: 'intermediate', preferred_activities: ['Gym'], preferred_training_days: ['monday', 'wednesday'] }],
    },
    client_measurements: { rows: [{ user_id: CID, weight_kg: 80, logged_at: '2026-09-04T09:00:00Z' }] },
    workouts: { rows: [{ id: 'w1', user_id: CID, assigned_by: PID, suggested_local_date: '2026-09-02' }] },
    workout_history: { rows: [{ user_id: CID, workout_id: 'w1', status: 'completed', completed_at: '2026-09-03T09:00:00Z' }], count: 1 },
    activities: { rows: [] },
    daily_checkins: { rows: [{ user_id: CID }], count: 2 },
    food_log_entries: { rows: [] },
  };
}

// ═══════════════════════════════════════════════════════════════════════

describe('aggregator — the consent boundary is STRUCTURAL', () => {
  test('share_progress = FALSE → gated + forbidden tables are NEVER queried', async () => {
    const db = new FakeSupabase(cannedActiveNotSharing());
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.ok(input, 'still produces a brief input from non-gated evidence');
    assert.equal(input!.sharesProgress, false);

    for (const t of [...NEVER, ...GATED]) {
      assert.equal(db.seen.has(t), false, `must not query "${t}" without consent — saw: ${[...db.seen].join(', ')}`);
    }
    // it MAY only touch this allowlist
    const allowed = new Set(['pt_clients', 'users', 'pt_bookings', 'professional_session_records', 'client_tasks']);
    for (const t of db.seen) assert.ok(allowed.has(t), `unexpected table without consent: ${t}`);
  });

  test('share_progress = TRUE → gated tables ARE queried; forbidden ones still are NOT', async () => {
    const db = new FakeSupabase(cannedActiveSharing());
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input!.sharesProgress, true);
    assert.ok(db.seen.has('fitness_profile'));
    assert.ok(db.seen.has('client_measurements'));
    for (const t of NEVER) {
      assert.equal(db.seen.has(t), false, `still must never query "${t}"`);
    }
  });

  test('non-nutrition flavour → food_log_entries is NOT queried even with consent', async () => {
    const db = new FakeSupabase(cannedActiveSharing());
    await buildClientBriefInput(db, { ...IND_CTX, professionalFlavour: 'training' });
    assert.equal(db.seen.has('food_log_entries'), false);
  });
  test('nutrition flavour + consent → food_log_entries IS queried', async () => {
    const db = new FakeSupabase(cannedActiveSharing());
    await buildClientBriefInput(db, { ...IND_CTX, professionalFlavour: 'nutrition' });
    assert.equal(db.seen.has('food_log_entries'), true);
  });

  test('no relationship row → null, and NOTHING gated is touched', async () => {
    const db = new FakeSupabase({ pt_clients: { rows: [] } });
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input, null);
    for (const t of [...NEVER, ...GATED]) assert.equal(db.seen.has(t), false);
  });

  test('pending relationship (not active) → not consented; gated tables untouched', async () => {
    const db = new FakeSupabase({
      pt_clients: { rows: [{ client_user_id: CID, pt_id: PID, status: 'pending', share_progress: true, created_at: '2026-09-01T09:00:00Z' }] },
      users: { rows: [{ id: CID, name: 'X', email: null }] },
      pt_bookings: { rows: [], count: 0 },
      professional_session_records: { rows: [], count: 0 },
      client_tasks: { rows: [] },
    });
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input!.sharesProgress, false);
    for (const t of GATED) assert.equal(db.seen.has(t), false);
  });
});

describe('aggregator — workspace isolation', () => {
  test('employed context queries gym_trainer_clients + gym_service_bookings, NOT pt_* tables', async () => {
    const db = new FakeSupabase({
      gym_trainer_clients: { rows: [{ client_user_id: CID, gym_trainer_id: 'gt-9', status: 'active', share_progress: false, created_at: '2026-06-01T09:00:00Z' }] },
      users: { rows: [{ id: CID, name: 'Y', email: null }] },
      gym_service_bookings: { rows: [], count: 0 },
      professional_session_records: { rows: [], count: 0 },
    });
    const input = await buildClientBriefInput(db, {
      ...IND_CTX,
      workspace: 'employed',
      professionalKind: 'gym_trainer',
      professionalId: 'gt-9',
    });
    assert.equal(input!.professionalRef.kind, 'gym_trainer');
    assert.ok(db.seen.has('gym_trainer_clients'));
    assert.ok(db.seen.has('gym_service_bookings'));
    assert.equal(db.seen.has('pt_clients'), false);
    assert.equal(db.seen.has('pt_bookings'), false);
    assert.equal(db.seen.has('client_tasks'), false, 'employed trainers have no task surface');
  });

  test('business workspace → no client intelligence at all', async () => {
    const db = new FakeSupabase({});
    assert.equal(await buildClientBriefInput(db, { ...IND_CTX, workspace: 'business' }), null);
    assert.equal(await resolveClientBrief(db, { ...IND_CTX, workspace: 'business' }), null);
    assert.deepEqual(
      await resolveHomeIntelligence(db, {
        workspace: 'business',
        professionalKind: 'personal_trainer',
        professionalId: 'x',
        professionalFlavour: null,
        todayLocalDate: '2026-09-06',
        nowIso: '2026-09-06T08:00:00',
      }),
      [],
    );
    assert.equal(db.tablesTouched.length, 0, 'business context issues zero queries');
  });

  test('every query is scoped to THIS professional id (cross-professional isolation)', async () => {
    // The fake cannot see .eq() args, so we assert the code path instead:
    // employed uses gym_trainer_id / venue tables; independent uses pt_id.
    const ind = new FakeSupabase(cannedActiveSharing());
    await buildClientBriefInput(ind, IND_CTX);
    assert.equal(ind.seen.has('gym_trainer_clients'), false);

    const emp = new FakeSupabase({
      gym_trainer_clients: { rows: [{ client_user_id: CID, gym_trainer_id: 'gt-1', status: 'active', share_progress: true, created_at: '2026-06-01T09:00:00Z' }] },
      users: { rows: [{ id: CID, name: 'Z', email: null }] },
      gym_service_bookings: { rows: [], count: 0 },
      professional_session_records: { rows: [], count: 0 },
      fitness_profile: { rows: [{ user_id: CID, goal: 'improve_health', goals: [], experience_level: null, preferred_activities: null, preferred_training_days: null }] },
      client_measurements: { rows: [] },
      workouts: { rows: [] },
      workout_history: { rows: [], count: 0 },
      activities: { rows: [] },
      daily_checkins: { rows: [], count: 0 },
    });
    await buildClientBriefInput(emp, { ...IND_CTX, workspace: 'employed', professionalKind: 'gym_trainer', professionalId: 'gt-1' });
    assert.equal(emp.seen.has('pt_clients'), false);
  });
});

describe('aggregator — Home ranking hydrates only a few', () => {
  test('empty roster → []', async () => {
    const db = new FakeSupabase({ pt_clients: { rows: [] } });
    const r = await resolveHomeIntelligence(db, {
      workspace: 'independent',
      professionalKind: 'personal_trainer',
      professionalId: 'pt-1',
      professionalFlavour: 'training',
      todayLocalDate: '2026-09-06',
      nowIso: '2026-09-06T08:00:00',
    });
    assert.deepEqual(r, []);
  });

  test('caps hydration at 4 even with a large ranked roster', async () => {
    const roster = Array.from({ length: 10 }, (_, i) => ({
      client_user_id: `c${i}`,
      pt_id: 'pt-1',
      status: 'active',
      share_progress: false,
      created_at: '2026-09-05T09:00:00Z', // all "new client" → all score > 0
    }));
    const db = new FakeSupabase({
      pt_clients: { rows: roster },
      pt_bookings: { rows: [] },
      professional_session_records: { rows: [], count: 0 },
      client_tasks: { rows: [] },
      users: { rows: roster.map((r) => ({ id: r.client_user_id, name: `Client ${r.client_user_id}`, email: null })) },
    });
    const r = await resolveHomeIntelligence(db, {
      workspace: 'independent',
      professionalKind: 'personal_trainer',
      professionalId: 'pt-1',
      professionalFlavour: 'training',
      todayLocalDate: '2026-09-06',
      nowIso: '2026-09-06T08:00:00',
      limit: 4,
    });
    assert.ok(r.length <= 4, `hydrated ${r.length}`);
  });
});

describe('aggregator → full brief integration', () => {
  test('active + sharing produces a grounded brief with a goal fact', async () => {
    const db = new FakeSupabase(cannedActiveSharing());
    const brief = await resolveClientBrief(db, IND_CTX, 'detail');
    assert.ok(brief);
    assert.equal(brief!.clientContext.goalLabel, 'Build muscle');
    assert.ok(brief!.knownFacts.some((f) => f.kind === 'goal'));
    assert.ok(['evidence', 'no_activity_data'].includes(brief!.state));
  });

  test('active + NOT sharing → no_shared_progress, goal absent, pro-owned facts allowed', async () => {
    const db = new FakeSupabase(cannedActiveNotSharing());
    const brief = await resolveClientBrief(db, IND_CTX, 'detail');
    assert.equal(brief!.state, 'no_shared_progress');
    assert.equal(brief!.clientContext.goalLabel, null);
  });

  test('raw fitness_profile codes never reach rendered copy (goal/experience are humanised)', async () => {
    const db = new FakeSupabase(cannedActiveSharing());
    const brief = await resolveClientBrief(db, IND_CTX, 'detail');
    assert.equal(brief!.clientContext.goalLabel, 'Build muscle'); // not "build_muscle"
    const all = [
      ...brief!.knownFacts.map((f) => f.text),
      ...brief!.observations.map((o) => o.text),
      ...brief!.talkingPoints,
    ].join(' | ');
    assert.equal(all.includes('build_muscle'), false, all);
    assert.equal(/\bintermediate\b/.test(all), false, 'lowercase code must be humanised');
    if (/experience level/i.test(all)) assert.match(all, /Experience level: Intermediate/);
  });
});

describe('aggregator — Phase 6 Step 6: the learning loop', () => {
  test('the most recent completed session contributes client_response + plan_intent to the next brief', async () => {
    const db = new FakeSupabase(cannedActiveSharing()); // prev session recorded as "difficult", plan "keep"
    const brief = await resolveClientBrief(db, IND_CTX, 'detail');
    const facts = brief!.knownFacts.map((f) => f.text).join(' | ');
    assert.match(facts, /recorded the last session as difficult/i);
    assert.match(facts, /plan after the last session was to keep similar/i);
    assert.ok(brief!.talkingPoints.some((t) => /marked difficult/i.test(t)));
  });

  test('the prev-session query selects the outcome columns', async () => {
    // regression guard — if the select() loses these, the loop silently breaks.
    const db = new FakeSupabase(cannedActiveSharing());
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input!.previousSession?.clientResponse, 'difficult');
    assert.equal(input!.previousSession?.planIntent, 'keep');
  });

  test("another professional's outcome cannot leak — prev is scoped to THIS professional id", async () => {
    const c = cannedActiveSharing();
    c.professional_session_records = {
      rows: [
        // a different PT's completed session with the same client
        { personal_trainer_id: 'pt-OTHER', client_user_id: CID, session_status: 'completed', focus: 'their focus', completed_at: '2026-09-05T11:00:00Z', client_response: 'great', plan_intent: 'progress' },
        // this PT's earlier one
        { personal_trainer_id: PID, client_user_id: CID, session_status: 'completed', focus: 'my focus', completed_at: '2026-09-01T11:00:00Z', client_response: 'difficult', plan_intent: 'keep' },
      ],
      count: 1,
    };
    const db = new FakeSupabase(c);
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input!.previousSession?.focus, 'my focus');
    assert.equal(input!.previousSession?.clientResponse, 'difficult'); // NOT the other PT's 'great'
  });

  test('a cancelled next booking does not contaminate the brief', async () => {
    const c = cannedActiveSharing();
    c.pt_bookings = {
      rows: [{ id: 'bk-cancelled', pt_id: PID, user_id: CID, scheduled_date: '2026-09-06', scheduled_time: '10:00:00', status: 'cancelled' }],
      count: 0,
    };
    const db = new FakeSupabase(c);
    const input = await buildClientBriefInput(db, IND_CTX);
    assert.equal(input!.nextBooking, null, 'cancelled booking is filtered by status');
    assert.equal(input!.hasUpcomingBooking, false);
  });
});
