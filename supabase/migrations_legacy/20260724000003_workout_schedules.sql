-- Scheduled workouts: a user picks a workout, a start date + time of day,
-- and an optional recurrence (once / daily / weekly on specific weekdays).
-- notification_ids stores the device-local expo-notifications identifiers
-- so the app can cancel/reschedule them on edit or delete.

CREATE TABLE IF NOT EXISTS public.workout_schedules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id        uuid        NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  start_date        date        NOT NULL,
  time_of_day       time        NOT NULL,
  recurrence        text        NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly')),
  weekdays          smallint[]  NOT NULL DEFAULT '{}', -- 0=Sun..6=Sat, only used when recurrence = 'weekly'
  notification_ids  text[]      NOT NULL DEFAULT '{}',
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own workout schedules"
  ON public.workout_schedules FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own workout schedules"
  ON public.workout_schedules FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own workout schedules"
  ON public.workout_schedules FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own workout schedules"
  ON public.workout_schedules FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX workout_schedules_user_id_idx ON public.workout_schedules (user_id);
CREATE INDEX workout_schedules_workout_id_idx ON public.workout_schedules (workout_id);
