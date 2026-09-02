-- Same class of bug as 20260828000027, caught immediately during Chunk 4
-- validation before it could affect real data: the previous migration
-- (20260828000028) created workouts_one_suggested_per_type_per_day as a
-- PARTIAL unique index (WHERE program_week_id IS NULL AND
-- suggested_local_date IS NOT NULL). Postgres's ON CONFLICT (col, col, col)
-- inference cannot use a partial index as an arbiter unless the same WHERE
-- clause is repeated in the conflict target, which supabase-js's
-- `onConflict: 'user_id,workout_type,suggested_local_date'` never does.
--
-- Fix: replace it with a plain (non-partial) UNIQUE constraint. This is
-- safe for regular (non-standalone) programme workouts, which never set
-- suggested_local_date — a standard unique constraint never considers two
-- NULLs equal, so any number of programme workouts with the same
-- user_id/workout_type and a NULL suggested_local_date remain unaffected.
DROP INDEX IF EXISTS public.workouts_one_suggested_per_type_per_day;
ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_one_suggested_per_type_per_day
  UNIQUE (user_id, workout_type, suggested_local_date);
