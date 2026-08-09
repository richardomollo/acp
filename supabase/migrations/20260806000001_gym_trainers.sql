-- Gym-employed staff trainers: a lightweight, gym-scoped account type distinct
-- from `personal_trainers` (which is shaped for independent, marketplace PTs
-- with their own approval workflow and public profile). A gym owner invites
-- their own employees here; no admin approval, no public visibility.

CREATE TABLE public.gym_trainers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null until invite accepted
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  status       TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
  invite_token UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_by   UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gym_id, email)
);

ALTER TABLE public.gym_trainers ENABLE ROW LEVEL SECURITY;

-- `instructor` stays as the free-text display column every existing
-- customer-facing read site already uses. `sessions.instructor_id` already
-- exists (a pre-existing, unconstrained, entirely unused uuid column — 0 of
-- 1446 rows have it set, no FK, referenced nowhere in the app) — reuse it
-- rather than adding a second, confusingly-similar column. Give it the real
-- FK it never had: set alongside `instructor` when a session is assigned to
-- an actual gym_trainers account.
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.gym_trainers(id) ON DELETE SET NULL;

-- ─── gym_trainers RLS ──────────────────────────────────────────────────────

CREATE POLICY "Partners manage their gym trainers"
  ON public.gym_trainers FOR ALL
  USING (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    gym_id IN (
      SELECT pg.gym_id FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Trainers view own record"
  ON public.gym_trainers FOR SELECT
  USING (user_id = auth.uid());

-- ─── sessions: additive policy, existing owner policies untouched ─────────

CREATE POLICY "Trainers view their assigned sessions"
  ON public.sessions FOR SELECT
  USING (instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid()));

-- ─── bookings: additive policies, existing owner/customer policies untouched ─

CREATE POLICY "Trainers view bookings for assigned sessions"
  ON public.bookings FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.sessions
      WHERE instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Trainers check in bookings for assigned sessions"
  ON public.bookings FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM public.sessions
      WHERE instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.sessions
      WHERE instructor_id IN (SELECT id FROM public.gym_trainers WHERE user_id = auth.uid())
    )
  );
