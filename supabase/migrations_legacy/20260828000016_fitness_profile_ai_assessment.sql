-- AI onboarding assessment (V1) — a single jsonb snapshot of the most recent
-- AI interpretation of the user's onboarding answers (headline/summary/
-- starting_point/recommendation/weekly_plan/next_steps — shape owned by
-- apps/web/app/api/ai/onboarding-assessment/route.ts), plus when it was
-- generated. Written by that service-role route after a successful
-- completeOnboarding() write; no new table, no changes to existing
-- onboarding columns. fitness_profile's existing "Users update own fitness
-- profile" RLS policy is row-level, so it already covers these two columns
-- with no changes needed here.
ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS ai_assessment jsonb,
  ADD COLUMN IF NOT EXISTS ai_assessment_generated_at timestamptz;
