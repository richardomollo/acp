import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBusinessBrief, type BusinessAggregatorContext } from '../business-aggregator.ts';
import type { SupabaseLike, QueryBuilder, QueryResult } from '../aggregator.ts';
import { addDays } from '../business-signals.ts';

// ── a fake supabase that RECORDS every table touched + honours filters ────

type Canned = Record<string, { rows?: unknown[] }>;

class FakeSupabase implements SupabaseLike {
  readonly tablesTouched: string[] = [];
  private canned: Canned;
  constructor(canned: Canned) {
    this.canned = canned;
  }

  from(table: string): QueryBuilder {
    this.tablesTouched.push(table);
    const allRows = (this.canned[table]?.rows ?? []) as Record<string, unknown>[];
    let head = false;
    let wantCount = false;
    let limit = Infinity;
    const preds: ((r: Record<string, unknown>) => boolean)[] = [];

    const rows = () => allRows.filter((r) => preds.every((p) => p(r))).slice(0, limit);
    const result = (): QueryResult => {
      const rs = rows();
      return { data: head ? null : rs, error: null, count: wantCount ? rs.length : null };
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
      gte(col: string, val: unknown) {
        preds.push((r) => String(r[col] ?? '') >= String(val));
        return builder;
      },
      lte(col: string, val: unknown) {
        preds.push((r) => String(r[col] ?? '') <= String(val));
        return builder;
      },
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

  get seen(): Set<string> {
    return new Set(this.tablesTouched);
  }
}

const TODAY = '2026-09-07'; // Monday
const NOW = '2026-09-07T09:00:00';

const BIZ_CTX: BusinessAggregatorContext = {
  workspace: 'business',
  businessId: 'gym-1',
  businessType: 'gym',
  teamRelevant: true,
  todayLocalDate: TODAY,
  nowIso: NOW,
};

// tables Business Intelligence must NEVER query (§2 / §17)
const FORBIDDEN = [
  'fitness_profile',
  'client_measurements',
  'workout_history',
  'activities',
  'food_log_entries',
  'daily_checkins',
  'professional_session_records',
  'pt_clients',
  'gym_trainer_clients',
  'client_tasks',
  'pt_bookings',
  'coaching_memory',
  'health_profile',
];

const ALLOWED = new Set([
  'gym_services',
  'gym_access_passes',
  'gym_trainers',
  'sessions',
  'bookings',
  'gym_service_bookings',
]);

function emptyCanned(): Canned {
  return {
    gym_services: { rows: [] },
    gym_access_passes: { rows: [] },
    gym_trainers: { rows: [] },
    sessions: { rows: [] },
    bookings: { rows: [] },
    gym_service_bookings: { rows: [] },
  };
}

describe('business-aggregator — the privacy boundary is STRUCTURAL', () => {
  test('only business-operations tables are ever queried', async () => {
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      gym_trainers: { rows: [{ id: 't1', gym_id: 'gym-1', status: 'active' }] },
      sessions: {
        rows: [
          { id: 's1', gym_id: 'gym-1', date: addDays(TODAY, 3), time: '10:00:00', name: 'Pilates', max_capacity: 10, is_active: true },
        ],
      },
      bookings: {
        rows: [
          { session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: addDays(TODAY, 3) },
        ],
      },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.ok(brief);
    for (const t of FORBIDDEN) {
      assert.equal(db.seen.has(t), false, `must never query "${t}" — saw: ${[...db.seen].join(', ')}`);
    }
    for (const t of db.seen) assert.ok(ALLOWED.has(t), `unexpected table: ${t}`);
  });

  test('independent workspace → null, ZERO queries', async () => {
    const db = new FakeSupabase(emptyCanned());
    const r = await resolveBusinessBrief(db, { ...BIZ_CTX, workspace: 'independent' });
    assert.equal(r, null);
    assert.equal(db.tablesTouched.length, 0);
  });

  test('employed workspace → null, ZERO queries', async () => {
    const db = new FakeSupabase(emptyCanned());
    const r = await resolveBusinessBrief(db, { ...BIZ_CTX, workspace: 'employed' });
    assert.equal(r, null);
    assert.equal(db.tablesTouched.length, 0);
  });

  test('missing businessId → null, ZERO queries', async () => {
    const db = new FakeSupabase(emptyCanned());
    const r = await resolveBusinessBrief(db, { ...BIZ_CTX, businessId: '' });
    assert.equal(r, null);
    assert.equal(db.tablesTouched.length, 0);
  });
});

describe('business-aggregator — states from real rows', () => {
  test('new business (all empty) → state "setup"', async () => {
    const db = new FakeSupabase(emptyCanned());
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.state, 'setup');
    assert.ok(brief!.observations.some((o) => o.kind === 'setup:no_service'));
  });

  test('configured but nothing upcoming → state "low_data"', async () => {
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      gym_access_passes: { rows: [{ id: 'ap1', gym_id: 'gym-1', status: 'active' }] },
      gym_trainers: { rows: [{ id: 't1', gym_id: 'gym-1', status: 'active' }] },
      sessions: {
        rows: [
          // a class, but in the PAST → no upcoming schedule
          { id: 's-old', gym_id: 'gym-1', date: addDays(TODAY, -10), time: '10:00:00', name: 'Old', max_capacity: 10, is_active: true },
        ],
      },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.state, 'low_data');
  });

  test('upcoming class with real bookings → "operational" + capacity observation', async () => {
    const day = addDays(TODAY, 4);
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      gym_trainers: { rows: [{ id: 't1', gym_id: 'gym-1', status: 'active' }] },
      sessions: {
        rows: [{ id: 's1', gym_id: 'gym-1', date: day, time: '10:00:00', name: 'Pilates', max_capacity: 10, is_active: true }],
      },
      bookings: {
        rows: Array.from({ length: 9 }, (_, i) => ({
          session_id: 's1',
          gym_id: 'gym-1',
          status: 'confirmed',
          no_show: false,
          booking_date: day,
        })),
      },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.state, 'operational');
    const cap = brief!.observations.find((o) => o.kind === 'class_capacity');
    assert.ok(cap, 'capacity observation present');
    assert.match(cap!.text, /9 of 10 places booked/);
    assert.equal(cap!.action?.href, '/lana-pro/bookings/class/s1');
  });
});

