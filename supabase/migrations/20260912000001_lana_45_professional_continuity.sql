-- LANA — Phase 4.5 (Professional → consumer continuity).
--
-- Additive only. Closes the loop so a completed Lana Pro session produces ONE
-- consumer update (summary + agreed actions), without a second task system,
-- without touching the generated plan, and without weakening privacy.
--
--   1. client_tasks: freeze professional-controlled columns against consumer
--      UPDATEs (P1 — consumer may change status / last_completed_date only).
--   2. get_client_session_feed: REVOKE from anon; tolerate a deleted trainer.
--   3. professional_session_records.personal_trainer_id → ON DELETE SET NULL
--      so a client keeps their completed-session summary if a trainer is
--      removed. CHECK relaxed to allow the null.
--   4. professional_session_records.notified_at — idempotency guard for the
--      ONE "session completed" consumer notification.
--   5. AFTER UPDATE trigger: on session_status → 'completed' (once), notify
--      the consumer via the existing notify-pt-client-event edge function.
--   6. Suppress the per-task assignment push for session-linked tasks, so a
--      3-action session = 1 notification, not 4.

-- ── 1. client_tasks: consumer may only touch status / last_completed_date ──
-- RLS can't restrict columns, so a BEFORE UPDATE trigger forces every
-- professional-controlled field back to its OLD value when the row is being
-- updated by the client (client_user_id = auth.uid()) rather than by the
-- owning trainer. Trainer edits (auth.uid() = the pt's user) are untouched.


begin;
CREATE OR REPLACE FUNCTION public.client_tasks_guard_consumer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owning_trainer boolean;
BEGIN
  -- Is the caller the trainer who owns this task? (service_role / no jwt →
  -- treated as trusted: auth.uid() is null and this check is false, but the
  -- WHEN clause below still lets trusted server code through via the
  -- client_user_id branch only — see note.)
  SELECT EXISTS (
    SELECT 1 FROM public.personal_trainers pt
    WHERE pt.id = NEW.pt_id AND pt.user_id = auth.uid()
  ) INTO _is_owning_trainer;

  -- Consumer path: the row's client is the caller and they are NOT the trainer.
  IF NEW.client_user_id = auth.uid() AND NOT _is_owning_trainer THEN
    NEW.title             := OLD.title;
    NEW.notes             := OLD.notes;
    NEW.pt_id             := OLD.pt_id;
    NEW.session_record_id := OLD.session_record_id;
    NEW.due_date          := OLD.due_date;
    NEW.recurrence        := OLD.recurrence;
    NEW.weekdays          := OLD.weekdays;
    NEW.client_user_id    := OLD.client_user_id;
    NEW.created_at        := OLD.created_at;
    -- status + last_completed_date pass through unchanged.
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_tasks_guard_consumer_update_trg ON public.client_tasks;
CREATE TRIGGER client_tasks_guard_consumer_update_trg
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.client_tasks_guard_consumer_update();

COMMENT ON FUNCTION public.client_tasks_guard_consumer_update() IS
  'Phase 4.5 P1: a client may UPDATE only status / last_completed_date on their own task; all professional-authored columns are frozen to OLD. Trainer edits unaffected.';

-- ── 2. get_client_session_feed: no anon; survive a deleted trainer ────────

REVOKE EXECUTE ON FUNCTION public.get_client_session_feed(int) FROM anon;

CREATE OR REPLACE FUNCTION public.get_client_session_feed(p_limit int DEFAULT 20)
RETURNS TABLE (
  session_id      uuid,
  service_type    text,
  professional_flavour text,
  focus           text,
  client_summary  text,
  follow_up_at    date,
  completed_at    timestamptz,
  professional_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.id,
    s.service_type,
    s.professional_flavour,
    s.focus,
    s.client_summary,
    s.follow_up_at,
    s.completed_at,
    COALESCE(pt.professional_name, pt.full_name, 'Your coach')
  FROM public.professional_session_records s
  LEFT JOIN public.personal_trainers pt ON pt.id = s.personal_trainer_id
  WHERE s.client_user_id = auth.uid()
    AND s.session_status = 'completed'
  ORDER BY s.completed_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_client_session_feed(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_session_feed(int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_session_feed(int) TO authenticated;

-- ── 3. keep a client's completed session if the trainer is deleted ───────

ALTER TABLE public.professional_session_records
  DROP CONSTRAINT IF EXISTS professional_session_records_personal_trainer_id_fkey;
ALTER TABLE public.professional_session_records
  ADD CONSTRAINT professional_session_records_personal_trainer_id_fkey
  FOREIGN KEY (personal_trainer_id) REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

-- the identity CHECK required personal_trainer_id NOT NULL for a
-- personal_trainer record; relax it so ON DELETE SET NULL doesn't fail.
-- Insert-time validity is still enforced by the app + the RLS WITH CHECK
-- (which requires personal_trainer_id IN my personal_trainers).
ALTER TABLE public.professional_session_records
  DROP CONSTRAINT IF EXISTS professional_session_records_check;
ALTER TABLE public.professional_session_records
  DROP CONSTRAINT IF EXISTS professional_session_records_kind_ids_check;
ALTER TABLE public.professional_session_records
  ADD CONSTRAINT professional_session_records_kind_ids_check CHECK (
    (professional_kind = 'personal_trainer' AND gym_trainer_id IS NULL)
    OR
    (professional_kind = 'gym_trainer' AND gym_trainer_id IS NOT NULL AND personal_trainer_id IS NULL)
  );

-- ── 4. notification idempotency guard ───────────────────────────────────

ALTER TABLE public.professional_session_records
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- ── 5. ONE "session completed" consumer notification ────────────────────

CREATE OR REPLACE FUNCTION public.trigger_session_completed_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF NEW.session_status = 'completed'
     AND COALESCE(OLD.session_status, '') <> 'completed'
     AND NEW.notified_at IS NULL
     AND NEW.client_user_id IS NOT NULL THEN
    PERFORM net.http_post(
      url     := public.edge_function_url('notify-pt-client-event'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
      body    := jsonb_build_object('type', 'session_completed', 'record', row_to_json(NEW))
    );
    NEW.notified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_completed_notification_trg ON public.professional_session_records;
CREATE TRIGGER session_completed_notification_trg
  BEFORE UPDATE OF session_status ON public.professional_session_records
  FOR EACH ROW EXECUTE FUNCTION public.trigger_session_completed_notification();

-- also cover a record that is INSERTed already-completed (defensive; the app
-- inserts in_progress then updates, but keep it correct either way).
DROP TRIGGER IF EXISTS session_completed_notification_ins_trg ON public.professional_session_records;
CREATE TRIGGER session_completed_notification_ins_trg
  BEFORE INSERT ON public.professional_session_records
  FOR EACH ROW
  WHEN (NEW.session_status = 'completed' AND NEW.notified_at IS NULL AND NEW.client_user_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_session_completed_notification();

-- ── 6. suppress the per-task push for session-linked tasks ──────────────
-- A session's agreed actions are announced by the ONE session_completed
-- notification above; the individual task_assigned push would be noise.

CREATE OR REPLACE FUNCTION public.trigger_client_task_assigned_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  -- Session-attributed tasks are covered by session_completed — skip.
  IF NEW.session_record_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := public.edge_function_url('notify-pt-client-event'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
    body    := jsonb_build_object('type', 'task_assigned', 'record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$;

commit;
