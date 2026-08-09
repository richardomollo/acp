-- Trainer-assigned workouts: a PT builds a workout (reusing the exact same
-- builder/generator consumers use) and assigns it to a specific client. The
-- client sees it in their own Fitness Hub via the existing user_id-owned
-- queries — no client-side workout-taking UI changes needed. This migration
-- adds the first persistent trainer↔client relationship in the schema
-- (everything else today — pt_bookings, pt_programme_enrollments — is a
-- one-off transaction, not an ongoing roster entry).

-- ── pt_clients ──────────────────────────────────────────────────────────────
-- share_progress defaults to false: booking/enrolling with a trainer lets
-- them assign workouts, but reading logged history/set-logs/fitness profile
-- requires the client to explicitly opt in.
CREATE TABLE IF NOT EXISTS public.pt_clients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id           uuid        NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  client_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  share_progress  boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pt_id, client_user_id)
);

ALTER TABLE public.pt_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers view own roster"
  ON public.pt_clients FOR SELECT
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers update own roster"
  ON public.pt_clients FOR UPDATE
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Clients view own trainer relationships"
  ON public.pt_clients FOR SELECT
  USING (client_user_id = auth.uid());

CREATE POLICY "Clients update own sharing preference"
  ON public.pt_clients FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

CREATE INDEX pt_clients_pt_idx ON public.pt_clients (pt_id);
CREATE INDEX pt_clients_client_idx ON public.pt_clients (client_user_id);

-- ── Auto-populate roster from bookings/enrollments ─────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_pt_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.pt_clients (pt_id, client_user_id, status)
    VALUES (NEW.pt_id, NEW.user_id, 'active')
    ON CONFLICT (pt_id, client_user_id) DO UPDATE SET status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER pt_bookings_upsert_client
  AFTER INSERT ON public.pt_bookings
  FOR EACH ROW EXECUTE FUNCTION public.upsert_pt_client();

CREATE TRIGGER pt_programme_enrollments_upsert_client
  AFTER INSERT ON public.pt_programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.upsert_pt_client();

-- ── workouts.assigned_by ────────────────────────────────────────────────────
-- Nullable — null means self-created, matching the existing user_id IS NULL
-- ("curated") convention already in use on this table.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.personal_trainers(id) ON DELETE SET NULL;

-- ── RLS: let a trainer read/insert workouts they assign to an active client ─
-- Existing "Workouts are readable" / "Users can create workouts" policies are
-- additive (Postgres OR's multiple permissive policies together), so these
-- new policies extend access without touching the client's own-data path.

CREATE POLICY "Trainers view assigned workouts"
  ON public.workouts FOR SELECT
  USING (
    assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
  );

CREATE POLICY "Trainers assign workouts to active clients"
  ON public.workouts FOR INSERT
  WITH CHECK (
    assigned_by IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = assigned_by AND client_user_id = workouts.user_id AND status = 'active'
    )
  );

-- ── RLS: workout_exercises follow the same assigned-by branch ───────────────

CREATE POLICY "Trainers manage exercises on assigned workouts"
  ON public.workout_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      JOIN public.personal_trainers pt ON pt.id = w.assigned_by
      WHERE w.id = workout_id AND pt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts w
      JOIN public.personal_trainers pt ON pt.id = w.assigned_by
      WHERE w.id = workout_id AND pt.user_id = auth.uid()
    )
  );

-- ── RLS: trainer can read a client's logged progress, only with consent ────

CREATE POLICY "Trainers view shared workout history"
  ON public.workout_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = workout_history.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );

CREATE POLICY "Trainers view shared set logs"
  ON public.workout_set_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = workout_set_logs.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );

CREATE POLICY "Trainers view shared fitness profile"
  ON public.fitness_profile FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = fitness_profile.user_id
        AND pt.user_id = auth.uid()
        AND pc.share_progress = true
    )
  );
