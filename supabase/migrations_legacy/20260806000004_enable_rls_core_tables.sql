-- CRITICAL FIX: gyms, sessions, bookings, partners, and partner_gyms all had
-- RLS *policies* defined, but Row Level Security was never actually enabled
-- at the table level for any of them (relrowsecurity = false) — meaning none
-- of those policies were ever enforced. Any authenticated (and in some cases
-- anonymous) API caller could read or write any row in these tables directly,
-- bypassing every app-level scoping check. Discovered while verifying the new
-- gym-trainer feature's own scoping — a test trainer account could read and
-- update a booking belonging to a completely unrelated gym.
--
-- rate_floor_negotiations is the same category of gap (used by the admin
-- negotiations page, same missing ENABLE ROW LEVEL SECURITY), included here
-- for consistency rather than leaving one sibling table exposed.
--
-- apps/admin has no admin-role concept at all today (its login is a plain
-- supabase.auth.signInWithPassword with no role check), but every admin page
-- queries these tables directly with the anon-key client rather than through
-- a service-role API route. Turning on enforcement with only the existing
-- owner/customer-scoped policies would immediately break the admin app
-- (pending-gym lists, venue edit/delete, rate negotiations, analytics).
-- `public.users.role` already has an 'admin' value and the one real admin
-- account is already flagged with it — reuse that rather than inventing a
-- new mechanism or rewriting every admin page into a bespoke API route.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_floor_negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all gyms" ON public.gyms FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage all sessions" ON public.sessions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage all bookings" ON public.bookings FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The customer mobile app's self-check-in (apps/mobile/app/(tabs)/check-in.tsx)
-- updates confirmation_code/checked_in/status directly on the customer's own
-- booking from the browser/app session — there was no existing UPDATE policy
-- for a user on their own booking at all (only SELECT/INSERT), so this would
-- have broken the moment enforcement turned on.
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all partners" ON public.partners FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage all partner_gyms" ON public.partner_gyms FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage all rate_floor_negotiations" ON public.rate_floor_negotiations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
