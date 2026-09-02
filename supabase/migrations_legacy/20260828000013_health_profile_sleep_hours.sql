-- Onboarding's starting-point step now records a sleep/work/sport/leisure
-- weekly-hours breakdown (replacing the old single activity-level picker).
-- Work and sport hours already live on health_profile
-- (20260828000008_health_profile_activity_hours.sql); sleep has no home yet.
ALTER TABLE public.health_profile
  ADD COLUMN IF NOT EXISTS sleep_hours_per_night numeric;
