-- The invited trainer has no account yet when they first open the invite
-- link, so plain RLS can't help (no auth.uid() to check against, and a
-- table-wide "status = 'invited'" policy would let anyone enumerate every
-- pending invite across every gym). Mirrors the existing
-- search_client_by_contact / redeem_pt_invite_code pattern from
-- 20260727000001_pt_client_invites.sql: SECURITY DEFINER functions, minimal
-- returned columns, exact random-token match only.

CREATE OR REPLACE FUNCTION public.get_trainer_invite(p_token uuid)
RETURNS TABLE (out_id uuid, out_full_name text, out_email text, out_gym_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT gt.id, gt.full_name, gt.email, g.name
  FROM public.gym_trainers gt
  JOIN public.gyms g ON g.id = gt.gym_id
  WHERE gt.invite_token = p_token AND gt.status = 'invited';
$$;

REVOKE ALL ON FUNCTION public.get_trainer_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trainer_invite(uuid) TO anon, authenticated;

-- Called right after auth.signUp/signInWithPassword succeeds, so auth.uid()
-- is the trainer's own new account — links it to the invited row and
-- activates it in one atomic step.
CREATE OR REPLACE FUNCTION public.claim_trainer_invite(p_token uuid)
RETURNS TABLE (out_gym_trainer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.gym_trainers;
BEGIN
  SELECT * INTO v_row
  FROM public.gym_trainers
  WHERE invite_token = p_token AND status = 'invited'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already used';
  END IF;

  UPDATE public.gym_trainers
  SET user_id = auth.uid(), status = 'active'
  WHERE id = v_row.id;

  RETURN QUERY SELECT v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_trainer_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_trainer_invite(uuid) TO authenticated;
