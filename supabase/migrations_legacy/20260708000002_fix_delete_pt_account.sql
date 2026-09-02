-- Fix 1: Change gyms.partner_id FK to ON DELETE SET NULL so that deleting
-- a partners row (which happens when auth.users is deleted via CASCADE) does
-- not violate the constraint. Gyms are preserved; partner_id is nulled out.
ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_partner_id_fkey;
ALTER TABLE public.gyms
  ADD CONSTRAINT gyms_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;

-- Fix 2: Rewrite delete_pt_account to explicitly clean up any partner linkage
-- before deleting auth.users, avoiding reliance on implicit CASCADE ordering.
CREATE OR REPLACE FUNCTION public.delete_pt_account(delete_auth_user boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pt_id      uuid;
  v_partner_id uuid;
BEGIN
  SELECT id INTO v_pt_id
    FROM public.personal_trainers
   WHERE user_id = auth.uid();

  IF v_pt_id IS NULL THEN
    RAISE EXCEPTION 'No PT profile found for current user';
  END IF;

  -- Delete PT-related rows (dependency order, cascades handle the rest)
  DELETE FROM public.pt_reviews          WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_bookings         WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_offerings        WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_venue_links      WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_availability     WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_blocked_dates    WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_payout_requests  WHERE pt_id = v_pt_id;
  DELETE FROM public.personal_trainers   WHERE id    = v_pt_id;

  IF delete_auth_user THEN
    -- If a partner row exists for this user, null out gyms.partner_id first,
    -- then delete the partner row before touching auth.users.
    SELECT id INTO v_partner_id
      FROM public.partners
     WHERE user_id = auth.uid();

    IF v_partner_id IS NOT NULL THEN
      UPDATE public.gyms SET partner_id = NULL WHERE partner_id = v_partner_id;
      DELETE FROM public.partner_gyms        WHERE partner_id = v_partner_id;
      DELETE FROM public.partner_notifications WHERE partner_id = v_partner_id;
      DELETE FROM public.partners            WHERE id = v_partner_id;
    END IF;

    DELETE FROM auth.users WHERE id = auth.uid();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_pt_account(boolean) TO authenticated;
