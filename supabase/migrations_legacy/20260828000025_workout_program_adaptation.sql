-- ACP Intelligence™ Day 5 — weekly check-in + deterministic adaptation.
-- Named to match the existing workout_program_* family (workout_programs,
-- workout_program_weeks) rather than the spec's bare "weekly_checkins" /
-- "program_adaptations", to stay consistent with this codebase's own
-- convention and avoid any ambiguity with the unrelated daily_checkins
-- (mood log) and the older category-level weekly-adaptation system in
-- apps/web/app/api/ai/weekly-adaptation (which operates on fitness_plans/
-- StartingPlanActivity, not this real-exercise workout_programs model).

-- ── workout_program_checkins ─────────────────────────────────────────────────
CREATE TABLE public.workout_program_checkins (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id            uuid        NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  week_number           integer     NOT NULL CHECK (week_number > 0),
  difficulty            text        NOT NULL CHECK (difficulty IN ('easy', 'about_right', 'too_difficult')),
  energy                text        NOT NULL CHECK (energy IN ('low', 'normal', 'high')),
  pain_reported         boolean     NOT NULL DEFAULT false,
  schedule_changed      boolean     NOT NULL DEFAULT false,
  availability_context  jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_id, week_number)
);

ALTER TABLE public.workout_program_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own checkins"
  ON public.workout_program_checkins FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users create own checkins"
  ON public.workout_program_checkins FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own checkins"
  ON public.workout_program_checkins FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── workout_program_adaptations ──────────────────────────────────────────────
-- One row per weekly evaluation (not per decision) — decision_types is an
-- array since the engine may return more than one (in practice almost always
-- exactly one, per the over-adaptation guard in lib/adaptation-engine.ts).
CREATE TABLE public.workout_program_adaptations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id      uuid        NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  week_number     integer     NOT NULL CHECK (week_number > 0), -- the week the check-in/evaluation was FOR; mutation applies to week_number+1 onward
  decision_types  text[]      NOT NULL,
  reason          text        NOT NULL,
  signals_used    jsonb       NOT NULL,
  before_state    jsonb       NOT NULL,
  after_state     jsonb,      -- null until/unless actually applied
  applied         boolean     NOT NULL DEFAULT false, -- false for TRAINER_CREATED/TRAINER_MODIFIED (recommendation-only) or when the decision itself is KEEP/INSUFFICIENT_EVIDENCE
  source          text        NOT NULL, -- programme source at time of evaluation, so history stays interpretable even if ownership changes later
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_id, week_number)
);

ALTER TABLE public.workout_program_adaptations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own adaptation history"
  ON public.workout_program_adaptations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users create own adaptation history"
  ON public.workout_program_adaptations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX workout_program_adaptations_program_idx ON public.workout_program_adaptations (program_id, week_number DESC);
