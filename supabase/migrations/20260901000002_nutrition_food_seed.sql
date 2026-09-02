-- ACP Intelligence™ — Nutrition N1 seed: a starter set of generic foods.
--
-- SOURCE: USDA FoodData Central, SR Legacy. USDA FDC data is a work of the
-- U.S. Government and is in the PUBLIC DOMAIN — free to redistribute
-- (https://fdc.nal.usda.gov/data-documentation.html).
--
-- All values are PER 100 g of the food as described. Only nutrients present
-- in the cited FDC record are populated; every other nutrient column is left
-- NULL == "not supplied by the source" (never 0). 0 == a measured zero.
--
-- PROVENANCE (N1 §5/§6):
--   • external_id = 'srlegacy:NNNNN'  — the SR-Legacy NDB number (kept for
--     human reference / cross-dataset lookup).
--   • fdc_id      = the USDA FDC numeric surrogate id — directly fetchable at
--     https://api.nal.usda.gov/fdc/v1/food/{fdc_id} and browsable at
--     https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}
--
-- RECONCILIATION: every row below was regenerated field-by-field from its
-- live FDC record via the FoodData Central API on 2026-09-01 (N1.6 §8). The
-- 5 canonical acceptance foods (Greek yoghurt nonfat, whole milk, egg,
-- banana, brewed coffee) match their FDC record exactly on energy + macros.
-- Four rows previously cited the wrong NDB number and were corrected:
--   Greek yoghurt whole milk  01287→01293 (01287 is "lowfat")
--   Gouda cheese              01018→01022 (01018 is "edam")
--   Cornmeal, whole-grain     20314→20020 (20314 is "corn grain, white")
--   Salmon, Atlantic, cooked  15236→15237 (15236 is "raw")
--
-- 32 foods; broad coverage comes from the N2 provider sync — this is
-- deliberately NOT a bulk import (N1 §2).
--
-- DENSITY PROVENANCE (N1 §8 — ml→g conversion must be source-backed, never a
-- blanket 1 ml = 1 g). Only 4 foods carry density_g_per_ml; each is derived
-- from that food's own USDA FDC `foodPortions` gram-weights (portion grams ÷
-- standard portion volume), verified 2026-09-01:
--   whole milk / semi-skimmed milk  244 g per US cup (236.588 ml) = 1.031 g/ml
--   olive oil                       13.5 g per US tbsp (14.787 ml) = 0.913 g/ml
--   coffee, brewed                  237 g per US cup (236.588 ml) = 1.002 g/ml (→ 1.00)
-- The other 28 foods have density_g_per_ml = NULL and cannot be logged in ml.

INSERT INTO public.foods
  (source, external_id, fdc_id, source_type, name, description, basis_grams, density_g_per_ml,
   energy_kcal, protein_g, carbohydrate_g, fat_g, saturated_fat_g, fibre_g, sugar_g,
   sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg,
   vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, vitamin_a_ug, folate_b9_ug,
   default_serving_grams, default_serving_label, is_generic, country_code)
