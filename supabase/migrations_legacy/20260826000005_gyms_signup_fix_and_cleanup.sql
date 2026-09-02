-- Root-caused the actual bug (see debugging trail in 20260826000001-4):
-- partner-signup's gym insert uses .insert({...}).select("id").single(), which
-- needs the newly-created row to be visible under a SELECT policy for the
-- RETURNING clause to succeed. At the moment of insert the gym is not yet
-- active and not yet linked via partner_gyms (that link is created in a
-- separate, later insert), so neither existing SELECT policy ("Anyone can
-- read gyms" requires is_active=true; "Partners can view their gyms" requires
-- an existing partner_gyms row) covered it — PostgREST surfaces that
-- read-back failure as the same generic "new row violates row-level security
-- policy" error, making it look like the INSERT itself was rejected. The
-- INSERT policies were actually fine all along (there were already two
-- overlapping ones, including the redundant one this migration removes below
-- — added while chasing the wrong hypothesis before finding the real cause).
--
-- Fix: let a partner see gyms via a direct partner_id match, same fallback
-- "Partners can update their gyms" already has, just missing on SELECT.
CREATE POLICY "Partners can view gyms via partner_id" ON public.gyms FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.partners WHERE id = gyms.partner_id AND user_id = auth.uid())
  );

-- Remove the redundant INSERT policy added in 20260826000001 — "Partners can
-- insert gyms" (pre-existing, managed outside migration history) already
-- covers this with the identical condition.
DROP POLICY IF EXISTS "Partners create their own gyms" ON public.gyms;

-- Drop the temporary debugging functions from 20260826000002-4.
DROP FUNCTION IF EXISTS public._debug_list_policies(text);
DROP FUNCTION IF EXISTS public._debug_check_gym_insert(uuid);
DROP FUNCTION IF EXISTS public._debug_list_triggers(text);