describe('business-aggregator — class capacity counting (§17)', () => {
  const day = addDays(TODAY, 4);
  function withBookings(bkRows: Record<string, unknown>[]) {
    return new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      sessions: {
        rows: [{ id: 's1', gym_id: 'gym-1', date: day, time: '10:00:00', name: 'HIIT', max_capacity: 10, is_active: true }],
      },
      bookings: { rows: bkRows },
    });
  }

  test('cancelled + no-show bookings are excluded from the count', async () => {
    const db = withBookings([
      ...Array.from({ length: 8 }, () => ({ session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: day })),
      { session_id: 's1', gym_id: 'gym-1', status: 'cancelled', no_show: false, booking_date: day },
      { session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: true, booking_date: day },
      { session_id: 's1', gym_id: 'gym-1', status: 'pending_payment', no_show: false, booking_date: day }, // counts (live)
    ]);
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    const cap = brief!.observations.find((o) => o.kind === 'class_capacity');
    assert.match(cap!.text, /9 of 10 places booked/); // 8 confirmed + 1 pending_payment
  });

  test('a class below the nearly-full threshold produces no capacity line', async () => {
    const db = withBookings(
      Array.from({ length: 3 }, () => ({ session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: day })),
    );
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.observations.some((o) => o.kind === 'class_capacity'), false);
  });

  test('insufficient history → no demand/trend observation', async () => {
    // only this week's Saturday class, no prior weeks
    const sat = '2026-09-12';
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      sessions: { rows: [{ id: 's1', gym_id: 'gym-1', date: sat, time: '10:00:00', name: 'Yoga', max_capacity: 10, is_active: true }] },
      bookings: {
        rows: Array.from({ length: 9 }, () => ({ session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: sat })),
      },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.observations.some((o) => o.kind === 'class_demand'), false);
  });

  test('enough history + a real gap → a supported demand observation', async () => {
    // Saturdays: this week 10/10; prior 3 Saturdays 5/10 each.
    const rows: Record<string, unknown>[] = [];
    const sessions: Record<string, unknown>[] = [];
    const sats = ['2026-09-12', '2026-09-05', '2026-08-29', '2026-08-22'];
    sats.forEach((d, i) => {
      const id = `s${i}`;
      sessions.push({ id, gym_id: 'gym-1', date: d, time: '10:00:00', name: 'Spin', max_capacity: 10, is_active: true });
      const n = i === 0 ? 10 : 5;
      for (let k = 0; k < n; k += 1) rows.push({ session_id: id, gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: d });
    });
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      sessions: { rows: sessions },
      bookings: { rows },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    const demand = brief!.observations.find((o) => o.kind === 'class_demand');
    assert.ok(demand, 'demand observation present with 3 weeks of history');
    assert.match(demand!.text, /Saturday classes have been busier/);
  });
});

