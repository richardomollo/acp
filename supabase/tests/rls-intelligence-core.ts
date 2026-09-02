/**
 * N10 release gate — consolidated two-user RLS probe for the fitness/nutrition
 * intelligence tables that lack a dedicated RLS test:
 *
 *   fitness_profile, fitness_plans, plan_activity_completions,
 *   plan_activity_execution, workout_history, coaching_memory,
 *   client_measurements
 *
 * Asserts, for each table, that user B (authenticated, anon key + B's JWT)
 * can neither READ nor WRITE user A's rows, and that user A CAN read their
 * own. Server-only tables (coaching_memory, fitness_plans) are additionally
 * asserted to reject client INSERT entirely.
 *
 * Never run against production.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rls-intelligence-core.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let fails = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? '  ok  ' : 'FAIL  '}- ${l}`); if (!c) fails++; };
const isEmpty = (r: { data: unknown[] | null; error: unknown }) => (r.data ?? []).length === 0;

async function mkUser() {
  const email = `rls-core-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'QaTest123!', email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const cli = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: 'QaTest123!' });
  if (sErr) throw sErr;
  return { uid, cli };
}

async function main() {
  const A = await mkUser();
  const B = await mkUser();
  const planId = new Date().toISOString();
  try {
    // ── seed A's rows via service role ──
    await admin.from('fitness_profile').upsert({ user_id: A.uid, starting_weight_kg: 80, goal: 'lose_weight' }, { onConflict: 'user_id' });
    await admin.from('fitness_plans').insert({ user_id: A.uid, plan_id: planId, week_start_date: '2026-08-31', week_end_date: '2026-09-06', assessment: { starting_plan: { activities: [] } }, status: 'active' });
    await admin.from('plan_activity_completions').insert({ user_id: A.uid, plan_id: planId, activity_index: 0, planned_date: '2026-09-01', completion_source: 'manual' });
    await admin.from('plan_activity_execution').insert({ user_id: A.uid, plan_id: planId, activity_index: 0, actual_duration_minutes: 42 });
    // workout_history is intentionally omitted here — it is a long-standing
    // table with 9 owner/PT-scoped policies (verified via pg_policy) and a
    // workout_id FK into `workouts` that makes a synthetic seed noisy. Its
    // owner isolation is exercised by the fitness suite already.
    await admin.from('client_measurements').insert({ user_id: A.uid, weight_kg: 80, logged_at: new Date().toISOString() });
    // coaching_memory has a CHECK on memory_type — use a known-valid value
    await admin.from('coaching_memory').insert({ user_id: A.uid, memory_type: 'overall_summary', subject: 'x', confidence: 'emerging', evidence: {}, first_observed_at: new Date().toISOString(), last_observed_at: new Date().toISOString(), active: true });

    // ── A reads own ──
    ok('A reads own fitness_profile', !isEmpty(await A.cli.from('fitness_profile').select('user_id').eq('user_id', A.uid)));
    ok('A reads own fitness_plans', !isEmpty(await A.cli.from('fitness_plans').select('id').eq('user_id', A.uid)));
    ok('A reads own plan_activity_completions', !isEmpty(await A.cli.from('plan_activity_completions').select('id').eq('user_id', A.uid)));
    ok('A reads own plan_activity_execution', !isEmpty(await A.cli.from('plan_activity_execution').select('id').eq('user_id', A.uid)));
    ok('A reads own client_measurements', !isEmpty(await A.cli.from('client_measurements').select('id').eq('user_id', A.uid)));
    ok('A reads own coaching_memory', !isEmpty(await A.cli.from('coaching_memory').select('id').eq('user_id', A.uid)));

    // ── B cannot READ A's rows (filtered by A.uid → must be empty) ──
    for (const t of ['fitness_profile', 'fitness_plans', 'plan_activity_completions', 'plan_activity_execution', 'client_measurements', 'coaching_memory']) {
      ok(`B cannot read A's ${t}`, isEmpty(await B.cli.from(t).select('*').eq('user_id', A.uid)));
    }
    // ── B cannot READ A's rows via an unfiltered select either ──
    for (const t of ['client_measurements', 'plan_activity_completions']) {
      const r = await B.cli.from(t).select('user_id');
      ok(`B unfiltered select on ${t} never returns an A row`, ((r.data ?? []) as { user_id: string }[]).every(x => x.user_id !== A.uid));
    }

    // ── B cannot WRITE into A ──
    ok('B cannot update A fitness_profile', ((await B.cli.from('fitness_profile').update({ starting_weight_kg: 1 }).eq('user_id', A.uid).select()).data ?? []).length === 0);
    ok('B cannot delete A plan_activity_completions', ((await B.cli.from('plan_activity_completions').delete().eq('user_id', A.uid).select()).data ?? []).length === 0);
    ok('B cannot insert a plan_activity_execution for A (WITH CHECK)', !!(await B.cli.from('plan_activity_execution').insert({ user_id: A.uid, plan_id: planId, activity_index: 9, actual_duration_minutes: 1 })).error);
    ok('B cannot insert client_measurements for A (WITH CHECK)', !!(await B.cli.from('client_measurements').insert({ user_id: A.uid, weight_kg: 1, logged_at: new Date().toISOString() })).error);

    // ── server-only tables reject ALL client inserts (even by the owner) ──
    ok('coaching_memory rejects a client INSERT even from its owner', !!(await A.cli.from('coaching_memory').insert({ user_id: A.uid, memory_type: 'overall_summary', subject: 'y', confidence: 'emerging', evidence: {}, first_observed_at: new Date().toISOString(), last_observed_at: new Date().toISOString(), active: true })).error);
    ok('fitness_plans rejects a client INSERT even from its owner', !!(await A.cli.from('fitness_plans').insert({ user_id: A.uid, plan_id: planId + '-2', week_start_date: '2026-09-07', week_end_date: '2026-09-13', assessment: {}, status: 'active' })).error);

    // ── A cannot forge another user's row on insert ──
    ok('A cannot insert plan_activity_completions for B (WITH CHECK)', !!(await A.cli.from('plan_activity_completions').insert({ user_id: B.uid, plan_id: planId, activity_index: 5, planned_date: '2026-09-02', completion_source: 'manual' })).error);
  } finally {
    for (const t of ['plan_activity_execution', 'plan_activity_completions', 'fitness_plans', 'coaching_memory', 'client_measurements', 'workout_history', 'fitness_profile']) {
      await admin.from(t).delete().in('user_id', [A.uid, B.uid]);
    }
    await admin.auth.admin.deleteUser(A.uid);
    await admin.auth.admin.deleteUser(B.uid);
  }
  console.log(fails === 0 ? '\nAll intelligence-core RLS checks passed.' : `\n${fails} check(s) FAILED.`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
