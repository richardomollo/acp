-- ACP Intelligence™ — Nutrition Catalogue Infrastructure: Canonical
-- Ingredient Expansion (gates Catalogue Content Batch 2).
--
-- SOURCE: USDA FoodData Central, SR Legacy — the exact same offline-curated
-- pipeline as 20260901000002_nutrition_food_seed.sql. USDA FDC data is a
-- work of the U.S. Government and is in the PUBLIC DOMAIN
-- (https://fdc.nal.usda.gov/data-documentation.html). No live FDC dependency
-- is introduced anywhere in the app — these are one-time, offline-curated
-- rows, fetched by the author at authoring time only, exactly like the
-- original 32-food seed.
--
-- All values are PER 100 g of the food as described. Only nutrients present
-- in the cited FDC record are populated; every other nutrient column is left
-- NULL == "not supplied by the source" (never 0). 0 == a measured zero
-- (e.g. feta cheese's fibre_g = 0 is a real measured zero, confirmed present
-- as an explicit reported value in the official dataset, not unknown).
--
-- PROVENANCE:
--   • external_id = 'srlegacy:NNNNN' — the SR-Legacy NDB number.
--   • fdc_id      = the USDA FDC numeric surrogate id, directly fetchable at
--     https://api.nal.usda.gov/fdc/v1/food/{fdc_id} and browsable at
--     https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}
--   • composition_method = 'direct_verified' for every row here — each is an
--     authoritative FDC composition entry for EXACTLY the food/prep-state
--     named (N7.5B semantics), never an ACP-assembled recipe.
--
-- VERIFICATION HISTORY (this file has been through two passes):
--   1. Initial authoring (2026-09-17): identity for onion/garlic confirmed
--      live against api.nal.usda.gov; the rest cross-referenced from public
--      SR-Legacy mirrors after the DEMO_KEY rate limit was exhausted.
--   2. OFFICIAL VERIFICATION (2026-09-17, same day, superseding pass): every
--      one of the 19 rows re-verified against the OFFICIAL USDA FoodData
--      Central bulk download — FoodData_Central_sr_legacy_food_csv_2018-04
--      (food.csv / sr_legacy_food.csv / food_nutrient.csv / nutrient.csv),
--      downloaded from https://fdc.nal.usda.gov/fdc-datasets/ — matched by
--      fdc_id, cross-checked by description and NDB number. This pass found
--      and corrected: a wrong fibre_g for basil (was 3.3, official is 1.6 —
--      the material discrepancy flagged in the prior audit is resolved in
--      favour of the LOWER figure), material errors for cucumber (fibre)
--      and cauliflower (kcal/protein/vitamin C), a smaller fibre/protein/
--      carb correction for lettuce, and wrong NDB-number citations (identity
--      via fdc_id was always correct; the external_id field cited the wrong
--      SR-Legacy number) for the four cooked-starch rows sourced with lower
--      confidence in pass 1: pasta, wholewheat pasta, couscous, quinoa.
--      Full per-ingredient classification is in the accompanying report.
--      The downloaded dataset file itself is authoring evidence, not part
--      of this repo — it was deleted after verification.
--
-- PREPARATION STATE (§4): every name states its state explicitly per the
-- established convention (`Potatoes, boiled, cooked without skin`, `Pasta,
-- cooked, enriched`, `Quinoa, cooked`, `Chickpeas ..., cooked` — never a
-- bare "Pasta" or "Potato" that could be mistaken for dry/raw weight). The
-- official dataset's own `description` field was checked for every one of
-- the six cooked/boiled rows and confirms each is genuinely the cooked/
-- boiled record, never a dry/raw record mislabelled.
--
-- DUPLICATION (§5): no alias mechanism exists in this schema (`foods` has
-- only `name`/`description`, no synonym/alias table) — so, per the spec's
-- own fallback ("prefer one canonical record... if the architecture
-- supports aliases"), courgette/zucchini and chickpeas/garbanzo beans are
-- each ONE row whose `name` carries both terms, so a search for either term
-- still matches (N1's search is `ilike '%q%'` over `name`).
--
-- 19 new foods (of a 20 maximum). Deliberately not a bulk import.

INSERT INTO public.foods
  (source, external_id, fdc_id, source_type, name, description, basis_grams, density_g_per_ml,
   energy_kcal, protein_g, carbohydrate_g, fat_g, saturated_fat_g, fibre_g, sugar_g,
   sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, copper_mg, manganese_mg,
   selenium_ug, riboflavin_b2_mg, niacin_b3_mg,
   vitamin_a_ug, vitamin_c_mg, vitamin_k_ug, folate_b9_ug,
   default_serving_grams, default_serving_label, is_generic, country_code, composition_method)
VALUES
  -- ── Aromatics (official verification: MATCH — every field exact) ──
  ('USDA FoodData Central', 'srlegacy:11282', 170000, 'trusted_food_database',
   'Onion, raw', 'Onions, raw',
   100, NULL, 40, 1.1, 9.34, 0.1, 0.042, 1.7, 4.24,
   4, 146, 23, 0.21, 10, NULL, NULL, NULL, NULL, NULL,
   0, 7.4, NULL, 19,
   110, '1 medium (110 g)', true, NULL, 'direct_verified'),
  ('USDA FoodData Central', 'srlegacy:11215', 169230, 'trusted_food_database',
   'Garlic, raw', 'Garlic, raw',
   100, NULL, 149, 6.36, 33.06, 0.5, 0.089, 2.1, 1.0,
   17, 401, 181, 1.7, 25, NULL, NULL, NULL, NULL, NULL,
   0, 31.2, NULL, 3,
   9, '3 cloves (9 g)', true, NULL, 'direct_verified'),
  -- ── Vegetables ──
  -- Bell pepper: MINOR DIFFERENCE in pass 1 (protein/carb/iron rounding) — tightened to official.
  ('USDA FoodData Central', 'srlegacy:11821', 170108, 'trusted_food_database',
   'Bell pepper (red), raw', 'Peppers, sweet, red, raw',
   100, NULL, 26, 0.99, 6.03, 0.3, NULL, 2.1, 4.2,
   4, 211, 7, 0.43, NULL, NULL, NULL, NULL, NULL, NULL,
   157, 127.7, NULL, 46,
   119, '1 medium (119 g)', true, NULL, 'direct_verified'),
  -- Mushroom: MATCH — every field, including every micro, exact.
  ('USDA FoodData Central', 'srlegacy:11260', 169251, 'trusted_food_database',
   'Mushroom, white, raw', 'Mushrooms, white, raw',
   100, NULL, 22, 3.09, 3.26, 0.34, NULL, 1.0, NULL,
   NULL, 318, NULL, NULL, NULL, 0.318, NULL, 9.3, 0.402, 3.607,
   NULL, NULL, NULL, NULL,
   70, '1 cup sliced (70 g)', true, NULL, 'direct_verified'),
  -- Cucumber: MATERIAL DIFFERENCE — fibre was 0.9 (mirror), official is 0.5;
  -- kcal was 14, official is 15. Corrected; sugar/sodium now populated (were
  -- unknown in pass 1, genuinely known from the official record).
  ('USDA FoodData Central', 'srlegacy:11205', 168409, 'trusted_food_database',
   'Cucumber, with peel, raw', 'Cucumber, with peel, raw',
   100, NULL, 15, 0.65, 3.63, 0.11, NULL, 0.5, 1.67,
   2, 147, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, 2.8, NULL, NULL,
   104, '1 cup sliced (104 g)', true, NULL, 'direct_verified'),
  -- Carrot: MATCH — every field, including vitamin A, exact.
  ('USDA FoodData Central', 'srlegacy:11124', 170393, 'trusted_food_database',
   'Carrot, raw', 'Carrots, raw',
   100, NULL, 41, 0.93, 9.58, 0.24, NULL, 2.8, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   835, NULL, NULL, NULL,
   61, '1 medium (61 g)', true, NULL, 'direct_verified'),
  -- Courgette (zucchini): MATCH — every field exact.
  ('USDA FoodData Central', 'srlegacy:11477', 169291, 'trusted_food_database',
   'Courgette (zucchini), raw', 'Squash, summer, zucchini, includes skin, raw',
   100, NULL, 17, 1.21, 3.11, 0.32, NULL, 1.0, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   118, '1 medium (118 g)', true, NULL, 'direct_verified'),
  -- Lettuce: MATERIAL DIFFERENCE — fibre was 1.8, official is 2.1; protein/
  -- carb tightened. Vitamin A/C now populated (genuinely known).
  ('USDA FoodData Central', 'srlegacy:11251', 169247, 'trusted_food_database',
   'Lettuce (romaine), raw', 'Lettuce, cos or romaine, raw',
   100, NULL, 17, 1.23, 3.29, 0.3, NULL, 2.1, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   436, 4, 102.5, NULL,
   47, '1 cup shredded (47 g)', true, NULL, 'direct_verified'),
  -- Aubergine (eggplant): MINOR DIFFERENCE — fat 0.19 vs official 0.18 (trivial rounding).
  ('USDA FoodData Central', 'srlegacy:11209', 169228, 'trusted_food_database',
   'Aubergine (eggplant), raw', 'Eggplant, raw',
   100, NULL, 25, 0.98, 5.88, 0.18, NULL, 3.0, NULL,
   NULL, 229, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   82, '1 cup cubes (82 g)', true, NULL, 'direct_verified'),
  -- Green beans: MATCH — every field, including vitamin C, exact.
  ('USDA FoodData Central', 'srlegacy:11052', 169961, 'trusted_food_database',
   'Green beans, raw', 'Beans, snap, green, raw',
   100, NULL, 31, 1.83, 6.97, 0.22, NULL, 2.7, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, 12.2, NULL, NULL,
   100, '1 cup (100 g)', true, NULL, 'direct_verified'),
  -- Cauliflower: MATERIAL DIFFERENCE — kcal was 23 (official 25), protein
  -- was 1.6 (official 1.92, ~20% off), vitamin C was 67.1 (official 48.2,
  -- ~39% off). All corrected.
  ('USDA FoodData Central', 'srlegacy:11135', 169986, 'trusted_food_database',
   'Cauliflower, raw', 'Cauliflower, raw',
   100, NULL, 25, 1.92, 4.97, 0.28, NULL, 2.0, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, 48.2, NULL, NULL,
   107, '1 cup (107 g)', true, NULL, 'direct_verified'),
  -- Basil: MATERIAL DIFFERENCE, THE FLAGGED BASIL DISCREPANCY RESOLVED —
  -- official fibre is 1.6g/100g, NOT 3.3g (the two third-party mirrors used
  -- in pass 1 were both wrong on this and on protein/potassium/vitamin C/
  -- vitamin A; the official dataset is authoritative and decides). Corrected:
  -- protein 2.65→3.15, fibre 3.3→1.6, potassium 440→295, vitamin C 6.0→18,
  -- vitamin A 583→264. Calcium, iron, manganese, vitamin K, sugar, kcal,
  -- carbs and fat were already correct.
  ('USDA FoodData Central', 'srlegacy:02044', 172232, 'trusted_food_database',
   'Basil, fresh', 'Basil, fresh',
   100, NULL, 23, 3.15, 2.65, 0.64, NULL, 1.6, 0.3,
   NULL, 295, 177, 3.17, NULL, NULL, 1.1, NULL, NULL, NULL,
   264, 18, 414.8, NULL,
   5, '2 tbsp chopped (5 g)', true, NULL, 'direct_verified'),
  -- ── Cooked starches (§4 — cooked/prepared state re-confirmed against the
  --    official dataset's own `description` field for all six rows below;
  --    every one is genuinely the cooked/boiled record, never dry/raw) ──
  -- Pasta, cooked: identity/nutrients were already correct (MINOR rounding
  -- only); the cited NDB number was WRONG (20124 — no such SR-Legacy food;
  -- official is 20121) — a provenance-citation error, not a nutrient error,
  -- since lookups always keyed on fdc_id. Corrected.
  ('USDA FoodData Central', 'srlegacy:20121', 169737, 'trusted_food_database',
   'Pasta, cooked', 'Pasta, cooked, enriched, without added salt',
   100, NULL, 158, 5.8, 30.86, 0.93, NULL, 1.8, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   140, '1 cup cooked (140 g)', true, NULL, 'direct_verified'),
  -- Wholewheat pasta, cooked: same as above — NDB citation was wrong
  -- (20421 → official 20125); nutrients tightened to official precision.
  ('USDA FoodData Central', 'srlegacy:20125', 168910, 'trusted_food_database',
   'Wholewheat pasta, cooked', 'Pasta, whole wheat, cooked',
   100, NULL, 149, 5.99, 30.07, 1.71, NULL, 3.9, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   140, '1 cup cooked (140 g)', true, NULL, 'direct_verified'),
  -- Potato, boiled without skin: MATCH — every field exact, NDB already correct.
  ('USDA FoodData Central', 'srlegacy:11367', 170440, 'trusted_food_database',
   'Potato, boiled (without skin)', 'Potatoes, boiled, cooked without skin, flesh, without salt',
   100, NULL, 86, 1.71, 20.01, 0.1, NULL, 1.8, NULL,
   NULL, 328, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   135, '1/2 cup (135 g)', true, NULL, 'direct_verified'),
  -- Couscous, cooked: NDB citation was wrong (20025 → official 20029);
  -- nutrients were already exact.
  ('USDA FoodData Central', 'srlegacy:20029', 169700, 'trusted_food_database',
   'Couscous, cooked', 'Couscous, cooked',
   100, NULL, 112, 3.79, 23.22, 0.16, NULL, 1.4, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   157, '1 cup (157 g)', true, NULL, 'direct_verified'),
  -- Quinoa, cooked: NDB citation was wrong (20035 → official 20137);
  -- nutrients were already exact.
  ('USDA FoodData Central', 'srlegacy:20137', 168917, 'trusted_food_database',
   'Quinoa, cooked', 'Quinoa, cooked',
   100, NULL, 120, 4.4, 21.3, 1.92, NULL, 2.8, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   185, '1 cup (185 g)', true, NULL, 'direct_verified'),
  -- Chickpeas, cooked: MINOR rounding only; NDB already correct.
  ('USDA FoodData Central', 'srlegacy:16057', 173757, 'trusted_food_database',
   'Chickpeas (garbanzo beans), cooked', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt',
   100, NULL, 164, 8.86, 27.42, 2.59, NULL, 7.6, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   164, '1 cup (164 g)', true, NULL, 'direct_verified'),
  -- ── Dairy ──
  -- Feta: MINOR DIFFERENCE — kcal/carb/fat/sodium each off by a small
  -- amount from the prior mirror-sourced values; NDB already correct.
  ('USDA FoodData Central', 'srlegacy:01019', 173420, 'trusted_food_database',
   'Feta cheese', 'Cheese, feta',
   100, NULL, 265, 14.21, 3.88, 21.49, NULL, 0, NULL,
   1139, NULL, 493, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   28, '1 oz crumbled (28 g)', true, NULL, 'direct_verified');
