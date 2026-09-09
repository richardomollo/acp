-- LANA PRO — Workout Template foundation.
--
-- The audit established that `public.workouts` is a CLIENT-BOUND prescribed
-- session (referenced live by `workout_schedules` and `workout_history`), that
-- a PT cannot own or edit a client-independent workout, and that reusing
-- `workouts` as a template would mutate historical prescription truth.
--
-- This migration adds the TEMPLATE layer as two NEW tables. Nothing existing
-- is altered:
--
--   WORKOUT TEMPLATE  (reusable, owned by exactly ONE professional)
--        │  copy-on-assign (application layer, later task)
--        ▼
--   CLIENT-BOUND WORKOUT SNAPSHOT   → workout_schedules → workout_history
--
-- No is_template flag on `workouts`, no loosened `workouts` RLS, no
-- `source_template_id`, no backfill, no seed. Editing a template touches
-- nothing under `workouts`/`workout_exercises`/`workout_schedules`/
-- `workout_history`/`workout_set_logs`.

begin;

-- ── workout_templates ─────────────────────────────────────────────────────
-- location_type / difficulty reuse the canonical `workouts` CHECK vocabularies
-- verbatim so a template copies into `workouts` with no lossy mapping.
-- `category` is free text NOT NULL, exactly like `workouts.category`.
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- exactly one professional owner (enforced by the CHECK below); ownership is
  -- immutable after insert (enforced by the trigger below).
  owner_pt_id                 uuid REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  owner_gym_trainer_id        uuid REFERENCES public.gym_trainers(id)      ON DELETE CASCADE,

  title                       text NOT NULL,
  description                 text,
  category                    text NOT NULL,
  location_type               text NOT NULL DEFAULT 'both'
                                CHECK (location_type IN ('home', 'gym', 'both')),
  difficulty                  text NOT NULL DEFAULT 'intermediate'
                                CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  -- nullable: the manual builder cannot always compute a duration reliably;
  -- assignment supplies the client workout's NOT NULL duration_minutes.
  estimated_duration_minutes  integer
                                CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),

  -- how the reusable template originated. NOT a claim of ownership — once the
  -- PT saves a Lana-generated draft, the professional owns it.
  source                      text NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual', 'lana_generated')),

  -- the supported product removal mechanism (no hard delete in V1). Set by the
  -- owner; leaves every client workout/history row untouched.
  archived_at                 timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workout_templates_one_owner_chk
    CHECK ((owner_pt_id IS NOT NULL) <> (owner_gym_trainer_id IS NOT NULL))
);

-- ── workout_template_exercises ───────────────────────────────────────────
-- Mirrors the useful prescription fields of `workout_exercises`. `exercise_id`
-- references the canonical library with the SAME (NO ACTION) delete behaviour
-- as `workout_exercises.exercise_id` — an exercise still referenced cannot be
-- deleted. Repeated exercise_id within one template is allowed (blocks / supersets).
CREATE TABLE IF NOT EXISTS public.workout_template_exercises (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id      uuid NOT NULL REFERENCES public.exercises(id),
  sort_order       integer NOT NULL CHECK (sort_order >= 0),
  sets             integer CHECK (sets IS NULL OR sets > 0),
  reps             integer CHECK (reps IS NULL OR reps > 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  rest_seconds     integer NOT NULL DEFAULT 60 CHECK (rest_seconds >= 0),
  load_guidance    text,
  notes            text
);

-- ── ownership immutability (§42) ─────────────────────────────────────────
-- RLS WITH CHECK cannot compare OLD vs NEW, so a trigger locks both owner
-- columns after insert. Owner transfer / owner-type switch is never allowed
-- (no such product feature).
CREATE OR REPLACE FUNCTION public.workout_templates_lock_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_pt_id IS DISTINCT FROM OLD.owner_pt_id
     OR NEW.owner_gym_trainer_id IS DISTINCT FROM OLD.owner_gym_trainer_id THEN
    RAISE EXCEPTION 'workout_templates ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workout_templates_lock_owner
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.workout_templates_lock_owner();

-- ── updated_at (reuses the canonical helper from 20260524000001) ─────────
CREATE TRIGGER workout_templates_updated_at
  BEFORE UPDATE ON public.workout_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS workout_templates_owner_pt_idx
  ON public.workout_templates (owner_pt_id) WHERE owner_pt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workout_templates_owner_gym_trainer_idx
  ON public.workout_templates (owner_gym_trainer_id) WHERE owner_gym_trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workout_template_exercises_template_order_idx
  ON public.workout_template_exercises (template_id, sort_order);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.workout_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_template_exercises ENABLE ROW LEVEL SECURITY;

-- caller owns the template row: their auth.uid() maps to the non-null owner.
--   independent PT  → owner_pt_id ∈ personal_trainers(user_id = auth.uid())
--   gym trainer     → owner_gym_trainer_id ∈ gym_trainers(user_id = auth.uid())
CREATE POLICY "Professionals view own workout templates"
  ON public.workout_templates FOR SELECT
  USING (
    (owner_pt_id IS NOT NULL AND owner_pt_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
    OR
    (owner_gym_trainer_id IS NOT NULL AND owner_gym_trainer_id IN (
      SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
  );

CREATE POLICY "Professionals create own workout templates"
  ON public.workout_templates FOR INSERT
  WITH CHECK (
    (owner_pt_id IS NOT NULL AND owner_pt_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
    OR
    (owner_gym_trainer_id IS NOT NULL AND owner_gym_trainer_id IN (
      SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
  );

CREATE POLICY "Professionals update own workout templates"
  ON public.workout_templates FOR UPDATE
  USING (
    (owner_pt_id IS NOT NULL AND owner_pt_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
    OR
    (owner_gym_trainer_id IS NOT NULL AND owner_gym_trainer_id IN (
      SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    (owner_pt_id IS NOT NULL AND owner_pt_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
    OR
    (owner_gym_trainer_id IS NOT NULL AND owner_gym_trainer_id IN (
      SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
  );
-- No DELETE policy: hard delete is not a V1 product flow. `archived_at` is the
-- supported removal mechanism. Add an explicit owner DELETE policy later only
-- if a real need emerges.

-- template exercises: access is inherited from the parent template's owner,
-- for every verb (removing an exercise from a template IS allowed; only the
-- template row itself cannot be hard-deleted).
CREATE POLICY "Professionals manage own template exercises"
  ON public.workout_template_exercises FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.workout_templates t
    WHERE t.id = workout_template_exercises.template_id
      AND (
        (t.owner_pt_id IS NOT NULL AND t.owner_pt_id IN (
          SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
        OR
        (t.owner_gym_trainer_id IS NOT NULL AND t.owner_gym_trainer_id IN (
          SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_templates t
    WHERE t.id = workout_template_exercises.template_id
      AND (
        (t.owner_pt_id IS NOT NULL AND t.owner_pt_id IN (
          SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()))
        OR
        (t.owner_gym_trainer_id IS NOT NULL AND t.owner_gym_trainer_id IN (
          SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()))
      )
  ));

comment on table public.workout_templates is
  'Lana Pro: a reusable workout prescription owned by exactly one professional (owner_pt_id XOR owner_gym_trainer_id). Not client-bound, not scheduled, not history. Assignment COPIES it into a client workouts row — later task.';
comment on table public.workout_template_exercises is
  'Ordered exercise prescription for a workout_templates row. Mirrors workout_exercises; access inherited from the parent template owner.';

commit;