VALUES
  -- ── Dairy & eggs ──
  ('USDA FoodData Central', 'srlegacy:01256', 170894, 'trusted_food_database',
   'Greek yoghurt, plain, nonfat', 'Yogurt, Greek, plain, nonfat',
   100, NULL, 59, 10.19, 3.6, 0.39, 0.117, 0, 3.24, 36, 141, 110, 0.07, 11, 0, 0, 0.75, 1, 7,
   170, '1 container (170 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01293', 171304, 'trusted_food_database',
   'Greek yoghurt, plain, whole milk', 'Yogurt, Greek, plain, whole milk',
   100, NULL, 97, 9, 3.98, 5, 2.395, 0, 4, 35, 141, 100, 0, 11, 0, 0, 0.75, 2, 5,
   170, '1 container (170 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01077', 171265, 'trusted_food_database',
   'Whole milk (3.25% fat)', 'Milk, whole, 3.25% milkfat, with added vitamin D',
   100, 1.031, 61, 3.15, 4.8, 3.25, 1.865, 0, 5.05, 43, 132, 113, 0.03, 10, 0, 1.3, 0.45, 46, 5,
   244, '1 cup (244 g / 237 ml)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01079', 171267, 'trusted_food_database',
   'Semi-skimmed milk (2% fat)', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D',
   100, 1.031, 50, 3.3, 4.8, 1.98, 1.257, 0, 5.06, 47, 140, 120, 0.02, 11, 0.2, 1.2, 0.53, 55, 5,
   244, '1 cup (244 g / 237 ml)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01123', 171287, 'trusted_food_database',
   'Egg, whole, raw', 'Egg, whole, raw, fresh',
   100, NULL, 143, 12.56, 0.72, 9.51, 3.126, 0, 0.37, 142, 138, 56, 1.75, 12, 0, 2, 0.89, 160, 47,
   50, '1 large egg (50 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01009', 173414, 'trusted_food_database',
   'Cheddar cheese', 'Cheese, cheddar',
   100, NULL, 403, 22.87, 3.37, 33.31, 18.867, 0, 0.48, 653, 76, 710, 0.14, 27, 0, 0.6, 1.1, 337, 27,
   28, '1 slice (28 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:01022', 171241, 'trusted_food_database',
   'Gouda cheese', 'Cheese, gouda',
   100, NULL, 356, 24.94, 2.22, 27.44, 17.614, 0, 2.22, 819, 121, 700, 0.24, 29, 0, 0.5, 1.54, 165, 21,
   28, '1 slice (28 g)', true, NULL),
  -- ── Fruit ──
  ('USDA FoodData Central', 'srlegacy:09040', 173944, 'trusted_food_database',
   'Banana, raw', 'Bananas, raw',
   100, NULL, 89, 1.09, 22.84, 0.33, 0.112, 2.6, 12.23, 1, 358, 5, 0.26, 27, 8.7, 0, 0, 3, 20,
   118, '1 medium (118 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:09003', 171688, 'trusted_food_database',
   'Apple, raw, with skin', 'Apples, raw, with skin',
   100, NULL, 52, 0.26, 13.81, 0.17, 0.028, 2.4, 10.39, 1, 107, 6, 0.12, 5, 4.6, 0, 0, 3, 3,
   182, '1 medium (182 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:09037', 171705, 'trusted_food_database',
   'Avocado, raw', 'Avocados, raw',
   100, NULL, 160, 2, 8.53, 14.66, 2.126, 6.7, 0.66, 7, 485, 12, 0.55, 29, 10, 0, 0, 7, 81,
   100, '1/2 avocado (100 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:09150', 167746, 'trusted_food_database',
   'Lemon, raw', 'Lemons, raw, without peel',
   100, NULL, 29, 1.1, 9.32, 0.3, 0.039, 2.8, 2.5, 2, 138, 26, 0.6, 8, 53, 0, 0, 1, 11,
   58, '1 fruit (58 g)', true, NULL),
  -- ── Grains, bread ──
  ('USDA FoodData Central', 'srlegacy:08120', 173904, 'trusted_food_database',
   'Oats, rolled, dry', 'Cereals, oats, regular and quick, not fortified, dry',
   100, NULL, 379, 13.15, 67.7, 6.52, 1.11, 10.1, 0.99, 6, 362, 52, 4.25, 138, 0, 0, 0, 0, 32,
   40, '1/2 cup dry (40 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:18075', 172688, 'trusted_food_database',
   'Wholegrain bread', 'Bread, whole-wheat, commercially prepared',
   100, NULL, 252, 12.45, 42.71, 3.5, 0.722, 6, 4.34, 455, 254, 161, 2.47, 75, 0, 0, 0, 0, 42,
   28, '1 slice (28 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:18069', 174924, 'trusted_food_database',
   'White bread', 'Bread, white, commercially prepared',
   100, NULL, 266, 8.85, 49.42, 3.33, 0.698, 2.7, 5.67, 490, 126, 144, 3.61, 23, 0, 0, 0, 0, 111,
   25, '1 slice (25 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:20045', 168878, 'trusted_food_database',
   'White rice, cooked', 'Rice, white, long-grain, regular, enriched, cooked',
   100, NULL, 130, 2.69, 28.17, 0.28, 0.077, 0.4, 0.05, 1, 35, 10, 1.2, 12, 0, 0, 0, 0, 58,
   158, '1 cup cooked (158 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:20037', 169704, 'trusted_food_database',
   'Brown rice, cooked', 'Rice, brown, long-grain, cooked',
   100, NULL, 123, 2.74, 25.58, 0.97, 0.26, 1.6, 0.24, 4, 86, 3, 0.56, 39, 0, 0, 0, 0, 9,
   195, '1 cup cooked (195 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:20020', 169697, 'trusted_food_database',
   'Maize meal (whole-grain cornmeal)', 'Cornmeal, whole-grain, yellow',
   100, NULL, 362, 8.12, 76.89, 3.59, 0.505, 7.3, 0.64, 35, 287, 6, 3.45, 127, 0, 0, 0, 11, 25,
   50, '1/2 cup dry (50 g)', true, NULL),
  -- ── Protein foods ──
  ('USDA FoodData Central', 'srlegacy:05064', 171477, 'trusted_food_database',
   'Chicken breast, roasted, skinless', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
   100, NULL, 165, 31.02, 0, 3.57, 1.01, 0, 0, 74, 256, 15, 1.04, 29, 0, 0.1, 0.34, 6, 4,
   120, '1 breast (120 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:15237', 175168, 'trusted_food_database',
   'Salmon, Atlantic, cooked', 'Fish, salmon, Atlantic, farmed, cooked, dry heat',
   100, NULL, 206, 22.1, 0, 12.35, 2.397, 0, 0, 61, 384, 15, 0.34, 30, 3.7, 13.1, 2.8, 69, 34,
   150, '1 fillet (150 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:15121', 173709, 'trusted_food_database',
   'Tuna, canned in water, drained', 'Fish, tuna, light, canned in water, drained solids',
   100, NULL, 86, 19.44, 0, 0.96, 0.211, 0, 0, 247, 179, 17, 1.63, 23, 0, 1.2, 2.55, 17, 4,
   142, '1 can drained (142 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:16033', 175194, 'trusted_food_database',
   'Kidney beans, cooked', 'Beans, kidney, red, mature seeds, cooked, boiled, without salt',
   100, NULL, 127, 8.67, 22.8, 0.5, 0.072, 7.4, 0.32, 2, 403, 28, 2.94, 45, 1.2, 0, 0, 0, 130,
   177, '1 cup (177 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:16070', 172421, 'trusted_food_database',
   'Lentils, cooked', 'Lentils, mature seeds, cooked, boiled, without salt',
   100, NULL, 116, 9.02, 20.13, 0.38, 0.053, 7.9, 1.8, 2, 369, 19, 3.33, 36, 1.5, 0, 0, 0, 181,
   198, '1 cup (198 g)', true, NULL),
  -- ── Vegetables & tubers ──
  ('USDA FoodData Central', 'srlegacy:11090', 170379, 'trusted_food_database',
   'Broccoli, raw', 'Broccoli, raw',
   100, NULL, 34, 2.82, 6.64, 0.37, 0.114, 2.6, 1.7, 33, 316, 47, 0.73, 21, 89.2, 0, 0, 31, 63,
   91, '1 cup chopped (91 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11457', 168462, 'trusted_food_database',
   'Spinach, raw', 'Spinach, raw',
   100, NULL, 23, 2.86, 3.63, 0.39, 0.063, 2.2, 0.42, 79, 558, 99, 2.71, 79, 28.1, 0, 0, 469, 194,
   30, '1 cup (30 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11233', 168421, 'trusted_food_database',
   'Kale (sukuma wiki), raw', 'Kale, raw',
   100, NULL, 35, 2.92, 4.42, 1.49, 0.178, 4.1, 0.99, 53, 348, 254, 1.6, 33, 93.4, 0, 0, 241, 62,
   67, '1 cup chopped (67 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11529', 170457, 'trusted_food_database',
   'Tomato, raw', 'Tomatoes, red, ripe, raw, year round average',
   100, NULL, 18, 0.88, 3.89, 0.2, 0.028, 1.2, 2.63, 5, 237, 10, 0.27, 11, 13.7, 0, 0, 42, 15,
   123, '1 medium (123 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11352', 170026, 'trusted_food_database',
   'Potato, raw', 'Potatoes, flesh and skin, raw',
   100, NULL, 77, 2.05, 17.49, 0.09, 0.025, 2.1, 0.82, 6, 425, 12, 0.81, 23, 19.7, 0, 0, 0, 15,
   213, '1 medium (213 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11507', 168482, 'trusted_food_database',
   'Sweet potato, raw', 'Sweet potato, raw, unprepared',
   100, NULL, 86, 1.57, 20.12, 0.05, 0.018, 3, 4.18, 55, 337, 30, 0.61, 25, 2.4, 0, 0, 709, 11,
   130, '1 medium (130 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:11134', 169985, 'trusted_food_database',
   'Cassava, raw', 'Cassava, raw',
   100, NULL, 160, 1.36, 38.06, 0.28, 0.074, 1.8, 1.7, 14, 271, 16, 0.27, 21, 20.6, 0, 0, 1, 27,
   103, '1 cup (103 g)', true, NULL),
  -- ── Fats & spreads ──
  ('USDA FoodData Central', 'srlegacy:04053', 171413, 'trusted_food_database',
   'Olive oil', 'Oil, olive, salad or cooking',
   100, 0.913, 884, 0, 0, 100, 13.808, 0, 0, 2, 1, 1, 0.56, 0, 0, 0, 0, 0, 0,
   13.5, '1 tbsp (13.5 g)', true, NULL),
  ('USDA FoodData Central', 'srlegacy:16098', 174266, 'trusted_food_database',
   'Peanut butter, smooth', 'Peanut butter, smooth style, with salt',
   100, NULL, 598, 22.21, 22.31, 51.36, 10.325, 5, 10.49, 426, 558, 49, 1.74, 168, 0, 0, 0, 0, 87,
   16, '1 tbsp (16 g)', true, NULL),
  -- ── Beverages ──
  ('USDA FoodData Central', 'srlegacy:14209', 171890, 'trusted_food_database',
   'Coffee, brewed, black', 'Beverages, coffee, brewed, prepared with tap water',
   100, 1.00, 1, 0.12, 0, 0.02, 0.002, 0, 0, 2, 49, 2, 0.01, 3, 0, 0, 0, 0, 2,
   237, '1 cup (237 g / 237 ml)', true, NULL);

