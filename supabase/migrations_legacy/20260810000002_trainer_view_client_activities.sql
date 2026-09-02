-- Extend the existing share_progress consent-gate pattern (already applied to
-- workout_history, workout_set_logs, fitness_profile, client_measurements in
-- 20260726000001_pt_clients_workout_assignment.sql and
-- 20260727000005_client_measurements.sql) to `activities`, so a personal
-- trainer can see a client's Strava-derived runs/walks/rides once the client
-- opts in via pt_clients.share_progress. This is a second, additive SELECT
-- policy — Postgres ORs multiple permissive policies together, so it doesn't
-- touch the existing owner-only `user_id = auth.uid()` policy.
CREATE POLICY "Trainers view shared client activities"
  ON public.activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = activities.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );
