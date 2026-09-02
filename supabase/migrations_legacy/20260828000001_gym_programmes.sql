-- Venue multi-week programmes: ports the PT "multi-week programme" concept
-- (pt_offerings.is_programme + pt_programme_enrollments) to gyms, since it
-- previously only existed on the PT side — a venue running a structured
-- multi-week course (e.g. martial arts) had no native way to sell it and had
-- to be dual-registered as a PT to use pt_offerings, which is shaped for one
-- named individual, not a venue/studio.
--
-- Unlike pt_offerings, this is a programme-only table (no is_programme flag)
-- since sessions/experiences already cover single-offering venue content.
--
-- The intro session is a real `sessions` row rather than a parallel booking
-- primitive (PT's pt_bookings) — venues already have full session-booking
-- infrastructure (bookings, book-session/guest-book-session, STK, check-in),
-- so the intro is just an ordinary bookable class the partner designates.
--
-- Unlike pt_programme_enrollments (which only ever records one deposit
-- payment; later instalments are a display-only calculation collected out of
-- band), every payment here — deposit and each instalment — is its own row
-- in gym_programme_instalments, so partners can actually see who's behind.

CREATE TABLE public.gym_programmes (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                      UUID          NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  instructor_id               UUID          REFERENCES public.gym_trainers(id) ON DELETE SET NULL,
  intro_session_id            UUID          NOT NULL REFERENCES public.sessions(id),
  title                       TEXT          NOT NULL,
  description                 TEXT,
  category                    TEXT,
  duration_minutes            INT           NOT NULL DEFAULT 60,
  max_participants            INT           NOT NULL DEFAULT 20,
  programme_weeks             INT           NOT NULL,
  programme_price_kes         NUMERIC(10,2) NOT NULL,
  deposit_pct                 INT           NOT NULL DEFAULT 30,
  instalment_frequency_weeks  INT           NOT NULL DEFAULT 4,
  image_url                   TEXT,
  slug                        TEXT          NOT NULL,
  is_active                   BOOLEAN       NOT NULL DEFAULT true,
  is_draft                    BOOLEAN       NOT NULL DEFAULT false,
  cancellation_cutoff_hours   INT,
  no_show_grace_mins          INT,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.gym_programmes.intro_session_id          IS 'Existing sessions row customers book as this programme''s trial class';
COMMENT ON COLUMN public.gym_programmes.programme_weeks           IS 'Total programme duration in weeks (e.g. 12)';
COMMENT ON COLUMN public.gym_programmes.deposit_pct                IS 'Deposit percentage required at Stage 2 commitment';
COMMENT ON COLUMN public.gym_programmes.instalment_frequency_weeks IS 'Weeks between each instalment payment';
COMMENT ON COLUMN public.gym_programmes.cancellation_cutoff_hours  IS 'NULL = inherit gyms venue-level default';
COMMENT ON COLUMN public.gym_programmes.no_show_grace_mins         IS 'NULL = inherit gyms venue-level default';

CREATE UNIQUE INDEX gym_programmes_slug_idx ON public.gym_programmes (slug);
CREATE INDEX gym_programmes_gym_idx ON public.gym_programmes (gym_id);
CREATE INDEX gym_programmes_active_idx ON public.gym_programmes (is_active, is_draft) WHERE is_active = true AND is_draft = false;

-- Same make_slug() + collision-loop shape already used by sessions/
-- experiences/trainers (20260722000001_add_slugs_sessions_trainers_experiences.sql)
CREATE OR REPLACE FUNCTION public.gym_programme_auto_slug() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base_slug := public.make_slug(COALESCE(NEW.title, 'programme'));
  IF base_slug = '' THEN base_slug := 'programme'; END IF;
  candidate := base_slug;
  suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.gym_programmes WHERE slug = candidate) LOOP
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gym_programmes_auto_slug
  BEFORE INSERT ON public.gym_programmes
  FOR EACH ROW EXECUTE FUNCTION public.gym_programme_auto_slug();

CREATE TRIGGER gym_programmes_updated_at
  BEFORE UPDATE ON public.gym_programmes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Enrollments ──────────────────────────────────────────────────────────────

CREATE TABLE public.gym_programme_enrollments (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id             UUID          NOT NULL REFERENCES public.gym_programmes(id) ON DELETE CASCADE,
  gym_id                   UUID          NOT NULL REFERENCES public.gyms(id),

  user_id                  UUID          REFERENCES public.users(id),
  guest_name               TEXT,
  guest_email              TEXT,
  guest_phone              TEXT,

  intro_booking_id         UUID          REFERENCES public.bookings(id),
  trainer_intro_confirmed  BOOLEAN       NOT NULL DEFAULT false,

  status                   TEXT          NOT NULL DEFAULT 'intro_booked'
                                         CHECK (status IN (
                                           'intro_booked', 'intro_complete',
                                           'programme_active', 'completed', 'cancelled'
                                         )),

  programme_start_date     DATE,
  total_price_kes          NUMERIC(10,2),
  deposit_pct              INT           NOT NULL DEFAULT 30,

  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER gym_programme_enrollments_updated_at
  BEFORE UPDATE ON public.gym_programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX gym_prog_enroll_programme_idx ON public.gym_programme_enrollments (programme_id);
CREATE INDEX gym_prog_enroll_gym_idx       ON public.gym_programme_enrollments (gym_id);
CREATE INDEX gym_prog_enroll_user_idx      ON public.gym_programme_enrollments (user_id);
CREATE INDEX gym_prog_enroll_intro_idx     ON public.gym_programme_enrollments (intro_booking_id);

-- ── Instalments — one row per payment (deposit = sequence 0), unlike PT's
--    single deposit_paid_kes field ──────────────────────────────────────────

CREATE TABLE public.gym_programme_instalments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID          NOT NULL REFERENCES public.gym_programme_enrollments(id) ON DELETE CASCADE,
  sequence        INT           NOT NULL,
  amount_kes      NUMERIC(10,2) NOT NULL,
  due_date        DATE,
  status          TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'waived')),
  paid_at         TIMESTAMPTZ,
  payment_method  TEXT,
  mpesa_reference TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, sequence)
);

