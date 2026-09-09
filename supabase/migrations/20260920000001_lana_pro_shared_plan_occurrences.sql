-- LANA PRO — narrow shared projection of a client's Lana-generated training
-- plan (dated planned occurrences + AUTHORITATIVE completion) for a
-- consenting professional. This is what makes Lana Pro's "Training this week"
-- and adherence facts agree with the consumer app, without exposing broader
-- client-owned state.
--
-- Why a SECURITY DEFINER function and NOT a trainer RLS policy on
-- plan_activity_completions / fitness_plans / fitness_profile.ai_assessment:
-- those rows also carry the AI reasoning prose, headline, next-steps,
-- completion_source, source_entity_id and full plan snapshots — none of which
-- a PT should see. The function returns ONLY
--   { client_user_id, planned_date, title, category, duration_minutes, completed }
-- and internally enforces the exact same predicate every other
-- share_progress gate uses:
--   authenticated caller
--   + active pt_clients / gym_trainer_clients relationship to the client
--   + share_progress = true
--
-- Batch by design: one call covers a whole authorized roster over a date
-- range, so Home never issues one RPC per client. Client detail calls it with
-- a single-element array.
--
-- Plan/version identity: plan_activity_completions.plan_id and
-- fitness_plans.plan_id both derive from ai_assessment_generated_at, but were
-- serialised by different writers (JS `toISOString()` → "…Z" vs PostgREST
-- `to_json` → "…+00:00"). They are compared as `::timestamptz` so a
-- completion only ever satisfies an occurrence of the SAME generated plan —
-- a regenerated plan (new generated_at) naturally stops matching.

create or replace function public.lana_pro_shared_plan_occurrences(
  p_clients uuid[],
  p_from    date,
  p_to      date
)
returns table (
  client_user_id   uuid,
  planned_date     date,
  title            text,
  category         text,
  duration_minutes integer,
  completed        boolean
)
language sql
security definer
stable
set search_path = public
set timezone = 'UTC'
as $$
  with authorized as (
    select c.cid as client_user_id
    from unnest(coalesce(p_clients, '{}'::uuid[])) as c(cid)
    where auth.uid() is not null
      and (
        exists (
          select 1
          from public.pt_clients pc
          join public.personal_trainers pt on pt.id = pc.pt_id
          where pc.client_user_id = c.cid
            and pt.user_id = auth.uid()
            and pc.status = 'active'
            and pc.share_progress = true
        )
        or exists (
          select 1
          from public.gym_trainer_clients gtc
          join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
          where gtc.client_user_id = c.cid
            and gt.user_id = auth.uid()
            and gtc.status = 'active'
            and gtc.share_progress = true
        )
      )
  ),
  plans as (
    -- historical + current plan snapshots for weeks overlapping [p_from, p_to]
    select a.client_user_id, fp.plan_id::text as plan_id, fp.assessment as assessment
    from authorized a
    join public.fitness_plans fp on fp.user_id = a.client_user_id
    where fp.week_start_date <= p_to
      and fp.week_end_date   >= p_from
    union all
    -- the live current plan, only when fitness_plans has no row for its week
    select a.client_user_id, prof.ai_assessment_generated_at::text as plan_id, prof.ai_assessment as assessment
    from authorized a
    join public.fitness_profile prof on prof.user_id = a.client_user_id
    where prof.ai_assessment is not null
      and prof.ai_assessment_generated_at is not null
      and (prof.ai_assessment #>> '{starting_plan,week_start_date}') is not null
      and (prof.ai_assessment #>> '{starting_plan,week_start_date}')::date between p_from and p_to
      and not exists (
        select 1 from public.fitness_plans fp2
        where fp2.user_id = a.client_user_id
          and fp2.week_start_date = (prof.ai_assessment #>> '{starting_plan,week_start_date}')::date
      )
  ),
  occ as (
    select
      p.client_user_id,
      p.plan_id,
      (x.ord - 1)::int as activity_index,
      nullif(x.elem ->> 'planned_date', '')::date as planned_date,
      coalesce(nullif(x.elem ->> 'title', ''), nullif(x.elem ->> 'activity', ''), 'Planned workout') as title,
      nullif(x.elem ->> 'category', '') as category,
      nullif(x.elem ->> 'duration_minutes', '')::numeric::int as duration_minutes
    from plans p
    cross join lateral jsonb_array_elements(p.assessment #> '{starting_plan,activities}')
      with ordinality as x(elem, ord)
  )
  select
    o.client_user_id,
    o.planned_date,
    o.title,
    o.category,
    o.duration_minutes,
    exists (
      select 1
      from public.plan_activity_completions c
      where c.user_id = o.client_user_id
        and c.activity_index = o.activity_index
        and c.plan_id::timestamptz = o.plan_id::timestamptz
    ) as completed
  from occ o
  where o.planned_date is not null
    and o.planned_date between p_from and p_to
  order by o.client_user_id, o.planned_date, o.title;
$$;

comment on function public.lana_pro_shared_plan_occurrences(uuid[], date, date) is
  'Lana Pro: consent-gated projection of a client''s Lana-generated plan occurrences + authoritative completion. Returns nothing for unauthenticated / unrelated / inactive / non-sharing callers. Minimal fields only.';

revoke all on function public.lana_pro_shared_plan_occurrences(uuid[], date, date) from public;
grant execute on function public.lana_pro_shared_plan_occurrences(uuid[], date, date) to authenticated;
