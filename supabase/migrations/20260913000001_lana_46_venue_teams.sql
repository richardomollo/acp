-- LANA PRO — Phase 4.6: Venue Teams & Employed Professionals.
--
-- Additive only. Lets a gym / studio / spa that EMPLOYS professionals:
--   • sell venue-owned appointment services   (gym_services          — exists)
--   • assign an employed professional          (gym_service_providers — exists)
--   • BOOK those appointments                   ← the one missing primitive
--   • deliver a coaching session against that booking, reusing
--     professional_session_records (professional_kind='gym_trainer', reserved
--     in 20260911000001 — now given RLS + a booking_source value)
--   • read consent-gated client progress ONLY when the client has explicitly
--     set gym_trainer_clients.share_progress = true
--
-- Nothing here touches personal_trainers / pt_clients / pt_bookings /
-- pt_offerings / client_tasks. No column dropped, no NOT NULL added to an
-- existing table, no CHECK tightened. Business ownership never implies
-- health-data consent.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. gym_service_bookings — the venue appointment booking home (§5)
--    VENUE-OWNED SERVICE + EMPLOYED-PROFESSIONAL DELIVERY + CLIENT APPOINTMENT
-- ─────────────────────────────────────────────────────────────────────────
create table public.gym_service_bookings (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(id)          on delete cascade,
  gym_service_id   uuid not null references public.gym_services(id)  on delete restrict,
  gym_trainer_id   uuid          references public.gym_trainers(id)  on delete set null,
  client_user_id   uuid not null references public.users(id)         on delete cascade,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60
                     check (duration_minutes > 0 and duration_minutes <= 600),
  status           text not null default 'pending'
                     check (status in ('pending','confirmed','completed','cancelled','no_show')),
  payment_status   text not null default 'not_collected'
                     check (payment_status in ('not_collected','pending','paid','refunded')),
  price_kes        numeric,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.gym_service_bookings is
  'Phase 4.6 — a client appointment for a venue-owned gym_services row, delivered '
  'by an employed gym_trainers provider. Distinct from pt_bookings (independent PT) '
  'and bookings (class attendance). Revenue belongs to the venue, never the trainer.';

-- Cheap accidental-double-booking guard (§11): one live appointment per trainer
-- per exact start. NOT an availability engine — cross-system class / PT overlap
-- is out of scope for Phase 4.6.
create unique index gym_service_bookings_trainer_slot_uniq
  on public.gym_service_bookings (gym_trainer_id, starts_at)
  where gym_trainer_id is not null and status in ('pending','confirmed');

create index gym_service_bookings_gym_idx     on public.gym_service_bookings (gym_id, starts_at);
create index gym_service_bookings_trainer_idx on public.gym_service_bookings (gym_trainer_id, starts_at);
create index gym_service_bookings_client_idx  on public.gym_service_bookings (client_user_id, starts_at);

create trigger gym_service_bookings_updated_at
  before update on public.gym_service_bookings
  for each row execute function public.set_updated_at();

alter table public.gym_service_bookings enable row level security;

-- ── RLS: venue owner ── full control of their own gym's bookings ──────────
create policy "Partners manage their gym service bookings"
  on public.gym_service_bookings for all
  using (
    gym_id in (
      select pg.gym_id from public.partner_gyms pg
      join public.partners p on p.id = pg.partner_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    gym_id in (
      select pg.gym_id from public.partner_gyms pg
      join public.partners p on p.id = pg.partner_id
      where p.user_id = auth.uid()
    )
  );

-- ── RLS: assigned employed professional ── see + operate own appointments ─
create policy "Gym trainers view their assigned service bookings"
  on public.gym_service_bookings for select
  using (
    gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
  );

create policy "Gym trainers create bookings for their roster clients"
  on public.gym_service_bookings for insert
  with check (
    gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
    and exists (
      select 1 from public.gym_trainer_clients gtc
      where gtc.gym_trainer_id = gym_service_bookings.gym_trainer_id
        and gtc.client_user_id = gym_service_bookings.client_user_id
        and gtc.status = 'active'
    )
  );

create policy "Gym trainers update their assigned service bookings"
  on public.gym_service_bookings for update
  using (
    gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
  )
  with check (
    gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
  );

-- ── RLS: client ── see own appointments, cancel own ─────────────────────
create policy "Clients view their own service bookings"
  on public.gym_service_bookings for select
  using (client_user_id = auth.uid());

create policy "Clients cancel their own service bookings"
  on public.gym_service_bookings for update
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid());

-- ── column-level guard ── RLS can't restrict columns. Only the venue owner
--    may change commercial fields; the trainer may move operational status /
--    notes; the client may only cancel. (Same pattern as the Phase 4.5
--    client_tasks guard.)
create or replace function public.gym_service_bookings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_partner boolean;
  _is_trainer boolean;
begin
  -- service_role / definer / admin contexts (no end-user JWT) are unrestricted.
  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1 from public.partner_gyms pg
    join public.partners p on p.id = pg.partner_id
    where p.user_id = auth.uid() and pg.gym_id = old.gym_id
  ) into _is_partner;

  if _is_partner then
    return new;                       -- venue owner: unrestricted
  end if;

  select exists (
    select 1 from public.gym_trainers gt
    where gt.id = old.gym_trainer_id and gt.user_id = auth.uid()
  ) into _is_trainer;

  -- Everyone else may only move operational fields — freeze the rest to OLD.
  new.gym_id          := old.gym_id;
  new.gym_service_id   := old.gym_service_id;
  new.gym_trainer_id   := old.gym_trainer_id;
  new.client_user_id   := old.client_user_id;
  new.starts_at        := old.starts_at;
  new.duration_minutes := old.duration_minutes;
  new.price_kes        := old.price_kes;
  new.payment_status   := old.payment_status;
  new.created_by       := old.created_by;
  new.created_at       := old.created_at;

  if not _is_trainer then
    -- client: cancellation only
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'clients may only cancel a service booking';
    end if;
    new.notes := old.notes;
  end if;

  return new;
