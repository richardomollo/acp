-- Allow sessions and pt_offerings to override the venue-level cancellation policy.
-- NULL means "inherit from gyms"; a non-null value takes precedence.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_pct               INTEGER,
  ADD COLUMN IF NOT EXISTS no_show_grace_mins         INTEGER;

ALTER TABLE public.pt_offerings
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INTEGER,
  ADD COLUMN IF NOT EXISTS no_show_grace_mins         INTEGER;

COMMENT ON COLUMN public.sessions.cancellation_cutoff_hours IS 'Override venue cancellation window (hours). NULL = inherit from gyms.';
COMMENT ON COLUMN public.sessions.deposit_pct               IS 'Override venue deposit % (1–100). NULL = inherit from gyms.';
COMMENT ON COLUMN public.sessions.no_show_grace_mins        IS 'Override venue no-show grace period (minutes). NULL = inherit from gyms.';

COMMENT ON COLUMN public.pt_offerings.cancellation_cutoff_hours IS 'Override venue cancellation window (hours). NULL = inherit from gyms.';
COMMENT ON COLUMN public.pt_offerings.no_show_grace_mins        IS 'Override venue no-show grace period (minutes). NULL = inherit from gyms.';
