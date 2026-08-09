-- Extends workout_schedules with trainer scheduling (recurrence + location for
-- a specific scheduled in-person session) and client_tasks with recurrence.
-- Reuses the existing client self-scheduling machinery rather than forking new
-- tables — a trainer-scheduled workout is the same real-world concept as a
-- client's own recurring reminder, just with an assigned_by trainer attached.

-- ── workout_schedules: trainer scheduling + location ────────────────────────

ALTER TABLE public.workout_schedules
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_type text CHECK (location_type IN ('gym', 'home', 'outdoor')),
  ADD COLUMN IF NOT EXISTS location_address text;

CREATE POLICY "Trainers schedule workouts for active clients"
  ON public.workout_schedules FOR INSERT
  WITH CHECK (
    assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = assigned_by AND client_user_id = workout_schedules.user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers view schedules they created"
  ON public.workout_schedules FOR SELECT
  USING (assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers update schedules they created"
  ON public.workout_schedules FOR UPDATE
  USING (assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers delete schedules they created"
  ON public.workout_schedules FOR DELETE
  USING (assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

-- ── client_tasks: recurrence, resetting each period ──────────────────────────
-- recurrence/weekdays mirror workout_schedules' exact shape for consistency.
-- last_completed_date is the source of truth for "done" on a recurring task —
-- it's only considered complete for the period whose computed due date
-- matches last_completed_date; status remains authoritative for one-time
-- tasks (recurrence = 'once', the default — fully backward compatible with
-- the tasks already in production).

ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly')),
  ADD COLUMN IF NOT EXISTS weekdays smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_completed_date date;
