-- Fitness and nutrition goals go hand in hand — merge nutrition_profile into
-- fitness_profile as a single shared user profile instead of two separate
-- goal-setting screens/tables that could drift out of sync. The goal enum is
-- widened to the union of both feature's original options (improve_fitness
-- from the nutrition side is folded into the pre-existing general_fitness,
-- since they were the same concept under different names).

ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS cuisine_preference text CHECK (cuisine_preference IN ('kenyan', 'mixed', 'vegetarian')),
  ADD COLUMN IF NOT EXISTS starting_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS goal_weight_kg numeric;

ALTER TABLE public.fitness_profile DROP CONSTRAINT IF EXISTS fitness_profile_goal_check;
ALTER TABLE public.fitness_profile ADD CONSTRAINT fitness_profile_goal_check
  CHECK (goal IN ('lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness', 'maintain_weight', 'eat_healthier'));

-- Carry forward any real nutrition_profile data (goal, cuisine, weights) into
-- fitness_profile before dropping the now-redundant table. Handles both
-- "user already has a fitness_profile row" (update) and "nutrition-only"
-- users (insert) via upsert.
INSERT INTO public.fitness_profile (user_id, goal, cuisine_preference, starting_weight_kg, goal_weight_kg)
SELECT
  np.user_id,
  CASE WHEN np.goal = 'improve_fitness' THEN 'general_fitness' ELSE np.goal END,
  np.cuisine_preference,
  np.starting_weight_kg,
  np.goal_weight_kg
FROM public.nutrition_profile np
ON CONFLICT (user_id) DO UPDATE SET
  goal               = COALESCE(public.fitness_profile.goal, EXCLUDED.goal),
  cuisine_preference = COALESCE(public.fitness_profile.cuisine_preference, EXCLUDED.cuisine_preference),
  starting_weight_kg = COALESCE(public.fitness_profile.starting_weight_kg, EXCLUDED.starting_weight_kg),
  goal_weight_kg     = COALESCE(public.fitness_profile.goal_weight_kg, EXCLUDED.goal_weight_kg);

DROP TABLE IF EXISTS public.nutrition_profile;
