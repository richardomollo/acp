-- Admin RLS for the new admin Finance dashboard.
--
-- experience_bookings had no admin policy at all (unlike bookings/pt_bookings/
-- experiences), so an admin querying it via the anon-key client (the pattern
-- every apps/admin page uses) would see zero rows.
--
-- partner_withdrawals/pt_payout_requests had an UPDATE policy of
-- USING (true) WITH CHECK (true), added under the assumption it was needed
-- for the b2b/b2c-callback edge functions. It wasn't: those functions use
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely. The open policy
-- was dead weight for its intended purpose and a live hole for everyone
-- else (any authenticated caller could flip any withdrawal's status).
-- Replaced with proper admin-only access, mirroring the is_admin() pattern
-- from 20260524000002_pt_admin_policies.sql / 20260806000004_enable_rls_core_tables.sql.

CREATE POLICY "Admins have full access to experience_bookings"
  ON public.experience_bookings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role update withdrawals" ON public.partner_withdrawals;
CREATE POLICY "Admins manage all partner withdrawals"
  ON public.partner_withdrawals FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role update pt payout requests" ON public.pt_payout_requests;
CREATE POLICY "Admins manage all pt payout requests"
  ON public.pt_payout_requests FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
