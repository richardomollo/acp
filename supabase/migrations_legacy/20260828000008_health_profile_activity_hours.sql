-- Personal Details page's new "Health & Fitness Profile" section (date of
-- birth, sex, height, weight — already on health_profile via the HealthKit
-- sync in services/health.ts; goal, target weight, target date — already on
-- fitness_profile via the onboarding journey) needs one new pair of fields
-- with no existing home: self-reported weekly working/exercise hours.
ALTER TABLE public.health_profile
  ADD COLUMN IF NOT EXISTS hours_working_per_week    numeric,
  ADD COLUMN IF NOT EXISTS hours_exercising_per_week numeric;
