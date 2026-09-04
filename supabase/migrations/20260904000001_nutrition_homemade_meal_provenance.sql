-- ACP Intelligence™ — Nutrition N6.5: Universal cooked-meal logging.
-- Beta Feedback #018.
--
-- A user must be able to log ANY cooked meal (fried rice, beef stew, curry,
-- pasta, homemade soups, rice + beans, casseroles, mixed homemade plates) —
-- without ACP pre-seeding every dish and without an LLM inventing nutrition
-- facts. This is achieved by REUSING what already exists, not by adding a new
-- food model:
--
--   • BUILD FROM INGREDIENTS  →  N6 `saved_meals` / `saved_meal_items`
--       (canonical-food components + confirmed portions; logging sums the
--        frozen per-component snapshots — deterministic, no model).
--   • QUICK ESTIMATE           →  N7.5 `foods` rows with
--       source_type = 'estimated' and composition_method =
--       'standard_recipe_estimated' (already searchable; the estimate is
--        disclosed, never promoted to a verified fact).
--   • MANUAL / TAKEAWAY NUMBERS →  an N1 `food_log_entries` row with
--       food_id = NULL, a user-entered nutrient snapshot, source_type =
--       'user_custom' and the new `user_provided_nutrition` flag below.
--
-- CANONICAL FOODS (`foods`, read-only, no client writes) stay completely
-- separate from USER MEALS (`saved_meals`, owner-only). This migration is
-- fully ADDITIVE: two nullable/defaulted columns, no table, no data rewrite,
-- no change to any existing row's meaning. It does NOT touch the N1 nutrient
-- maths, N2 history, or the `nutrition_day` view.

-- ── saved_meals.provenance — how this reusable definition was created ─────
-- Distinguishes the two homemade routes so "My beef stew" reads honestly in
-- My Meals and so downstream layers never treat an approximate meal as an
-- ingredient-summed one:
--
--   'user_recipe_from_components' — the user listed the ingredients; every
--        number is a deterministic sum of canonical food facts (this is the
--        only kind that exists today, so every existing row backfills here).
--   'user_meal_estimated'         — the user saved an approximate meal (a
--        standard-recipe estimate, or their own typed numbers). Disclosed as
--        an estimate everywhere it is shown.
ALTER TABLE public.saved_meals
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'user_recipe_from_components';

UPDATE public.saved_meals
  SET provenance = 'user_recipe_from_components'
  WHERE provenance IS NULL;

ALTER TABLE public.saved_meals
  DROP CONSTRAINT IF EXISTS saved_meals_provenance_check;
ALTER TABLE public.saved_meals
  ADD CONSTRAINT saved_meals_provenance_check
  CHECK (provenance IN ('user_recipe_from_components', 'user_meal_estimated'));

-- ── food_log_entries.user_provided_nutrition ─────────────────────────────
-- TRUE only for a row whose nutrient snapshot the USER typed in (a packaged
-- or takeaway item with a label, or a rough homemade estimate) — never for a
-- row backed by a canonical `foods` record. It is an explicit, queryable
-- provenance marker so N2–N9 and history can badge the row as "your numbers,
-- not a verified database" without inferring it from (food_id IS NULL AND
-- energy_kcal IS NOT NULL). A name-only custom entry (no snapshot at all)
-- keeps this FALSE and still contributes nothing to totals.
ALTER TABLE public.food_log_entries
  ADD COLUMN IF NOT EXISTS user_provided_nutrition boolean NOT NULL DEFAULT false;
