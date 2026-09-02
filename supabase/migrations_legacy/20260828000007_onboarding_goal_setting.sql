-- Goal-setting onboarding journey — extends the existing fitness_profile
-- table (created in 20260723000003_fitness_hub_schema.sql, already the
-- per-user home for goal/experience_level/preferred_location/weights) rather
-- than introducing a parallel profile table. `goal` (singular) continues to
-- serve as the primary-goal field consumed by create-workout.tsx's
-- goalToCategory()/toWorkoutGoal() (which already falls back safely to
-- 'general_fitness' for any goal value it doesn't recognize) and by
-- fitness-goals.tsx's settings screen — so the three new goal values below
-- are additive, not a replacement of the existing six.
ALTER TABLE public.fitness_profile DROP CONSTRAINT IF EXISTS fitness_profile_goal_check;
ALTER TABLE public.fitness_profile ADD CONSTRAINT fitness_profile_goal_check
  CHECK (goal IN (
    'lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness',
    'maintain_weight', 'eat_healthier',
    'improve_running', 'improve_health', 'healthy_lifestyle'
  ));

ALTER TABLE public.fitness_profile
  -- Shared target date for goals that need one (weight loss, running).
  ADD COLUMN IF NOT EXISTS goal_target_date date,
  -- Per-goal structured extras that don't warrant their own column (5K
  -- times, strength target, health/lifestyle focus, derived support style).
  -- starting_weight_kg/goal_weight_kg (already on this table) are reused
  -- directly for the weight-loss goal instead of duplicating them in here.
  ADD COLUMN IF NOT EXISTS goal_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- "Where are you starting from" — distinct from experience_level (which
  -- is strength-training-specific: beginner/intermediate/advanced).
  ADD COLUMN IF NOT EXISTS activity_level text
    CHECK (activity_level IN ('inactive', 'occasional', 'active_2_3', 'active_4_plus', 'serious')),
  ADD COLUMN IF NOT EXISTS barriers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_activities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
