-- ACP Intelligence™ — Nutrition N7.5: Kenyan-first canonical food coverage.
--
-- FIXES THE BETA DEFECT: searching "Ugali" on Log Food returned
-- "No foods matched". This migration adds 13 common Kenyan foods/dishes as
-- ORDINARY canonical `foods` rows + `food_servings`, so every downstream
-- layer (N2 history, N3 references, N4 coaching, N5 camera match, N6 saved
-- meals, N7 fitness×nutrition, N8 advice effectiveness) picks them up with
-- ZERO special-casing.
--
-- Fully ADDITIVE. Does NOT edit the N1 seed (20260901000002), the N1 schema,
-- or the legacy `meals` library (those 92 admin-curated rows are a coverage
-- inventory, NEVER a nutrition source — no macro is copied from them here).
--
-- NO LLM values. NO guessed macros. Two provenance models (N7.5 §10):
--
--   MODEL A — DIRECT COMPOSITION. A documented food-composition entry exists.
--     source='USDA FoodData Central', source_type='trusted_food_database',
--     real fdc_id + external_id='srlegacy:NNNNN'. Values PER 100 g, verbatim
--     from the cited USDA SR / FDC record (public domain).
--
--   MODEL B — STRUCTURED STANDARDIZED RECIPE (deterministic). No direct
--     entry, so per-100g composition is computed from canonical ingredients
--     (each with its own USDA fdc_id) and a DOCUMENTED cooked yield:
--         per-100g nutrient = Σ(ingredient nutrient) × (100 / cooked_yield_g)
--     source='ACP standardized recipe', source_type='estimated',
--     external_id='acp-recipe:<slug>-v1', fdc_id=NULL. These are labelled
--     "standard recipe" in the name — they are ONE documented preparation,
--     not universal truth (N7.5 §13). A user who cooks it differently can
--     build their own with N6 saved meals.
--
-- MODEL B DERIVATIONS (ingredient fdc_id · grams → cooked yield g):
--   Ugali (acp-recipe:ugali-v1)
--     maize meal 169697 · 100 g  +  water  →  yield 300 g   (factor 0.3333)
--     no oil, no salt assumed (salt varies — sodium left NULL, §39).
--   Githeri (acp-recipe:githeri-v1)   → yield 260 g
--     kidney beans (ckd) 175194 · 120 g  +  hominy 169706 · 120 g
--     +  vegetable oil (as 171413) · 8 g  +  tomato 170457 · 20 g
--   Sukuma wiki (acp-recipe:sukuma-wiki-v1)   → served yield 180 g
--     kale, cooked 168422 · 150 g  +  oil 171413 · 12 g
--     +  onion, raw 170000 · 30 g  +  tomato 170457 · 20 g
--   Chapati (acp-recipe:chapati-v1)   → cooked yield 75 g / chapati
--     wheat flour, white, enriched 168944 · 60 g  +  oil 171413 · 8 g  +  water
--   Mukimo (acp-recipe:mukimo-v1)   → yield 250 g
--     potato, boiled 170439 · 150 g  +  sweet corn, cooked 169998 · 60 g
--     +  spinach, cooked 168463 · 40 g  +  oil 171413 · 8 g
--   Pilau (acp-recipe:pilau-v1)   → yield 250 g
--     white rice, cooked 168878 · 200 g  +  oil 171413 · 15 g
--     +  beef, lean, broiled 174725 · 30 g  +  onion 170000 · 20 g  + spices (negligible)
--   Uji (acp-recipe:uji-v1)   → yield 230 g (thin gruel, density ≈ water)
--     maize meal 169697 · 25 g  +  water 220 g
--   Mandazi (acp-recipe:mandazi-v1)   → fried yield 50 g / piece
--     wheat flour 168944 · 40 g  +  sugar 19335 · 5 g  +  absorbed oil 171413 · 8 g
--   Beans, stewed (acp-recipe:beans-stew-v1)   → yield 250 g
--     kidney beans, cooked 175194 · 200 g  +  oil 171413 · 12 g
--     +  tomato 170457 · 40 g  +  onion 170000 · 30 g
--
-- NULL == not established by the source (never 0). Only nutrients the
-- derivation could support are populated; the rest stay NULL (N7.5 §40/§52).
-- country_code='KE' is DISPLAY/FILTER metadata only — it never touches a
-- nutrient calc or a search rank (N7.5 §18).

INSERT INTO public.foods
  (source, external_id, fdc_id, source_type, name, description, basis_grams, density_g_per_ml,
   energy_kcal, protein_g, carbohydrate_g, fat_g, saturated_fat_g, fibre_g, sugar_g,
   sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg,
   vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, vitamin_a_ug, folate_b9_ug,
   default_serving_grams, default_serving_label, is_generic, country_code)
