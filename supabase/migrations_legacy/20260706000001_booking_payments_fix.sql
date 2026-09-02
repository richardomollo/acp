-- booking_payments: make booking_id nullable (experience bookings have no session booking_id)
-- and add metadata column (used to store experience_booking_id)
ALTER TABLE public.booking_payments
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS metadata JSONB;
