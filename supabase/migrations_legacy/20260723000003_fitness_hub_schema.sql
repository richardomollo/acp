-- ── ACP Fitness Hub ─────────────────────────────────────────────────────────
-- Schema: exercises, workouts, workout_exercises, workout_history, fitness_profile

-- ── Exercises ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exercises (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text         NOT NULL,
  body_part    text,
  target_muscle text,
  equipment    text,
  difficulty   text         CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  instructions text[]       NOT NULL DEFAULT '{}',
  media_url    text,
  source       text         NOT NULL DEFAULT 'ACP',
  created_at   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exercises are publicly readable"
  ON public.exercises FOR SELECT USING (true);

-- ── Workouts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workouts (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text     NOT NULL,
  description      text,
  category         text     NOT NULL,
  location_type    text     NOT NULL CHECK (location_type IN ('home', 'gym', 'both')),
  difficulty       text     NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_minutes integer  NOT NULL,
  goal             text     CHECK (goal IN ('lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness')),
  equipment        text,
  thumbnail        text,
  is_active        boolean  NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workouts are publicly readable"
  ON public.workouts FOR SELECT USING (is_active = true);

-- ── Workout Exercises (join table with order + prescription) ──────────────────
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id       uuid     NOT NULL REFERENCES public.workouts(id)  ON DELETE CASCADE,
  exercise_id      uuid     NOT NULL REFERENCES public.exercises(id),
  sort_order       integer  NOT NULL,
  sets             integer,
  reps             integer,
  duration_seconds integer,
  rest_seconds     integer  NOT NULL DEFAULT 60,
  notes            text
);

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workout exercises are publicly readable"
  ON public.workout_exercises FOR SELECT USING (true);

CREATE INDEX workout_exercises_workout_id_idx ON public.workout_exercises (workout_id);

-- ── Workout History ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_history (
  id               uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id       uuid     NOT NULL REFERENCES public.workouts(id),
  completed_at     timestamptz NOT NULL DEFAULT now(),
  duration_minutes integer,
  rating           integer  CHECK (rating BETWEEN 1 AND 5)
);

ALTER TABLE public.workout_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own workout history"
  ON public.workout_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own workout history"
  ON public.workout_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own workout history"
  ON public.workout_history FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX workout_history_user_id_idx ON public.workout_history (user_id);
CREATE INDEX workout_history_completed_at_idx ON public.workout_history (completed_at);

-- ── Fitness Profile ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fitness_profile (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal               text CHECK (goal IN ('lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness')),
  experience_level   text CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  preferred_location text CHECK (preferred_location IN ('home', 'gym', 'both')),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fitness_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own fitness profile"
  ON public.fitness_profile FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users upsert own fitness profile"
  ON public.fitness_profile FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own fitness profile"
  ON public.fitness_profile FOR UPDATE
  USING (user_id = auth.uid());
