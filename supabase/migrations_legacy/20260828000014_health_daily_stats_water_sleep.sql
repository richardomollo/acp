-- Home page's "For this day" goals row (Steps/Water/Sleep, redesigned to
-- match the ring + manual-counter style of the reference design) needs a
-- per-day home for manually-logged water and sleep, alongside the existing
-- HealthKit-synced `steps` column on the same table.
ALTER TABLE public.health_daily_stats
  ADD COLUMN IF NOT EXISTS water_cups   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sleep_hours  numeric NOT NULL DEFAULT 0;
