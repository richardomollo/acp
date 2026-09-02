-- Users can now select multiple goals (e.g. "Build Muscle" + "Eat Healthier")
-- instead of being forced to pick just one. `goal` (singular) is kept as a
-- derived "primary" value — the first selected goal — so existing readers
-- that only understand a single goal (the AI workout generator's category
-- picker, older display code) keep working unchanged; `goals` is the new
-- source of truth for anything that should show/edit the full set.
ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS goals text[] NOT NULL DEFAULT '{}';

UPDATE public.fitness_profile
SET goals = ARRAY[goal]
WHERE goal IS NOT NULL AND goals = '{}';
