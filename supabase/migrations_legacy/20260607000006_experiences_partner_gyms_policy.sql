-- Allow mobile-app partners (linked via partner_gyms) to manage experiences.
-- The web dashboard RLS uses contact_email; the mobile app authenticates via
-- auth.uid() → partners → partner_gyms → gym_id, so we need a second policy.

CREATE POLICY "Partner gyms manage experiences"
  ON public.experiences
  FOR ALL
  USING (
    gym_id IN (
      SELECT pg.gym_id
      FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    gym_id IN (
      SELECT pg.gym_id
      FROM public.partner_gyms pg
      JOIN public.partners p ON p.id = pg.partner_id
      WHERE p.user_id = auth.uid()
    )
  );
