-- Two gaps: no welcome email at all on signup, and no email when someone
-- joins a community. Same Vault-secured net.http_post trigger pattern as
-- trigger_community_status_notification() (20260812000002).

-- 1. General "Welcome to Active CityPass" on signup — skipped for partner/PT
-- signups, which get their own approval-flow emails instead.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := NEW.raw_user_meta_data->>'role';
  v_name  text := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')), '');
  v_phone text := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
  v_service_role_key text;
BEGIN
  INSERT INTO public.users (
    id, email, name, phone, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_name, v_phone, now(), now()
  )
  ON CONFLICT DO NOTHING;  -- catches id AND email unique constraint conflicts

  IF v_role IS DISTINCT FROM 'personal_trainer' AND v_role IS DISTINCT FROM 'partner' THEN
    BEGIN
      v_service_role_key := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
      PERFORM net.http_post(
        url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-user-welcome',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body    := jsonb_build_object('record', jsonb_build_object('id', NEW.id, 'email', NEW.email, 'name', v_name))
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- never block signup if the welcome email fails to fire
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. "Welcome to [Community]" when a member's status becomes active — covers
-- both instant joins on open communities (INSERT) and approvals on
-- approval_required communities (UPDATE OF status pending -> active).
CREATE OR REPLACE FUNCTION public.trigger_community_join_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  _became_active boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _became_active := NEW.status = 'active';
  ELSE
    _became_active := NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active';
  END IF;

  IF _became_active THEN
    PERFORM net.http_post(
      url     := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/notify-community-join',
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

CREATE TRIGGER community_members_join_notification
  AFTER INSERT OR UPDATE OF status ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.trigger_community_join_notification();
