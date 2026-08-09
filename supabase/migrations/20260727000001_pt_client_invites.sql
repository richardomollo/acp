-- Let a trainer add an existing app user as a client (pending that user's
-- acceptance) or invite someone with no account yet via a shareable code.
-- Mirrors the existing "copy a booking link" pattern in offerings.tsx rather
-- than building new email/SMS send infrastructure.

-- ── pt_clients: support pending/code-based rows ────────────────────────────

ALTER TABLE public.pt_clients ALTER COLUMN client_user_id DROP NOT NULL;

ALTER TABLE public.pt_clients DROP CONSTRAINT IF EXISTS pt_clients_status_check;
ALTER TABLE public.pt_clients ADD CONSTRAINT pt_clients_status_check
  CHECK (status IN ('pending', 'active', 'inactive'));

ALTER TABLE public.pt_clients
  ADD COLUMN IF NOT EXISTS invite_code  text UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_name text;

-- ── RLS: trainer-initiated invites ──────────────────────────────────────────

CREATE POLICY "Trainers create client invites"
  ON public.pt_clients FOR INSERT
  WITH CHECK (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Clients can remove trainer relationship"
  ON public.pt_clients FOR DELETE
  USING (client_user_id = auth.uid());

-- ── Search an existing user by exact phone/email match ─────────────────────
-- SECURITY DEFINER + minimal columns + exact match only, so a trainer can't
-- use this to enumerate/scrape arbitrary user data — public.users has no
-- tracked RLS policy in this migration history, so this avoids relying on
-- whatever access level the table happens to have today.

CREATE OR REPLACE FUNCTION public.search_client_by_contact(p_query text)
RETURNS TABLE (id uuid, name text, email text, phone text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email, u.phone
  FROM public.users u
  WHERE u.email = lower(p_query) OR u.phone = p_query
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.search_client_by_contact(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_client_by_contact(text) TO authenticated;

-- ── Redeem a code invite ────────────────────────────────────────────────────
-- Entering the code is itself the consent, so this goes straight to 'active'
-- (unlike a search-invite, which needs a separate accept step from the client).

CREATE OR REPLACE FUNCTION public.redeem_pt_invite_code(p_code text)
RETURNS TABLE (out_pt_id uuid, out_trainer_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pt_clients;
BEGIN
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

REVOKE ALL ON FUNCTION public.redeem_pt_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_pt_invite_code(text) TO authenticated;
