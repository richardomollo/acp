-- Notify a community owner by email/WhatsApp when an admin approves or
-- rejects their community. Same Vault-secured net.http_post trigger pattern
-- as trigger_pt_status_notification() (20260729000003_move_service_role_key_to_vault.sql).
CREATE OR REPLACE FUNCTION public.trigger_community_status_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
BEGIN
  IF NEW.review_status IN ('approved', 'rejected') AND (OLD.review_status IS DISTINCT FROM NEW.review_status) THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-community-status',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body    := jsonb_build_object('record', row_to_json(NEW))
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER communities_status_notification
  AFTER UPDATE OF review_status ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.trigger_community_status_notification();
