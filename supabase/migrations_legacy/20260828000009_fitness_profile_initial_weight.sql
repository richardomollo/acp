-- The "Your Weight" progress card on the Profile tab needs a fixed
-- reference point to measure progress against — starting_weight_kg is
-- edited every time the user updates their current weight (Personal
-- Details), so it can't also serve as "where you started". This column is
-- snapshotted once (the first time a current weight is saved) and never
-- overwritten afterwards.
ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS initial_weight_kg numeric;