-- ── Named household measures (label → grams). Kept separate from foods so a
--    food can offer several ("1 small" / "1 medium" / "1 large" banana). ──
INSERT INTO public.food_servings (food_id, label, grams, source_type, sort_order)
SELECT f.id, v.label, v.grams, 'trusted_food_database', v.so
FROM public.foods f
JOIN (VALUES
  ('Banana, raw',                 '1 small (101 g)',      101, 0),
  ('Banana, raw',                 '1 medium (118 g)',     118, 1),
  ('Banana, raw',                 '1 large (136 g)',      136, 2),
  ('Apple, raw, with skin',       '1 small (149 g)',      149, 0),
  ('Apple, raw, with skin',       '1 medium (182 g)',     182, 1),
  ('Apple, raw, with skin',       '1 large (223 g)',      223, 2),
  ('Avocado, raw',                '1/2 avocado (100 g)',  100, 0),
  ('Avocado, raw',                '1 avocado (201 g)',    201, 1),
  ('Egg, whole, raw',             '1 medium (44 g)',       44, 0),
  ('Egg, whole, raw',             '1 large (50 g)',        50, 1),
  ('Egg, whole, raw',             '1 extra large (56 g)',  56, 2),
  ('Whole milk (3.25% fat)',      '1 cup (244 g)',        244, 1),
  ('Semi-skimmed milk (2% fat)',  '1 cup (244 g)',        244, 1),
  ('Greek yoghurt, plain, nonfat',     '1 container (170 g)', 170, 1),
  ('Greek yoghurt, plain, whole milk', '1 container (170 g)', 170, 1),
  ('Wholegrain bread',            '1 slice (28 g)',        28, 0),
  ('Wholegrain bread',            '2 slices (56 g)',       56, 1),
  ('White bread',                 '1 slice (25 g)',        25, 0),
  ('White bread',                 '2 slices (50 g)',       50, 1),
  ('Cheddar cheese',              '1 slice (28 g)',        28, 0),
  ('Gouda cheese',                '1 slice (28 g)',        28, 0),
  ('Olive oil',                   '1 tsp (4.5 g)',        4.5, 0),
  ('Olive oil',                   '1 tbsp (13.5 g)',     13.5, 1),
  ('Peanut butter, smooth',       '1 tbsp (16 g)',         16, 0),
  ('Peanut butter, smooth',       '2 tbsp (32 g)',         32, 1),
  ('Oats, rolled, dry',           '1/2 cup dry (40 g)',    40, 0),
  ('Oats, rolled, dry',           '1 cup dry (81 g)',      81, 1),
  ('White rice, cooked',          '1 cup cooked (158 g)', 158, 0),
  ('Brown rice, cooked',          '1 cup cooked (195 g)', 195, 0),
  ('Chicken breast, roasted, skinless', '1 breast (120 g)', 120, 0),
  ('Salmon, Atlantic, cooked',    '1 fillet (150 g)',     150, 0),
  ('Tuna, canned in water, drained',    '1 can drained (142 g)', 142, 0),
  ('Kidney beans, cooked',        '1 cup (177 g)',        177, 0),
  ('Lentils, cooked',             '1 cup (198 g)',        198, 0),
  ('Broccoli, raw',               '1 cup chopped (91 g)',  91, 0),
  ('Spinach, raw',                '1 cup (30 g)',          30, 0),
  ('Kale (sukuma wiki), raw',     '1 cup chopped (67 g)',  67, 0),
  ('Tomato, raw',                 '1 medium (123 g)',     123, 0),
  ('Potato, raw',                 '1 medium (213 g)',     213, 0),
  ('Sweet potato, raw',           '1 medium (130 g)',     130, 0),
  ('Coffee, brewed, black',       '1 cup (237 g)',        237, 0),
  ('Coffee, brewed, black',       '1 mug (355 g)',        355, 1)
) AS v(fname, label, grams, so) ON f.name = v.fname AND f.source = 'USDA FoodData Central';
