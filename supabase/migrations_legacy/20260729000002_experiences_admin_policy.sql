-- Admins need to set the platform discount on any experience, not just
-- ones they own as a partner. Mirrors the existing admin-access pattern
-- used for personal_trainers/pt_offerings/etc (20260524000002).

CREATE POLICY "Admins have full access to experiences"
  ON public.experiences FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
