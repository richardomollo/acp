-- ACP Intelligence™ — Nutrition: KFCT / FAO Kenyan Food Recipe schema (V1).
--
-- Schema-only. No data. Data import is a separate deterministic script
-- (scripts/import-kfct-recipes.ts) against data/kfct/*.csv — see that
-- script's header for why (reproducibility; no 3,834-row hand-written SQL).
--
-- AUDIT FINDING this migration acts on: `public.foods` already carries
-- everything a verified KFCT recipe needs — composition_method /
-- recipe_source / recipe_reference (20260903000003), source / source_type /
-- country_code / is_active (20260901000001) — so NO change to `foods` is
-- needed here. What's genuinely missing is a place to keep the RECIPE
-- itself (ingredients, quantities, preparation) — `meals.ingredients` is an
-- unstructured text[] with no gram quantities and is the legacy curated
-- library this task must not touch (§26); no food_recipes-shaped table
-- exists anywhere in the schema (grep confirmed). This migration adds
-- exactly that, additively:
--
--   food_recipes             — one row per source recipe (metadata + provenance)
--   food_recipe_ingredients  — its ingredient lines (grams authoritative)
--
-- Deliberate design choices (see the KFCT V1 report for the full reasoning):
--   • food_recipes.food_id is NULLABLE. A recipe whose nutrient composition
--     the source could not establish (2 of 142 — missing yield factors /
--     missing ingredient composition) gets a food_recipes row for
--     auditability but NO `foods` row — it must never be searchable,
--     loggable, or contribute a zero nutrient. `nutrient_status` records why.
--   • food_recipe_ingredients.canonical_food_id is NULLABLE and is NOT
--     populated by the V1 import. The recipe's authoritative nutrient
--     truth is the source's own per-100g composition on `foods`
--     (composition_method = 'standard_recipe_verified'), never a re-sum of
--     these ingredient rows — resolving every ingredient name to a Lana
--     canonical food is a separate, later improvement, not a blocker here.
--   • Both tables are read-only to normal users (public catalogue data —
--     same trust tier as `foods`/`food_servings`), matching the existing
--     "canonical facts, admin/import-only writes" RLS pattern exactly.

CREATE TABLE IF NOT EXISTS public.food_recipes (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL only for a recipe with no usable nutrient composition (§ above).
  -- ON DELETE RESTRICT: a recipe's identity must never silently disappear
  -- out from under its provenance record by an unrelated foods deletion.
  food_id                uuid        REFERENCES public.foods(id) ON DELETE RESTRICT,

  name                   text        NOT NULL,
  category               text,

  source                 text        NOT NULL,
  source_reference       text        NOT NULL,   -- KFCT code, e.g. 'kfct:15053'
  source_url             text,

  serves                 integer     CHECK (serves IS NULL OR serves > 0),
  preparation_time_text  text,
  cooking_time_text      text,
  instructions           text,

  -- Whether/why this recipe has (or lacks) a `foods` composition:
  --   'available'                            — food_id is set, fully usable
  --   'unavailable_missing_yield_factors'
  --   'unavailable_missing_ingredient_composition'
  -- Mirrors the two documented reasons in the KFCT source verbatim rather
  -- than a generic "unavailable" — keeps the audit trail legible.
  nutrient_status        text        NOT NULL DEFAULT 'available' CHECK (nutrient_status IN (
                            'available',
                            'unavailable_missing_yield_factors',
                            'unavailable_missing_ingredient_composition'
                          )),
  nutrient_note          text,

  version                integer     NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- The idempotent upsert key the import script targets (mirrors the role
  -- `meals.recipe_reference` already plays — 20260918000001).
  UNIQUE (source, source_reference),
  -- A composition-bearing recipe must have exactly one food_id and never
  -- claim 'available' without one (and vice versa) — data-level guarantee,
  -- not just import-script discipline.
  CHECK ((nutrient_status = 'available') = (food_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS food_recipes_food_idx ON public.food_recipes (food_id);

ALTER TABLE public.food_recipes ENABLE ROW LEVEL SECURITY;

-- Same trust tier as `foods` (N1 §30): readable by any signed-in user,
-- no client write path.
CREATE POLICY "Food recipes are readable by authenticated users"
  ON public.food_recipes FOR SELECT TO authenticated USING (true);

CREATE TRIGGER food_recipes_updated_at
  BEFORE UPDATE ON public.food_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── food_recipe_ingredients ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.food_recipe_ingredients (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id          uuid    NOT NULL REFERENCES public.food_recipes(id) ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 0,

  ingredient_name    text    NOT NULL,
  -- The authoritative measured quantity (§13 — never the calculation
  -- source for `foods` nutrients; display/transparency/future-substitution
  -- only, per this migration's header).
  grams              numeric NOT NULL CHECK (grams > 0),
  -- Source-stated approximate household measure — DISPLAY ONLY.
  household_measure  text,

  -- Deliberately NOT resolved in V1 (see header). Nullable so a future pass
  -- can backfill matches without a schema change.
  canonical_food_id  uuid    REFERENCES public.foods(id) ON DELETE SET NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (recipe_id, sort_order)
);

CREATE INDEX IF NOT EXISTS food_recipe_ingredients_recipe_idx ON public.food_recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS food_recipe_ingredients_canonical_food_idx ON public.food_recipe_ingredients (canonical_food_id) WHERE canonical_food_id IS NOT NULL;

ALTER TABLE public.food_recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Food recipe ingredients are readable by authenticated users"
  ON public.food_recipe_ingredients FOR SELECT TO authenticated USING (true);
