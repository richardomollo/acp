-- Experience bookings: records a paid booking for a specific experience
CREATE TABLE IF NOT EXISTS public.experience_bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id       UUID        NOT NULL REFERENCES public.experiences(id) ON DELETE CASCADE,
  user_id             UUID        REFERENCES auth.users(id),
  gym_id              UUID        NOT NULL,
  email               TEXT        NOT NULL,
  guest_name          TEXT,
  guest_phone         TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending_payment',
  -- statuses: pending_payment | deposit_paid | confirmed | checked_in | completed | cancelled
  confirmation_code   TEXT,
  qr_payload          TEXT,
  session_price       NUMERIC(12,2),
  deposit_pct         NUMERIC(5,2),
  deposit_amount      NUMERIC(12,2),
  remainder_amount    NUMERIC(12,2),
  payment_phone       TEXT,
  deposit_paid_at     TIMESTAMPTZ,
  deposit_payment_id  TEXT,
  cancellation_reason TEXT,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.experience_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own experience bookings"
  ON public.experience_bookings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages experience bookings"
  ON public.experience_bookings FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS experience_bookings_user_idx
  ON public.experience_bookings (user_id);

CREATE INDEX IF NOT EXISTS experience_bookings_experience_idx
  ON public.experience_bookings (experience_id);

COMMENT ON TABLE public.experience_bookings IS 'Paid bookings for full-day experiences';
