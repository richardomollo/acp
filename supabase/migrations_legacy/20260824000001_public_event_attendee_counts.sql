-- community_event_attendees has no public-read RLS policy (only own row /
-- organiser of the event / service_role / admin), so a non-member viewing a
-- community's events list got a count() query silently RLS-filtered to zero
-- rows -- showing "0/100 going" even when real attendees existed. The
-- single-event pages already work around this via get_event_attendees(); this
-- is the same fix for the multi-event list view, aggregated server-side
-- instead of one RPC call per event.
CREATE OR REPLACE FUNCTION public.get_event_attendee_counts(p_event_ids uuid[])
RETURNS TABLE(event_id uuid, going_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cea.event_id, count(*)::bigint
  FROM public.community_event_attendees cea
  JOIN public.community_events e ON e.id = cea.event_id
  JOIN public.communities c ON c.id = e.community_id
  WHERE cea.event_id = ANY(p_event_ids)
    AND cea.status = 'going'
    AND e.status = 'active'
    AND c.review_status = 'approved' AND c.is_active
  GROUP BY cea.event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_attendee_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_attendee_counts(uuid[]) TO authenticated, anon;
