-- Members who never had a name captured anywhere (not even in their auth
-- signup metadata, so the earlier backfill couldn't recover it) showed up
-- as an indistinguishable "Member" in every roster/attendee/leaderboard
-- list. Add a shared fallback that derives a display name from the email
-- local-part (never the raw email itself) so existing members show up
-- distinctly right now, without waiting on them to edit their profile.
CREATE OR REPLACE FUNCTION public.display_name(p_name text, p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(trim(p_name), ''), initcap(split_part(p_email, '@', 1)));
$$;

CREATE OR REPLACE FUNCTION public.get_community_members(p_community_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text, role text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cm.user_id, public.display_name(u.name, u.email), u.avatar_url, cm.role
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

CREATE OR REPLACE FUNCTION public.get_event_attendees(p_event_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cea.user_id, public.display_name(u.name, u.email), u.avatar_url
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

DROP FUNCTION IF EXISTS public.get_challenge_leaderboard(uuid);

CREATE FUNCTION public.get_challenge_leaderboard(p_challenge_id uuid)
RETURNS TABLE(user_id uuid, name text, avatar_url text, metric_value numeric, rank bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  ch record;
BEGIN
  SELECT * INTO ch FROM public.challenges WHERE id = p_challenge_id;
  IF ch IS NULL THEN
    RETURN;
  END IF;

  IF ch.community_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = ch.community_id AND cm.user_id = auth.uid() AND cm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not a member of this community';
  END IF;

  RETURN QUERY
  WITH scoped_users AS (
    SELECT cm.user_id FROM public.community_members cm
    WHERE cm.community_id = ch.community_id AND cm.status = 'active'
  ),
  filtered AS (
    SELECT a.user_id, a.distance_meters, a.start_time
    FROM public.activities a
    JOIN scoped_users su ON su.user_id = a.user_id
    WHERE a.activity_type = ANY(ch.activity_types)
      AND a.start_time::date BETWEEN ch.period_start AND ch.period_end
  ),
  agg AS (
    SELECT f.user_id,
      CASE ch.metric
        WHEN 'distance_km' THEN SUM(f.distance_meters) / 1000
        WHEN 'activity_count' THEN COUNT(*)
        WHEN 'days_active' THEN COUNT(DISTINCT f.start_time::date)
      END AS metric_value
    FROM filtered f
    GROUP BY f.user_id
  )
  SELECT agg.user_id, public.display_name(u.name, u.email), u.avatar_url, agg.metric_value, RANK() OVER (ORDER BY agg.metric_value DESC)
  FROM agg
  JOIN public.users u ON u.id = agg.user_id
  ORDER BY agg.metric_value DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_community_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_members(uuid) TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_event_attendees(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_attendees(uuid) TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_challenge_leaderboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO authenticated;