VALUES
  -- ── Starches / dishes ──
  ('ACP standardized recipe', 'acp-recipe:ugali-v1', NULL, 'estimated',
   'Ugali (maize meal / posho, cooked)', 'Stiff maize-meal porridge, standard recipe (maize meal + water, no oil, no added salt).',
   100, NULL, 121, 2.71, 25.63, 1.20, 0.17, 2.43, 0.21, NULL, 95.67, 2.0, 1.15, 42.33, 0, NULL, NULL, 3.67, 8.33,
   250, '1 serving (250 g)', true, 'KE'),

  ('ACP standardized recipe', 'acp-recipe:githeri-v1', NULL, 'estimated',
   'Githeri (boiled maize and beans)', 'Boiled maize and kidney beans with a little oil, onion and tomato — standard recipe.',
   100, NULL, 120, 4.75, 17.40, 3.73, 0.51, 4.66, 1.09, 160, 212.2, 18.3, 1.66, 27.6, 1.61, NULL, NULL, 3.23, 60.0,
   250, '1 serving (250 g)', true, 'KE'),

  ('ACP standardized recipe', 'acp-recipe:chapati-v1', NULL, 'estimated',
   'Chapati (Kenyan-style flatbread)', 'Soft layered wheat-flour flatbread cooked with oil — standard recipe.',
   100, NULL, 386, 8.27, 61.05, 11.45, 1.59, 2.16, 0.21, NULL, 85.6, 12.0, 3.71, 17.6, NULL, NULL, NULL, NULL, 232.8,
   75, '1 chapati (75 g)', true, 'KE'),

  ('ACP standardized recipe', 'acp-recipe:mukimo-v1', NULL, 'estimated',
   'Mukimo (mashed potato, maize and greens)', 'Mashed potato with green maize and leafy greens, a little oil — standard recipe.',
   100, NULL, 107, 3.22, 17.72, 3.66, 0.50, 2.04, 1.64, 14, 354.4, 25.5, 1.44, 47.3, 7.30, NULL, NULL, 83.8, 37.0,
   220, '1 serving (220 g)', true, 'KE'),

  ('ACP standardized recipe', 'acp-recipe:pilau-v1', NULL, 'estimated',
   'Pilau (spiced rice, standard recipe)', 'Spiced rice cooked with oil and a small amount of lean beef — standard recipe.',
   100, NULL, 186, 5.91, 23.28, 7.37, 1.32, 0.46, 0.38, 7, 122.3, 10.6, 1.33, 16.9, 0.59, NULL, 0.28, NULL, 1.52,
   250, '1 serving (250 g)', true, 'KE'),

  ('USDA FoodData Central', 'srlegacy:09277', 168556, 'trusted_food_database',
   'Matoke (boiled green banana / plantain)', 'Plantains, cooked (boiled), no added fat. USDA proxy for East African cooking banana.',
   100, NULL, 116, 0.79, 31.15, 0.18, 0.069, 2.3, 14.0, 5, 465, 2, 0.58, 32, 10.9, NULL, NULL, 45, 24,
   200, '1 serving (200 g)', true, 'KE'),

  ('ACP standardized recipe', 'acp-recipe:uji-v1', NULL, 'estimated',
   'Uji (maize / millet porridge)', 'Thin fermented cereal porridge — standard recipe (maize meal + water). Density ≈ water.',
   100, 1.02, 39, 0.88, 8.36, 0.39, 0.05, 0.79, 0.07, NULL, 31.2, 0.65, 0.38, 13.8, 0, NULL, NULL, 1.20, 2.72,
   250, '1 cup (250 g / 245 ml)', true, 'KE'),

  ('USDA FoodData Central', 'srlegacy:11508', 168483, 'trusted_food_database',
   'Sweet potato, boiled (ngwaci)', 'Sweet potato, cooked, boiled, without skin, without salt.',
   100, NULL, 76, 1.37, 17.72, 0.14, 0.048, 2.5, 5.74, 27, 230, 27, 0.72, 18, 12.8, NULL, NULL, 961, 6,
   150, '1 medium (150 g)', true, 'KE'),

  -- ── Legumes / mixed ──
  ('ACP standardized recipe', 'acp-recipe:beans-stew-v1', NULL, 'estimated',
   'Beans, stewed (Kenyan-style, with tomato and onion)', 'Kidney/rosecoco beans stewed with tomato, onion and oil — standard recipe.',
   100, NULL, 152, 7.21, 19.98, 5.24, 0.78, 6.32, 1.18, 3, 377.8, 26.8, 2.42, 39.0, 4.03, NULL, NULL, 6.72, 106.3,
   200, '1 serving (200 g)', true, 'KE'),

  -- ── Vegetables ──
  ('ACP standardized recipe', 'acp-recipe:sukuma-wiki-v1', NULL, 'estimated',
   'Sukuma wiki (collard/kale greens, fried)', 'Leafy greens fried with oil, onion and tomato — standard recipe.',
   100, NULL, 91, 1.87, 7.13, 7.06, 0.97, 2.08, 2.04, 21, 266.8, 65.0, 0.81, 19.0, 36.9, NULL, NULL, 205.5, 14.0,
   150, '1 serving (150 g)', true, 'KE'),

  ('USDA FoodData Central', 'srlegacy:11109', 168601, 'trusted_food_database',
   'Cabbage, cooked', 'Cabbage, cooked, boiled, drained, without salt.',
   100, NULL, 23, 1.27, 5.51, 0.06, 0.014, 1.9, 2.79, 8, 196, 48, 0.17, 15, 37.5, NULL, NULL, 5, 30,
   150, '1 cup (150 g)', true, 'KE'),

  -- ── Proteins ──
  ('USDA FoodData Central', 'srlegacy:13364', 174725, 'trusted_food_database',
   'Nyama choma (grilled beef, lean)', 'Beef, round, top round, lean, cooked, broiled. Faithful proxy for lean grilled meat, no added fat.',
   100, NULL, 216, 30.6, 0, 9.4, 3.35, 0, 0, 44, 355, 6, 2.8, 27, NULL, NULL, 2.3, NULL, NULL,
   150, '1 serving (150 g)', true, 'KE'),

  -- ── Breakfast / snack ──
  ('ACP standardized recipe', 'acp-recipe:mandazi-v1', NULL, 'estimated',
   'Mandazi (fried sweet dough)', 'Lightly sweet deep-fried wheat dough — standard recipe.',
   100, NULL, 471, 8.26, 71.04, 16.78, 2.32, 2.16, 10.20, NULL, 85.6, 12.0, 3.72, 17.6, NULL, NULL, NULL, NULL, 232.8,
   50, '1 mandazi (50 g)', true, 'KE');

