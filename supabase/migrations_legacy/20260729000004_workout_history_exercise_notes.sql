-- Per-exercise personal notes during a self-logged workout session (e.g. "felt
-- a pull in my shoulder on set 2", "increase weight next time"), keyed by
-- exercise id within that session's exercise_notes jsonb blob. Distinct from
-- workout_exercises.notes (the trainer's assigned note on the template) and
-- from workout_history.notes (the whole-session note already captured on the
-- done screen).
ALTER TABLE public.workout_history ADD COLUMN IF NOT EXISTS exercise_notes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Self-users had no UPDATE policy on workout_history at all (only a
-- trainer-logged-on-behalf-of policy existed), so the existing "Save Note"
-- button on the done screen has been silently failing for every self-logged
-- session. Fixes that too.
CREATE POLICY "Users update own workout history"
  ON public.workout_history FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
