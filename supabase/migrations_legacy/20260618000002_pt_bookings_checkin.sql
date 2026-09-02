-- Add check-in fields to pt_bookings to support in-app QR check-in
ALTER TABLE pt_bookings
  ADD COLUMN IF NOT EXISTS confirmation_code TEXT,
  ADD COLUMN IF NOT EXISTS checked_in        BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS check_in_time     TIMESTAMPTZ;
