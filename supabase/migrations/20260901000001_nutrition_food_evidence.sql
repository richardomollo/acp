-- ACP Intelligence™ — Nutrition N1: Food Evidence Foundation.
--
-- Fully ADDITIVE. Does NOT touch meals / meal_plans / meal_plan_items /
-- meal_logs — the curated Kenyan meal library and trainer-assigned plans
-- keep working exactly as they do today. This migration introduces the
-- separate, canonical record of what a user ACTUALLY ate:
--
--   food_source  →  foods (canonical facts, per-100g, provenance attached)
--                →  food_servings (household measures → grams)
--                →  food_log_entries (the user's real log + a nutrient
--                                     SNAPSHOT frozen at log time)
--                →  nutrition_day (view: deterministic daily totals)
--
-- Principles encoded here (Nutrition N0 report):
--   • Structured nutrition FACTS live in structured columns, never RAG/LLM.
--   • Every canonical nutrient value is attributable to a source_type.
--   • NULL nutrient = UNKNOWN / not supplied by the source. 0 = measured zero.
--     These are kept distinct at every layer (column, snapshot, view).
--   • Portion is first-class: a log entry always resolves to quantity_grams
--     (or, for a name-only custom entry, stays NULL and contributes nothing).
--   • Micronutrient-CAPABLE from day one (N1 UI need not expose them all) so
--     N3 is a UI/backfill task, not a schema redesign.

