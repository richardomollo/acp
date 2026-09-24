-- Lana Nutrition — Monthly → Weekly → Daily Planning V1.
--
-- Three new, purely additive tables. Nothing existing is touched: `meals`,
-- `meal_plans`/`meal_plan_items` (trainer-assigned plans), `saved_meals`,
-- `food_recipes`, `foods`, `food_log_entries`, and the dormant Beta #022
-- `nutrition_recommendation_events` system all stay exactly as they are.
--
-- Architecture mirrors two proven, already-shipped patterns audited before
-- writing this:
--   • fitness_plans' scheduled -> active -> superseded promotion state
--     machine (apps/web/app/api/ai/weekly-adaptation/route.ts) — reused
--     here as scheduled -> current -> completed, so a week can be prepared
--     ahead of time (product spec §31) without ever becoming what Today
--     reads until its own start_date actually arrives.
--   • nutrition_recommendation_events' one-row-per-(user,date,slot)
--     RECOMMENDED/PLANNED/CONSUMED/REPLACED lifecycle (migration
--     20260907000001) — reused here as nutrition_planned_meals, but
--     pointing at canonical food_recipes/foods instead of legacy
--     meals/saved_meals (spec §0/§12: every planned meal must resolve to a
--     canonical recipe + canonical food + deterministic quantity).

-- ── nutrition_planning_cycles — the monthly/4-week strategy ────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_planning_cycles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL, -- start_date + 27 days (a rolling 4-week cycle, never assumed to equal a calendar month)
  -- Snapshot of fitness_profile.goal at cycle-creation time — a later goal
  -- change never silently rewrites an in-progress cycle's own strategy
  -- (spec §19); a new cycle picks up the new goal instead.
  goal        text,
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date),
  UNIQUE (user_id, start_date) -- idempotent cycle creation
);

ALTER TABLE public.nutrition_planning_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition planning cycles"
  ON public.nutrition_planning_cycles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX nutrition_planning_cycles_user_idx ON public.nutrition_planning_cycles (user_id, start_date DESC);

-- ── nutrition_weekly_plans — one week's executable objective ───────────────
CREATE TABLE IF NOT EXISTS public.nutrition_weekly_plans (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid        NOT NULL REFERENCES public.nutrition_planning_cycles(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date date        NOT NULL, -- Monday
  week_end_date   date        NOT NULL, -- Sunday
  -- One deterministic, evidence-conditioned sentence (never LLM-invented —
  -- see lib/nutrition/monthly-nutrition-strategy.ts). objective_reason is an
  -- internal evidence trail, never shown as a "reason code" in the UI.
  objective        text        NOT NULL,
  objective_reason text,
  -- scheduled: prepared ahead of its own start_date, never read by Today.
  -- current:   the one week Today/execution actually reflects.
  -- completed: week_end_date has passed.
  -- Promotion (scheduled -> current, prior current -> completed) happens in
  -- the service layer on the first request on/after week_start_date — never
  -- a cron job, never silently regenerated (spec §31/§33/§34).
  status          text        NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'current', 'completed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (week_end_date > week_start_date),
  UNIQUE (user_id, week_start_date) -- idempotent weekly generation
);

ALTER TABLE public.nutrition_weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition weekly plans"
  ON public.nutrition_weekly_plans FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX nutrition_weekly_plans_user_idx ON public.nutrition_weekly_plans (user_id, week_start_date DESC);
CREATE INDEX nutrition_weekly_plans_cycle_idx ON public.nutrition_weekly_plans (cycle_id);

-- ── nutrition_planned_meals — one planned occurrence per (user, date, slot) ─
CREATE TABLE IF NOT EXISTS public.nutrition_planned_meals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id  uuid        NOT NULL REFERENCES public.nutrition_weekly_plans(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date      date        NOT NULL,
  meal_slot       text        NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- RECOMMENDED — frozen at generation time, never overwritten by a swap
  -- (mirrors nutrition_recommendation_events exactly).
  recommended_recipe_id uuid REFERENCES public.food_recipes(id) ON DELETE SET NULL,
  recommended_food_id   uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  recommended_label     text NOT NULL,
  recommended_grams     numeric CHECK (recommended_grams IS NULL OR recommended_grams > 0),
  recommendation_reason text, -- a fixed, deterministic reason string — never AI-invented

  -- PLANNED — what the user currently intends. Starts equal to recommended;
  -- a swap replaces these fields only (recommended_* stays historical).
  planned_recipe_id uuid REFERENCES public.food_recipes(id) ON DELETE SET NULL,
  planned_food_id   uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  planned_label     text NOT NULL,
  planned_grams     numeric NOT NULL CHECK (planned_grams > 0),
  swapped           boolean NOT NULL DEFAULT false,

  -- CONSUMED — filled once the user actually logs something for this slot.
  -- Points at the real N1 evidence; no nutrient numbers duplicated here,
  -- exactly like nutrition_recommendation_events.
  consumed_log_group_id uuid,
  consumed_at            timestamptz,

  -- recommended -> nothing logged yet, still today's suggestion.
  -- planned     -> swapped but not yet logged.
  -- consumed    -> the user logged the planned recipe itself.
  -- replaced    -> the user logged something else entirely; planned/
  --                recommended stay as historical evidence, consumed_*
  --                still records what was actually eaten.
  -- skipped     -> the user explicitly marked this slot as not happening
  --                today — distinct from simply not-yet-logged.
  status          text        NOT NULL DEFAULT 'recommended'
                               CHECK (status IN ('recommended', 'planned', 'consumed', 'replaced', 'skipped')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, local_date, meal_slot)
);

ALTER TABLE public.nutrition_planned_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition planned meals"
  ON public.nutrition_planned_meals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX nutrition_planned_meals_user_date_idx ON public.nutrition_planned_meals (user_id, local_date);
CREATE INDEX nutrition_planned_meals_weekly_plan_idx ON public.nutrition_planned_meals (weekly_plan_id);

-- updated_at maintenance (reuses the existing shared trigger function).
CREATE TRIGGER nutrition_weekly_plans_updated_at BEFORE UPDATE ON public.nutrition_weekly_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER nutrition_planned_meals_updated_at BEFORE UPDATE ON public.nutrition_planned_meals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
