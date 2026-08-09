-- ─────────────────────────────────────────────────────────────────────────────
-- Personal Trainer System
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Core PT profile ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.personal_trainers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identity
  full_name            TEXT        NOT NULL,
  professional_name    TEXT,                        -- "Coach James"
  slug                 TEXT        UNIQUE,          -- coach-james (auto-generated)
  photo_url            TEXT,
  bio                  TEXT,
  instagram_handle     TEXT,
  phone                TEXT,
  email                TEXT,

  -- Professional
  years_of_experience  INT,
  certifications       TEXT[]      NOT NULL DEFAULT '{}',   -- ['REPS Kenya','NASM']
  specialisations      TEXT[]      NOT NULL DEFAULT '{}',   -- ['Weight Loss','Strength']
  languages            TEXT[]      NOT NULL DEFAULT '{}',   -- ['English','Swahili']

  -- Logistics
  training_locations   TEXT[]      NOT NULL DEFAULT '{}',   -- ['Home','Outdoor','Online']
  session_types        TEXT[]      NOT NULL DEFAULT '{}',   -- ['1-on-1','Group','Online']
  service_areas        TEXT[]      NOT NULL DEFAULT '{}',   -- for home-visit radius

  -- Approval workflow (self-serve with approval queue)
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason     TEXT,
  is_certified_verified BOOLEAN    NOT NULL DEFAULT false,  -- admin manually verified certs
  approved_at          TIMESTAMPTZ,
  rejected_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate slug from professional_name or full_name
CREATE OR REPLACE FUNCTION public.generate_pt_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INT := 0;
BEGIN
  base_slug := regexp_replace(
    lower(coalesce(NEW.professional_name, NEW.full_name)),
    '[^a-z0-9]+', '-', 'g'
  );
  base_slug := trim(both '-' from base_slug);
  candidate := base_slug;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.personal_trainers
      WHERE slug = candidate AND id != NEW.id
    );
    counter   := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_pt_slug
  BEFORE INSERT ON public.personal_trainers
  FOR EACH ROW EXECUTE FUNCTION public.generate_pt_slug();

-- ── 2. PT ↔ Venue links ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_venue_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id      UUID        NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  gym_id     UUID        NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  is_primary BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pt_id, gym_id)
);

-- ── 3. Weekly recurring availability ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_availability (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id        UUID  NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  day_of_week  INT   NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Mon … 6=Sun
  start_time   TIME  NOT NULL,
  end_time     TIME  NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (pt_id, day_of_week, start_time)
);

-- ── 4. Blocked dates (override availability) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_blocked_dates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id      UUID        NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pt_id, date)
);

-- ── 5. Session offerings (the PT's menu) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_offerings (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id            UUID          NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,

  title            TEXT          NOT NULL,
  description      TEXT,
  type             TEXT          NOT NULL
                                 CHECK (type IN ('1-on-1','group','online','outdoor','home-visit','drop-in')),
  duration_minutes INT           NOT NULL DEFAULT 60,

  -- Pricing (both modes supported)
  price_kes        NUMERIC(10,2),
  credits_required INT,

  -- Capacity
  max_participants INT           NOT NULL DEFAULT 1,
  min_participants INT           NOT NULL DEFAULT 1,

  -- Venue link (for drop-in sessions)
  gym_id           UUID          REFERENCES public.gyms(id),

  -- Shareable slug within PT namespace
  slug             TEXT          NOT NULL,

  is_active        BOOLEAN       NOT NULL DEFAULT true,
  is_draft         BOOLEAN       NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (pt_id, slug)
);

