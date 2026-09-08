-- ACP Intelligence™ — Nutrition Catalogue Infrastructure V1.
--
-- Adds the same additive provenance columns to `meals` that N7.5B already
-- added to `foods` (20260903000003_nutrition_dish_provenance.sql), so a
-- Lana-authored recipe composed from FDC-grounded canonical foods can carry
-- truthful, structured provenance instead of the always-null source/
-- source_type/serving_description columns Day 7.2 added but never populated
-- (20260829000002_international_nutrition_expansion.sql).
--
-- Distinction preserved (mirrors N7.5B §2): USDA FoodData Central proving
-- what an INGREDIENT contains is not the same as USDA verifying a whole
-- composed DISH. A Lana-authored recipe assembled from FDC-grounded
-- ingredients must never claim FoodData Central directly verified the
-- complete dish — it is `acp_curated` (meals.source_type) with
-- `composition_method` describing how the recipe itself was established.
--
-- Fully additive and backwards compatible: all three columns are nullable,
-- no existing row's data changes, and the CHECK constraint mirrors the one
-- already governing `foods.composition_method` verbatim (same four values,
-- same domain model). All 92 existing Kenyan meals continue to work
-- unchanged — composition_method stays NULL for them ("not yet classified",
-- never miscoded as a false claim of any kind).

ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS composition_method text
    CHECK (composition_method IS NULL OR composition_method IN (
      'direct_verified', 'standard_recipe_verified', 'standard_recipe_estimated', 'proxy_composition'
    )),
  ADD COLUMN IF NOT EXISTS recipe_source text,      -- human-readable recipe provenance (short)
  ADD COLUMN IF NOT EXISTS recipe_reference text;   -- stable reference (derivation slug or citation)
