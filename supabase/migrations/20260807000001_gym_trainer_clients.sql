-- Gives gym-employed staff trainers (gym_trainers) the same client-roster +
-- Fitness Hub / Nutrition Hub assignment capability independent personal
-- trainers already have via pt_clients / workouts.assigned_by /
-- meal_plans.assigned_by. Purely additive: a parallel roster table plus a
-- second nullable assigned_by column on workouts/meal_plans, with new RLS
-- policies mirroring the existing personal_trainers ones exactly — none of
-- the existing personal_trainers/pt_clients tables or policies are touched.

CREATE TABLE public.gym_trainer_clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_trainer_id uuid NOT NULL REFERENCES public.gym_trainers(id) ON DELETE CASCADE,
  client_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  share_progress boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_trainer_id, client_user_id)
);

ALTER TABLE public.gym_trainer_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gym trainers view own roster"
  ON public.gym_trainer_clients FOR SELECT
  USING (gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers create client roster rows"
  ON public.gym_trainer_clients FOR INSERT
  WITH CHECK (gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers update own roster"
  ON public.gym_trainer_clients FOR UPDATE
  USING (gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers remove own roster rows"
  ON public.gym_trainer_clients FOR DELETE
  USING (gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Clients view own gym trainer relationships"
  ON public.gym_trainer_clients FOR SELECT
  USING (client_user_id = auth.uid());

CREATE POLICY "Clients update own gym trainer sharing preference"
  ON public.gym_trainer_clients FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

CREATE POLICY "Clients can remove gym trainer relationship"
  ON public.gym_trainer_clients FOR DELETE
  USING (client_user_id = auth.uid());

-- ── workouts / workout_exercises ────────────────────────────────────────────

ALTER TABLE public.workouts
  ADD COLUMN assigned_by_gym_trainer_id uuid REFERENCES public.gym_trainers(id) ON DELETE SET NULL;

CREATE POLICY "Gym trainers view assigned workouts"
  ON public.workouts FOR SELECT
  USING (assigned_by_gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers assign workouts to active clients"
  ON public.workouts FOR INSERT
  WITH CHECK (
    assigned_by_gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gym_trainer_clients
      WHERE gym_trainer_id = workouts.assigned_by_gym_trainer_id
        AND client_user_id = workouts.user_id
        AND status = 'active'
    )
  );

CREATE POLICY "Gym trainers manage exercises on assigned workouts"
  ON public.workout_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w JOIN public.gym_trainers gt ON gt.id = w.assigned_by_gym_trainer_id
      WHERE w.id = workout_exercises.workout_id AND gt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts w JOIN public.gym_trainers gt ON gt.id = w.assigned_by_gym_trainer_id
      WHERE w.id = workout_exercises.workout_id AND gt.user_id = auth.uid()
    )
  );

-- ── meal_plans / meal_plan_items ────────────────────────────────────────────

ALTER TABLE public.meal_plans
  ADD COLUMN assigned_by_gym_trainer_id uuid REFERENCES public.gym_trainers(id) ON DELETE SET NULL;

CREATE POLICY "Gym trainers view assigned meal plans"
  ON public.meal_plans FOR SELECT
  USING (assigned_by_gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers assign meal plans to active clients"
  ON public.meal_plans FOR INSERT
  WITH CHECK (
    assigned_by_gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gym_trainer_clients
      WHERE gym_trainer_id = meal_plans.assigned_by_gym_trainer_id
        AND client_user_id = meal_plans.user_id
        AND status = 'active'
    )
  );

CREATE POLICY "Gym trainers update own assigned meal plans"
  ON public.meal_plans FOR UPDATE
  USING (assigned_by_gym_trainer_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Gym trainers manage items on assigned meal plans"
  ON public.meal_plan_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp JOIN public.gym_trainers gt ON gt.id = mp.assigned_by_gym_trainer_id
      WHERE mp.id = meal_plan_items.meal_plan_id AND gt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_plans mp JOIN public.gym_trainers gt ON gt.id = mp.assigned_by_gym_trainer_id
      WHERE mp.id = meal_plan_items.meal_plan_id AND gt.user_id = auth.uid()
    )
  );
