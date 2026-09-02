-- ── ACP Nutrition Hub ────────────────────────────────────────────────────────
-- Schema: meals, nutrition_profile, meal_plans, meal_plan_items, meal_logs.
-- Mirrors the Fitness Hub's shape throughout: meals is a publicly-readable,
-- admin-curated library like exercises; meal_plans/meal_plan_items follow the
-- workouts/workout_exercises self-owned-or-trainer-assigned pattern from
-- 20260724000001_user_workouts.sql + 20260726000001_pt_clients_workout_assignment.sql;
-- meal_logs is a toggle-per-day table like client_tasks/daily_checkins;
-- nutrition_profile mirrors fitness_profile including trainer visibility.
-- "Nutritionist" is not a new role — it's a personal_trainers row with
-- 'Nutrition' in specialisations, so all trainer-side policies here reuse
-- personal_trainers/pt_clients exactly as the fitness side does.

-- ── Meals (curated library) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  category          text        NOT NULL CHECK (category IN ('breakfast', 'lunch', 'dinner', 'snack', 'smoothie')),
  description       text,
  image_url         text,
  ingredients       text[]      NOT NULL DEFAULT '{}',
  calories          integer,
  protein_g         numeric,
  carbs_g           numeric,
  fat_g             numeric,
  fibre_g           numeric,
  prep_time_minutes integer,
  difficulty        text        CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  tags              text[]      NOT NULL DEFAULT '{}',
  cuisine           text        NOT NULL DEFAULT 'Kenyan',
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meals are publicly readable"
  ON public.meals FOR SELECT USING (is_active = true);

CREATE POLICY "Admins have full access to meals"
  ON public.meals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX meals_category_idx ON public.meals (category);

-- ── Nutrition Profile ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nutrition_profile (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal              text CHECK (goal IN ('lose_weight', 'build_muscle', 'improve_fitness', 'maintain_weight', 'eat_healthier')),
  cuisine_preference text CHECK (cuisine_preference IN ('kenyan', 'mixed', 'vegetarian')),
  starting_weight_kg numeric,
  goal_weight_kg    numeric,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own nutrition profile"
  ON public.nutrition_profile FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users upsert own nutrition profile"
  ON public.nutrition_profile FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own nutrition profile"
  ON public.nutrition_profile FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Trainers view shared nutrition profile"
  ON public.nutrition_profile FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = nutrition_profile.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );

-- ── Meal Plans ───────────────────────────────────────────────────────────────
-- user_id: the client/owner. assigned_by: nullable — set when a nutritionist
-- (a personal_trainers row) created/assigned this plan, mirrors workouts.

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by  uuid        REFERENCES public.personal_trainers(id) ON DELETE SET NULL,
  name         text        NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal plans"
  ON public.meal_plans FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Trainers view assigned meal plans"
  ON public.meal_plans FOR SELECT
  USING (assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers assign meal plans to active clients"
  ON public.meal_plans FOR INSERT
  WITH CHECK (
    assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = assigned_by AND client_user_id = meal_plans.user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers update own assigned meal plans"
  ON public.meal_plans FOR UPDATE
  USING (assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE INDEX meal_plans_user_id_idx ON public.meal_plans (user_id);
CREATE INDEX meal_plans_assigned_by_idx ON public.meal_plans (assigned_by);

-- ── Meal Plan Items (flat child, like workout_exercises) ────────────────────

CREATE TABLE IF NOT EXISTS public.meal_plan_items (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id  uuid    NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_slot     text    NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  meal_id       uuid    NOT NULL REFERENCES public.meals(id),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own meal plan items"
  ON public.meal_plan_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.meal_plans WHERE id = meal_plan_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meal_plans WHERE id = meal_plan_id AND user_id = auth.uid()));

CREATE POLICY "Trainers manage items on assigned meal plans"
  ON public.meal_plan_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      JOIN public.personal_trainers pt ON pt.id = mp.assigned_by
      WHERE mp.id = meal_plan_id AND pt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp
      JOIN public.personal_trainers pt ON pt.id = mp.assigned_by
      WHERE mp.id = meal_plan_id AND pt.user_id = auth.uid()
    )
  );

CREATE INDEX meal_plan_items_meal_plan_id_idx ON public.meal_plan_items (meal_plan_id);

-- ── Meal Logs (toggle-per-day, like client_tasks) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.meal_logs (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_plan_item_id  uuid    NOT NULL REFERENCES public.meal_plan_items(id) ON DELETE CASCADE,
  log_date           date    NOT NULL,
  status             text    NOT NULL CHECK (status IN ('eaten', 'skipped')),
  logged_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meal_plan_item_id, log_date)
);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal logs"
  ON public.meal_logs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Trainers view shared meal logs"
  ON public.meal_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = meal_logs.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );

CREATE INDEX meal_logs_user_date_idx ON public.meal_logs (user_id, log_date);

-- ── Hydration: extend the existing per-day check-in table ───────────────────
-- mood was NOT NULL (a checkin always meant a mood entry) — relaxed so a user
-- can log water intake for a day without being forced to also log a mood.

ALTER TABLE public.daily_checkins ADD COLUMN IF NOT EXISTS water_liters numeric;
ALTER TABLE public.daily_checkins ALTER COLUMN mood DROP NOT NULL;
ALTER TABLE public.daily_checkins ADD CONSTRAINT daily_checkins_mood_or_water
  CHECK (mood IS NOT NULL OR water_liters IS NOT NULL);
