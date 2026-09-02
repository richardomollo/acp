-- Lets a trainer log progress/sessions on behalf of a client during in-person
-- training (the client isn't the one operating the app in that moment).
-- Extends the existing self-logged tables rather than forking new ones, so
-- every client-facing history view picks these up with zero query changes —
-- a trainer-authored row is just a normal row in the client's own history.
--
-- Visibility follows the client_tasks precedent (trainer-authored -> the
-- client always sees it) rather than the share_progress-gated precedent
-- (client-authored -> trainer needs opt-in). A trainer's own logged rows are
-- always visible to that trainer regardless of share_progress, since gating
-- them from the person who wrote them would be nonsensical.

-- ── client_measurements ─────────────────────────────────────────────────────

ALTER TABLE public.client_measurements
  ADD COLUMN IF NOT EXISTS logged_by_pt_id uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

CREATE POLICY "Trainers log measurements for active clients"
  ON public.client_measurements FOR INSERT
  WITH CHECK (
    logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = logged_by_pt_id AND client_user_id = client_measurements.user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers view own logged measurements"
  ON public.client_measurements FOR SELECT
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers update own logged measurements"
  ON public.client_measurements FOR UPDATE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers delete own logged measurements"
  ON public.client_measurements FOR DELETE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

-- ── workout_history ──────────────────────────────────────────────────────────

ALTER TABLE public.workout_history
  ADD COLUMN IF NOT EXISTS logged_by_pt_id uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

CREATE POLICY "Trainers log workout history for active clients"
  ON public.workout_history FOR INSERT
  WITH CHECK (
    logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = logged_by_pt_id AND client_user_id = workout_history.user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers view own logged workout history"
  ON public.workout_history FOR SELECT
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers update own logged workout history"
  ON public.workout_history FOR UPDATE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers delete own logged workout history"
  ON public.workout_history FOR DELETE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

-- ── workout_set_logs ─────────────────────────────────────────────────────────

ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS logged_by_pt_id uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

CREATE POLICY "Trainers log set logs for active clients"
  ON public.workout_set_logs FOR INSERT
  WITH CHECK (
    logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = logged_by_pt_id AND client_user_id = workout_set_logs.user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers view own logged set logs"
  ON public.workout_set_logs FOR SELECT
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers update own logged set logs"
  ON public.workout_set_logs FOR UPDATE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers delete own logged set logs"
  ON public.workout_set_logs FOR DELETE
  USING (logged_by_pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));
