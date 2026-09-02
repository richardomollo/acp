-- Home page's Steps ring compares today's step count against a goal that can
-- come from either the client themselves or their assigned trainer (trainer
-- wins when both are set). No existing UPDATE policy is added for the
-- trainer column: trainer writes to a client's fitness_profile go through a
-- service-role API route only, matching the pt_programme_enrollments pattern
-- elsewhere in this schema — a client can never grant themselves a
-- trainer-set goal by writing to their own row.
ALTER TABLE public.fitness_profile
  ADD COLUMN IF NOT EXISTS daily_steps_goal          integer,
  ADD COLUMN IF NOT EXISTS trainer_daily_steps_goal   integer;
