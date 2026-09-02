-- The new "Update Progress" log-a-measurement screen needs a few body
-- composition fields client_measurements doesn't have yet (weight_kg,
-- waist_cm, chest_cm, hips_cm already exist from 20260727000005). Extending
-- the existing per-entry log table rather than adding a new one.
ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS body_fat_percentage numeric,
  ADD COLUMN IF NOT EXISTS muscle_mass_kg       numeric,
  ADD COLUMN IF NOT EXISTS visceral_fat         numeric,
  ADD COLUMN IF NOT EXISTS fat_mass_kg          numeric,
  ADD COLUMN IF NOT EXISTS body_water_l         numeric,
  ADD COLUMN IF NOT EXISTS neck_cm              numeric,
  ADD COLUMN IF NOT EXISTS leg_cm               numeric;