end;
$$;

create trigger gym_service_bookings_guard_trg
  before update on public.gym_service_bookings
  for each row execute function public.gym_service_bookings_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. professional_session_records — enable professional_kind='gym_trainer'
-- ─────────────────────────────────────────────────────────────────────────
alter table public.professional_session_records
  drop constraint if exists professional_session_records_booking_source_check;
alter table public.professional_session_records
  add constraint professional_session_records_booking_source_check
  check (booking_source in ('pt_booking','gym_service_booking'));

create policy "Gym trainers manage their own session records"
  on public.professional_session_records for all
  using (
    professional_kind = 'gym_trainer'
    and gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
  )
  with check (
    professional_kind = 'gym_trainer'
    and gym_trainer_id in (select id from public.gym_trainers where user_id = auth.uid())
    and (
      client_user_id is null
      or exists (
        select 1 from public.gym_trainer_clients gtc
        where gtc.gym_trainer_id = professional_session_records.gym_trainer_id
          and gtc.client_user_id = professional_session_records.client_user_id
          and gtc.status = 'active'
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. get_client_session_feed — surface BOTH professional kinds (§20)
--    client_user_id = auth.uid() remains the ONLY trust boundary.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.get_client_session_feed(p_limit integer default 20)
returns table(
  session_id uuid, service_type text, professional_flavour text, focus text,
  client_summary text, follow_up_at date, completed_at timestamptz, professional_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.service_type,
    s.professional_flavour,
    s.focus,
    s.client_summary,
    s.follow_up_at,
    s.completed_at,
    coalesce(pt.professional_name, pt.full_name, gt.full_name, 'Your coach')
  from public.professional_session_records s
  left join public.personal_trainers pt on pt.id = s.personal_trainer_id
  left join public.gym_trainers      gt on gt.id = s.gym_trainer_id
  where s.client_user_id = auth.uid()
    and s.session_status = 'completed'
  order by s.completed_at desc nulls last
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.get_client_session_feed(integer) from anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. consent-gated progress reads for EMPLOYED professionals (§17)
--    Contract: gym_trainer_clients.status='active' AND share_progress=true
--    AND the gym_trainer belongs to auth.uid(). Venue owner NEVER gains this
--    through ownership; another trainer NEVER gains it.
-- ─────────────────────────────────────────────────────────────────────────
create policy "Gym trainers view shared measurements"
  on public.client_measurements for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = client_measurements.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

create policy "Gym trainers view shared workout history"
  on public.workout_history for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = workout_history.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

create policy "Gym trainers view shared set logs"
  on public.workout_set_logs for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = workout_set_logs.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

create policy "Gym trainers view shared checkins"
  on public.daily_checkins for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = daily_checkins.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

create policy "Gym trainers view shared fitness profile"
  on public.fitness_profile for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = fitness_profile.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

create policy "Gym trainers view shared food log"
  on public.food_log_entries for select
  using (exists (
    select 1 from public.gym_trainer_clients gtc
    join public.gym_trainers gt on gt.id = gtc.gym_trainer_id
    where gtc.client_user_id = food_log_entries.user_id
      and gt.user_id = auth.uid()
      and gtc.status = 'active'
      and gtc.share_progress = true
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. session-completed notification — fire for either professional kind (§22)
--    Existing trigger already keys on client_user_id; make the OR explicit and
--    keep notified_at idempotency. No new edge function.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.trigger_session_completed_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _service_role_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1);
begin
  if NEW.session_status = 'completed'
     and coalesce(OLD.session_status, '') <> 'completed'
     and NEW.notified_at is null
     and NEW.client_user_id is not null
     and (NEW.personal_trainer_id is not null or NEW.gym_trainer_id is not null) then
    perform net.http_post(
      url     := public.edge_function_url('notify-pt-client-event'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
      body    := jsonb_build_object('type', 'session_completed', 'record', row_to_json(NEW))
    );
    NEW.notified_at := now();
  end if;
  return NEW;
end;
$$;

commit;
