-- Add missing FK from experience_bookings.gym_id → gyms.id
-- This allows PostgREST / supabase-js to resolve gyms!gym_id directly
-- on experience_bookings without going through the experiences table.

ALTER TABLE public.experience_bookings
  ADD CONSTRAINT experience_bookings_gym_id_fkey
  FOREIGN KEY (gym_id) REFERENCES public.gyms(id);
