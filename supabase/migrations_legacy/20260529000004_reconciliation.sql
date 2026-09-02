-- Venue reconciliation table: one row per venue × billing period

CREATE TABLE IF NOT EXISTS public.venue_reconciliations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                   UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  period_start             DATE NOT NULL,
  period_end               DATE NOT NULL,
  completed_sessions       INTEGER NOT NULL DEFAULT 0,
  no_show_sessions         INTEGER NOT NULL DEFAULT 0,
  total_session_revenue    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_deposits_collected NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_remainders_expected NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_remainders_reported NUMERIC(10,2) NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'approved', 'disputed')),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gym_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS venue_reconciliations_gym_id_idx ON public.venue_reconciliations(gym_id);
CREATE INDEX IF NOT EXISTS venue_reconciliations_period_idx ON public.venue_reconciliations(period_start, period_end);
