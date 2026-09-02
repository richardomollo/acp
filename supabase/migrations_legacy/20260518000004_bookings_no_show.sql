-- Ensure checked_in exists (may have been added manually outside migrations)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in boolean NOT NULL DEFAULT false;

-- Add no_show flag to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false;

-- A booking cannot be both checked in and a no-show
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_show_checked_in_excl
  CHECK (NOT (checked_in = true AND no_show = true));

-- Backfill: any past booking that was never checked in
UPDATE public.bookings
SET no_show = true
WHERE checked_in = false
  AND no_show    = false
  AND booking_date < CURRENT_DATE;

-- Daily cron to mark new no-shows (requires pg_cron extension)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'mark-no-shows',
      '0 1 * * *',
      $sql$UPDATE public.bookings
        SET no_show = true
        WHERE checked_in = false
          AND no_show    = false
          AND booking_date < CURRENT_DATE;$sql$
    );
  END IF;
END $$;
