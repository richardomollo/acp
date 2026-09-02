-- Day 4: behavioural completion tracking for ACP Intelligence™'s canonical
-- weekly plan — deliberately a NEW, separate table rather than a field
-- inside fitness_profile.ai_assessment. The assessment jsonb represents
-- "what ACP suggested" (regenerated wholesale on every AI call); this table
-- represents "what the user actually did" and must survive/outlive any
-- single generated plan and never be overwritten by a future regeneration.
--
-- Plan identification: reuses fitness_profile.ai_assessment_generated_at
-- (already unique-per-generation, already immutable once set) as `plan_id`,
-- rather than introducing a dedicated plan-id column/table. This is
-- sufficient because a completion is only ever meaningful in the context of
-- the specific generated plan it was completed against — if the plan is
-- regenerated (new generated_at), old completions naturally stop matching
-- the new plan's (day, activity_index) pairs instead of silently attaching
-- to unrelated new activities.
CREATE TABLE IF NOT EXISTS public.plan_activity_completions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id           text NOT NULL,
  activity_index    integer NOT NULL CHECK (activity_index >= 0),
  planned_date      date NOT NULL,
  completed_at      timestamptz NOT NULL DEFAULT now(),
  completion_source text NOT NULL CHECK (completion_source IN ('manual', 'exercise_db', 'strava', 'acp_session', 'acp_experience')),
  -- External record this completion was confirmed from (Strava activities.id,
  -- workout_history.id, bookings.id, experience_bookings.id) — null for manual.
  source_entity_id  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id, activity_index)
);

-- One external activity must not complete more than one plan activity
-- (e.g. a single 30-minute run can't count toward three separate cardio
-- sessions) — enforced at the DB level, not just in application logic.
-- Partial index since source_entity_id is meaningless for manual completions.
CREATE UNIQUE INDEX IF NOT EXISTS plan_activity_completions_source_entity_unique
  ON public.plan_activity_completions (user_id, completion_source, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plan_activity_completions_user_plan_idx
  ON public.plan_activity_completions (user_id, plan_id);

ALTER TABLE public.plan_activity_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plan completions"
  ON public.plan_activity_completions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own plan completions"
  ON public.plan_activity_completions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Undo removes the record entirely (no separate "undo" state/history) —
-- the simplest model consistent with "do not add complex edit-history
-- infrastructure." No UPDATE policy: a completion is either present or not.
CREATE POLICY "Users delete own plan completions"
  ON public.plan_activity_completions FOR DELETE
  USING (user_id = auth.uid());
