-- Two more VYTAL-inspired features:
-- 1. daily_checkins — client-authored mood log, gated by the same
--    share_progress consent used for workout_history/client_measurements.
-- 2. client_tasks — trainer-assigned, non-workout tasks. Visibility mirrors
--    workouts.assigned_by: the client always sees what's assigned to them,
--    no consent gate needed (the trainer is writing, not reading).

-- ── daily_checkins ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood          smallint    NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note          text,
  checkin_date  date        NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own checkins"
  ON public.daily_checkins FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Trainers view shared checkins"
  ON public.daily_checkins FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pt_clients pc
    JOIN public.personal_trainers pt ON pt.id = pc.pt_id
    WHERE pc.client_user_id = daily_checkins.user_id
      AND pt.user_id = auth.uid() AND pc.share_progress = true
  ));

CREATE INDEX daily_checkins_user_idx ON public.daily_checkins (user_id, checkin_date DESC);

-- ── client_tasks ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_id           uuid        NOT NULL REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  client_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  notes           text,
  due_date        date,
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers view own assigned tasks"
  ON public.client_tasks FOR SELECT
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers assign tasks to active clients"
  ON public.client_tasks FOR INSERT
  WITH CHECK (
    pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.pt_clients
      WHERE pt_id = client_tasks.pt_id AND client_user_id = client_tasks.client_user_id AND status = 'active'
    )
  );

CREATE POLICY "Trainers update own assigned tasks"
  ON public.client_tasks FOR UPDATE
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Trainers delete own assigned tasks"
  ON public.client_tasks FOR DELETE
  USING (pt_id IN (SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()));

CREATE POLICY "Clients view own tasks"
  ON public.client_tasks FOR SELECT
  USING (client_user_id = auth.uid());

CREATE POLICY "Clients update own task status"
  ON public.client_tasks FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

CREATE INDEX client_tasks_pt_idx ON public.client_tasks (pt_id);
CREATE INDEX client_tasks_client_idx ON public.client_tasks (client_user_id);
