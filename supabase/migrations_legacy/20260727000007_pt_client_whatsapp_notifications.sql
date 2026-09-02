-- WhatsApp notifications for PT <-> client events, via the notify-pt-client-event
-- edge function. Message templates (client_invite_received, client_invite_accepted,
-- client_task_assigned, client_workout_assigned) must be approved in Meta Business
-- Manager before these will actually deliver anything — the trigger firing and the
-- template existing are independent concerns.

-- ── A trainer invited an existing-account client (search-based invite) ────────
-- Code-based invites for brand-new clients have no contact info on file at
-- invite time (the PT shares the code out of band), so this only fires when
-- client_user_id is already known.

CREATE OR REPLACE FUNCTION public.trigger_pt_invite_received_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.status = 'pending' AND NEW.client_user_id IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-client-event',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
      body    := jsonb_build_object('type', 'invite_received', 'record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pt_invite_received_notification_trigger ON pt_clients;
CREATE TRIGGER pt_invite_received_notification_trigger
  AFTER INSERT ON pt_clients
  FOR EACH ROW EXECUTE FUNCTION public.trigger_pt_invite_received_notification();

-- ── A client accepted a pending invite (search-based accept, or code redeem) ──

CREATE OR REPLACE FUNCTION public.trigger_pt_invite_accepted_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-client-event',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
      body    := jsonb_build_object('type', 'invite_accepted', 'record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pt_invite_accepted_notification_trigger ON pt_clients;
CREATE TRIGGER pt_invite_accepted_notification_trigger
  AFTER UPDATE OF status ON pt_clients
  FOR EACH ROW EXECUTE FUNCTION public.trigger_pt_invite_accepted_notification();

-- ── A trainer assigned a client a task ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_client_task_assigned_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  PERFORM net.http_post(
    url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-client-event',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
    body    := jsonb_build_object('type', 'task_assigned', 'record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_task_assigned_notification_trigger ON client_tasks;
CREATE TRIGGER client_task_assigned_notification_trigger
  AFTER INSERT ON client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trigger_client_task_assigned_notification();

-- ── A trainer assigned a client a workout ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_workout_assigned_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.assigned_by IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-client-event',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
      body    := jsonb_build_object('type', 'workout_assigned', 'record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_assigned_notification_trigger ON workouts;
CREATE TRIGGER workout_assigned_notification_trigger
  AFTER INSERT ON workouts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_workout_assigned_notification();
