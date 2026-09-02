-- Deletes all venue partner data for the calling user.
-- Pass delete_auth_user => true for partner-only accounts (also removes auth.users row).
-- Pass delete_auth_user => false for dual-role accounts (keeps auth + PT data intact).
CREATE OR REPLACE FUNCTION public.delete_partner_account(delete_auth_user boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT id INTO v_partner_id
    FROM public.partners
   WHERE user_id = auth.uid();

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'No partner profile found for current user';
  END IF;

  DELETE FROM public.partner_withdrawals
    WHERE gym_id IN (SELECT gym_id FROM public.partner_gyms WHERE partner_id = v_partner_id);
  DELETE FROM public.partner_notifications    WHERE partner_id = v_partner_id;
  DELETE FROM public.partner_gyms             WHERE partner_id = v_partner_id;
  DELETE FROM public.partners                 WHERE id = v_partner_id;

  IF delete_auth_user THEN
    DELETE FROM auth.users WHERE id = auth.uid();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_partner_account(boolean) TO authenticated;
