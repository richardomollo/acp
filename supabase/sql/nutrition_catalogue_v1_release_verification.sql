-- ACP Intelligence™ — Nutrition Catalogue V1 · Production Deployment Package.
--
-- READ-ONLY verification queries to run AFTER the release (provenance
-- migration → corrected ingredient migration → catalogue seed) has been
-- applied to production. Every query here is a plain SELECT — nothing here
-- writes, and none of it has been run against production as part of this
-- task.
--
-- Expected results are noted inline. If any query's result doesn't match,
-- STOP and investigate before treating the release as complete.

-- 1. Provenance columns exist on `meals`.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'meals'
  AND column_name IN ('composition_method', 'recipe_source', 'recipe_reference');
-- expect: 3 rows

-- 2. The recipe_reference uniqueness constraint exists.
SELECT conname FROM pg_constraint WHERE conname = 'meals_recipe_reference_unique';
-- expect: 1 row

-- 3. The 19 canonical ingredients are present, by exact name.
SELECT count(*) AS canonical_ingredient_count
FROM public.foods
WHERE name IN (
  'Onion, raw', 'Garlic, raw', 'Bell pepper (red), raw', 'Mushroom, white, raw',
  'Cucumber, with peel, raw', 'Carrot, raw', 'Courgette (zucchini), raw',
  'Lettuce (romaine), raw', 'Aubergine (eggplant), raw', 'Green beans, raw',
  'Cauliflower, raw', 'Basil, fresh', 'Pasta, cooked', 'Wholewheat pasta, cooked',
  'Potato, boiled (without skin)', 'Couscous, cooked', 'Quinoa, cooked',
  'Chickpeas (garbanzo beans), cooked', 'Feta cheese'
);
-- expect: 19

-- 4. Every corrected ingredient's fdc_id / external_id (NDB reference) is present and non-null.
SELECT name, fdc_id, external_id FROM public.foods
WHERE name IN (
  'Onion, raw', 'Garlic, raw', 'Bell pepper (red), raw', 'Mushroom, white, raw',
  'Cucumber, with peel, raw', 'Carrot, raw', 'Courgette (zucchini), raw',
  'Lettuce (romaine), raw', 'Aubergine (eggplant), raw', 'Green beans, raw',
  'Cauliflower, raw', 'Basil, fresh', 'Pasta, cooked', 'Wholewheat pasta, cooked',
  'Potato, boiled (without skin)', 'Couscous, cooked', 'Quinoa, cooked',
  'Chickpeas (garbanzo beans), cooked', 'Feta cheese'
)
ORDER BY name;
-- expect: 19 rows, no NULL fdc_id/external_id. Spot-check against the
-- corrected values in 20260917000001_canonical_ingredient_expansion.sql —
-- in particular Basil fibre_g = 1.6 (not 3.3), and the NDB citations for
-- Pasta/Wholewheat pasta/Couscous/Quinoa match the migration's corrected
-- external_id values.

-- 5. Exactly 120 international meals present.
SELECT count(*) FROM public.meals WHERE recipe_reference IS NOT NULL;
-- expect: 120

-- 6. Cuisine group breakdown (European/Western = 40, Mediterranean = 40, Global = 40).
SELECT
  CASE WHEN cuisine IN ('western','european') THEN 'european_western' ELSE cuisine END AS cuisine_group,
  count(*)
FROM public.meals
WHERE recipe_reference IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- expect: european_western=40, mediterranean=40, global=40

-- 7. Occasion (category) counts across the new catalogue.
SELECT category, count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL
GROUP BY category ORDER BY category;
-- expect: breakfast=30, lunch=45, dinner=45 (sums to 120)

-- 8. No duplicate recipe_reference anywhere in `meals`.
SELECT recipe_reference, count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL
GROUP BY recipe_reference HAVING count(*) > 1;
-- expect: 0 rows

-- 9. No duplicate meal identity (name+cuisine+category) within the new catalogue.
SELECT name, cuisine, category, count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL
GROUP BY name, cuisine, category HAVING count(*) > 1;
-- expect: 0 rows

-- 10. Existing Kenyan meal count is unchanged (compare against the known
--     pre-release count — 92 as of the provenance migration's own comment;
--     re-verify the true pre-release number immediately before applying).
SELECT count(*) FROM public.meals WHERE recipe_reference IS NULL;
-- expect: unchanged from the pre-release count

-- 11. No Kenyan row was deactivated as a side effect.
SELECT count(*) FROM public.meals WHERE recipe_reference IS NULL AND is_active = false;
-- expect: 0 (or whatever the pre-release count of inactive Kenyan rows already was — compare, don't assume 0)

-- 12. Provenance fields populated on every new catalogue row.
SELECT count(*) FROM public.meals
WHERE recipe_reference IS NOT NULL
  AND (composition_method IS NULL OR recipe_source IS NULL OR recipe_reference IS NULL);
-- expect: 0

-- 13. No null core macros on new rows (fibre is allowed to be null — UNKNOWN ≠ ZERO;
--     energy/protein/carbs/fat are hard-required by composeMeal() and must never be null).
SELECT name, recipe_reference FROM public.meals
WHERE recipe_reference IS NOT NULL
  AND (calories IS NULL OR protein_g IS NULL OR carbs_g IS NULL OR fat_g IS NULL);
-- expect: 0 rows
