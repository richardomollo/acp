-- Expand Apple Health sync beyond steps/active energy: resting energy + heart
-- rate join the existing daily time-series table; body measurements and
-- profile characteristics (which are "latest known value", not daily) get
-- their own table; workouts get their own table since they're discrete
-- events from a different source than our own app-logged workout_history.

ALTER TABLE public.health_daily_stats
  ADD COLUMN IF NOT EXISTS resting_energy_kcal numeric,
  ADD COLUMN IF NOT EXISTS heart_rate_avg numeric;

CREATE TABLE IF NOT EXISTS public.health_profile (
  user_id                  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_birth            date,
  biological_sex           text,
  height_cm                numeric,
  weight_kg                numeric,
  body_fat_percentage      numeric,
  waist_circumference_cm   numeric,
  synced_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own health profile"
  ON public.health_profile FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own health profile"
  ON public.health_profile FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own health profile"
  ON public.health_profile FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.health_workouts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hk_uuid            text        NOT NULL,
  activity_type      text,
  start_date         timestamptz NOT NULL,
  end_date           timestamptz NOT NULL,
  duration_seconds   numeric,
  total_energy_kcal  numeric,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hk_uuid)
);

ALTER TABLE public.health_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own health workouts"
  ON public.health_workouts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own health workouts"
  ON public.health_workouts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX health_workouts_user_date_idx ON public.health_workouts (user_id, start_date DESC);
