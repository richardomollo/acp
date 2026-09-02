-- Public member list (name + avatar) for an approved community's profile page.
-- community_members has no public-read policy (only self/owner/admin), so this
-- is exposed narrowly via a SECURITY DEFINER RPC rather than loosening RLS.
CREATE OR REPLACE FUNCTION public.get_community_members(p_community_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text, role text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cm.user_id, u.name::text, u.avatar_url, cm.role
  FROM public.community_members cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.community_id = p_community_id
    AND cm.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = p_community_id AND c.review_status = 'approved' AND c.is_active
    )
  ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_community_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_members(uuid) TO authenticated, anon;
