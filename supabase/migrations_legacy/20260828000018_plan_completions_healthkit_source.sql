-- Adds 'healthkit' as a valid plan_activity_completions.completion_source —
-- Apple Health workouts (via health_workouts, synced from HealthKit) are now
-- a distinct auto-sync signal alongside Strava, separate from 'exercise_db'
-- (ACP's own in-app workout tracker) and 'strava' (GPS activity tracking).
-- Constraint is located dynamically rather than assumed by name, since it
-- was declared inline (unnamed) in the original CREATE TABLE.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.plan_activity_completions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%completion_source%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.plan_activity_completions DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.plan_activity_completions
  ADD CONSTRAINT plan_activity_completions_completion_source_check
  CHECK (completion_source IN ('manual', 'exercise_db', 'strava', 'healthkit', 'acp_session', 'acp_experience'));
