-- Server-side UUID generation for invite-link regeneration — avoids depending
-- on crypto.randomUUID() being available in every client runtime (Hermes/RN).
CREATE OR REPLACE FUNCTION public.regenerate_community_invite_token(p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token uuid;
BEGIN
  IF NOT public.is_community_admin(p_community_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this community';
  END IF;

  v_new_token := gen_random_uuid();
  UPDATE public.communities SET invite_token = v_new_token WHERE id = p_community_id;
  RETURN v_new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_community_invite_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_community_invite_token(uuid) TO authenticated;