describe('business-aggregator — venue shapes (§11 / §13)', () => {
  test('class-only studio: no appointment-slot claims, no facility-access noise', async () => {
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [] }, // studios use sessions, not gym_services
      sessions: {
        rows: [{ id: 's1', gym_id: 'gym-1', date: addDays(TODAY, 2), time: '09:00:00', name: 'Reformer', max_capacity: 10, is_active: true }],
      },
      bookings: {
        rows: Array.from({ length: 9 }, () => ({ session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: addDays(TODAY, 2) })),
      },
    });
    const brief = await resolveBusinessBrief(db, { ...BIZ_CTX, businessType: 'Pilates studio' });
    assert.equal(brief!.shape, 'studio');
    const text = [...brief!.observations, ...brief!.facts].map((i) => i.text).join(' | ');
    assert.equal(/appointment slots? available/i.test(text), false);
    assert.equal(/facility access/i.test(text), false);
  });

  test('appointment-only spa: no class-capacity noise, appointment load fact only', async () => {
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      gym_service_bookings: {
        rows: Array.from({ length: 4 }, (_, i) => ({
          id: `b${i}`,
          gym_id: 'gym-1',
          starts_at: `${addDays(TODAY, 1 + i)}T11:00:00`,
          status: 'confirmed',
        })),
      },
    });
    const brief = await resolveBusinessBrief(db, { ...BIZ_CTX, businessType: 'Spa & Wellness' });
    assert.equal(brief!.shape, 'spa');
    assert.equal(brief!.observations.some((o) => o.kind === 'class_capacity'), false);
    assert.equal(brief!.observations.some((o) => o.kind === 'setup:no_schedule'), false);
    const load = brief!.facts.find((f) => f.kind === 'upcoming_load');
    assert.ok(load);
    assert.match(load!.text, /4 appointments are booked/);
  });

  test('gym with employed PTs: operational venue intelligence, no private client data leaks', async () => {
    const db = new FakeSupabase({
      ...emptyCanned(),
      gym_services: { rows: [{ id: 'svc1', gym_id: 'gym-1', status: 'active' }] },
      gym_trainers: { rows: [{ id: 't1', gym_id: 'gym-1', status: 'active' }] },
      sessions: {
        rows: [{ id: 's1', gym_id: 'gym-1', date: addDays(TODAY, 2), time: '18:00:00', name: 'Strength', max_capacity: 12, is_active: true }],
      },
      bookings: {
        rows: Array.from({ length: 11 }, () => ({ session_id: 's1', gym_id: 'gym-1', status: 'confirmed', no_show: false, booking_date: addDays(TODAY, 2) })),
      },
      gym_service_bookings: {
        rows: [{ id: 'b1', gym_id: 'gym-1', starts_at: `${addDays(TODAY, 1)}T09:00:00`, status: 'confirmed' }],
      },
    });
    const brief = await resolveBusinessBrief(db, BIZ_CTX);
    assert.equal(brief!.state, 'operational');
    for (const t of FORBIDDEN) assert.equal(db.seen.has(t), false);
    // it reasoned about class capacity + load, nothing client-specific
    assert.ok(brief!.observations.some((o) => o.kind === 'class_capacity'));
  });
});
