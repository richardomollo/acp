-- Fix a real, live-observed bug: getActivityRecommendation's standalone-
-- suggested-session reuse check (SELECT for an existing same-day row, then
-- INSERT if none found) is not atomic. Two concurrent calls for the same
-- user + activity type — e.g. My Plan and Home both mounting
-- ActivityFulfilmentCard within the same few seconds, or a user rapidly
-- re-visiting the plan screen — can both pass the "nothing found yet" check
-- before either INSERT completes, each creating its own standalone workout.
-- Observed live: one real account accumulated 15 duplicate
-- 'acp_suggested_strength' workouts in an 11-minute window.
--
-- Fix: give every standalone ACP-suggested workout an explicit local-date
-- identity, and enforce uniqueness of (user, workout_type, that date) at
-- the database level — the same pattern already used for
-- exercises(source, external_id). The service now performs an
-- INSERT ... ON CONFLICT DO NOTHING (supabase-js `ignoreDuplicates: true`)
-- against this constraint, which is atomic regardless of how many
-- concurrent requests race it — exactly one wins and generates exercises;
-- every other request detects zero rows returned and reuses the winner's id.
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS suggested_local_date date;

CREATE UNIQUE INDEX IF NOT EXISTS workouts_one_suggested_per_type_per_day
  ON public.workouts (user_id, workout_type, suggested_local_date)
  WHERE program_week_id IS NULL AND suggested_local_date IS NOT NULL;
