-- ACP Intelligence™ — Nutrition Catalogue V1 · Production Deployment Package.
--
-- `meals` has no natural unique identity today: `id` is a random uuid and
-- nothing else is constrained (20260729000006_nutrition_hub_schema.sql).
-- The Catalogue V1 deployment package needs a STABLE identity to upsert
-- against so re-running the release is idempotent (never duplicates, never
-- depends on insert order) — the same role `recipe_reference`
-- (20260916000001_meal_catalogue_provenance.sql) already plays for a single
-- authored recipe.
--
-- Standard SQL UNIQUE semantics make this safe for the existing catalogue:
-- a UNIQUE constraint allows any number of NULLs (only non-NULL values must
-- be distinct from each other), so all pre-existing Kenyan meals — which
-- have `recipe_reference IS NULL` and always will unless separately
-- approved — are completely unaffected. Only the 120 new international
-- catalogue rows, each carrying its own globally-unique
-- 'acp-recipe:batchN-...-v1' reference, are ever governed by this
-- constraint. Fully additive: no existing row is touched, no data changes.

ALTER TABLE public.meals
  ADD CONSTRAINT meals_recipe_reference_unique UNIQUE (recipe_reference);
