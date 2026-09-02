-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add rejection_reason to gyms so admin can record a reason when declining
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ─── PT status change trigger ─────────────────────────────────────────────────
-- Fires when personal_trainers.status is updated to 'approved' or 'rejected'

CREATE OR REPLACE FUNCTION public.trigger_pt_status_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-partner-status',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body    := jsonb_build_object(
        'type',       'pt_status_change',
        'record',     row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pt_status_notification_trigger ON personal_trainers;
CREATE TRIGGER pt_status_notification_trigger
  AFTER UPDATE OF status ON personal_trainers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_pt_status_notification();

-- ─── Gym approval trigger ─────────────────────────────────────────────────────
-- Fires when gyms.is_active flips from false → true (admin approves)

CREATE OR REPLACE FUNCTION public.trigger_gym_approval_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.is_active = true AND (OLD.is_active IS DISTINCT FROM true) THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-partner-status',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body    := jsonb_build_object(
        'type',   'gym_approved',
        'record', row_to_json(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gym_approval_notification_trigger ON gyms;
CREATE TRIGGER gym_approval_notification_trigger
  AFTER UPDATE OF is_active ON gyms
  FOR EACH ROW EXECUTE FUNCTION public.trigger_gym_approval_notification();

-- ─── Gym rejection trigger ────────────────────────────────────────────────────
-- Fires when gyms.rejection_reason is set (admin populates it to decline)

CREATE OR REPLACE FUNCTION public.trigger_gym_rejection_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1); -- rotated & moved to Vault, see 20260729000003_move_service_role_key_to_vault.sql
BEGIN
  IF NEW.rejection_reason IS NOT NULL AND OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-partner-status',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body    := jsonb_build_object(
        'type',   'gym_rejected',
        'record', row_to_json(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gym_rejection_notification_trigger ON gyms;
CREATE TRIGGER gym_rejection_notification_trigger
  AFTER UPDATE OF rejection_reason ON gyms
  FOR EACH ROW EXECUTE FUNCTION public.trigger_gym_rejection_notification();
