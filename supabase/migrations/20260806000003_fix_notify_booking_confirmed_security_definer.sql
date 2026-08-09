-- notify_booking_confirmed() reads a secret from vault.decrypted_secrets but,
-- unlike every sibling trigger in this codebase (trigger_gym_approval_notification,
-- trigger_pt_status_notification, send_booking_email, etc. — all SECURITY DEFINER
-- specifically so they can read vault as a non-service-role caller), it was
-- never marked SECURITY DEFINER. This was invisible until now because
-- `bookings` had zero UPDATE RLS policies before this feature's migration, so
-- no authenticated-role UPDATE ever actually reached the trigger. The new
-- gym-trainer check-in policy is the first UPDATE policy on bookings, and it
-- surfaced "permission denied for schema vault" on every check-in attempt —
-- which means the existing gym-owner check-in flow (same direct
-- supabase.from("bookings").update(...) call) would hit the exact same wall
-- the moment an owner-facing UPDATE policy is ever added too.

CREATE OR REPLACE FUNCTION public.notify_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
