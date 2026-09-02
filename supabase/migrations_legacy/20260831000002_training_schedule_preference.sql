-- ACP Intelligence™ Beta Feedback #002 — user-controlled training schedule.
--
-- Distinguishes AVAILABILITY (already covered indirectly by
-- health_profile.hours_exercising_per_week — "how much could I train") from
-- TRAINING SCHEDULE PREFERENCE ("how do I prefer to structure my week"). An
-- advanced user like Paul may have plenty of availability AND an established
-- Mon–Fri rhythm the plan should coach within, not replace.
--
-- ONE additive, optional column. Frequency (days/week) is NOT stored — it is
-- always derived from array_length(preferred_training_days, 1), so the two
-- can never disagree (Beta #002 §7, option B).
--
-- NULL semantics (Beta #002 §32/§33): NULL means "no explicit preference" —
-- NOT "3 days". A legacy profile stays NULL and keeps its exact existing
-- planning behaviour until the user chooses days in My Goals / onboarding.
--
-- Canonical representation (Beta #002 §6): lowercase full weekday names,
-- matching WEEKDAY_INDEX in
-- apps/web/app/api/ai/onboarding-assessment/assessment.ts. No competing
-- Mon / Monday / MONDAY forms — the app layer normalises before writing.
--
-- Range (Beta #002 §8): 2–6 days. Not 7 (the plan model has no first-class
-- "Rest" activity and 7 demanding days is unsafe by default); not 1 (a
-- single-day "week" is not a schedule the weekly plan is built around). The
-- CHECK also rejects any non-canonical weekday string as a backstop to the
-- app-layer sanitiser.

ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS preferred_training_days text[];

ALTER TABLE public.fitness_profile
  DROP CONSTRAINT IF EXISTS fitness_profile_preferred_training_days_check;

ALTER TABLE public.fitness_profile
  ADD CONSTRAINT fitness_profile_preferred_training_days_check CHECK (
    preferred_training_days IS NULL
    OR (
      array_length(preferred_training_days, 1) BETWEEN 2 AND 6
      AND preferred_training_days <@ ARRAY[
        'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
      ]::text[]
    )
  );

COMMENT ON COLUMN public.fitness_profile.preferred_training_days IS
  'Beta Feedback #002 — user-stated preferred training weekdays (canonical lowercase: monday..sunday), 2–6 entries, or NULL for no explicit preference (legacy behaviour). days/week is derived, never stored. A strong planning preference, never an override of time-budget/magnitude/continuity/recovery guardrails; ACP adapts the PLAN to evidence, never rewrites this stored preference.';
