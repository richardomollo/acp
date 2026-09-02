-- Fix: pt_clients.client_user_id referenced auth.users(id), unlike every
-- other PT table (pt_bookings, pt_programme_enrollments), which reference
-- public.users(id) specifically. PostgREST can only auto-detect embeds
-- (e.g. `.select('..., users(name, email)')`) via foreign keys in the
-- exposed (public) schema, so `clients.tsx`'s query failed with
-- "Could not find a relationship between 'pt_clients' and 'users' in the
-- schema cache" — confirmed live. public.users.id stays in sync with
-- auth.users.id via the existing handle_new_user() trigger, so retargeting
-- the FK doesn't change any data, just what PostgREST can see.

ALTER TABLE public.pt_clients DROP CONSTRAINT pt_clients_client_user_id_fkey;
ALTER TABLE public.pt_clients ADD CONSTRAINT pt_clients_client_user_id_fkey
  FOREIGN KEY (client_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
