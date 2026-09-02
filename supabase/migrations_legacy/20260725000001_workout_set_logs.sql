-- Per-set weight/reps logging during a guided workout session, so users can
-- track strength progress on a given exercise over time.

CREATE TABLE IF NOT EXISTS public.workout_set_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_history_id  uuid        NOT NULL REFERENCES public.workout_history(id) ON DELETE CASCADE,
  exercise_id         uuid        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  set_number          integer     NOT NULL,
  weight_kg           numeric,
  reps                integer,
  logged_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own set logs"
  ON public.workout_set_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own set logs"
  ON public.workout_set_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own set logs"
  ON public.workout_set_logs FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX workout_set_logs_user_exercise_idx ON public.workout_set_logs (user_id, exercise_id, logged_at DESC);
CREATE INDEX workout_set_logs_workout_history_idx ON public.workout_set_logs (workout_history_id);
