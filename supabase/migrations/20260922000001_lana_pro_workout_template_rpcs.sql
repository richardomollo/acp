-- LANA PRO — atomic RPCs for the Workout Library UI.
--
-- supabase-js has no client transaction API, so the two multi-row operations
-- the UI needs cannot be made atomic from the browser:
--
--   1. SAVE a template  = insert/update workout_templates + reconcile its
--      workout_template_exercises. A failed second write would orphan a parent
--      template, and hard DELETE of a template is intentionally denied
--      (20260921000001) — so the orphan could not be cleaned up.
--
--   2. ASSIGN a template = copy into a NEW client-bound workouts row + NEW
--      workout_exercises snapshot + a workout_schedules row (the canonical PT
--      plan Client Progress / Training This Week / Adherence already read). A
--      failure after the first write orphans client-facing prescription data,
--      and a PT cannot DELETE a workouts row either.
--
-- Both are plain SECURITY INVOKER plpgsql functions: every statement still runs
-- under the caller's RLS (the existing owner / "Trainers assign …" / "Trainers
-- schedule …" policies), and the whole function body is ONE transaction, so a
-- partial failure rolls back completely. No SECURITY DEFINER, no service role,
-- no new RLS on existing tables.
--
-- ASSIGN is INDEPENDENT-PT ONLY for V1: workout_schedules has no
-- assigned_by_gym_trainer_id column and no gym-trainer INSERT policy, so a
-- gym trainer cannot create a schedule row at all (employed scheduling is not
-- modelled). Gym trainers can still create / edit / archive templates.

begin;

-- ── save (create or full replace) a workout template + its exercises ──────
create or replace function public.lana_pro_save_workout_template(
  p_template_id                uuid,          -- null → create; else update this template
  p_workspace                  text,          -- 'independent' | 'employed'
  p_title                      text,
  p_description                text,
  p_category                   text,
  p_location_type              text,          -- 'home' | 'gym' | 'both'
  p_difficulty                 text,          -- 'beginner' | 'intermediate' | 'advanced'
  p_estimated_duration_minutes integer,       -- nullable
  p_source                     text,          -- 'manual' | 'lana_generated'
  p_exercises                  jsonb          -- [{exercise_id, sort_order?, sets?, reps?, duration_seconds?, rest_seconds?, load_guidance?, notes?}]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_pt uuid;
  v_owner_gt uuid;
  v_id       uuid;
begin
  if p_title is null or btrim(p_title) = '' then raise exception 'title is required'; end if;
  if p_category is null or btrim(p_category) = '' then raise exception 'category is required'; end if;
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) = 0 then
    raise exception 'at least one exercise is required';
  end if;

  if p_workspace = 'employed' then
    select id into v_owner_gt from public.gym_trainers
      where user_id = auth.uid() and status = 'active' limit 1;
    if v_owner_gt is null then raise exception 'caller is not an active gym trainer'; end if;
  else
    select id into v_owner_pt from public.personal_trainers where user_id = auth.uid() limit 1;
    if v_owner_pt is null then raise exception 'caller is not a personal trainer'; end if;
  end if;

  if p_template_id is null then
    insert into public.workout_templates
      (owner_pt_id, owner_gym_trainer_id, title, description, category,
       location_type, difficulty, estimated_duration_minutes, source)
    values
      (v_owner_pt, v_owner_gt, btrim(p_title), nullif(btrim(coalesce(p_description,'')), ''), btrim(p_category),
       coalesce(p_location_type, 'both'), coalesce(p_difficulty, 'intermediate'),
       p_estimated_duration_minutes, coalesce(p_source, 'manual'))
    returning id into v_id;                                   -- RLS INSERT policy: owner = caller
  else
    update public.workout_templates set
      title = btrim(p_title),
      description = nullif(btrim(coalesce(p_description,'')), ''),
      category = btrim(p_category),
      location_type = coalesce(p_location_type, 'both'),
      difficulty = coalesce(p_difficulty, 'intermediate'),
      estimated_duration_minutes = p_estimated_duration_minutes,
      source = coalesce(p_source, source)
    where id = p_template_id
    returning id into v_id;                                   -- RLS UPDATE policy: owner = caller
    if v_id is null then raise exception 'template not found or not owned by caller'; end if;
    delete from public.workout_template_exercises where template_id = v_id;   -- RLS: parent owned by caller
  end if;

  insert into public.workout_template_exercises
    (template_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds, load_guidance, notes)
  select
    v_id,
    (e ->> 'exercise_id')::uuid,
    coalesce(nullif(e ->> 'sort_order', '')::int, (ord - 1)::int),
    nullif(e ->> 'sets', '')::int,
    nullif(e ->> 'reps', '')::int,
    nullif(e ->> 'duration_seconds', '')::int,
    coalesce(nullif(e ->> 'rest_seconds', '')::int, 60),
    nullif(btrim(e ->> 'load_guidance'), ''),
    nullif(btrim(e ->> 'notes'), '')
  from jsonb_array_elements(p_exercises) with ordinality as t(e, ord);   -- table CHECKs + RLS enforce validity

  return v_id;