-- ── Named household measures. Model B dishes carry 'estimated' servings
--    (ACP standard-serving estimates); Model A carry 'trusted_food_database'.
--    Grams are documented practical portions, never invented for UX (N7.5 §15). ──
INSERT INTO public.food_servings (food_id, label, grams, source_type, sort_order)
SELECT f.id, v.label, v.grams, v.st, v.so
FROM public.foods f
JOIN (VALUES
  ('Ugali (maize meal / posho, cooked)',                 '1 small serving (150 g)',  150, 'estimated', 0),
  ('Ugali (maize meal / posho, cooked)',                 '1 serving (250 g)',        250, 'estimated', 1),
  ('Ugali (maize meal / posho, cooked)',                 '1 large serving (350 g)',  350, 'estimated', 2),
  ('Githeri (boiled maize and beans)',                   '1 serving (250 g)',        250, 'estimated', 0),
  ('Chapati (Kenyan-style flatbread)',                   '1 chapati (75 g)',          75, 'estimated', 0),
  ('Chapati (Kenyan-style flatbread)',                   '1 large chapati (100 g)',  100, 'estimated', 1),
  ('Mukimo (mashed potato, maize and greens)',           '1 serving (220 g)',        220, 'estimated', 0),
  ('Pilau (spiced rice, standard recipe)',               '1 serving (250 g)',        250, 'estimated', 0),
  ('Matoke (boiled green banana / plantain)',            '1 serving (200 g)',        200, 'trusted_food_database', 0),
  ('Uji (maize / millet porridge)',                      '1 cup (250 g / 245 ml)',   250, 'estimated', 0),
  ('Uji (maize / millet porridge)',                      '1 mug (350 g)',            350, 'estimated', 1),
  ('Sweet potato, boiled (ngwaci)',                      '1 medium (150 g)',         150, 'trusted_food_database', 0),
  ('Sweet potato, boiled (ngwaci)',                      '1 serving (200 g)',        200, 'trusted_food_database', 1),
  ('Beans, stewed (Kenyan-style, with tomato and onion)','1 serving (200 g)',        200, 'estimated', 0),
  ('Sukuma wiki (collard/kale greens, fried)',           '1 serving (150 g)',        150, 'estimated', 0),
  ('Cabbage, cooked',                                    '1 cup (150 g)',            150, 'trusted_food_database', 0),
  ('Nyama choma (grilled beef, lean)',                   '1 serving (150 g)',        150, 'trusted_food_database', 0),
  ('Nyama choma (grilled beef, lean)',                   '1 large serving (250 g)',  250, 'trusted_food_database', 1),
  ('Mandazi (fried sweet dough)',                        '1 mandazi (50 g)',          50, 'estimated', 0),
  ('Mandazi (fried sweet dough)',                        '2 mandazi (100 g)',        100, 'estimated', 1)
) AS v(fname, label, grams, st, so) ON f.name = v.fname AND f.country_code = 'KE';
