-- Personal note a user can leave on a completed workout session.
-- (workout_exercises.notes already exists in the schema for per-exercise notes
-- within a workout template — this adds the session-level counterpart.)
ALTER TABLE public.workout_history ADD COLUMN IF NOT EXISTS notes text;
