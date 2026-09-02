-- Day 6 — ACP Intelligence™ longitudinal coaching memory. Structured,
-- evidence-backed, replaceable facts about what has consistently worked or
-- been difficult for a user across several completed weeks — NOT chat/vector
-- memory. Computed deterministically server-side (weekly-adaptation route)
-- from fitness_plans + plan_activity_completions; never invented by the AI.
--
-- Identity is (user_id, memory_type, subject) — a repeated weekly review
-- updates the SAME logical memory (upsert), never appends a duplicate row.
-- A memory is "replaceable, not permanent truth" (Day 6 Part 18): each run
-- recomputes the whole window and either refreshes or deactivates a row.
CREATE TABLE IF NOT EXISTS public.coaching_memory (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type       text        NOT NULL CHECK (memory_type IN (
                        'overall_summary',
                        'category_success', 'category_difficulty',
                        'day_success', 'day_difficulty',
                        'duration_success', 'duration_difficulty',
                        'nutrition_focus_persistence', 'support_opportunity_persistence'
                      )),
  subject           text        NOT NULL,  -- 'overall' | ActivityCategory | lowercase weekday | 'short'|'medium'|'long' | NutritionFocusType | SupportType
  confidence        text        NOT NULL CHECK (confidence IN ('emerging', 'moderate', 'strong')),
  evidence          jsonb       NOT NULL,  -- structured facts backing this memory — never store a claim without them (Part 21)
  user_message      text,                  -- fixed, deterministic coaching-language template; evidence above remains the source of truth, never this string (Part 11)
  first_observed_at timestamptz NOT NULL,
  last_observed_at  timestamptz NOT NULL,
  active            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, memory_type, subject)
);

CREATE INDEX coaching_memory_user_active_idx ON public.coaching_memory (user_id, active);

ALTER TABLE public.coaching_memory ENABLE ROW LEVEL SECURITY;

-- Read-only for the owning user — writes only ever happen server-side via
-- the service-role client in the weekly-adaptation route, mirroring
-- fitness_plans (20260828000019). No client can write or spoof coaching
-- evidence for themselves or another user.
CREATE POLICY "Users view own coaching memory"
  ON public.coaching_memory FOR SELECT
  USING (user_id = auth.uid());
