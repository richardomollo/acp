-- Beta Feedback #020B — anchored weekly measurement check-in.
--
-- The weekly check-in reminder is now anchored to a stable WEEKDAY instead of
-- drifting 7 days from the last log. This one additive column makes the
-- anchor a structured, per-user setting; the Lana MVP default is Friday.
--
-- Fully ADDITIVE: one nullable-but-defaulted smallint. `ADD COLUMN ... DEFAULT
-- 5` backfills every existing fitness_profile row to Friday (Postgres 11+ does
-- this as a metadata-only change — no table rewrite), so EXISTING users
-- receive the Friday default immediately with no data migration. New rows get
-- 5 from the column default. The app also falls back to weekday 5 in code when
-- the value is NULL, so a partial/older client is safe too.
--
-- No measurement history is touched. `client_measurements` remains the sole
-- canonical evidence; this column only shapes when the reminder appears.
--
-- JS weekday convention (matches lib/progress/measurement-checkin.ts):
--   0 = Sunday … 5 = Friday … 6 = Saturday.

ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS measurement_checkin_weekday smallint NOT NULL DEFAULT 5;

ALTER TABLE public.fitness_profile
  DROP CONSTRAINT IF EXISTS fitness_profile_measurement_checkin_weekday_check;
ALTER TABLE public.fitness_profile
  ADD CONSTRAINT fitness_profile_measurement_checkin_weekday_check
  CHECK (measurement_checkin_weekday BETWEEN 0 AND 6);
