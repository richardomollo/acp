/**
 * RPC probe — public.lana_pro_shared_plan_occurrences (migration
 * 20260920000001). Asserts the consent gate and the minimal projection:
 *
 *   • an authorized PT (active pt_clients row + share_progress = true) sees the
 *     client's Lana-plan occurrences with authoritative `completed`;
 *   • an unrelated PT, an inactive relationship, share_progress = false and an
 *     anonymous caller all get ZERO rows;
 *   • the AI prose / completion_source / plan_id never appear in the result;
 *   • a stale/other week returns nothing;
 *   • a completion from a REGENERATED (older) plan never satisfies the current
 *     plan's occurrence.
 *
 * Never run against production.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rpc-lana-pro-shared-plan.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let fails = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? '  ok  ' : 'FAIL  '}- ${l}`); if (!c) fails += 1; };

async function mkUser(tag: string) {
  const email = `rpc-slp-${tag}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'QaTest123!', email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  // some deploys back the fitness FKs with public.users; upsert so the row
  // exists whether or not the handle_new_user trigger is installed locally.
  await admin.from('users').upsert({ id: uid, email, name: tag, role: 'user' }, { onConflict: 'id' });
  const cli = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: 'QaTest123!' });
  if (sErr) throw sErr;
  return { uid, cli };
}

const WEEK = { from: '2026-09-07', to: '2026-09-13' };
const call = (cli: ReturnType<typeof createClient>, client: string, from = WEEK.from, to = WEEK.to) =>
  cli.rpc('lana_pro_shared_plan_occurrences', { p_clients: [client], p_from: from, p_to: to });

async function main() {
  const coach = await mkUser('coach');
  const other = await mkUser('other');
  const client = await mkUser('client');
  const anon = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: ptRow } = await admin.from('personal_trainers')
    .insert({ user_id: coach.uid, full_name: 'Coach' }).select('id').single();
  const ptId = ptRow!.id as string;
  const { data: otherPt } = await admin.from('personal_trainers')
    .insert({ user_id: other.uid, full_name: 'Other' }).select('id').single();

  const curPlanId = '2026-09-05T10:00:00.123Z';
  const oldPlanId = '2026-08-01T09:00:00.000Z';
  try {
    await admin.from('pt_clients').insert({ pt_id: ptId, client_user_id: client.uid, status: 'active', share_progress: true });
    await admin.from('pt_clients').insert({ pt_id: otherPt!.id, client_user_id: client.uid, status: 'inactive', share_progress: false });
    await admin.from('fitness_profile').upsert({ user_id: client.uid }, { onConflict: 'user_id' });
    await admin.from('fitness_plans').insert({
      user_id: client.uid, plan_id: curPlanId, week_start_date: '2026-09-07', week_end_date: '2026-09-13',
      status: 'active',
      assessment: {
        headline: 'SECRET AI PROSE',
        starting_plan: {
          week_start_date: '2026-09-07',
          activities: [
            { day: 'Monday', title: 'Heavy Lower', category: 'strength', duration_minutes: 60, planned_date: '2026-09-07' },
            { day: 'Tuesday', title: 'Heavy Upper', category: 'strength', duration_minutes: 60, planned_date: '2026-09-08' },
            { day: 'Wednesday', title: 'Conditioning', category: 'cardio', duration_minutes: 40, planned_date: '2026-09-09' },
          ],
        },
      },
    });
    // completions: current plan's index 0 & 1 done (PostgREST "+00:00" form);
    // an OLD plan's index 2 done — must NOT satisfy the current plan.
    await admin.from('plan_activity_completions').insert([
      { user_id: client.uid, plan_id: '2026-09-05T10:00:00.123+00:00', activity_index: 0, planned_date: '2026-09-07', completion_source: 'manual' },
      { user_id: client.uid, plan_id: '2026-09-05T10:00:00.123+00:00', activity_index: 1, planned_date: '2026-09-08', completion_source: 'strava' },
      { user_id: client.uid, plan_id: oldPlanId, activity_index: 2, planned_date: '2026-09-09', completion_source: 'manual' },
    ]);

    const authed = await call(coach.cli, client.uid);
    const rows = (authed.data ?? []) as { planned_date: string; completed: boolean; title: string }[];
    ok('authorized PT sees 3 occurrences', rows.length === 3);
    ok('Mon/Tue completed=true (manual + strava)', rows.filter((r) => r.completed).map((r) => r.planned_date).sort().join(',') === '2026-09-07,2026-09-08');
    ok('Wed completed=false — an OLD plan_id completion does NOT count (§33)', rows.find((r) => r.planned_date === '2026-09-09')?.completed === false);
    ok('no AI prose / completion_source / plan_id in the payload (§3/§11)',
      !JSON.stringify(rows).match(/SECRET AI PROSE|completion_source|plan_id|2026-09-05T10:00/i));

    ok('unrelated PT → 0 rows', ((await call(other.cli, client.uid)).data ?? []).length === 0);
    ok('anonymous → 0 rows', ((await call(anon, client.uid)).data ?? []).length === 0);
    ok('the client themselves → 0 rows (not a professional path)', ((await call(client.cli, client.uid)).data ?? []).length === 0);
    ok('stale/other week → 0 rows', ((await call(coach.cli, client.uid, '2026-09-14', '2026-09-20')).data ?? []).length === 0);

    await admin.from('pt_clients').update({ share_progress: false }).eq('pt_id', ptId).eq('client_user_id', client.uid);
    ok('share_progress = false → 0 rows', ((await call(coach.cli, client.uid)).data ?? []).length === 0);
    await admin.from('pt_clients').update({ share_progress: true, status: 'inactive' }).eq('pt_id', ptId).eq('client_user_id', client.uid);
    ok('inactive relationship → 0 rows', ((await call(coach.cli, client.uid)).data ?? []).length === 0);
  } finally {
    await admin.from('plan_activity_completions').delete().eq('user_id', client.uid);
    await admin.from('fitness_plans').delete().eq('user_id', client.uid);
    await admin.from('fitness_profile').delete().eq('user_id', client.uid);
    await admin.from('pt_clients').delete().eq('client_user_id', client.uid);
    await admin.from('personal_trainers').delete().in('id', [ptId, otherPt!.id]);
    for (const u of [coach.uid, other.uid, client.uid]) await admin.auth.admin.deleteUser(u);
  }
  console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
