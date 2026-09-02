-- ACP Intelligence™ Day 9 — closed-loop execution intelligence.
--
-- Adds a canonical per-(plan, activity) EXECUTION record, parallel and
-- additive to plan_activity_completions. Rationale (same principle as Day 4's
-- decision to keep plan_activity_completions separate from the assessment
-- jsonb): plan_activity_completions represents binary "the user did this",
-- and every existing adherence read across web + mobile counts its rows.
-- Putting a 'skipped' row in that table would silently inflate every one of
-- those reads. So execution status / difficulty feedback / skip context live
-- here instead — a completely additive evidence layer. A user with no Day 9
-- feedback simply has no rows here, and every existing completion read keeps
-- working unchanged.
--
-- Identity is (user_id, plan_id, activity_index) — the same key as
-- plan_activity_completions — so this is an idempotent upsert target: a
-- repeated feedback tap updates the same row, never appends.

CREATE TABLE IF NOT EXISTS public.plan_activity_execution (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                text        NOT NULL,  -- = fitness_profile.ai_assessment_generated_at, same as plan_activity_completions
  activity_index         integer     NOT NULL CHECK (activity_index >= 0),

  -- Canonical execution status (Day 9 section 4). 'substituted' is
  -- deliberately NOT included — the architecture cannot reliably identify a
  -- replacement activity, and section 4 forbids inventing that inference.
  execution_status       text        NOT NULL DEFAULT 'planned'
    CHECK (execution_status IN ('planned', 'completed', 'partial', 'skipped')),

  -- Optional lightweight post-activity difficulty feedback (section 8). NULL
  -- = the user did not answer = unknown (section 9/54) — never treated as
  -- 'about_right'.
  difficulty             text        CHECK (difficulty IN ('too_easy', 'about_right', 'too_hard')),

  -- Optional context for a skipped/non-completed activity (section 11). NULL
  -- = no reason given = unknown (section 13). No medical categories.
  skip_reason            text        CHECK (skip_reason IN (
                             'no_time', 'low_energy', 'too_difficult',
                             'schedule_changed', 'equipment_unavailable',
                             'not_in_mood', 'other'
                           )),

  -- Actual minutes performed, ONLY when reliably known (section 20): user
  -- input, or a structured workout/Strava/HealthKit duration. A class
  -- check-in never populates this.
  actual_duration_minutes integer    CHECK (actual_duration_minutes IS NULL OR actual_duration_minutes >= 0),

  -- Where this execution record's richest signal came from. Reuses the
  -- plan_activity_completions source vocabulary plus 'workout' for a linked
  -- guided workout_history session.
  source                 text        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'workout', 'strava', 'healthkit', 'acp_session', 'acp_experience')),

  -- Historical skip context is retained even after a later completion
  -- (section 48) — the CURRENT execution_status reflects the completion, but
  -- "this was skipped once, for reason X" stays queryable as event metadata.
  first_skipped_at       timestamptz,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, plan_id, activity_index)
);

CREATE INDEX IF NOT EXISTS plan_activity_execution_user_plan_idx
  ON public.plan_activity_execution (user_id, plan_id);

ALTER TABLE public.plan_activity_execution ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs — UPDATE is required (unlike
-- plan_activity_completions) because feedback is an idempotent upsert the
-- user can also revise (section 46).
CREATE POLICY "Users view own plan execution"
  ON public.plan_activity_execution FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users insert own plan execution"
  ON public.plan_activity_execution FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own plan execution"
  ON public.plan_activity_execution FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own plan execution"
  ON public.plan_activity_execution FOR DELETE
  USING (user_id = auth.uid());

-- ── coaching_memory: allow the Day 9 execution pattern type ─────────────────
-- Section 31 — do NOT create a parallel memory system. Repeated execution
-- patterns reuse the existing (user_id, memory_type, subject) row, its
-- active/inactive lifecycle, its confidence thresholds and its SELECT RLS.
-- subject carries the dimension: 'difficulty_fit' | 'time_fit' |
-- 'execution_barrier' | an ActivityCategory.
ALTER TABLE public.coaching_memory DROP CONSTRAINT IF EXISTS coaching_memory_memory_type_check;
ALTER TABLE public.coaching_memory ADD CONSTRAINT coaching_memory_memory_type_check
  CHECK (memory_type IN (
    'overall_summary',
    'category_success', 'category_difficulty',
    'day_success', 'day_difficulty',
    'duration_success', 'duration_difficulty',
    'nutrition_focus_persistence', 'support_opportunity_persistence',
    'outcome_progress',
    'execution_pattern'
  ));
