-- Lana Nutrition Planning — Close the Intelligence Loop.
--
-- ONE additive column. nutrition_weekly_plans.objective currently stores
-- only the user-facing sentence ("Build consistent protein intake."), which
-- is not machine-comparable — prepareNextWeek needs to know WHICH theme a
-- week was actually working on (lib/nutrition/monthly-nutrition-
-- strategy.ts's WeekObjectiveTheme) to decide whether to carry that same
-- focus into next week or advance to the strategy's next theme (spec §10).
-- String-matching the sentence would be fragile; this makes the theme a
-- real, typed fact instead.
ALTER TABLE public.nutrition_weekly_plans
  ADD COLUMN IF NOT EXISTS objective_theme text
    CHECK (objective_theme IN ('protein_consistency', 'fibre_and_vegetables', 'training_day_nutrition', 'consolidate_what_worked'));

COMMENT ON COLUMN public.nutrition_weekly_plans.objective_theme IS
  'lib/nutrition/monthly-nutrition-strategy.ts''s WeekObjectiveTheme — the machine-comparable identity behind the human-readable `objective` sentence. Nullable only for defensiveness; every row written by the service always sets it.';
