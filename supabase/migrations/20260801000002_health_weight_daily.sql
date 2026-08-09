-- Move weight from health_profile (single latest-known-value row) into
-- health_daily_stats (per-day value, using HealthKit's daily "most recent"
-- aggregation) so it can be charted as a trend on the Analytics page, same
-- as steps/calories/resting energy/heart rate.

ALTER TABLE public.health_daily_stats
  ADD COLUMN IF NOT EXISTS weight_kg numeric;

ALTER TABLE public.health_profile
  DROP COLUMN IF EXISTS weight_kg;
