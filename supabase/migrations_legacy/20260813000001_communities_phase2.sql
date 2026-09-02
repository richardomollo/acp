-- Phase 2: community-scoped challenges + leaderboard.
-- Strava -> community event linkage needs no schema change (activity_id already exists
-- on community_event_attendees from the Phase 1 migration).

ALTER TABLE public.challenges ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE;
CREATE INDEX challenges_community_idx ON public.challenges (community_id);

DROP POLICY IF EXISTS "Public read active challenges" ON public.challenges;
CREATE POLICY "Public read active challenges"
  ON public.challenges FOR SELECT
  USING (
    is_active = true
    AND (
      community_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.communities c
        WHERE c.id = challenges.community_id AND c.review_status = 'approved' AND c.is_active
      )
    )
  );

CREATE POLICY "Community admins create challenges"
  ON public.challenges FOR INSERT
  WITH CHECK (community_id IS NOT NULL AND public.is_community_admin(community_id));

CREATE POLICY "Community admins update challenges"
  ON public.challenges FOR UPDATE
  USING (community_id IS NOT NULL AND public.is_community_admin(community_id));

CREATE POLICY "Community admins delete challenges"
  ON public.challenges FOR DELETE
  USING (community_id IS NOT NULL AND public.is_community_admin(community_id));

-- Leaderboard for community-scoped challenges only. Global challenges (community_id IS NULL)
-- keep the existing single-user live-progress computation in apps/mobile/app/challenges.tsx.
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(p_challenge_id uuid)
RETURNS TABLE(user_id uuid, name text, metric_value numeric, rank bigint)
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
  SELECT agg.user_id, u.name::text, agg.metric_value, RANK() OVER (ORDER BY agg.metric_value DESC)
  FROM agg
  JOIN public.users u ON u.id = agg.user_id
  ORDER BY agg.metric_value DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_leaderboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO authenticated;
