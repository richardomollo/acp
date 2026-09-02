-- The partial unique index on exercises.external_id can't be used as an
-- ON CONFLICT arbiter by the app's upsert (which specifies no predicate),
-- so every custom-workout exercise upsert failed and silently dropped the
-- workout_exercises link. Postgres unique indexes already treat NULLs as
-- distinct, so the partial predicate was unnecessary — replace it with a
-- plain unique index.

DROP INDEX IF EXISTS public.exercises_external_id_key;
CREATE UNIQUE INDEX exercises_external_id_key ON public.exercises(external_id);
