-- Fix: REVOKE ... FROM PUBLIC in the previous migration didn't remove Supabase's
-- default per-role grants — confirmed live that the anon (unauthenticated) role
-- could still call both RPCs. For search_client_by_contact that's an
-- unauthenticated contact-info lookup; for redeem_pt_invite_code it's worse —
-- an anon caller has auth.uid() = NULL, and since client_user_id is now
-- nullable, redeeming as anon would flip a row to status='active' while
-- leaving client_user_id NULL, corrupting the "unclaimed" invariant. Revoke the
-- anon grant explicitly and add an auth.uid() guard in both functions as
-- defense-in-depth against this class of grant misconfiguration recurring.

REVOKE ALL ON FUNCTION public.search_client_by_contact(text) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_pt_invite_code(text) FROM anon;

CREATE OR REPLACE FUNCTION public.search_client_by_contact(p_query text)
RETURNS TABLE (id uuid, name text, email text, phone text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email, u.phone
  FROM public.users u
  WHERE auth.uid() IS NOT NULL
    AND (u.email = lower(p_query) OR u.phone = p_query)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.redeem_pt_invite_code(p_code text)
RETURNS TABLE (out_pt_id uuid, out_trainer_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pt_clients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to redeem an invite code';
  END IF;

  SELECT * INTO v_row
  FROM public.pt_clients
  WHERE invite_code = p_code AND client_user_id IS NULL AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite code not found or already used';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pt_clients
    WHERE pt_clients.pt_id = v_row.pt_id AND client_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You already have a relationship with this trainer';
  END IF;

  UPDATE public.pt_clients
  SET client_user_id = auth.uid(), status = 'active'
  WHERE id = v_row.id;

  RETURN QUERY
    SELECT p.id, COALESCE(p.professional_name, p.full_name)
    FROM public.personal_trainers p
    WHERE p.id = v_row.pt_id;
END;
$$;