end;
$$;

comment on function public.lana_pro_save_workout_template(uuid, text, text, text, text, text, text, integer, text, jsonb) is
  'Lana Pro: atomically create/replace a workout template + its ordered exercises, under the caller''s own RLS. Ownership is derived from auth.uid() + workspace, never from the payload.';

revoke all on function public.lana_pro_save_workout_template(uuid, text, text, text, text, text, text, integer, text, jsonb) from public;
grant execute on function public.lana_pro_save_workout_template(uuid, text, text, text, text, text, text, integer, text, jsonb) to authenticated;

-- ── assign (copy-on-assign) a template to one client + schedule it ───────
create or replace function public.lana_pro_assign_workout_template(
  p_template_id      uuid,
  p_client           uuid,
  p_start_date       date,
  p_time             time,
  p_recurrence       text,          -- 'once' | 'daily' | 'weekly'
  p_weekdays         smallint[],    -- 0=Sun..6=Sat, only for 'weekly'
  p_location_type    text,          -- 'gym' | 'home' | 'outdoor' | null  (workout_schedules vocabulary)
  p_location_address text
)
returns table (workout_id uuid, workout_schedule_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pt       uuid;
  v_t        public.workout_templates%rowtype;
  v_workout  uuid;
  v_sched    uuid;
  v_duration integer;
begin
  select id into v_pt from public.personal_trainers where user_id = auth.uid() limit 1;
  if v_pt is null then raise exception 'assignment is available to independent personal trainers only in V1'; end if;

  select * into v_t from public.workout_templates where id = p_template_id;   -- RLS: owner SELECT only
  if v_t.id is null then raise exception 'template not found or not owned by caller'; end if;
  if v_t.owner_pt_id is distinct from v_pt then raise exception 'template not owned by caller'; end if;

  if not exists (
    select 1 from public.pt_clients
    where pt_id = v_pt and client_user_id = p_client and status = 'active'
  ) then
    raise exception 'no active relationship with this client';
  end if;

  -- deterministic duration when the template has none: sum of
  -- sets × (work + rest) seconds, ≥ 10 min. workouts.duration_minutes is NOT NULL.
  v_duration := coalesce(
    v_t.estimated_duration_minutes,
    (select greatest(10, ceil(sum(
       coalesce(te.sets, 1) * (coalesce(te.duration_seconds, coalesce(te.reps, 10) * 4) + te.rest_seconds)
     ) / 60.0)::int)
     from public.workout_template_exercises te where te.template_id = p_template_id),
    30);

  insert into public.workouts
    (title, description, category, location_type, difficulty, duration_minutes, is_active, user_id, assigned_by)
  values
    (v_t.title, v_t.description, v_t.category,
     case when v_t.location_type in ('home', 'gym', 'both') then v_t.location_type else 'both' end,
     v_t.difficulty, v_duration, true, p_client, v_pt)
  returning id into v_workout;                                -- RLS: "Trainers assign workouts to active clients"

  insert into public.workout_exercises
    (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds, notes)
  select
    v_workout, te.exercise_id, te.sort_order, te.sets, te.reps, te.duration_seconds, te.rest_seconds,
    -- load_guidance has no workout_exercises column — fold it into notes with a
    -- clear prefix rather than drop it silently (report §U/§33).
    nullif(concat_ws(E'\n',
      case when nullif(btrim(te.load_guidance), '') is not null then 'Load: ' || btrim(te.load_guidance) end,
      nullif(btrim(te.notes), '')), '')
  from public.workout_template_exercises te
  where te.template_id = p_template_id
  order by te.sort_order;                                     -- RLS: "Trainers manage exercises on assigned workouts"

  insert into public.workout_schedules
    (user_id, workout_id, start_date, time_of_day, recurrence, weekdays, is_active, assigned_by, location_type, location_address)
  values
    (p_client, v_workout, p_start_date, coalesce(p_time, '18:00'::time),
     coalesce(p_recurrence, 'once'), coalesce(p_weekdays, '{}'::smallint[]),
     true, v_pt, p_location_type, p_location_address)
  returning id into v_sched;                                  -- RLS: "Trainers schedule workouts for active clients"

  return query select v_workout, v_sched;
end;
$$;

comment on function public.lana_pro_assign_workout_template(uuid, uuid, date, time, text, smallint[], text, text) is
  'Lana Pro: atomically COPY a workout template into a new client-bound workouts row + workout_exercises snapshot + workout_schedules row, under the caller''s RLS. Independent-PT only in V1. Editing the template afterwards never touches the copy.';

revoke all on function public.lana_pro_assign_workout_template(uuid, uuid, date, time, text, smallint[], text, text) from public;
grant execute on function public.lana_pro_assign_workout_template(uuid, uuid, date, time, text, smallint[], text, text) to authenticated;

commit;
