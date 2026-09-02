-- 5th onboarding goal: "Reduce stress — Improve my wellbeing".
ALTER TABLE public.fitness_profile DROP CONSTRAINT IF EXISTS fitness_profile_goal_check;
ALTER TABLE public.fitness_profile ADD CONSTRAINT fitness_profile_goal_check
  CHECK (goal IN (
    'lose_weight', 'build_muscle', 'improve_mobility', 'general_fitness',
    'maintain_weight', 'eat_healthier',
    'improve_running', 'improve_health', 'healthy_lifestyle',
    'body_recomposition', 'reduce_stress'
  ));
