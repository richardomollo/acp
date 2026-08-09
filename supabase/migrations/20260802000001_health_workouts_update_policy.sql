-- health_workouts was missing an UPDATE policy. syncHealthData() upserts
-- workout rows (onConflict: 'user_id,hk_uuid'), so a re-sync that hits an
-- existing row takes the UPDATE path — with no UPDATE policy at all, RLS
-- denies it outright ("violates row-level security policy (USING
-- expression)"), even though the row belongs to the same user.

CREATE POLICY "Users update own health workouts"
  ON public.health_workouts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
