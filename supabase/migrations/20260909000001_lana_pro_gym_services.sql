-- LANA PRO — Phase 4.2 (Services + Availability).
--
-- Strong preference is REUSE (§17): appointments + PT classes ride
-- `pt_offerings` unchanged; studio/gym classes ride `sessions` unchanged;
-- general + per-service availability ride `pt_availability` unchanged.
--
-- This migration adds the ONLY two things existing persistence genuinely
-- cannot represent for the MVP provider models:
--
--   1. gym / spa ACCESS  (open gym, day pass, facility/sauna pass) — an
--      always-available paid window, NOT a scheduled class, so it does not
--      belong in `sessions`.
--
--   2. a venue-level APPOINTMENT service delivered by the venue's TEAM
--      (a gym's "Personal Training", delivered by employed `gym_trainers`)
--      WITHOUT duplicating each trainer as a fake standalone service (§8).
--
-- Fully additive. Nothing existing is altered or dropped. No auto-assignment
-- of staff is implied (§8) — `gym_service_providers` is just the eligibility
-- list. Status mirrors pt_offerings semantics: draft | active | inactive,
-- entirely separate from marketplace verification (§11). Historical bookings
-- are never touched by a status change (§16) — deactivate, never delete.

-- ── gym_access_passes ─────────────────────────────────────────────────────


begin;
CREATE TABLE IF NOT EXISTS public.gym_access_passes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  price_kes        numeric(10,2),
  duration_minutes int,                 -- NULL = "all day" / open-ended window
  capacity         int,                 -- NULL = uncapped
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gym_access_passes_gym_idx ON public.gym_access_passes (gym_id);

ALTER TABLE public.gym_access_passes ENABLE ROW LEVEL SECURITY;

-- Owner (partner) manages; public sees only active passes of active venues.
CREATE POLICY "Partners manage their gym access passes"
  ON public.gym_access_passes FOR ALL
  USING (gym_id IN (
    SELECT pg.gym_id FROM public.partner_gyms pg
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (gym_id IN (
    SELECT pg.gym_id FROM public.partner_gyms pg
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Public can view active access passes of active venues"
  ON public.gym_access_passes FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.is_active = true)
  );

-- ── gym_services (venue-level appointment, team-delivered) ────────────────

CREATE TABLE IF NOT EXISTS public.gym_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id           uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  category         text NOT NULL DEFAULT 'appointment' CHECK (category IN ('appointment')),
  name             text NOT NULL,
  description      text,
  duration_minutes int NOT NULL DEFAULT 60,
  price_kes        numeric(10,2),
  capacity         int NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gym_services_gym_idx ON public.gym_services (gym_id);

ALTER TABLE public.gym_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners manage their gym services"
  ON public.gym_services FOR ALL
  USING (gym_id IN (
    SELECT pg.gym_id FROM public.partner_gyms pg
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (gym_id IN (
    SELECT pg.gym_id FROM public.partner_gyms pg
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Public can view active gym services of active venues"
  ON public.gym_services FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.is_active = true)
  );

-- ── gym_service_providers — eligibility list, NOT assignment ─────────────

CREATE TABLE IF NOT EXISTS public.gym_service_providers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_service_id uuid NOT NULL REFERENCES public.gym_services(id) ON DELETE CASCADE,
  gym_trainer_id uuid NOT NULL REFERENCES public.gym_trainers(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_service_id, gym_trainer_id)
);

ALTER TABLE public.gym_service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners manage providers for their gym services"
  ON public.gym_service_providers FOR ALL
  USING (gym_service_id IN (
    SELECT gs.id FROM public.gym_services gs
    JOIN public.partner_gyms pg ON pg.gym_id = gs.gym_id
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (gym_service_id IN (
    SELECT gs.id FROM public.gym_services gs
    JOIN public.partner_gyms pg ON pg.gym_id = gs.gym_id
    JOIN public.partners p ON p.id = pg.partner_id
    WHERE p.user_id = auth.uid()
  ));

-- ── updated_at triggers (reuse the existing helper) ─────────────────────

DROP TRIGGER IF EXISTS gym_access_passes_updated_at ON public.gym_access_passes;
CREATE TRIGGER gym_access_passes_updated_at
  BEFORE UPDATE ON public.gym_access_passes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS gym_services_updated_at ON public.gym_services;
CREATE TRIGGER gym_services_updated_at
  BEFORE UPDATE ON public.gym_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

commit;
