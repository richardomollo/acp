-- Fix a real bug found during ACP Intelligence™ Chunk 1 validation: every
-- exercise upsert (`.upsert(..., { onConflict: 'source,external_id' })` in
-- services/programme-service.ts and services/activity-recommendation-
-- service.ts) has been failing with:
--   42P10: there is no unique or exclusion constraint matching the ON
--   CONFLICT specification
--
-- Root cause: 20260828000022_musclewiki_provider_support.sql created
-- exercises_source_external_id_key as a PARTIAL unique index
-- (WHERE external_id IS NOT NULL). Postgres's ON CONFLICT (col, col)
-- inference only matches a plain, unconditional unique constraint/index —
-- it cannot use a partial index as an arbiter for a conflict target that
-- doesn't repeat the same WHERE clause, which supabase-js's
-- `onConflict: 'source,external_id'` (a plain column list) never does.
--
-- The partial WHERE clause was unnecessary in the first place: a standard
-- (non-partial) UNIQUE constraint already permits unlimited rows with a
-- NULL external_id (NULL is never considered equal to another NULL under
-- SQL's default unique-constraint semantics) — so replacing the partial
-- index with a real, plain UNIQUE constraint changes nothing about which
-- rows are allowed, it only fixes ON CONFLICT resolution.
DROP INDEX IF EXISTS public.exercises_source_external_id_key;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_source_external_id_key UNIQUE (source, external_id);
