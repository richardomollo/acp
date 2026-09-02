-- ── Favorites, ratings, actual rest logging, and health sync ──────────────────
-- Exercises come from two sources: the DB-backed `exercises` table (used in
-- workout-detail/workout-player) and a live ExerciseDB/RapidAPI browse screen
-- that has no matching DB rows. Favorites/ratings support both via a
-- `source` + one-of-two-keys shape rather than forcing a fake DB row.

CREATE TABLE IF NOT EXISTS public.exercise_favorites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source       text        NOT NULL CHECK (source IN ('db', 'exercisedb')),
  exercise_id  uuid        REFERENCES public.exercises(id) ON DELETE CASCADE,
  external_id  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_favorites_key_check CHECK (
    (source = 'db' AND exercise_id IS NOT NULL AND external_id IS NULL) OR
    (source = 'exercisedb' AND external_id IS NOT NULL AND exercise_id IS NULL)
  )
);

ALTER TABLE public.exercise_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own exercise favorites"
  ON public.exercise_favorites FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own exercise favorites"
  ON public.exercise_favorites FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own exercise favorites"
  ON public.exercise_favorites FOR DELETE
  USING (user_id = auth.uid());

CREATE UNIQUE INDEX exercise_favorites_db_uidx
  ON public.exercise_favorites (user_id, source, exercise_id);
CREATE UNIQUE INDEX exercise_favorites_external_uidx
  ON public.exercise_favorites (user_id, source, external_id);

-- ── Exercise ratings (personal, editable anytime — not a per-session log) ─────
CREATE TABLE IF NOT EXISTS public.exercise_ratings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source       text        NOT NULL CHECK (source IN ('db', 'exercisedb')),
  exercise_id  uuid        REFERENCES public.exercises(id) ON DELETE CASCADE,
  external_id  text,
  rating       integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_ratings_key_check CHECK (
    (source = 'db' AND exercise_id IS NOT NULL AND external_id IS NULL) OR
    (source = 'exercisedb' AND external_id IS NOT NULL AND exercise_id IS NULL)
  )
);

ALTER TABLE public.exercise_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own exercise ratings"
  ON public.exercise_ratings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own exercise ratings"
  ON public.exercise_ratings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own exercise ratings"
  ON public.exercise_ratings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own exercise ratings"
  ON public.exercise_ratings FOR DELETE
  USING (user_id = auth.uid());

CREATE UNIQUE INDEX exercise_ratings_db_uidx
  ON public.exercise_ratings (user_id, source, exercise_id);
CREATE UNIQUE INDEX exercise_ratings_external_uidx
  ON public.exercise_ratings (user_id, source, external_id);

-- ── Workout favorites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_favorites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id  uuid        NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workout_id)
);

ALTER TABLE public.workout_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own workout favorites"
  ON public.workout_favorites FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own workout favorites"
  ON public.workout_favorites FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own workout favorites"
  ON public.workout_favorites FOR DELETE
  USING (user_id = auth.uid());

-- ── Actual rest time between sets (workout_set_logs only had planned rest) ────
ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS rest_seconds_actual integer;

-- Note: workout_history already has an UPDATE policy (added in
-- 20260729000004_workout_history_exercise_notes.sql), which the post-session
-- rating feature relies on to set `rating` after insert — no change needed here.

-- ── Apple Health daily sync (durable mirror so Analytics can query like ───────
-- everything else instead of re-reading HealthKit on every page load) ─────────
CREATE TABLE IF NOT EXISTS public.health_daily_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  steps           integer,
  calories_burned numeric,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.health_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own health stats"
  ON public.health_daily_stats FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own health stats"
  ON public.health_daily_stats FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own health stats"
  ON public.health_daily_stats FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX health_daily_stats_user_date_idx ON public.health_daily_stats (user_id, date DESC);
