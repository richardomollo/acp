-- LANA PRO — Web Partner Onboarding, Phase 3 (Existing-client acquisition).
--
-- Principle: "The professional owns the client relationship. Lana enhances it."
-- An invited person is NOT an active client until THEY accept. This migration
-- is FULLY ADDITIVE and does not touch the existing consent path:
--   • search-invite  → pt_clients row w/ client_user_id, status 'pending',
--                       client accepts inside Lana  (unchanged)
--   • code invite    → pt_clients row w/ invite_code, status 'pending',
--                       redeem_pt_invite_code() = consent → 'active'  (unchanged)
--
-- The existing pt_clients.status CHECK ('pending','active','inactive') is
-- DELIBERATELY LEFT ALONE — status is the consent/relationship state and the
-- RLS + notification triggers key off it. Invitation lifecycle detail
-- (draft|sent|accepted|expired|cancelled) goes in a SEPARATE nullable column so
-- nothing that reads `status` has to change.

-- ── pt_clients: invitation metadata (all additive, all nullable) ────────────


begin;
ALTER TABLE public.pt_clients
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS invited_phone text,
  ADD COLUMN IF NOT EXISTS invited_at    timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS invite_state  text;

ALTER TABLE public.pt_clients DROP CONSTRAINT IF EXISTS pt_clients_invite_state_check;
ALTER TABLE public.pt_clients ADD CONSTRAINT pt_clients_invite_state_check
  CHECK (invite_state IS NULL OR invite_state IN
    ('draft', 'sent', 'accepted', 'expired', 'cancelled'));

COMMENT ON COLUMN public.pt_clients.invited_email IS
  'Contact email captured when a professional invited someone who had no Lana account yet (Lana Pro onboarding). Not health data.';
COMMENT ON COLUMN public.pt_clients.invited_phone IS
  'Contact mobile captured when a professional invited someone who had no Lana account yet. Not health data.';
COMMENT ON COLUMN public.pt_clients.invite_state IS
  'Invitation lifecycle: draft|sent|accepted|expired|cancelled. Distinct from status (the relationship/consent state). NULL for rows not created via an invitation.';

-- Keep accepted_at / invite_state truthful when a code invite is redeemed. The
-- existing redeem_pt_invite_code() flips status pending→active; this trigger
-- mirrors that onto the invitation columns without modifying that function.
CREATE OR REPLACE FUNCTION public.pt_clients_sync_invite_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active' THEN
    IF NEW.invite_state IS DISTINCT FROM 'accepted' THEN
      NEW.invite_state := 'accepted';
    END IF;
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pt_clients_sync_invite_state_trigger ON public.pt_clients;
CREATE TRIGGER pt_clients_sync_invite_state_trigger
  BEFORE UPDATE OF status ON public.pt_clients
  FOR EACH ROW EXECUTE FUNCTION public.pt_clients_sync_invite_state();

-- ── personal_trainers: base_location (Phase 2 hardening) ────────────────────
-- Phase 2 collected gymName / ownLocation and then dropped them. This is the
-- smallest truthful home for that onboarding intent: a free-text label the
-- professional typed. It is NOT a verified venue relationship — no FK to gyms,
-- no partner link, no marketplace placement. If Lana later verifies a venue,
-- that is a separate, explicit record.
ALTER TABLE public.personal_trainers
  ADD COLUMN IF NOT EXISTS base_location text;

COMMENT ON COLUMN public.personal_trainers.base_location IS
  'Free-text "where I''m based" the professional typed at Lana Pro onboarding (e.g. a gym/studio name or an area). NOT a verified venue link — no relationship to public.gyms/partners is implied.';

-- ── preview_pt_invite: public, read-only, NO health data ───────────────────
-- Powers the consumer landing page at /join/[code] for someone who does NOT yet
-- have a Lana account (so cannot be `authenticated`). Returns ONLY the
-- professional's display name and the invited person's first name — never
-- goals, measurements, programmes or any progress data. Does not mutate,
-- does not reveal contact details, and returns nothing for a redeemed/expired
-- code.
CREATE OR REPLACE FUNCTION public.preview_pt_invite(p_code text)
RETURNS TABLE (professional_name text, invited_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(pt.professional_name, pt.full_name) AS professional_name,
         pc.invited_name
  FROM public.pt_clients pc
  JOIN public.personal_trainers pt ON pt.id = pc.pt_id
  WHERE pc.invite_code = p_code
    AND pc.client_user_id IS NULL
    AND pc.status = 'pending'
    AND (pc.invite_state IS NULL OR pc.invite_state NOT IN ('expired', 'cancelled'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.preview_pt_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_pt_invite(text) TO anon, authenticated;

commit;