-- ── foods: canonical food facts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foods (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provenance (mandatory — N0 §9 / N1 §5). `source` is the human-readable
  -- dataset name; `external_id` its stable id within that dataset;
  -- `source_type` the trust classification the app can reason about.
  source        text        NOT NULL,
  external_id   text,        -- stable id within `source` (USDA: the SR-Legacy NDB number)
  -- USDA FoodData Central numeric surrogate id. Directly fetchable at
  -- /fdc/v1/food/{fdc_id} — the trace food_log_entry → foods → USDA source
  -- record needs no manual lookup (N1 §6). NULL for non-USDA foods.
  fdc_id        bigint,
  source_type   text        NOT NULL CHECK (source_type IN (
                  'trusted_food_database', 'manufacturer', 'restaurant',
                  'acp_curated', 'user_custom', 'estimated'
                )),
  source_url    text,

  name          text        NOT NULL,
  brand         text,
  description   text,

  -- Nutrient reference basis. All nutrient columns below are the amount
  -- present in `basis_grams` grams of this food (default: per 100 g).
  -- `basis_unit` / `basis_amount` are for DISPLAY ONLY ("per 100 ml");
  -- scaling maths always goes through grams.
  basis_grams   numeric     NOT NULL DEFAULT 100 CHECK (basis_grams > 0),
  basis_unit    text        NOT NULL DEFAULT 'g' CHECK (basis_unit IN ('g', 'ml')),
  basis_amount  numeric     NOT NULL DEFAULT 100 CHECK (basis_amount > 0),

  -- Legitimate volume↔weight conversion ONLY where a real density is known
  -- (N1 §8). NULL → the food cannot be logged in ml; the UI must require g
  -- or a named serving. Never guessed.
  density_g_per_ml numeric  CHECK (density_g_per_ml IS NULL OR density_g_per_ml > 0),

  -- ── Nutrients per `basis_grams` g. ALL nullable. NULL = unknown. ──
  energy_kcal        numeric CHECK (energy_kcal IS NULL OR energy_kcal >= 0),
  protein_g          numeric CHECK (protein_g IS NULL OR protein_g >= 0),
  carbohydrate_g     numeric CHECK (carbohydrate_g IS NULL OR carbohydrate_g >= 0),
  fat_g             numeric CHECK (fat_g IS NULL OR fat_g >= 0),
  saturated_fat_g   numeric CHECK (saturated_fat_g IS NULL OR saturated_fat_g >= 0),
  fibre_g           numeric CHECK (fibre_g IS NULL OR fibre_g >= 0),
  sugar_g           numeric CHECK (sugar_g IS NULL OR sugar_g >= 0),
  sodium_mg         numeric CHECK (sodium_mg IS NULL OR sodium_mg >= 0),

  calcium_mg        numeric CHECK (calcium_mg IS NULL OR calcium_mg >= 0),
  iron_mg           numeric CHECK (iron_mg IS NULL OR iron_mg >= 0),
  magnesium_mg      numeric CHECK (magnesium_mg IS NULL OR magnesium_mg >= 0),
  phosphorus_mg     numeric CHECK (phosphorus_mg IS NULL OR phosphorus_mg >= 0),
  potassium_mg      numeric CHECK (potassium_mg IS NULL OR potassium_mg >= 0),
  zinc_mg           numeric CHECK (zinc_mg IS NULL OR zinc_mg >= 0),
  copper_mg         numeric CHECK (copper_mg IS NULL OR copper_mg >= 0),
  manganese_mg      numeric CHECK (manganese_mg IS NULL OR manganese_mg >= 0),
  selenium_ug       numeric CHECK (selenium_ug IS NULL OR selenium_ug >= 0),

  vitamin_a_ug      numeric CHECK (vitamin_a_ug IS NULL OR vitamin_a_ug >= 0),
  thiamin_b1_mg     numeric CHECK (thiamin_b1_mg IS NULL OR thiamin_b1_mg >= 0),
  riboflavin_b2_mg  numeric CHECK (riboflavin_b2_mg IS NULL OR riboflavin_b2_mg >= 0),
  niacin_b3_mg      numeric CHECK (niacin_b3_mg IS NULL OR niacin_b3_mg >= 0),
  pantothenic_b5_mg numeric CHECK (pantothenic_b5_mg IS NULL OR pantothenic_b5_mg >= 0),
  vitamin_b6_mg     numeric CHECK (vitamin_b6_mg IS NULL OR vitamin_b6_mg >= 0),
  biotin_b7_ug      numeric CHECK (biotin_b7_ug IS NULL OR biotin_b7_ug >= 0),
  folate_b9_ug      numeric CHECK (folate_b9_ug IS NULL OR folate_b9_ug >= 0),
  vitamin_b12_ug    numeric CHECK (vitamin_b12_ug IS NULL OR vitamin_b12_ug >= 0),
  vitamin_c_mg      numeric CHECK (vitamin_c_mg IS NULL OR vitamin_c_mg >= 0),
  vitamin_d_ug      numeric CHECK (vitamin_d_ug IS NULL OR vitamin_d_ug >= 0),
  vitamin_e_mg      numeric CHECK (vitamin_e_mg IS NULL OR vitamin_e_mg >= 0),
  vitamin_k_ug      numeric CHECK (vitamin_k_ug IS NULL OR vitamin_k_ug >= 0),

  -- Convenience default only; named options live in food_servings.
  default_serving_grams numeric CHECK (default_serving_grams IS NULL OR default_serving_grams > 0),
  default_serving_label text,

  is_generic    boolean     NOT NULL DEFAULT true,
  country_code  text,        -- ISO-3166 alpha-2, where the source is geo-specific
  language_code text        NOT NULL DEFAULT 'en',
  is_active     boolean     NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Canonicalization key (N1 §16): one canonical row per (dataset, external id).
-- A repeat search/log of the same source food reuses this row via upsert.
CREATE UNIQUE INDEX IF NOT EXISTS foods_source_external_uidx
  ON public.foods (source, external_id) WHERE external_id IS NOT NULL;

-- One canonical row per USDA FDC record; also the lookup key for a source audit.
CREATE UNIQUE INDEX IF NOT EXISTS foods_fdc_id_uidx
  ON public.foods (fdc_id) WHERE fdc_id IS NOT NULL;

-- Case-insensitive prefix/substring search — the N1 search is a debounced
-- name match (ilike '%q%'), deliberately simple (N1 §45). A trigram/FTS
-- index is a later optimisation, not needed at seed-set scale.
CREATE INDEX IF NOT EXISTS foods_name_lower_idx ON public.foods (lower(name) text_pattern_ops);

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

-- Canonical facts are readable by any signed-in user (N1 §30). No client
-- write path in N1: rows come from this migration's seed and, later, a
-- server-side provider sync. user_custom foods are deferred (N1 §13 → a
-- custom entry is a food_log_entries row with food_id NULL, name only).
CREATE POLICY "Foods are readable by authenticated users"
  ON public.foods FOR SELECT TO authenticated USING (is_active = true);

-- ── food_servings: named household measures → grams ────────────────────────
CREATE TABLE IF NOT EXISTS public.food_servings (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id     uuid    NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  label       text    NOT NULL,               -- "1 medium", "1 slice", "1 tbsp", "1 egg", "1 cup"
  grams       numeric NOT NULL CHECK (grams > 0),
  -- Where this measure came from (a source household measure vs an ACP
  -- estimate) — same trust vocabulary as foods.source_type.
  source_type text    NOT NULL DEFAULT 'trusted_food_database' CHECK (source_type IN (
                'trusted_food_database', 'manufacturer', 'restaurant', 'acp_curated', 'estimated'
              )),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (food_id, label)
);

CREATE INDEX IF NOT EXISTS food_servings_food_idx ON public.food_servings (food_id);

ALTER TABLE public.food_servings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Food servings are readable by authenticated users"
  ON public.food_servings FOR SELECT TO authenticated USING (true);

-- ── food_log_entries: the actual, user-owned food log ─────────────────────
CREATE TABLE IF NOT EXISTS public.food_log_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  logged_at       timestamptz NOT NULL DEFAULT now(),
  -- The user's LOCAL calendar day + their tz — daily totals are grouped by
  -- local_date so "today" matches the rest of this app's local-date model
  -- (lib/fulfilment.localISODate). Set by the client at write time.
  local_date      date        NOT NULL,
  timezone        text,

  meal_slot       text        CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- NULL for a name-only custom entry (N1 §13 option B) — such a row carries
  -- no nutrient snapshot and contributes nothing to totals.
  food_id         uuid        REFERENCES public.foods(id) ON DELETE SET NULL,
  display_name    text        NOT NULL,
  brand           text,

  quantity        numeric     NOT NULL CHECK (quantity > 0),
  unit            text        NOT NULL CHECK (unit IN ('g', 'ml', 'serving')),
  serving_label   text,                        -- set when unit = 'serving'
  -- The deterministic scaling basis actually used. NULL only for a name-only
  -- entry (or one whose unit could not be resolved to grams — the client
  -- must not create that; it's a hard guard).
  quantity_grams  numeric     CHECK (quantity_grams IS NULL OR quantity_grams > 0),

  capture_method  text        NOT NULL DEFAULT 'search' CHECK (capture_method IN (
                    'manual', 'search', 'plan', 'camera'
                  )),
  -- Provenance carried onto the log so history stays interpretable even if
  -- the canonical food row is later re-synced or deleted.
  source          text,
  source_type     text,

  note            text,       -- short, private; NEVER emitted to telemetry (N1 §31)

  -- ── Nutrient SNAPSHOT — the food's values SCALED to quantity_grams,
  --    frozen at log time (N1 §11/§12). ALL nullable; NULL = the source
  --    did not supply this nutrient (never coerced to 0). Same column set
  --    as foods so an N3 micronutrient UI reads one shape everywhere. ──
  energy_kcal        numeric CHECK (energy_kcal IS NULL OR energy_kcal >= 0),
  protein_g          numeric CHECK (protein_g IS NULL OR protein_g >= 0),
  carbohydrate_g     numeric CHECK (carbohydrate_g IS NULL OR carbohydrate_g >= 0),
  fat_g             numeric CHECK (fat_g IS NULL OR fat_g >= 0),
  saturated_fat_g   numeric CHECK (saturated_fat_g IS NULL OR saturated_fat_g >= 0),
  fibre_g           numeric CHECK (fibre_g IS NULL OR fibre_g >= 0),
  sugar_g           numeric CHECK (sugar_g IS NULL OR sugar_g >= 0),
  sodium_mg         numeric CHECK (sodium_mg IS NULL OR sodium_mg >= 0),
  calcium_mg        numeric CHECK (calcium_mg IS NULL OR calcium_mg >= 0),
  iron_mg           numeric CHECK (iron_mg IS NULL OR iron_mg >= 0),
  magnesium_mg      numeric CHECK (magnesium_mg IS NULL OR magnesium_mg >= 0),
  phosphorus_mg     numeric CHECK (phosphorus_mg IS NULL OR phosphorus_mg >= 0),
  potassium_mg      numeric CHECK (potassium_mg IS NULL OR potassium_mg >= 0),
  zinc_mg           numeric CHECK (zinc_mg IS NULL OR zinc_mg >= 0),
  copper_mg         numeric CHECK (copper_mg IS NULL OR copper_mg >= 0),
  manganese_mg      numeric CHECK (manganese_mg IS NULL OR manganese_mg >= 0),
  selenium_ug       numeric CHECK (selenium_ug IS NULL OR selenium_ug >= 0),
  vitamin_a_ug      numeric CHECK (vitamin_a_ug IS NULL OR vitamin_a_ug >= 0),
  thiamin_b1_mg     numeric CHECK (thiamin_b1_mg IS NULL OR thiamin_b1_mg >= 0),
  riboflavin_b2_mg  numeric CHECK (riboflavin_b2_mg IS NULL OR riboflavin_b2_mg >= 0),
  niacin_b3_mg      numeric CHECK (niacin_b3_mg IS NULL OR niacin_b3_mg >= 0),
  pantothenic_b5_mg numeric CHECK (pantothenic_b5_mg IS NULL OR pantothenic_b5_mg >= 0),
  vitamin_b6_mg     numeric CHECK (vitamin_b6_mg IS NULL OR vitamin_b6_mg >= 0),
  biotin_b7_ug      numeric CHECK (biotin_b7_ug IS NULL OR biotin_b7_ug >= 0),
  folate_b9_ug      numeric CHECK (folate_b9_ug IS NULL OR folate_b9_ug >= 0),
  vitamin_b12_ug    numeric CHECK (vitamin_b12_ug IS NULL OR vitamin_b12_ug >= 0),
  vitamin_c_mg      numeric CHECK (vitamin_c_mg IS NULL OR vitamin_c_mg >= 0),
  vitamin_d_ug      numeric CHECK (vitamin_d_ug IS NULL OR vitamin_d_ug >= 0),
  vitamin_e_mg      numeric CHECK (vitamin_e_mg IS NULL OR vitamin_e_mg >= 0),
  vitamin_k_ug      numeric CHECK (vitamin_k_ug IS NULL OR vitamin_k_ug >= 0),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_log_entries_user_date_idx
  ON public.food_log_entries (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS food_log_entries_user_food_idx
  ON public.food_log_entries (user_id, food_id, logged_at DESC);

ALTER TABLE public.food_log_entries ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs (N1 §30). A user's food log is private
-- evidence — no trainer/share policy in N1.
CREATE POLICY "Users view own food log"
  ON public.food_log_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own food log"
  ON public.food_log_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own food log"
  ON public.food_log_entries FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own food log"
  ON public.food_log_entries FOR DELETE USING (user_id = auth.uid());

-- ── nutrition_day: deterministic daily totals (N1 §21/§22) ────────────────
-- A VIEW, not a table — no second mutable source of truth (N0 §W). Totals
-- are always exactly the sum of that day's entry snapshots. `security_invoker`
-- so the caller's RLS on food_log_entries applies (a user only ever sees
-- their own rows). SUM(...) over an all-NULL nutrient across a day yields
-- NULL → coalesced to 0 for the four macros + fibre that N1 surfaces;
-- micronutrient sums are intentionally left raw so "unknown" stays visible
-- to N3.
CREATE OR REPLACE VIEW public.nutrition_day
WITH (security_invoker = true) AS
SELECT
  user_id,
  local_date,
  count(*)                             AS entry_count,
  count(*) FILTER (WHERE food_id IS NULL) AS custom_entry_count,
  COALESCE(sum(energy_kcal), 0)        AS energy_kcal,
  COALESCE(sum(protein_g), 0)          AS protein_g,
  COALESCE(sum(carbohydrate_g), 0)     AS carbohydrate_g,
  COALESCE(sum(fat_g), 0)              AS fat_g,
  COALESCE(sum(fibre_g), 0)            AS fibre_g,
  sum(sugar_g)          AS sugar_g,
  sum(saturated_fat_g)  AS saturated_fat_g,
  sum(sodium_mg)        AS sodium_mg,
  sum(calcium_mg)       AS calcium_mg,
  sum(iron_mg)          AS iron_mg,
  sum(magnesium_mg)     AS magnesium_mg,
  sum(phosphorus_mg)    AS phosphorus_mg,
  sum(potassium_mg)     AS potassium_mg,
  sum(zinc_mg)          AS zinc_mg,
  sum(selenium_ug)      AS selenium_ug,
  sum(vitamin_a_ug)     AS vitamin_a_ug,
  sum(folate_b9_ug)     AS folate_b9_ug,
  sum(vitamin_b12_ug)   AS vitamin_b12_ug,
  sum(vitamin_c_mg)     AS vitamin_c_mg,
  sum(vitamin_d_ug)     AS vitamin_d_ug
FROM public.food_log_entries
GROUP BY user_id, local_date;
