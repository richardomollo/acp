-- Allow users to create and manage their own workouts

-- 1. Add user_id to workouts (nullable — NULL = system/curated workout)
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Add external_id to exercises so ExerciseDB exercises can be upserted idempotently
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exercises_external_id_key ON public.exercises(external_id) WHERE external_id IS NOT NULL;

-- ── Workouts RLS ────────────────────────────────────────────────────────────────

-- Drop old catch-all read policy, replace with one that also covers user workouts
DROP POLICY IF EXISTS "Workouts are publicly readable" ON public.workouts;
CREATE POLICY "Workouts are readable"
  ON public.workouts FOR SELECT
  USING (is_active = true AND (user_id IS NULL OR user_id = auth.uid()));

CREATE POLICY "Users can create workouts"
  ON public.workouts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own workouts"
  ON public.workouts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own workouts"
  ON public.workouts FOR DELETE
  USING (user_id = auth.uid());

-- ── Workout exercises RLS ───────────────────────────────────────────────────────

CREATE POLICY "Users can insert workout exercises"
  ON public.workout_exercises FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own workout exercises"
  ON public.workout_exercises FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete own workout exercises"
  ON public.workout_exercises FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.workouts WHERE id = workout_id AND user_id = auth.uid())
  );

-- ── Exercises RLS ───────────────────────────────────────────────────────────────

-- Allow authenticated users to insert ExerciseDB exercises
CREATE POLICY "Authenticated users can insert exercises"
  ON public.exercises FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow updating ExerciseDB-sourced exercises (e.g. to fill in gif_url later)
CREATE POLICY "Authenticated users can update exercisedb exercises"
  ON public.exercises FOR UPDATE
  USING (external_id IS NOT NULL AND auth.uid() IS NOT NULL);
