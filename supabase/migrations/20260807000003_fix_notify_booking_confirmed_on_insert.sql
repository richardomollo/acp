-- notify_booking_confirmed() referenced OLD.status unconditionally, but the
-- trigger fires on INSERT as well as UPDATE. On INSERT, OLD is not assigned,
-- so any booking created with status already 'confirmed' (e.g. a free
-- session/experience, which is now inserted as confirmed directly instead
-- of going through the deposit-payment flow) raised
-- "record \"old\" is not assigned yet" and the whole insert failed.

CREATE OR REPLACE FUNCTION public.notify_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed')) THEN
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

-- Same OLD.status-on-INSERT bug, plus this one was also missing the
-- SECURITY DEFINER + search_path fix that notify_booking_confirmed()
-- already got in 20260806000003_fix_notify_booking_confirmed_security_definer.sql.
CREATE OR REPLACE FUNCTION public.notify_experience_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed')) THEN
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

-- Same bug again on pt_bookings -- this one silently broke the existing
-- free PT intro-session flow (BookingModal.tsx inserts pt_bookings with
-- status: 'confirmed' directly), since that INSERT would hit the same
-- "record \"old\" is not assigned yet" error.
CREATE OR REPLACE FUNCTION public.notify_pt_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF (NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed')) THEN
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
