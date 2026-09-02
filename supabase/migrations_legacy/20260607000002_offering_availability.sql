-- Add per-offering availability: offering_id IS NULL → global PT schedule,
-- offering_id IS NOT NULL → overrides global for that specific session only.

ALTER TABLE public.pt_availability
  ADD COLUMN IF NOT EXISTS offering_id UUID REFERENCES public.pt_offerings(id) ON DELETE CASCADE;

-- Drop the old global unique constraint (doesn't handle NULLs correctly for two-scope model)
ALTER TABLE public.pt_availability
  DROP CONSTRAINT IF EXISTS pt_availability_pt_id_day_of_week_start_time_key;

-- Partial index for global schedule (offering_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS pt_availability_global_unique
  ON public.pt_availability (pt_id, day_of_week, start_time)
  WHERE offering_id IS NULL;

-- Partial index for per-offering schedule
CREATE UNIQUE INDEX IF NOT EXISTS pt_availability_offering_unique
  ON public.pt_availability (offering_id, day_of_week, start_time)
  WHERE offering_id IS NOT NULL;
