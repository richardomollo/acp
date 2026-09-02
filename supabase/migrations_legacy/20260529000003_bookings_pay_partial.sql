-- Add Pay Partial payment columns to bookings

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS session_price           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_pct             INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_amount          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS remainder_amount        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_payment_id      TEXT,
  ADD COLUMN IF NOT EXISTS deposit_paid_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_refunded        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remainder_collected     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remainder_collected_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_phone           TEXT,
  ADD COLUMN IF NOT EXISTS qr_payload              TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason     TEXT;

-- Extend status enum to include new pay-partial states
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending',
      'pending_payment',
      'deposit_paid',
      'confirmed',
      'checked_in',
      'completed',
      'cancelled',
      'no_show'
    ));

-- Payment audit trail: one row per STK push attempt
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  checkout_request_id  TEXT UNIQUE,
  merchant_request_id  TEXT,
  phone                TEXT NOT NULL,
  amount               NUMERIC(10,2) NOT NULL,
  payment_type         TEXT NOT NULL CHECK (payment_type IN ('deposit', 'remainder')),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  mpesa_receipt        TEXT,
  raw_callback         JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_payments_booking_id_idx        ON public.booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS booking_payments_checkout_request_idx  ON public.booking_payments(checkout_request_id);
