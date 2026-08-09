-- Allow guest bookings: user_id becomes nullable and guest contact fields are added.
ALTER TABLE public.bookings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_name   TEXT,
  ADD COLUMN IF NOT EXISTS guest_email  TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone  TEXT;

-- Guests must supply at least an email
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_owner_check
    CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

CREATE INDEX IF NOT EXISTS bookings_guest_email_idx ON public.bookings (guest_email);
