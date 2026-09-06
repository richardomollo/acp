-- LANA PRO — Phase 6 (Step 6): lightweight post-session coaching evidence.
--
-- Additive only. Two nullable columns on professional_session_records so a
-- professional can capture, in seconds, their OWN read of a completed session
-- and the direction they've chosen for next time. NOT clinical documentation.
--
--   client_response — the professional's observation of how the session went.
--     NOT a diagnosis / sentiment score / pain class / readiness score.
--   plan_intent     — the direction the PROFESSIONAL chose for the next
--     interaction. Lana never decides it.
--
-- Both optional; existing rows stay valid. No RLS change — the existing
-- "PTs/Gym trainers manage their own session records" policies already cover
-- these columns (professional-only).

begin;

alter table public.professional_session_records
  add column if not exists client_response text,
  add column if not exists plan_intent     text;

alter table public.professional_session_records
  drop constraint if exists professional_session_records_client_response_check;
alter table public.professional_session_records
  add constraint professional_session_records_client_response_check
  check (client_response is null or client_response in ('great', 'good', 'difficult'));

alter table public.professional_session_records
  drop constraint if exists professional_session_records_plan_intent_check;
alter table public.professional_session_records
  add constraint professional_session_records_plan_intent_check
  check (plan_intent is null or plan_intent in ('progress', 'keep', 'adjust'));

commit;
