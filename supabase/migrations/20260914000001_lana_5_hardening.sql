-- LANA PRO — Phase 5 (MVP hardening).
--
-- Additive only. Two hardening changes surfaced by the Phase 5 audit:
--
--   1. Missing indexes on gym_trainer_clients. The six Phase 4.6 consent
--      policies filter `gym_trainer_clients.client_user_id = <evidence>.user_id`
--      with no supporting index — the exact analog `pt_clients_client_idx`
--      exists for the identical Phase 4.4 policy pattern. Add the parallel
--      indexes so employed-professional consent checks stay index-backed.
--
--   2. professional_session_records.gym_trainer_id used ON DELETE CASCADE while
--      personal_trainer_id (Phase 4.5) uses ON DELETE SET NULL. Deleting a
--      gym_trainers row would erase a client's completed-session history. Make
--      the two professional kinds consistent: SET NULL, and relax the identity
--      CHECK to tolerate the null (mirrors what 20260912000001 did for the PT
--      side). Insert-time validity is still enforced by the app + the RLS
--      WITH CHECK (gym_trainer_id must be one of the caller's gym_trainers).

begin;

-- ── 1. gym_trainer_clients indexes ─────────────────────────────────────
create index if not exists gym_trainer_clients_client_idx
  on public.gym_trainer_clients (client_user_id);
create index if not exists gym_trainer_clients_trainer_idx
  on public.gym_trainer_clients (gym_trainer_id);

-- ── 2. preserve client session history if an employed trainer is deleted ─
alter table public.professional_session_records
  drop constraint if exists professional_session_records_gym_trainer_id_fkey;
alter table public.professional_session_records
  add constraint professional_session_records_gym_trainer_id_fkey
  foreign key (gym_trainer_id) references public.gym_trainers(id) on delete set null;

alter table public.professional_session_records
  drop constraint if exists professional_session_records_kind_ids_check;
alter table public.professional_session_records
  add constraint professional_session_records_kind_ids_check check (
    (professional_kind = 'personal_trainer' and gym_trainer_id is null)
    or
    (professional_kind = 'gym_trainer' and personal_trainer_id is null)
  );

commit;
