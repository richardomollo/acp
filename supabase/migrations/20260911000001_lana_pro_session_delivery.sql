-- LANA PRO — Phase 4.4 (Client delivery + professional intelligence).
--
-- Smallest truthful persistence for professional session delivery. No EMR, no
-- programme, no diagnosis. Additive only — pt_bookings / pt_clients /
-- client_tasks / workout_history / client_measurements / meal_plans and every
-- programme/experience/community model are UNTOUCHED.
--
-- What's new:
--   1. professional_session_records — one delivery record per appointment.
--   2. client_tasks.session_record_id — link agreed actions to the session.
--   3. food_log_entries: a narrow professional read policy (nutrition brief).
--   4. get_client_session_feed() — the column-safe consumer read contract
--      (Phase 4.5 UI). private_notes / session_exercises are NEVER exposed.

-- ── 1. professional_session_records ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.professional_session_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- link to the booking; never duplicate its price/time/client/service
  booking_source      text NOT NULL DEFAULT 'pt_booking'
                        CHECK (booking_source IN ('pt_booking')),
  booking_id          uuid NOT NULL,

  -- owning professional. MVP: independent personal trainers only. The
  -- gym_trainer_id column is RESERVED for a future phase — no auth/flow uses
  -- it yet (see report §P). Exactly one of the two id columns is set.
  professional_kind   text NOT NULL DEFAULT 'personal_trainer'
                        CHECK (professional_kind IN ('personal_trainer', 'gym_trainer')),
  personal_trainer_id uuid REFERENCES public.personal_trainers(id) ON DELETE CASCADE,
  gym_trainer_id      uuid REFERENCES public.gym_trainers(id) ON DELETE CASCADE,
  CHECK (
    (professional_kind = 'personal_trainer' AND personal_trainer_id IS NOT NULL AND gym_trainer_id IS NULL)
    OR
    (professional_kind = 'gym_trainer'      AND gym_trainer_id IS NOT NULL AND personal_trainer_id IS NULL)
  ),

  client_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- context (small, non-duplicative)
  service_type        text,
  professional_flavour text
                        CHECK (professional_flavour IN ('training', 'nutrition', 'therapy', 'general')),

  -- lifecycle
  session_status      text NOT NULL DEFAULT 'in_progress'
                        CHECK (session_status IN ('in_progress', 'completed')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,

  -- content — PRIVATE vs CLIENT-VISIBLE is the P1 boundary:
  focus               text,          -- client-visible
  client_summary      text,          -- client-visible
  private_notes       text,          -- professional-only, NEVER in the consumer contract
  session_exercises   jsonb,         -- professional-only for Phase 4.4 (evidence, not a plan)
  follow_up_at        date,          -- client-visible

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- one delivery record per appointment → completion is idempotent
  UNIQUE (booking_source, booking_id)
);

CREATE INDEX IF NOT EXISTS psr_pt_idx     ON public.professional_session_records (personal_trainer_id);
CREATE INDEX IF NOT EXISTS psr_client_idx ON public.professional_session_records (client_user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS psr_booking_idx ON public.professional_session_records (booking_source, booking_id);

ALTER TABLE public.professional_session_records ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS psr_updated_at ON public.professional_session_records;
CREATE TRIGGER psr_updated_at
  BEFORE UPDATE ON public.professional_session_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The OWNING professional (independent PT) manages their own records, and only
-- for a client they actively work with. NO venue/gym-owner policy — a gym
-- owner never sees a trainer's private notes. NO client policy on the raw
-- table — consumers read the safe projection RPC only.
CREATE POLICY "PTs manage their own session records"
  ON public.professional_session_records
  FOR ALL
  TO authenticated
  USING (
    professional_kind = 'personal_trainer'
    AND personal_trainer_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    professional_kind = 'personal_trainer'
    AND personal_trainer_id IN (
      SELECT id FROM public.personal_trainers WHERE user_id = auth.uid()
    )
    AND (
      client_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.pt_clients pc
        WHERE pc.pt_id = professional_session_records.personal_trainer_id
          AND pc.client_user_id = professional_session_records.client_user_id
          AND pc.status = 'active'
      )
    )
  );

COMMENT ON COLUMN public.professional_session_records.private_notes IS
  'Professional-only. NEVER returned by any client-facing API or the get_client_session_feed contract.';
COMMENT ON COLUMN public.professional_session_records.session_exercises IS
  'Professional-only session evidence for Phase 4.4 (free-text/light structure). Not a workout plan; not client-visible in 4.4.';

-- ── 2. client_tasks ← session link ─────────────────────────────────────────
-- Reuse the canonical trainer-assigned-task model for agreed actions. Existing
-- RLS + attribution + client visibility are unchanged; this only groups tasks
-- under the session that produced them.

ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS session_record_id uuid
    REFERENCES public.professional_session_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_tasks_session_idx ON public.client_tasks (session_record_id);

-- ── 3. food_log_entries: narrow professional read (nutrition brief) ────────
-- Mirrors the existing "Trainers view shared measurements/workout history"
-- policies, but ALSO requires pc.status = 'active' (Phase 4.4 §4 — gate on
-- BOTH active + share_progress). Row-scoped to that professional's own active,
-- consenting client. No broad trainer access.

DROP POLICY IF EXISTS "Professionals view shared food log" ON public.food_log_entries;
CREATE POLICY "Professionals view shared food log"
  ON public.food_log_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pt_clients pc
      JOIN public.personal_trainers pt ON pt.id = pc.pt_id
      WHERE pc.client_user_id = food_log_entries.user_id
        AND pt.user_id = auth.uid()
        AND pc.status = 'active'
        AND pc.share_progress = true
    )
  );

-- ── 4. Consumer read contract (Phase 4.5 UI consumes this) ────────────────
-- Column-safe: returns ONLY client-visible fields. Never selects private_notes
-- or session_exercises. SECURITY DEFINER so a consumer with no direct table
-- grant can still read their own completed sessions.

CREATE OR REPLACE FUNCTION public.get_client_session_feed(p_limit int DEFAULT 20)
RETURNS TABLE (
  session_id      uuid,
  service_type    text,
  professional_flavour text,
  focus           text,
  client_summary  text,
  follow_up_at    date,
  completed_at    timestamptz,
  professional_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.id,
    s.service_type,
    s.professional_flavour,
    s.focus,
    s.client_summary,
    s.follow_up_at,
    s.completed_at,
    COALESCE(pt.professional_name, pt.full_name)
  FROM public.professional_session_records s
  JOIN public.personal_trainers pt ON pt.id = s.personal_trainer_id
  WHERE s.client_user_id = auth.uid()
    AND s.session_status = 'completed'
  ORDER BY s.completed_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_client_session_feed(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_session_feed(int) TO authenticated;

COMMENT ON FUNCTION public.get_client_session_feed(int) IS
  'Phase 4.4 consumer read contract. Client-visible session fields ONLY — never private_notes or session_exercises. Consumer mobile UI is Phase 4.5.';
