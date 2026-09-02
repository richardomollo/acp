-- ACP Intelligence™ — Nutrition N6: Saved Meals (My Meals).
--
-- Fully ADDITIVE. Introduces a USER-OWNED, reusable RECIPE for creating N1
-- food evidence — never an opaque nutrition total (N6 §2/§7):
--
--   saved_meals        →  a named collection a user eats repeatedly
--   saved_meal_items   →  its canonical-food components + confirmed portions
--
-- A saved meal definition is NOT dietary evidence. Only LOGGING it creates
-- evidence: N1 resolves each component to grams and freezes a nutrient
-- snapshot per component, producing ordinary food_log_entries rows that
-- N2/N3/N4 already understand with zero special-casing (N6 §33-§35).
--
-- Does NOT touch: meals / meal_plans / meal_plan_items / meal_logs (the
-- curated Kenyan library + trainer plans — N6 §21), the I0 baseline, or the
-- N1 migrations. Two small ADDITIVE changes to food_log_entries below
-- (nullable columns + one widened CHECK) record which rows were logged
-- together as one occurrence, without altering any N1/N2 assumption.

-- ── saved_meals: the reusable definition ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_meals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Duplicate names are allowed (N6 §27): the UX distinguishes by contents +
-- updated date; a global/user uniqueness constraint would only get in the way.
CREATE INDEX IF NOT EXISTS saved_meals_user_idx
  ON public.saved_meals (user_id, updated_at DESC);

ALTER TABLE public.saved_meals ENABLE ROW LEVEL SECURITY;

-- Owner-only, all four verbs (N6 §29). A saved meal is private nutrition
-- information — no trainer/share policy.
CREATE POLICY "Users view own saved meals"
  ON public.saved_meals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own saved meals"
  ON public.saved_meals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own saved meals"
  ON public.saved_meals FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own saved meals"
  ON public.saved_meals FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER saved_meals_updated_at
  BEFORE UPDATE ON public.saved_meals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── saved_meal_items: canonical-food components + confirmed portions ──────
-- Source of truth is COMPONENTS + PORTIONS (N6 §7) — there is deliberately no
-- cached calorie/macro column. Every component references a shared, read-only
-- canonical food; name-only "custom" foods cannot be components (N6 §20) —
-- there is nothing to reproduce and nothing to calculate.
CREATE TABLE IF NOT EXISTS public.saved_meal_items (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_meal_id  uuid    NOT NULL REFERENCES public.saved_meals(id) ON DELETE CASCADE,
  food_id        uuid    NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,

  -- Same portion vocabulary as food_log_entries (N1). Resolution to grams
  -- always goes through N1's resolveGrams at log time — a saved meal never
  -- bypasses it (N6 §17): 'ml' still requires a real density, a named
  -- 'serving' still requires a known food_servings label.
  quantity       numeric NOT NULL CHECK (quantity > 0),
  unit           text    NOT NULL CHECK (unit IN ('g', 'ml', 'serving')),
  serving_label  text,                       -- set when unit = 'serving'

  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_meal_items_meal_idx
  ON public.saved_meal_items (saved_meal_id, sort_order);

ALTER TABLE public.saved_meal_items ENABLE ROW LEVEL SECURITY;

-- Child ownership is enforced through the parent (N6 §29): a row is visible/
-- writable only if its saved_meal belongs to the caller.
CREATE POLICY "Users view items of own saved meals"
  ON public.saved_meal_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.saved_meals m WHERE m.id = saved_meal_id AND m.user_id = auth.uid()));
CREATE POLICY "Users insert items into own saved meals"
  ON public.saved_meal_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.saved_meals m WHERE m.id = saved_meal_id AND m.user_id = auth.uid()));
CREATE POLICY "Users update items of own saved meals"
  ON public.saved_meal_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.saved_meals m WHERE m.id = saved_meal_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.saved_meals m WHERE m.id = saved_meal_id AND m.user_id = auth.uid()));
CREATE POLICY "Users delete items of own saved meals"
  ON public.saved_meal_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.saved_meals m WHERE m.id = saved_meal_id AND m.user_id = auth.uid()));

CREATE TRIGGER saved_meal_items_updated_at
  BEFORE UPDATE ON public.saved_meal_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── food_log_entries: occurrence grouping (additive, nullable) ────────────
-- N1's food_log_entries has no field that groups several foods as ONE eating
-- event (meal_slot is not enough — multiple snacks share a slot/day, N6 §13).
-- Two nullable columns fix that WITHOUT changing what a row means: each row is
-- still one canonical food with its own frozen snapshot and is still the unit
-- of nutrition evidence (N2/N3/N4 never read these columns).
--
--   log_group_id  — a client-generated id shared by every row written in one
--                   log action. Lets the UI show / edit / delete a logged
--                   meal as a group (N6 §41/§42) and is reusable by a future
--                   "save this photographed meal" flow (N6 §24).
--   saved_meal_id — provenance: this occurrence was logged FROM saved meal X.
--                   ON DELETE SET NULL so deleting the definition never
--                   touches historical evidence (N6 §28).
ALTER TABLE public.food_log_entries
  ADD COLUMN IF NOT EXISTS log_group_id  uuid,
  ADD COLUMN IF NOT EXISTS saved_meal_id uuid REFERENCES public.saved_meals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS food_log_entries_log_group_idx
  ON public.food_log_entries (user_id, log_group_id) WHERE log_group_id IS NOT NULL;

-- 'saved_meal' is the honest description of how such rows were logged — the
-- user picked a saved meal, not a single search result. N2/N3/N4 ignore
-- capture_method for nutrition, so this only sharpens history/telemetry.
ALTER TABLE public.food_log_entries
  DROP CONSTRAINT IF EXISTS food_log_entries_capture_method_check;
ALTER TABLE public.food_log_entries
  ADD CONSTRAINT food_log_entries_capture_method_check
  CHECK (capture_method IN ('manual', 'search', 'plan', 'camera', 'saved_meal'));
