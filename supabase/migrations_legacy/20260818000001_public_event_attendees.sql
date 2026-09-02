-- Public "who's going" avatar list for an event's detail page. Mirrors
-- get_community_members: community_event_attendees has no public-read
-- policy (only self/organiser), so this is exposed narrowly via a
-- SECURITY DEFINER RPC scoped to active events on approved communities.
CREATE OR REPLACE FUNCTION public.get_event_attendees(p_event_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cea.user_id, u.name::text, u.avatar_url
  FROM public.community_event_attendees cea
  JOIN public.users u ON u.id = cea.user_id
  WHERE cea.event_id = p_event_id
    AND cea.status = 'going'
    AND EXISTS (
      SELECT 1 FROM public.community_events e
      JOIN public.communities c ON c.id = e.community_id
      WHERE e.id = p_event_id AND e.status = 'active'
        AND c.review_status = 'approved' AND c.is_active
    )
  ORDER BY cea.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_event_attendees(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_attendees(uuid) TO authenticated, anon;
