-- Body weight/measurement tracking — the "Progress" pillar VYTAL covers
-- beyond just workout history. Mirrors workout_history's ownership shape
-- (auth.users FK, no public.users embed needed) and the share_progress
-- consent-gate pattern already used for workout_history/workout_set_logs/
-- fitness_profile.

CREATE TABLE IF NOT EXISTS public.client_measurements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg  numeric,
  waist_cm   numeric,
  chest_cm   numeric,
  hips_cm    numeric,
  notes      text,
  logged_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own measurements"
  ON public.client_measurements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own measurements"
  ON public.client_measurements FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own measurements"
  ON public.client_measurements FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own measurements"
  ON public.client_measurements FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Trainers view shared measurements"
  ON public.client_measurements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pt_clients pc
    JOIN public.personal_trainers pt ON pt.id = pc.pt_id
    WHERE pc.client_user_id = client_measurements.user_id
      AND pt.user_id = auth.uid() AND pc.share_progress = true
  ));

CREATE INDEX client_measurements_user_idx ON public.client_measurements (user_id, logged_at DESC);
