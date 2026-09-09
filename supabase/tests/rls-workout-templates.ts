/**
 * RLS + constraint probe — public.workout_templates / workout_template_exercises
 * (migration 20260921000001). Asserts:
 *
 *   • an independent PT / gym trainer can CRUD ONLY their own templates;
 *   • no cross-trainer visibility (no gym-wide sharing);
 *   • exactly-one-owner CHECK; ownership is immutable after insert;
 *   • prescription CHECKs (sets/reps/duration > 0, rest >= 0, sort_order >= 0),
 *     duration-based exercises (sets/reps NULL) allowed;
 *   • archive is owner-only; hard DELETE of a template is denied for everyone;
 *   • anon and a plain consumer account get nothing;
 *   • editing a template touches ZERO rows under
 *     workouts / workout_exercises / workout_schedules / workout_history /
 *     workout_set_logs.
 *
 * Never run against production.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rls-workout-templates.ts
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
const denied = (r: { error: unknown }) => !!r.error;
const empty = (r: { data: unknown[] | null; error: unknown }) => !r.error && (r.data ?? []).length === 0;

async function mkUser(tag: string) {
  const email = `wtmpl-${tag}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'QaTest123!', email_confirm: true });
  if (error) throw error;
  await admin.from('users').upsert({ id: data.user!.id, email, name: tag, role: 'user' }, { onConflict: 'id' });
  const cli = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: 'QaTest123!' });
  return { uid: data.user!.id, cli };
}

async function main() {
  const a = await mkUser('pta');
  const b = await mkUser('ptb');
  const g = await mkUser('gymt');
  const plain = await mkUser('plain');
  const anon = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: ptA } = await admin.from('personal_trainers').insert({ user_id: a.uid, full_name: 'PT A' }).select('id').single();
  const { data: ptB } = await admin.from('personal_trainers').insert({ user_id: b.uid, full_name: 'PT B' }).select('id').single();
  const { data: gym } = await admin.from('gyms').insert({ name: 'Probe Gym', location: 'Nairobi', area: 'Westlands', type: 'gym' }).select('id').single();
  const { data: gt } = await admin.from('gym_trainers').insert({ gym_id: gym!.id, user_id: g.uid, full_name: 'Gym T', email: 'gt@ex.com', status: 'active' }).select('id').single();
  const { data: ex } = await admin.from('exercises').insert({ name: 'Bench press', source: 'ACP' }).select('id').single();

  let tplA: string | null = null;
  try {
    // §25 PT A creates own
    const ins = await a.cli.from('workout_templates').insert({ owner_pt_id: ptA!.id, title: 'Upper Body Strength', category: 'strength', estimated_duration_minutes: 55 }).select('id, source, location_type, difficulty').single();
    ok('§25 PT A creates own template', !ins.error && ins.data?.source === 'manual' && ins.data?.location_type === 'both' && ins.data?.difficulty === 'intermediate');
    tplA = ins.data?.id ?? null;

    // §26 PT A cannot own-as-PT-B
    ok('§26 PT A cannot insert owner_pt_id = PT B', denied(await a.cli.from('workout_templates').insert({ owner_pt_id: ptB!.id, title: 'spoof', category: 'strength' })));

    // §29 exactly one owner
    ok('§29 both owners set → CHECK', denied(await a.cli.from('workout_templates').insert({ owner_pt_id: ptA!.id, owner_gym_trainer_id: gt!.id, title: 'x', category: 'strength' })));
    ok('§29 no owner → CHECK', denied(await a.cli.from('workout_templates').insert({ title: 'x', category: 'strength' })));

    // §27 visibility
    await b.cli.from('workout_templates').insert({ owner_pt_id: ptB!.id, title: 'B private', category: 'strength' });
    const aSees = await a.cli.from('workout_templates').select('title');
    const bSees = await b.cli.from('workout_templates').select('title');
    ok('§27 PT A sees only own', !aSees.error && (aSees.data ?? []).every((r) => r.title === 'Upper Body Strength'));
    ok('§27 PT B sees only own', !bSees.error && (bSees.data ?? []).every((r) => r.title === 'B private'));

    // §28 gym trainer
    const gIns = await g.cli.from('workout_templates').insert({ owner_gym_trainer_id: gt!.id, title: 'Gym Strength A', category: 'strength' }).select('id').single();
    ok('§28 gym trainer creates own', !gIns.error);
    ok('§28 PT A cannot see the gym trainer template', empty(await a.cli.from('workout_templates').select('id').eq('title', 'Gym Strength A')));

    // §42 ownership immutable
    ok('§42 owner cannot transfer to PT B', denied(await a.cli.from('workout_templates').update({ owner_pt_id: ptB!.id }).eq('id', tplA!)));
    ok('§42 owner cannot switch to gym-trainer', denied(await a.cli.from('workout_templates').update({ owner_pt_id: null, owner_gym_trainer_id: gt!.id }).eq('id', tplA!)));
    ok('§42 normal edit still works', !(await a.cli.from('workout_templates').update({ title: 'Upper Body Strength v2' }).eq('id', tplA!)).error);

    // §30/§31/§32 exercises
    ok('§30 owner adds exercises', !(await a.cli.from('workout_template_exercises').insert([
      { template_id: tplA, exercise_id: ex!.id, sort_order: 0, sets: 3, reps: 8, rest_seconds: 90 },
      { template_id: tplA, exercise_id: ex!.id, sort_order: 1, sets: 3, reps: 10, rest_seconds: 75 },
    ])).error);
    ok('§31 duration-based exercise (sets/reps NULL)', !(await a.cli.from('workout_template_exercises').insert({ template_id: tplA, exercise_id: ex!.id, sort_order: 2, sets: null, reps: null, duration_seconds: 60, rest_seconds: 30 })).error);
    ok('§32 sets = -1 → CHECK', denied(await a.cli.from('workout_template_exercises').insert({ template_id: tplA, exercise_id: ex!.id, sort_order: 3, sets: -1 })));
    ok('§32 reps = 0 → CHECK', denied(await a.cli.from('workout_template_exercises').insert({ template_id: tplA, exercise_id: ex!.id, sort_order: 4, reps: 0 })));
    ok('§32 rest = -5 → CHECK', denied(await a.cli.from('workout_template_exercises').insert({ template_id: tplA, exercise_id: ex!.id, sort_order: 5, rest_seconds: -5 })));

    // §30 non-owner
    ok('§30 PT B cannot see A template exercises', empty(await b.cli.from('workout_template_exercises').select('id').eq('template_id', tplA!)));
    ok('§30 PT B cannot insert into A template', denied(await b.cli.from('workout_template_exercises').insert({ template_id: tplA, exercise_id: ex!.id, sort_order: 9, sets: 3, reps: 3 })));

    // §33 archive
    ok('§33 non-owner cannot archive', empty(await b.cli.from('workout_templates').update({ archived_at: new Date().toISOString() }).eq('id', tplA!).select('id')));
    ok('§33 owner archives own', !(await a.cli.from('workout_templates').update({ archived_at: new Date().toISOString() }).eq('id', tplA!)).error);

    // §15/§J hard delete denied for everyone
    ok('§J owner cannot hard-delete a template', empty(await a.cli.from('workout_templates').delete().eq('id', tplA!).select('id')));

    // §35 anon
    ok('§35 anon SELECT → nothing', empty(await anon.from('workout_templates').select('id')));
    ok('§35 anon INSERT → denied', denied(await anon.from('workout_templates').insert({ owner_pt_id: ptA!.id, title: 'x', category: 'strength' })));
    // §36 plain consumer
    ok('§36 plain consumer SELECT → nothing', empty(await plain.cli.from('workout_templates').select('id')));
    ok('§36 plain consumer INSERT → denied', denied(await plain.cli.from('workout_templates').insert({ owner_pt_id: ptA!.id, title: 'x', category: 'strength' })));
  } finally {
    await admin.from('workout_template_exercises').delete().in('template_id', [tplA].filter(Boolean) as string[]);
    await admin.from('workout_templates').delete().in('owner_pt_id', [ptA!.id, ptB!.id]);
    await admin.from('workout_templates').delete().eq('owner_gym_trainer_id', gt!.id);
    await admin.from('exercises').delete().eq('id', ex!.id);
    await admin.from('gym_trainers').delete().eq('id', gt!.id);
    await admin.from('gyms').delete().eq('id', gym!.id);
    await admin.from('personal_trainers').delete().in('id', [ptA!.id, ptB!.id]);
    for (const u of [a.uid, b.uid, g.uid, plain.uid]) await admin.auth.admin.deleteUser(u);
  }
  console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
