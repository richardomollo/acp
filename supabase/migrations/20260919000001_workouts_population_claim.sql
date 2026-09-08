-- LANA MOBILE — Shared Workout Concurrency Fix.
--
-- ROOT CAUSE (approved read-only audit): findReusableSuggested()'s self-heal
-- branch reads workout_exercises count, and if 0, calls
-- populateExerciseWorkout() to (re-)populate it. Multiple
-- ActivityFulfilmentCard instances (Home's up to 2 + My Plan's up to N, both
-- routinely mounted at once) can all read count=0 for the SAME workout_id
-- before any of them has inserted a single row, and each independently runs
-- the full population loop — appending, not replacing — against the same
-- row. Evidence: Richard's production "Lower strength (heavy)" workout has
-- 38 workout_exercises rows vs. 11/6 on his other two current-week strength
-- sessions (a normal pass is ~11-13 rows; 38 ≈ 3 duplicate passes stacked).
--
-- This mirrors the EXISTING, already-fixed row-CREATION race
-- (20260828000028/29 — workouts_one_suggested_per_type_per_day) but that
-- fix only makes the ROW unique; it does nothing once the row already
-- exists with 0 exercises, which is exactly the state a genuinely-failed
-- prior generation attempt leaves behind, and exactly the state the repair
-- branch operates on.
--
-- `population_claimed_at` is a simple atomic-claim marker for "someone is
-- (or recently was) populating this specific row's exercises right now".
-- The claim is taken via a single `UPDATE ... WHERE population_claimed_at
-- IS NULL (or stale) ... RETURNING id` — Postgres's normal row-level
-- locking on UPDATE guarantees only one concurrent transaction can match
-- that WHERE clause and get a row back. Fully additive: nullable, no
-- existing row's data changes, no behaviour change for any already-
-- populated workout (count > 0 never reaches the claim logic at all — see
-- activity-recommendation-service.ts's isValidSuggestedSession guard).
--
-- claim_workout_population() wraps that UPDATE as a small RPC (SECURITY
-- INVOKER — runs as the calling user, so the existing "Users can update own
-- workouts" RLS policy still applies exactly as it does for every other
-- direct .update() this service already performs) rather than expressing
-- the OR condition as a PostgREST query-string filter on a PATCH request —
-- verified live against this project's PostgREST that combining `.or()`
-- with an UPDATE reliably fails ("column ... does not exist", regardless of
-- which column) while the identical OR filter works fine on a plain SELECT
-- and a plain UPDATE with only AND filters also works fine. Moving the
-- two-condition WHERE inside a single SQL statement server-side sidesteps
-- that gap entirely and is, if anything, closer to "prefer an atomic
-- Postgres/RPC claim" than a client-built filter would have been anyway.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS population_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_workout_population(p_workout_id uuid, p_stale_before timestamptz)
RETURNS TABLE(id uuid)
LANGUAGE sql
AS $$
  UPDATE public.workouts
  SET population_claimed_at = now()
  WHERE workouts.id = p_workout_id
    AND (workouts.population_claimed_at IS NULL OR workouts.population_claimed_at < p_stale_before)
  RETURNING workouts.id;
$$;

GRANT EXECUTE ON FUNCTION public.claim_workout_population(uuid, timestamptz) TO authenticated, service_role;
