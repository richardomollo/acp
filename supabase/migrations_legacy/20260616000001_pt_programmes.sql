-- ─────────────────────────────────────────────────────────────────────────────
-- PT Programmes
-- Extends pt_offerings with programme-mode fields and adds the
-- pt_programme_enrollments table to track the two-stage purchase flow.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend pt_offerings ────────────────────────────────────────────────────
ALTER TABLE public.pt_offerings
  ADD COLUMN IF NOT EXISTS is_programme              BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS programme_weeks           INT,
  ADD COLUMN IF NOT EXISTS programme_price_kes       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS intro_price_kes           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_pct               INT           NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS instalment_frequency_weeks INT;

COMMENT ON COLUMN public.pt_offerings.is_programme               IS 'True for multi-week programme offerings';
COMMENT ON COLUMN public.pt_offerings.programme_weeks            IS 'Total programme duration in weeks (e.g. 12)';
COMMENT ON COLUMN public.pt_offerings.programme_price_kes        IS 'Full programme price in KES';
COMMENT ON COLUMN public.pt_offerings.intro_price_kes            IS 'Introductory session price (0 = free, NULL = not set = same as price_kes)';
COMMENT ON COLUMN public.pt_offerings.deposit_pct                IS 'Deposit percentage required at Stage 2 commitment';
COMMENT ON COLUMN public.pt_offerings.instalment_frequency_weeks IS 'Weeks between each instalment payment (e.g. 3)';

-- ── 2. Programme enrollments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_programme_enrollments (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id              UUID          NOT NULL REFERENCES public.pt_offerings(id) ON DELETE CASCADE,
  pt_id                     UUID          NOT NULL REFERENCES public.personal_trainers(id),

  -- Client (authenticated or guest)
  user_id                   UUID          REFERENCES public.users(id),
  guest_name                TEXT,
  guest_email               TEXT,
  guest_phone               TEXT,

  -- Intro session link (set after Stage 1 booking)
  intro_booking_id          UUID          REFERENCES public.pt_bookings(id),
  trainer_intro_confirmed   BOOLEAN       NOT NULL DEFAULT false,

  -- Programme commitment status
  status                    TEXT          NOT NULL DEFAULT 'intro_booked'
                                          CHECK (status IN (
                                            'intro_booked',
                                            'intro_complete',
                                            'programme_active',
                                            'completed',
                                            'cancelled'
                                          )),

  -- Stage 2 details (filled on programme purchase)
  programme_start_date      DATE,
  total_price_kes           NUMERIC(10,2),
  deposit_pct               INT           NOT NULL DEFAULT 30,
  deposit_paid_kes          NUMERIC(10,2),
  payment_method            TEXT,
  payment_status            TEXT          DEFAULT 'pending'
                                          CHECK (payment_status IN ('pending','paid','failed','refunded')),
  mpesa_reference           TEXT,

  notes                     TEXT,

  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Updated-at trigger
CREATE TRIGGER pt_programme_enrollments_updated_at
  BEFORE UPDATE ON public.pt_programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pt_prog_enroll_prog_idx  ON public.pt_programme_enrollments (programme_id);
CREATE INDEX IF NOT EXISTS pt_prog_enroll_pt_idx    ON public.pt_programme_enrollments (pt_id);
CREATE INDEX IF NOT EXISTS pt_prog_enroll_user_idx  ON public.pt_programme_enrollments (user_id);
CREATE INDEX IF NOT EXISTS pt_prog_enroll_intro_idx ON public.pt_programme_enrollments (intro_booking_id);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.pt_programme_enrollments ENABLE ROW LEVEL SECURITY;

-- PT sees and updates their own enrollments
CREATE POLICY "PT sees own programme enrollments"
  ON public.pt_programme_enrollments FOR SELECT
  USING (
    pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
  );

CREATE POLICY "PT updates own programme enrollments"
  ON public.pt_programme_enrollments FOR UPDATE
  USING (
    pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
  );

-- Authenticated user sees their own enrollments
CREATE POLICY "User sees own programme enrollments"
  ON public.pt_programme_enrollments FOR SELECT
  USING (user_id = auth.uid());

-- Inserts are done via service-role API route
CREATE POLICY "Service role inserts programme enrollments"
  ON public.pt_programme_enrollments FOR INSERT
  WITH CHECK (true);
