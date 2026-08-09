-- Allow venue partners to read experience bookings for their gyms.
-- The existing policy only lets users read their own bookings, so partners
-- querying their gym's experience_bookings see an empty result.

CREATE POLICY "Partners read experience bookings for their gyms"
  ON public.experience_bookings FOR SELECT
  USING (
    gym_id IN (
      SELECT pg.gym_id
      FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );
