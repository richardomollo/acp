-- Add session-level cancellation policy fields to experiences
-- null = inherit venue/platform default, explicit value = override
ALTER TABLE public.experiences
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_pct               INTEGER,
  ADD COLUMN IF NOT EXISTS no_show_grace_mins        INTEGER;

COMMENT ON COLUMN public.experiences.cancellation_cutoff_hours IS 'Hours before start that free cancellation closes; null = venue/platform default';
COMMENT ON COLUMN public.experiences.deposit_pct               IS 'Deposit percentage required at booking; null = venue/platform default';
COMMENT ON COLUMN public.experiences.no_show_grace_mins        IS 'Minutes after start before marking no-show; null = venue/platform default';
