-- Strava integration: OAuth connections + a unified "tracked activity" ledger,
-- kept separate from workout_history (strength-training) and health_workouts
-- (Apple HealthKit mirror) since these are discrete events from a different
-- source. Tokens are never exposed to the client — strava_connections and
-- strava_oauth_states have RLS enabled with zero policies for `authenticated`,
-- so only service-role edge functions can ever read/write them; the client
-- gets connection status via the strava-status edge function instead.

CREATE TABLE IF NOT EXISTS public.strava_connections (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  strava_athlete_id  bigint      NOT NULL UNIQUE,
  access_token       text        NOT NULL,
  refresh_token      text        NOT NULL,
  expires_at         timestamptz NOT NULL,
  scope              text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;
-- No policies for `authenticated`/`anon` — tokens are service-role-only, by design.

-- platform distinguishes which client initiated the connection, so the
-- callback knows how to redirect back: 'mobile'/'partners' get a custom-
-- scheme deep link (acitypass:// / partners://), 'web' gets a normal same-tab
-- redirect to return_to (e.g. /pt-dashboard/profile or /trainer-dashboard) —
-- Strava is used from the client app (apps/mobile) and the partner portal on
-- both web (apps/web trainer-dashboard/pt-dashboard) and app (apps/partners).
CREATE TABLE IF NOT EXISTS public.strava_oauth_states (
  state       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    text        NOT NULL DEFAULT 'mobile' CHECK (platform IN ('mobile', 'partners', 'web')),
  return_to   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies for `authenticated`/`anon` — single-use CSRF state, service-role-only.

CREATE TABLE IF NOT EXISTS public.activities (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source                text        NOT NULL CHECK (source IN ('strava', 'acp', 'partner')),
  external_id           text,
  activity_type         text        NOT NULL CHECK (activity_type IN ('run', 'walk', 'cycle', 'strength', 'mobility', 'class', 'other')),
  name                  text,
  start_time            timestamptz NOT NULL,
  duration_seconds      integer,
  moving_time_seconds   integer,
  distance_meters       numeric,
  avg_speed_mps         numeric,
  elevation_gain_meters numeric,
  calories              numeric,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS activities_user_id_idx ON public.activities (user_id);
CREATE INDEX IF NOT EXISTS activities_source_idx ON public.activities (source);
CREATE INDEX IF NOT EXISTS activities_external_id_idx ON public.activities (external_id);
CREATE INDEX IF NOT EXISTS activities_activity_type_idx ON public.activities (activity_type);
CREATE INDEX IF NOT EXISTS activities_start_time_idx ON public.activities (start_time);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own activities"
  ON public.activities FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own activities"
  ON public.activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own activities"
  ON public.activities FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own activities"
  ON public.activities FOR DELETE
  USING (user_id = auth.uid());

-- Minimal challenges: progress is computed live from `activities`/`workout_history`
-- at read time (no participants/leaderboard table for this MVP pass).
CREATE TABLE IF NOT EXISTS public.challenges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text        NOT NULL,
  description    text,
  metric         text        NOT NULL CHECK (metric IN ('distance_km', 'activity_count', 'days_active')),
  target_value   numeric     NOT NULL,
  activity_types text[]      NOT NULL DEFAULT '{run,walk}',
  period_start   date        NOT NULL,
  period_end     date        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active challenges"
  ON public.challenges FOR SELECT
  USING (is_active = true);

INSERT INTO public.challenges (title, description, metric, target_value, activity_types, period_start, period_end)
VALUES
  ('Nairobi 50K Challenge', 'Run or walk 50 km this month.', 'distance_km', 50,
   '{run,walk}', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date),
  ('10K Run Challenge', 'Complete a 10 km run.', 'distance_km', 10,
   '{run}', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date),
  ('Active 7', 'Complete an activity on 7 different days.', 'days_active', 7,
   '{run,walk,cycle}', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date);
