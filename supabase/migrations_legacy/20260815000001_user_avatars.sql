ALTER TABLE public.users ADD COLUMN avatar_url text;

-- Leaderboard now also surfaces avatar_url for display.
-- CREATE OR REPLACE can't change the OUT parameter list, so drop first.
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
  SELECT agg.user_id, u.name::text, u.avatar_url, agg.metric_value, RANK() OVER (ORDER BY agg.metric_value DESC)
  FROM agg
  JOIN public.users u ON u.id = agg.user_id
  ORDER BY agg.metric_value DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_leaderboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO authenticated;