-- ── 6. Bookings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_bookings (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id             UUID          NOT NULL REFERENCES public.personal_trainers(id),
  user_id           UUID          NOT NULL REFERENCES public.users(id),
  offering_id       UUID          NOT NULL REFERENCES public.pt_offerings(id),

  scheduled_date    DATE          NOT NULL,
  scheduled_time    TIME          NOT NULL,

  -- Location (confirmed at booking for flexible types)
  location_type     TEXT,
  location_address  TEXT,

  -- Payment
  payment_method    TEXT          CHECK (payment_method IN ('credits','mpesa','wallet')),
  amount_kes        NUMERIC(10,2),
  credits_used      INT,
  payment_status    TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (payment_status IN ('pending','paid','refunded','failed')),
  mpesa_reference   TEXT,

  -- Online session
  meeting_link      TEXT,

  -- Status
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  cancellation_reason TEXT,
  notes             TEXT,

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── 7. Reviews ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_reviews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id      UUID        NOT NULL REFERENCES public.personal_trainers(id),
  user_id    UUID        NOT NULL REFERENCES public.users(id),
  booking_id UUID        UNIQUE REFERENCES public.pt_bookings(id),
  rating     INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pt_status_idx       ON public.personal_trainers (status);
CREATE INDEX IF NOT EXISTS pt_user_id_idx      ON public.personal_trainers (user_id);
CREATE INDEX IF NOT EXISTS pt_slug_idx         ON public.personal_trainers (slug);
CREATE INDEX IF NOT EXISTS pt_offerings_pt_idx ON public.pt_offerings (pt_id);
CREATE INDEX IF NOT EXISTS pt_bookings_pt_idx  ON public.pt_bookings (pt_id);
CREATE INDEX IF NOT EXISTS pt_bookings_user_idx ON public.pt_bookings (user_id);
CREATE INDEX IF NOT EXISTS pt_bookings_date_idx ON public.pt_bookings (scheduled_date);
CREATE INDEX IF NOT EXISTS pt_reviews_pt_idx   ON public.pt_reviews (pt_id);

-- ── 9. Updated-at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TRIGGER pt_updated_at
  BEFORE UPDATE ON public.personal_trainers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pt_offerings_updated_at
  BEFORE UPDATE ON public.pt_offerings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pt_bookings_updated_at
  BEFORE UPDATE ON public.pt_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 10. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE public.personal_trainers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_venue_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_blocked_dates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_offerings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_reviews         ENABLE ROW LEVEL SECURITY;

-- personal_trainers
CREATE POLICY "Public can view approved PTs"
  ON public.personal_trainers FOR SELECT
  USING (status = 'approved');

CREATE POLICY "PTs can view and update own profile"
  ON public.personal_trainers FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can register as PT"
  ON public.personal_trainers FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- pt_offerings
CREATE POLICY "Public can view active offerings of approved PTs"
  ON public.pt_offerings FOR SELECT
  USING (
    is_active = true AND is_draft = false AND
    EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND status = 'approved')
  );

CREATE POLICY "PTs manage own offerings"
  ON public.pt_offerings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

-- pt_availability + pt_blocked_dates (public read, PT write)
CREATE POLICY "Public can view PT availability"
  ON public.pt_availability FOR SELECT USING (true);

CREATE POLICY "PTs manage own availability"
  ON public.pt_availability FOR ALL
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

CREATE POLICY "Public can view PT blocked dates"
  ON public.pt_blocked_dates FOR SELECT USING (true);

CREATE POLICY "PTs manage own blocked dates"
  ON public.pt_blocked_dates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

-- pt_venue_links (public read)
CREATE POLICY "Public can view PT venue links"
  ON public.pt_venue_links FOR SELECT USING (true);

CREATE POLICY "PTs manage own venue links"
  ON public.pt_venue_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

-- pt_bookings
CREATE POLICY "Users see own PT bookings"
  ON public.pt_bookings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "PTs see bookings for their sessions"
  ON public.pt_bookings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

CREATE POLICY "Users can create PT bookings"
  ON public.pt_bookings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "PTs can update booking status"
  ON public.pt_bookings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.personal_trainers WHERE id = pt_id AND user_id = auth.uid()));

-- pt_reviews
CREATE POLICY "Public can view PT reviews"
  ON public.pt_reviews FOR SELECT USING (true);

CREATE POLICY "Users can leave one review per completed booking"
  ON public.pt_reviews FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.pt_bookings
      WHERE id = booking_id AND user_id = auth.uid() AND status = 'completed'
    )
  );

-- ── 11. Computed avg_rating view (used by admin + mobile) ────────────────────
CREATE OR REPLACE VIEW public.pt_profiles_public AS
SELECT
  pt.*,
  ROUND(AVG(r.rating)::NUMERIC, 1)  AS avg_rating,
  COUNT(r.id)                        AS review_count,
  COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') AS sessions_completed
FROM public.personal_trainers pt
LEFT JOIN public.pt_reviews r  ON r.pt_id = pt.id
LEFT JOIN public.pt_bookings b ON b.pt_id = pt.id
WHERE pt.status = 'approved'
GROUP BY pt.id;
