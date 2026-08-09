-- Extend sessions table to support full-day experiences (retreats, hikes, multi-activity events)

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_experience      BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_time           TIME,
  ADD COLUMN IF NOT EXISTS meeting_point      TEXT,
  ADD COLUMN IF NOT EXISTS transport_info     TEXT,
  ADD COLUMN IF NOT EXISTS includes           TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS itinerary          JSONB     NOT NULL DEFAULT '[]';

-- Index so the home screen query (WHERE is_experience = true) is fast
CREATE INDEX IF NOT EXISTS sessions_is_experience_idx
  ON public.sessions (is_experience)
  WHERE is_experience = true;

COMMENT ON COLUMN public.sessions.is_experience   IS 'True for full-day/multi-activity experiences (retreats, hikes, etc.)';
COMMENT ON COLUMN public.sessions.end_time        IS 'Approximate end time for experiences that span several hours';
COMMENT ON COLUMN public.sessions.meeting_point   IS 'Departure / meeting point for the group (e.g. "Nairobi CBD, Shell station")';
COMMENT ON COLUMN public.sessions.transport_info  IS 'Free-text transport description (e.g. "26-seater bus, departure 6 AM")';
COMMENT ON COLUMN public.sessions.includes        IS 'Array of inclusions shown on the detail page (e.g. ["Return Transport","Snacks","Photography"])';
COMMENT ON COLUMN public.sessions.itinerary       IS 'Ordered schedule: [{"time":"5:30 AM","activity":"Meet-up","detail":"Introductions | Welcome"}]';
