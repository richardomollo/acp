-- Recompute subscription plan credits from the admin-configured credit_unit_value.
-- Formula: credits = ROUND(plan.price / credit_unit_value)
-- This replaces the manually seeded values (4, 8, 14) with correct amounts.

UPDATE public.subscription_plans
SET credits = ROUND(
  price / (SELECT value::numeric FROM public.app_settings WHERE key = 'credit_unit_value')
)
WHERE tier != 'free_trial'
  AND price > 0;
