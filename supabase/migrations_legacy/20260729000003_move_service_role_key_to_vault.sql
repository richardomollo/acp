-- SECURITY FIX: every trigger function below previously had the live Supabase
-- service-role key hardcoded as a plaintext literal (some via a _service_role_key
-- variable, three inline). That key has been rotated in the Supabase dashboard
-- and the new value stored in Vault as the secret named 'service_role_key' —
-- this migration is what makes these functions read it from there instead of
-- ever containing it in source again. Nothing else about their behavior changes.

CREATE OR REPLACE FUNCTION public.notify_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed')) THEN
    PERFORM net.http_post(
      url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-booking',
      body := jsonb_build_object('record', row_to_json(NEW)),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_experience_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed')) THEN
    PERFORM net.http_post(
      url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-experience-booking',
      body := jsonb_build_object('record', row_to_json(NEW)),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_pt_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed')) THEN
    PERFORM net.http_post(
      url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-booking',
      body := jsonb_build_object('record', row_to_json(NEW)),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_pt_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_gym_approval_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_gym_rejection_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_pt_invite_received_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_pt_invite_accepted_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_client_task_assigned_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  PERFORM net.http_post(
    url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-pt-client-event',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _service_role_key),
    body    := jsonb_build_object('type', 'task_assigned', 'record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_workout_assigned_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
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
$function$;
