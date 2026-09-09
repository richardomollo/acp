/**
 * RPC probe — public.lana_pro_save_workout_template / lana_pro_assign_workout_template
 * (migration 20260922000001). Proves the two multi-row operations the Workout
 * Library UI needs are ATOMIC and RLS-enforced:
 *
 *   • save: create → 1 template + N ordered exercises; a bad exercise in the
 *     batch rolls the WHOLE save back (no orphan parent);
 *   • save: update replaces + reorders exercises;
 *   • assign (independent PT): COPIES template → new workouts + workout_exercises
 *     + workout_schedules, atomically; editing the template afterwards leaves
 *     the assigned copy byte-identical (snapshot immutability);
 *   • assign to a non-relationship client → exception, ZERO client rows;
 *   • PT B cannot save/assign PT A's template; gym trainer can save but not assign.
 *
 * Never run against production.
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rpc-lana-pro-workout-template-rpcs.ts
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let fails = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? '  ok  ' : 'FAIL  '}- ${l}`); if (!c) fails += 1; };

async function mkUser(tag: string) {
  const email = `wtr-${tag}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await admin.auth.admin.createUser({ email, password: 'QaTest123!', email_confirm: true });
  await admin.from('users').upsert({ id: data!.user!.id, email, name: tag, role: 'user' }, { onConflict: 'id' });
  const cli = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: 'QaTest123!' });
  return { uid: data!.user!.id, cli };
}

async function main() {
  const a = await mkUser('pta'), b = await mkUser('ptb'), g = await mkUser('gymt'), client = await mkUser('client');
  const { data: ptA } = await admin.from('personal_trainers').insert({ user_id: a.uid, full_name: 'PT A' }).select('id').single();
  const { data: ptB } = await admin.from('personal_trainers').insert({ user_id: b.uid, full_name: 'PT B' }).select('id').single();
  const { data: gym } = await admin.from('gyms').insert({ name: 'Probe Gym', location: 'Nairobi', area: 'W', type: 'gym' }).select('id').single();
  const { data: gt } = await admin.from('gym_trainers').insert({ gym_id: gym!.id, user_id: g.uid, full_name: 'GT', email: 'gt@ex.com', status: 'active' }).select('id').single();
  await admin.from('pt_clients').insert({ pt_id: ptA!.id, client_user_id: client.uid, status: 'active', share_progress: true });
  const { data: exRows } = await admin.from('exercises').insert([
    { name: 'Bench press', source: 'ACP' }, { name: 'Lat pulldown', source: 'ACP' }, { name: 'Shoulder press', source: 'ACP' },
  ]).select('id');
  const [ex1, ex2, ex3] = exRows!.map((r) => r.id as string);

  let tpl: string | null = null;
  try {
    // ── §50 save (create) ──
    const save = await a.cli.rpc('lana_pro_save_workout_template', {
      p_template_id: null, p_workspace: 'independent', p_title: 'Upper Body Strength', p_description: null,
      p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: 55,
      p_source: 'manual', p_exercises: [
        { exercise_id: ex1, sort_order: 0, sets: 3, reps: 8, rest_seconds: 90 },
        { exercise_id: ex2, sort_order: 1, sets: 3, reps: 10, rest_seconds: 75 },
        { exercise_id: ex3, sort_order: 2, sets: 3, reps: 8, rest_seconds: 90, load_guidance: '70% 1RM' },
      ],
    });
    tpl = save.data as string;
    const { data: rows1 } = await admin.from('workout_template_exercises').select('sort_order, sets, reps, load_guidance').eq('template_id', tpl).order('sort_order');
    ok('§50 save create → 1 template', !save.error && !!tpl);
    ok('§50 → 3 exercises, orders 0/1/2', (rows1 ?? []).map((r) => r.sort_order).join(',') === '0,1,2');
    ok('§50 → load_guidance stored on the template', rows1?.[2]?.load_guidance === '70% 1RM');

    // ── §13 save atomicity: a bad exercise (reps 0) rolls the whole save back ──
    const bad = await a.cli.rpc('lana_pro_save_workout_template', {
      p_template_id: null, p_workspace: 'independent', p_title: 'Should not persist', p_description: null,
      p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: null,
      p_source: 'manual', p_exercises: [{ exercise_id: ex1, sort_order: 0, sets: 3, reps: 0, rest_seconds: 90 }],
    });
    const { count: strayCount } = await admin.from('workout_templates').select('id', { count: 'exact', head: true }).eq('title', 'Should not persist');
    ok('§13 bad exercise → save errors', !!bad.error);
    ok('§13 → NO orphan parent template', (strayCount ?? 0) === 0);

    // ── §36 title required, §11 ≥1 exercise ──
    ok('§11 zero exercises → error', !!(await a.cli.rpc('lana_pro_save_workout_template', { p_template_id: null, p_workspace: 'independent', p_title: 'x', p_description: null, p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: null, p_source: 'manual', p_exercises: [] })).error);

    // ── §51 save (update): replace + reorder ──
    const upd = await a.cli.rpc('lana_pro_save_workout_template', {
      p_template_id: tpl, p_workspace: 'independent', p_title: 'Upper Body Strength v2', p_description: 'edited',
      p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: 55,
      p_source: 'manual', p_exercises: [
        { exercise_id: ex1, sort_order: 0, sets: 3, reps: 8, rest_seconds: 90 },
        { exercise_id: ex3, sort_order: 1, sets: 3, reps: 8, rest_seconds: 90 },
        { exercise_id: ex2, sort_order: 2, sets: 4, reps: 8, rest_seconds: 75 },  // pulldown moved last, 4x8
      ],
    });
    const { data: rows2 } = await admin.from('workout_template_exercises').select('exercise_id, sort_order, sets').eq('template_id', tpl).order('sort_order');
    ok('§51 update ok, still one template', !upd.error && (upd.data as string) === tpl);
    ok('§51 exercises replaced + reordered', (rows2 ?? []).length === 3 && rows2?.[2]?.exercise_id === ex2 && rows2?.[2]?.sets === 4);

    // ── §48 PT B cannot save PT A's template ──
    ok('§48 PT B cannot update PT A template', !!(await b.cli.rpc('lana_pro_save_workout_template', { p_template_id: tpl, p_workspace: 'independent', p_title: 'hijack', p_description: null, p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: null, p_source: 'manual', p_exercises: [{ exercise_id: ex1, sort_order: 0, sets: 3, reps: 3, rest_seconds: 60 }] })).error);

    // ── gym trainer can save (employed) ──
    const gSave = await g.cli.rpc('lana_pro_save_workout_template', { p_template_id: null, p_workspace: 'employed', p_title: 'Gym Strength', p_description: null, p_category: 'strength', p_location_type: 'gym', p_difficulty: 'intermediate', p_estimated_duration_minutes: 40, p_source: 'manual', p_exercises: [{ exercise_id: ex1, sort_order: 0, sets: 3, reps: 8, rest_seconds: 90 }] });
    ok('gym trainer can save an employed-owned template', !gSave.error && !!gSave.data);

    // ── §54 assign (independent PT) ──
    const asg = await a.cli.rpc('lana_pro_assign_workout_template', {
      p_template_id: tpl, p_client: client.uid, p_start_date: '2026-09-16', p_time: '18:00',
      p_recurrence: 'once', p_weekdays: [], p_location_type: 'gym', p_location_address: null,
    });
    const row = Array.isArray(asg.data) ? asg.data[0] : asg.data;
    ok('§54 assign returns workout_id + workout_schedule_id', !asg.error && !!row?.workout_id && !!row?.workout_schedule_id);
    const { data: wex } = await admin.from('workout_exercises').select('exercise_id, sort_order, sets, notes').eq('workout_id', row.workout_id).order('sort_order');
    ok('§54 workout_exercises snapshot copied (3 rows, order preserved)', (wex ?? []).length === 3 && wex?.[2]?.exercise_id === ex2 && wex?.[2]?.sets === 4);
    const { data: sched } = await admin.from('workout_schedules').select('user_id, workout_id, recurrence, assigned_by').eq('id', row.workout_schedule_id).single();
    ok('§36 workout_schedules row → client + this workout + this PT', sched?.user_id === client.uid && sched?.workout_id === row.workout_id && sched?.assigned_by === ptA!.id);
    const { data: wk } = await admin.from('workouts').select('user_id, assigned_by, duration_minutes, title').eq('id', row.workout_id).single();
    ok('§31/§32 workouts row → client, assigned_by PT, duration set, title copied', wk?.user_id === client.uid && wk?.assigned_by === ptA!.id && (wk?.duration_minutes ?? 0) > 0 && wk?.title === 'Upper Body Strength v2');

    // ── §38/§55 snapshot immutability: edit template, assigned copy unchanged ──
    const before = JSON.stringify((wex ?? []).map((r) => [r.exercise_id, r.sort_order, r.sets]));
    await a.cli.rpc('lana_pro_save_workout_template', {
      p_template_id: tpl, p_workspace: 'independent', p_title: 'RENAMED', p_description: null, p_category: 'hypertrophy',
      p_location_type: 'home', p_difficulty: 'advanced', p_estimated_duration_minutes: 99, p_source: 'manual',
      p_exercises: [{ exercise_id: ex1, sort_order: 0, sets: 5, reps: 5, rest_seconds: 120 }],  // 1 exercise, 5x5
    });
    const { data: wexAfter } = await admin.from('workout_exercises').select('exercise_id, sort_order, sets').eq('workout_id', row.workout_id).order('sort_order');
    ok('§38/§55 assigned copy UNCHANGED after template edit', JSON.stringify((wexAfter ?? []).map((r) => [r.exercise_id, r.sort_order, r.sets])) === before);

    // ── §56 assignment to a non-relationship client → exception, zero client rows ──
    const { count: wkBefore } = await admin.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', b.uid);
    const badAsg = await a.cli.rpc('lana_pro_assign_workout_template', { p_template_id: tpl, p_client: b.uid, p_start_date: '2026-09-16', p_time: '18:00', p_recurrence: 'once', p_weekdays: [], p_location_type: null, p_location_address: null });
    const { count: wkAfter } = await admin.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', b.uid);
    ok('§56 assign to non-client → error', !!badAsg.error);
    ok('§56 → zero partial workouts rows', (wkAfter ?? 0) === (wkBefore ?? 0));

    // ── §48 PT B cannot assign PT A's template ──
    ok('§48 PT B cannot assign PT A template', !!(await b.cli.rpc('lana_pro_assign_workout_template', { p_template_id: tpl, p_client: client.uid, p_start_date: '2026-09-16', p_time: '18:00', p_recurrence: 'once', p_weekdays: [], p_location_type: null, p_location_address: null })).error);

    // ── gym trainer cannot assign (independent-PT only V1) ──
    ok('gym trainer cannot assign', !!(await g.cli.rpc('lana_pro_assign_workout_template', { p_template_id: gSave.data, p_client: client.uid, p_start_date: '2026-09-16', p_time: '18:00', p_recurrence: 'once', p_weekdays: [], p_location_type: null, p_location_address: null })).error);
  } finally {
    // best-effort teardown
    const { data: mine } = await admin.from('workout_templates').select('id').or(`owner_pt_id.in.(${ptA!.id},${ptB!.id}),owner_gym_trainer_id.eq.${gt!.id}`);
    for (const t of mine ?? []) await admin.from('workout_template_exercises').delete().eq('template_id', t.id);
    await admin.from('workout_templates').delete().or(`owner_pt_id.in.(${ptA!.id},${ptB!.id}),owner_gym_trainer_id.eq.${gt!.id}`);
    for (const u of [client.uid, b.uid]) {
      const { data: ws } = await admin.from('workouts').select('id').eq('user_id', u);
      for (const w of ws ?? []) { await admin.from('workout_schedules').delete().eq('workout_id', w.id); await admin.from('workout_exercises').delete().eq('workout_id', w.id); }
      await admin.from('workouts').delete().eq('user_id', u);
    }
    await admin.from('pt_clients').delete().eq('client_user_id', client.uid);
    await admin.from('exercises').delete().in('id', [ex1, ex2, ex3]);
    await admin.from('gym_trainers').delete().eq('id', gt!.id);
    await admin.from('gyms').delete().eq('id', gym!.id);
    await admin.from('personal_trainers').delete().in('id', [ptA!.id, ptB!.id]);
    for (const u of [a.uid, b.uid, g.uid, client.uid]) await admin.auth.admin.deleteUser(u);
  }
  console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
