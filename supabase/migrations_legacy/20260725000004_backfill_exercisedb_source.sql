-- Any exercise with a real ExerciseDB external_id is, by definition, sourced
-- from ExerciseDB — but create-workout.tsx's upsert never set `source`
-- explicitly, so these silently kept the column's 'ACP' default. Backfill,
-- and the app code has been fixed to set source = 'ExerciseDB' going forward.
UPDATE public.exercises
SET source = 'ExerciseDB'
WHERE external_id IS NOT NULL AND source <> 'ExerciseDB';
