-- ACP Intelligence™ Day 2 — personalised programme generation.
--
-- Naming note: "programme"/"program" already means a commercial gym/PT
-- membership package elsewhere in this schema (gym_programmes, pt_programmes,
-- instalment billing) — completely unrelated to workout planning. To avoid
-- colliding with that vocabulary (and with the existing `fitness_plans`
-- table, which is the AI-assessment JSON snapshot history, not a structured
-- workout plan), the new tables are named `workout_programs` /
-- `workout_program_weeks`, and `workouts` (already the per-session model,
-- already user-ownable — see 20260724000001_user_workouts.sql) is extended
-- rather than duplicated.

-- ── workout_programs ─────────────────────────────────────────────────────────
CREATE TABLE public.workout_programs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source                    text        NOT NULL CHECK (source IN ('ACP_GENERATED', 'TRAINER_CREATED', 'TRAINER_MODIFIED')),
  status                    text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  goal                      text        NOT NULL,
  experience_level          text        NOT NULL CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  sessions_per_week         integer     NOT NULL CHECK (sessions_per_week BETWEEN 1 AND 7),
  session_duration_minutes  integer     NOT NULL CHECK (session_duration_minutes > 0),
  start_date                date        NOT NULL,
  duration_weeks            integer     NOT NULL DEFAULT 8 CHECK (duration_weeks > 0),
  generation_context        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generation_version        text        NOT NULL DEFAULT 'v1',
  explanation               text,
  created_from_program_id   uuid        REFERENCES public.workout_programs(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- One active programme per user regardless of source — the idempotency
-- guard for generateProgramme/regenerateProgramme (Day 2 section 17):
-- regeneration must archive the old row before inserting a new one, it can
-- never coexist with it.
CREATE UNIQUE INDEX workout_programs_one_active_per_user
  ON public.workout_programs (user_id) WHERE status = 'active';

CREATE INDEX workout_programs_user_idx ON public.workout_programs (user_id);

ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own programmes"
  ON public.workout_programs FOR SELECT
  USING (user_id = auth.uid());

-- Trainer-protection readiness (Day 2 section 22): a client can only ever
-- insert/update their OWN ACP_GENERATED rows. TRAINER_CREATED/
-- TRAINER_MODIFIED rows do not exist yet (no trainer programme builder this
-- Day), but when they do, they'll be written by a service-role trainer route
-- — never by the client's own authenticated session — and these policies
-- guarantee the client can never touch them, not even their own trainer's.
CREATE POLICY "Users create own ACP-generated programmes"
  ON public.workout_programs FOR INSERT
  WITH CHECK (user_id = auth.uid() AND source = 'ACP_GENERATED');

CREATE POLICY "Users update own ACP-generated programmes"
  ON public.workout_programs FOR UPDATE
  USING (user_id = auth.uid() AND source = 'ACP_GENERATED')
  WITH CHECK (user_id = auth.uid() AND source = 'ACP_GENERATED');

-- ── workout_program_weeks ────────────────────────────────────────────────────
CREATE TABLE public.workout_program_weeks (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid    NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number > 0),
  UNIQUE (program_id, week_number)
);

ALTER TABLE public.workout_program_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own programme weeks"
  ON public.workout_program_weeks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workout_programs p WHERE p.id = program_id AND p.user_id = auth.uid()));

CREATE POLICY "Users create own ACP-generated programme weeks"
  ON public.workout_program_weeks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_programs p
    WHERE p.id = program_id AND p.user_id = auth.uid() AND p.source = 'ACP_GENERATED'
  ));

CREATE POLICY "Users delete own ACP-generated programme weeks"
  ON public.workout_program_weeks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.workout_programs p
    WHERE p.id = program_id AND p.user_id = auth.uid() AND p.source = 'ACP_GENERATED'
  ));

-- ── workouts: extend for programme membership ────────────────────────────────
-- Nullable and additive only — every existing template/custom workout row
-- keeps program_week_id = NULL and behaves exactly as before. Existing RLS on
-- `workouts`/`workout_exercises` (20260724000001_user_workouts.sql) already
-- scopes everything by `user_id = auth.uid()`, which every programme-owned
-- workout will have set, so no RLS changes are needed here.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS program_week_id   uuid REFERENCES public.workout_program_weeks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS day_of_week       text CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  ADD COLUMN IF NOT EXISTS workout_type      text,
  ADD COLUMN IF NOT EXISTS sequence          integer,
  -- true = a non-catalogue activity block (e.g. "20 min walk + mobility") —
  -- described entirely by `workouts.description`, with zero linked
  -- workout_exercises rows. Avoids inventing fake catalogue exercises for
  -- activities MuscleWiki has no content for (Day 2 section 15).
  ADD COLUMN IF NOT EXISTS is_activity_block boolean NOT NULL DEFAULT false;

CREATE INDEX workouts_program_week_idx ON public.workouts (program_week_id) WHERE program_week_id IS NOT NULL;
