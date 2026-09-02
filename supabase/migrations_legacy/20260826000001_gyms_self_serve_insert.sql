-- Venue signup (apps/web/app/partner-signup/page.tsx) creates the partners
-- row, then inserts the gyms row linked to it via partner_id — but gyms only
-- ever got an admin-only RLS policy (20260806000004_enable_rls_core_tables.sql
-- turned on enforcement for the first time and added is_admin()-gated access,
-- without a self-serve path for the partner creating their own venue). SELECT
-- and UPDATE on gyms already work for the owning partner via policies managed
-- outside the migration history, but there was never an INSERT policy at all,
-- so every new venue signup fails with "new row violates row-level security
-- policy for table gyms" the moment it tries to create the gym row.
CREATE POLICY "Partners create their own gyms" ON public.gyms FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.partners WHERE id = partner_id AND user_id = auth.uid())
  );
