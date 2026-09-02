-- ACP Intelligence™ Day 1 — MuscleWiki integration & exercise foundation.
--
-- Scope: apps/mobile's live exercise browse/search/picker (previously a
-- direct ExerciseDB call) now goes through a provider-agnostic
-- ExerciseService, with MuscleWiki as the first new provider. This migration
-- only widens what the schema already accepts for a new source value — it
-- does not touch the curated `public.exercises` catalogue (all 42 seeded rows
-- keep source = 'ExerciseDB' and remain exactly as-is; they back template
-- workouts, not the live browse/search flow this migration is about).

-- 1. exercise_favorites / exercise_ratings: 'musclewiki' joins 'db'/'exercisedb'
--    as a valid source, same one-of-two-keys shape (external_id, no exercise_id
--    row). Existing 'exercisedb'-sourced rows are untouched and remain valid —
--    this only adds a new allowed value, it does not reinterpret old ones.
ALTER TABLE public.exercise_favorites DROP CONSTRAINT exercise_favorites_key_check;
ALTER TABLE public.exercise_favorites ADD CONSTRAINT exercise_favorites_key_check CHECK (
  (source = 'db' AND exercise_id IS NOT NULL AND external_id IS NULL) OR
  (source IN ('exercisedb', 'musclewiki') AND external_id IS NOT NULL AND exercise_id IS NULL)
);
ALTER TABLE public.exercise_favorites DROP CONSTRAINT exercise_favorites_source_check;
ALTER TABLE public.exercise_favorites ADD CONSTRAINT exercise_favorites_source_check
  CHECK (source IN ('db', 'exercisedb', 'musclewiki'));

ALTER TABLE public.exercise_ratings DROP CONSTRAINT exercise_ratings_key_check;
ALTER TABLE public.exercise_ratings ADD CONSTRAINT exercise_ratings_key_check CHECK (
  (source = 'db' AND exercise_id IS NOT NULL AND external_id IS NULL) OR
  (source IN ('exercisedb', 'musclewiki') AND external_id IS NOT NULL AND exercise_id IS NULL)
);
ALTER TABLE public.exercise_ratings DROP CONSTRAINT exercise_ratings_source_check;
ALTER TABLE public.exercise_ratings ADD CONSTRAINT exercise_ratings_source_check
  CHECK (source IN ('db', 'exercisedb', 'musclewiki'));

-- 2. public.exercises: `exercises_external_id_key` was a UNIQUE index on
--    external_id ALONE. create-workout.tsx upserts a picked/generated live
--    exercise into this table on `onConflict: 'external_id'` — with a second
--    provider now supplying live exercises, two different providers could in
--    principle mint the same external_id string, and the old index would let
--    one silently overwrite the other's row (and everything already linked to
--    it via workout_exercises). Scope the uniqueness to (source, external_id)
--    instead so each provider's id-space is independent; existing ExerciseDB
--    rows keep the exact same identity (source='ExerciseDB', their external_id).
DROP INDEX IF EXISTS public.exercises_external_id_key;
CREATE UNIQUE INDEX exercises_source_external_id_key
  ON public.exercises (source, external_id) WHERE external_id IS NOT NULL;
