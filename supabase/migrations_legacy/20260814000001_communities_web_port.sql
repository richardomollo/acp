-- Web port support: event images + a stable, regeneratable invite link per community.

ALTER TABLE public.community_events ADD COLUMN image_url text;

ALTER TABLE public.communities ADD COLUMN invite_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX communities_invite_token_idx ON public.communities (invite_token);

-- SECURITY DEFINER so the invite link can be resolved without a public SELECT
-- policy on communities.invite_token (keeps the token non-enumerable via the
-- normal public communities read).
CREATE OR REPLACE FUNCTION public.resolve_community_invite(p_token uuid)
RETURNS TABLE(community_id uuid, name text, slug text, community_type text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, name, slug, community_type FROM public.communities
  WHERE invite_token = p_token AND review_status = 'approved' AND is_active;
$$;

REVOKE ALL ON FUNCTION public.resolve_community_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_community_invite(uuid) TO authenticated, anon;
