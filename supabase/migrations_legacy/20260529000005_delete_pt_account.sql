-- Deletes all PT data for the calling user.
-- Pass delete_auth_user => true for PT-only accounts (also removes auth.users row).
-- Pass delete_auth_user => false for dual-role accounts (keeps auth + venue data intact).
CREATE OR REPLACE FUNCTION public.delete_pt_account(delete_auth_user boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pt_id uuid;
BEGIN
  SELECT id INTO v_pt_id
    FROM public.personal_trainers
   WHERE user_id = auth.uid();

  IF v_pt_id IS NULL THEN
    RAISE EXCEPTION 'No PT profile found for current user';
  END IF;

  -- Delete in dependency order (no-cascade tables first)
  DELETE FROM public.pt_reviews   WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_bookings  WHERE pt_id = v_pt_id;

  -- These have ON DELETE CASCADE from personal_trainers, but deleting
  -- explicitly here keeps the intent clear and avoids ordering issues.
  DELETE FROM public.pt_offerings      WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_venue_links    WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_availability   WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_blocked_dates  WHERE pt_id = v_pt_id;
  DELETE FROM public.pt_payout_requests WHERE pt_id = v_pt_id;

  DELETE FROM public.personal_trainers WHERE id = v_pt_id;

  IF delete_auth_user THEN
    DELETE FROM auth.users WHERE id = auth.uid();
  END IF;
END;
$$;

-- Allow any authenticated user to call this on their own account
GRANT EXECUTE ON FUNCTION public.delete_pt_account(boolean) TO authenticated;
