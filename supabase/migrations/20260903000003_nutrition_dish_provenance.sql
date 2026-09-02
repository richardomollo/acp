-- ACP Intelligence™ — Nutrition N7.5B: structured dish provenance hardening.
--
-- N7.5 added Kenyan dishes. Their INGREDIENT nutrients are authoritative
-- (USDA FoodData Central), but for the "ACP standardized recipe" (Model B)
-- dishes the ingredient RATIOS, oil/water amounts, cooked YIELD and named
-- SERVING weights are ACP assumptions. Authoritative ingredient nutrients
-- are NOT an authoritative recipe (§2).
--
-- This migration makes that distinction EXPLICIT in structured data (not just
-- a code comment) via three additive, nullable columns on `foods`, and
-- backfills every existing row. It changes NO nutrient value and NO
-- arithmetic (§22) — only the honesty of the origin.
--
-- Research done for N7.5B: the authoritative recipe source for these dishes
-- is the **Kenya Food Composition Tables 2018 (FAO & Government of Kenya)** —
-- 522 foods + 142 mixed-dish recipes (food group 15) with ingredient
-- weights, yield factors and preparation, plus the companion "Kenyan food
-- recipes" recipe book (GoK/FAO 2018). The primary PDF/XLSX could NOT be
-- retrieved in this session (openknowledge.fao.org 403; the government
-- mirror failed TLS verification), and consumer nutrition trackers that
-- cite KFCT are not acceptable provenance (§3/§7). So NO Model B dish is
-- upgraded to `standard_recipe_verified` here — verifying each against KFCT
-- group 15 is the explicit deferred follow-up. The estimated numbers are
-- responsibly constructed and stay (better than zero coverage — §25).
--
-- Versioning (§17): the N7.5 `acp-recipe:<slug>-v1` rows are UNSHIPPED
-- (local only, production untouched) and NO nutrient value changes here, so
-- there is no material composition change to version — v1 is kept, not
-- bumped to v2. A future KFCT-verified pass that changes numbers would be
-- `-v2`. Historical food_log_entries are frozen regardless (§33).

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS composition_method text
    CHECK (composition_method IS NULL OR composition_method IN (
      'direct_verified', 'standard_recipe_verified', 'standard_recipe_estimated', 'proxy_composition'
    )),
  ADD COLUMN IF NOT EXISTS recipe_source text,      -- human-readable recipe/proxy provenance (short)
  ADD COLUMN IF NOT EXISTS recipe_reference text;   -- stable reference (derivation slug or citation)

-- ── Model B — ACP standardized recipes: ingredient nutrients authoritative,
--    recipe ratios / oil / yield / servings are ACP assumptions. ──
UPDATE public.foods SET
  composition_method = 'standard_recipe_estimated',
  recipe_source      = 'ACP estimated standard recipe (ingredient nutrients: USDA FoodData Central; recipe ratios, cooking fat, cooked yield and serving sizes are ACP estimates)',
  recipe_reference   = external_id
WHERE source = 'ACP standardized recipe';

-- ── Model A proxies — an authoritative direct food used as an explicit
--    stand-in for a Kenyan dish (not a measured analysis of that dish). ──
UPDATE public.foods SET
  composition_method = 'proxy_composition',
  recipe_source      = 'USDA FoodData Central: Plantains, cooked (boiled). Accepted proxy for East African cooking banana; not a measured matoke analysis.'
WHERE external_id = 'srlegacy:09277';   -- Matoke (boiled green banana / plantain)

UPDATE public.foods SET
  composition_method = 'proxy_composition',
  recipe_source      = 'USDA FoodData Central: Beef, round, top round, lean, broiled. Proxy for lean grilled meat with no added fat; not a measured nyama choma analysis.'
WHERE external_id = 'srlegacy:13364';   -- Nyama choma (grilled beef, lean)

-- ── Everything else with an authoritative direct composition entry
--    (the 32 original USDA generic foods + Cabbage cooked + Sweet potato
--    boiled) is a direct verified composition. ──
UPDATE public.foods SET composition_method = 'direct_verified'
WHERE composition_method IS NULL
  AND source = 'USDA FoodData Central'
  AND source_type = 'trusted_food_database';

-- ── Sharpen the two proxy rows' user-facing description so the proxy is
--    honest at the point of logging (§18/§19/§27) — no name change. ──
UPDATE public.foods
SET description = 'Plantains, cooked (boiled), no added fat. USDA composition used as a proxy for the East African cooking banana — not a measured matoke analysis; homemade matoke stewed with oil/tomato will differ.'
WHERE external_id = 'srlegacy:09277';

UPDATE public.foods
SET description = 'Lean grilled beef (USDA top round, broiled, no added fat) used as a proxy for nyama choma — cut, fattiness and marinade vary in practice.'
WHERE external_id = 'srlegacy:13364';
