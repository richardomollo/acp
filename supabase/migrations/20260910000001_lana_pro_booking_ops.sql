-- LANA PRO — Phase 4.3 (Bookings + Schedule operations).
--
-- The ONLY schema change 4.3 needs: let a professional create a pt_bookings
-- row for a client they ALREADY actively work with (§7). Today the sole INSERT
-- policy on pt_bookings is the consumer one (CHECK user_id = auth.uid()); a PT
-- cannot book on a client's behalf without the service-role API. This adds a
-- tightly-scoped additive INSERT policy validating canonical relationships:
--
--   * the auth user owns the personal_trainers row (pt_id)
--   * the offering belongs to that same PT, is active and not a draft
--   * the offering is NOT a programme (§23 — programmes are not services)
--   * the target client is an ACTIVE pt_clients relationship for that PT
--     (or a guest booking with no user_id)
--
-- Nothing is weakened: the consumer policy, the SELECT/UPDATE policies, and the
-- legacy `pt_bookings_upsert_client` trigger are all untouched. A booking made
-- through this policy still does NOT grant progress-sharing consent —
-- pt_clients.share_progress stays whatever it was (default false).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pt_bookings'
      AND policyname = 'PTs create bookings for their active clients'
  ) THEN
    CREATE POLICY "PTs create bookings for their active clients"
      ON public.pt_bookings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        -- the booking's PT is owned by the caller
        EXISTS (
          SELECT 1 FROM public.personal_trainers pt
          WHERE pt.id = pt_bookings.pt_id
            AND pt.user_id = auth.uid()
        )
        -- the offering belongs to that PT and is bookable (active, published,
        -- not a programme)
        AND EXISTS (
          SELECT 1 FROM public.pt_offerings o
          WHERE o.id = pt_bookings.offering_id
            AND o.pt_id = pt_bookings.pt_id
            AND o.is_active = true
            AND o.is_draft = false
            AND COALESCE(o.is_programme, false) = false
        )
        -- the client is EITHER a guest (no account) OR an already-active
        -- pt_clients relationship for this PT. A booking must not be the thing
        -- that creates the relationship in Lana Pro (§8, §23).
        AND (
          pt_bookings.user_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.pt_clients pc
            WHERE pc.pt_id = pt_bookings.pt_id
              AND pc.client_user_id = pt_bookings.user_id
              AND pc.status = 'active'
          )
        )
      );
  END IF;
END $$;

COMMENT ON POLICY "PTs create bookings for their active clients" ON public.pt_bookings IS
  'Lana Pro Phase 4.3: professional-created direct bookings for an already-active client. Additive; does not weaken the consumer INSERT policy or imply share_progress consent.';
