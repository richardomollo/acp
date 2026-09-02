-- Day 5 — plan history. fitness_profile.ai_assessment/ai_assessment_generated_at
-- remain the single "current plan" mirror every existing read site (Home, My
-- Plan, onboarding/plan.tsx) already queries — untouched, no read-site
-- migration needed. This table is purely an append-only log alongside it, so
-- ACP can answer "what did we recommend last week" without disturbing any
-- existing current-plan read path.
--
-- UNIQUE (user_id, week_start_date) is the idempotency guard for weekly
-- adaptation generation (Day 5 Part 42): a second request for the same
-- target week hits this constraint instead of creating a duplicate plan.
CREATE TABLE IF NOT EXISTS public.fitness_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id          text        NOT NULL,  -- = this plan's ai_assessment_generated_at value
  based_on_plan_id text,                  -- previous plan_id this was adapted from; null for the first-ever plan
  week_start_date  date        NOT NULL,
  week_end_date    date        NOT NULL,
  assessment       jsonb       NOT NULL,  -- full snapshot at time of generation
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date),
  UNIQUE (user_id, plan_id)
);

ALTER TABLE public.fitness_plans ENABLE ROW LEVEL SECURITY;

-- Read-only for the owning user — writes only ever happen server-side via
-- the service-role client in the onboarding-assessment/weekly-adaptation
-- routes, mirroring how fitness_profile.ai_assessment itself is never
-- written directly by the client either.
CREATE POLICY "Users view own fitness plans"
  ON public.fitness_plans FOR SELECT
  USING (user_id = auth.uid());

CREATE INDEX fitness_plans_user_week_idx ON public.fitness_plans (user_id, week_start_date DESC);
