-- 4th onboarding goal: "Build muscle — Burn fat, build muscle mass" (body
-- recomposition) is distinct from the existing 'build_muscle' value (which
-- the onboarding UI displays as "Gain weight" — pure bulk), so it needs its
-- own value rather than reusing that one.
ALTER TABLE public.fitness_profile DROP CONSTRAINT IF EXISTS fitness_profile_goal_check;
ALTER TABLE public.fitness_profile ADD CONSTRAINT fitness_profile_goal_check
  CHECK (goal IN (
    'lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness',
    'maintain_weight', 'eat_healthier',
    'improve_running', 'improve_health', 'healthy_lifestyle',
    'body_recomposition'
  ));