COMMENT ON COLUMN public.gym_programme_instalments.sequence IS '0 = deposit (paid immediately at commit), 1..N = subsequent instalments';
COMMENT ON COLUMN public.gym_programme_instalments.due_date IS 'NULL for sequence 0 — due immediately';

CREATE INDEX gym_prog_instalment_enrollment_idx ON public.gym_programme_instalments (enrollment_id);
CREATE INDEX gym_prog_instalment_due_idx ON public.gym_programme_instalments (due_date) WHERE status = 'pending';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.gym_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_programme_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_programme_instalments ENABLE ROW LEVEL SECURITY;

-- gym_programmes: public read (active + published), two-hop gym-ownership
-- manage (matches gym_trainers' RLS shape, not personal_trainers' single-hop
-- shape), assigned gym_trainer can read their own programme, admin full access.

CREATE POLICY "Public can view active gym programmes" ON public.gym_programmes FOR SELECT
  USING (is_active = true AND is_draft = false);

CREATE POLICY "Partners manage their gym programmes" ON public.gym_programmes FOR ALL
  USING (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Assigned trainer views their gym programmes" ON public.gym_programmes FOR SELECT
  USING (instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Admins have full access to gym programmes" ON public.gym_programmes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- gym_programme_enrollments: partner (two-hop) and assigned trainer see/update
-- their own gym's enrollments (e.g. to set trainer_intro_confirmed), customer
-- sees their own, service role inserts (matches pt_programme_enrollments'
-- "insert via API route" pattern exactly).

CREATE POLICY "Partners manage their gym programme enrollments" ON public.gym_programme_enrollments FOR SELECT
  USING (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Partners update their gym programme enrollments" ON public.gym_programme_enrollments FOR UPDATE
  USING (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Assigned trainer views their programme enrollments" ON public.gym_programme_enrollments FOR SELECT
  USING (
    programme_id IN (
      SELECT id FROM public.gym_programmes
      WHERE instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "User sees own gym programme enrollments" ON public.gym_programme_enrollments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role inserts gym programme enrollments" ON public.gym_programme_enrollments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins have full access to gym programme enrollments" ON public.gym_programme_enrollments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- gym_programme_instalments: partner sees their own gym's, customer sees
-- their own (via enrollment ownership), writes via service-role API route only.

CREATE POLICY "Partners view their gym programme instalments" ON public.gym_programme_instalments FOR SELECT
  USING (
    enrollment_id IN (
      SELECT e.id FROM public.gym_programme_enrollments e
      JOIN public.partner_gyms pg ON pg.gym_id = e.gym_id
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "User sees own gym programme instalments" ON public.gym_programme_instalments FOR SELECT
  USING (
    enrollment_id IN (SELECT id FROM public.gym_programme_enrollments WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role inserts gym programme instalments" ON public.gym_programme_instalments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins have full access to gym programme instalments" ON public.gym_programme_instalments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
