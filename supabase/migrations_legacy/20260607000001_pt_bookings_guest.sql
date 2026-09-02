-- Allow guest (unauthenticated) PT bookings: user_id becomes optional,
-- guest contact info stored directly on the booking.

ALTER TABLE public.pt_bookings ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.pt_bookings
  ADD COLUMN IF NOT EXISTS guest_name  TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT;
