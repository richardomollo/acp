-- ACP Intelligence™ Day 7.2 — Structured International Nutrition Expansion.
--
-- Fully additive. Does NOT touch meal_plans/meal_plan_items/meal_logs, does
-- NOT change any existing meals row's macros, does NOT drop or rename the
-- legacy fitness_profile.cuisine_preference column (the live vegetarian
-- hard-filter in apps/mobile/lib/nutrition-matching.ts reads that exact
-- column today and must keep working unchanged).
--
-- This is a STRUCTURED data expansion, deliberately separate from Day 7.1's
-- knowledge_documents/knowledge_chunks (RAG is for nutrition PRINCIPLES;
-- this is for nutrition FACTS — see that migration's own header for the
-- boundary this preserves).

-- ── meals: provenance + serving description (all nullable — no existing row loses anything) ──
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS serving_description text;

-- Every one of the 92 existing rows is 'Kenyan' today (verified live) —
-- backfilled to the new canonical lowercase taxonomy value before the CHECK
-- constraint below is added, so no existing row is ever invalidated.
UPDATE public.meals SET cuisine = 'kenyan' WHERE lower(cuisine) = 'kenyan';

-- Canonical cuisine taxonomy (section 5/6) — machine-safe snake_case values;
-- human-readable labels live in the app layer, never duplicated in SQL.
ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_cuisine_check;
ALTER TABLE public.meals ADD CONSTRAINT meals_cuisine_check
  CHECK (cuisine IN (
    'kenyan', 'east_african', 'mediterranean', 'south_asian', 'indian',
    'middle_eastern', 'east_asian', 'western', 'european', 'global'
  ));
-- 'mixed' is deliberately NOT in this list (section 5) — it is a USER
-- PREFERENCE meaning "do not narrowly restrict by cuisine", never the
-- actual cuisine of a real meal.

CREATE INDEX IF NOT EXISTS meals_cuisine_idx ON public.meals (cuisine);

-- ── fitness_profile: multi-cuisine preference (new, additive) ──────────────
-- The legacy singular `cuisine_preference` column (kenyan/mixed/vegetarian)
-- is untouched — it still drives the existing vegetarian hard-filter as-is.
-- `cuisine_preferences` (plural, array) is the new field the Day 7.2 cuisine
-- matcher reads, mirroring the existing `goals text[]` multi-select
-- precedent already on this same table.
ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS cuisine_preferences text[] NOT NULL DEFAULT '{}';

-- Backfill from the legacy column so existing preference data isn't lost:
--   'kenyan'     -> {'kenyan'}
--   'mixed'      -> {'mixed'}          (a real, meaningful preference value)
--   'vegetarian' -> {}                 (this was always a dietary-restriction
--                                        value, not real cuisine data — the
--                                        vegetarian hard-filter keeps reading
--                                        the legacy column directly, so no
--                                        behaviour is lost by not carrying
--                                        this into the new cuisine-only field)
--   null         -> {}
UPDATE public.fitness_profile
SET cuisine_preferences = CASE
  WHEN cuisine_preference IN ('kenyan', 'mixed') THEN ARRAY[cuisine_preference]
  ELSE '{}'::text[]
END
WHERE cuisine_preferences = '{}';
