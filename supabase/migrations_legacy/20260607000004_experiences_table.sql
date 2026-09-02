-- Revert: remove experience columns added to sessions in 20260607000003
ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS is_experience,
  DROP COLUMN IF EXISTS end_time,
  DROP COLUMN IF EXISTS meeting_point,
  DROP COLUMN IF EXISTS transport_info,
  DROP COLUMN IF EXISTS includes,
  DROP COLUMN IF EXISTS itinerary;

DROP INDEX IF EXISTS sessions_is_experience_idx;

-- ── Experiences ───────────────────────────────────────────────────────────────
-- Standalone table for full-day / multi-activity events (retreats, hikes, etc.)

CREATE TABLE IF NOT EXISTS public.experiences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           UUID        REFERENCES public.gyms(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  tagline          TEXT,
  description      TEXT,
  date             DATE        NOT NULL,
  start_time       TIME        NOT NULL,
  end_time         TIME,
  meeting_point    TEXT,
  transport_info   TEXT,
  price_kes        NUMERIC     NOT NULL DEFAULT 0,
  max_capacity     INTEGER     NOT NULL DEFAULT 20,
  spots_left       INTEGER     NOT NULL DEFAULT 20,
  includes         TEXT[]      NOT NULL DEFAULT '{}',
  itinerary        JSONB       NOT NULL DEFAULT '[]',
  image_url        TEXT,
  category         TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partners can only read/write their own gym's experiences
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners manage own experiences"
  ON public.experiences
  FOR ALL
  USING (
    gym_id IN (
      SELECT id FROM public.gyms WHERE contact_email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Experiences are publicly readable"
  ON public.experiences
  FOR SELECT
  USING (is_active = true);

-- Fast lookup for the home screen upcoming section
CREATE INDEX IF NOT EXISTS experiences_date_active_idx
  ON public.experiences (date, is_active)
  WHERE is_active = true;

COMMENT ON TABLE  public.experiences                IS 'Full-day / multi-activity events (retreats, hikes, wellness days)';
COMMENT ON COLUMN public.experiences.tagline        IS 'Short strapline shown on cards, e.g. "The Journey Inward"';
COMMENT ON COLUMN public.experiences.meeting_point  IS 'Departure / meeting point, e.g. "Shell CBD, Kenyatta Ave"';
COMMENT ON COLUMN public.experiences.transport_info IS 'Free-text transport note, e.g. "26-seater bus, comfortable & safe"';
COMMENT ON COLUMN public.experiences.includes       IS 'Array of inclusions shown as chips on the detail page';
COMMENT ON COLUMN public.experiences.itinerary      IS 'Ordered schedule: [{"time":"5:30 AM","activity":"Meet-up","detail":"Introductions | Welcome"}]';
