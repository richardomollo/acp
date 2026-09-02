-- Day 6.5 — Outcome Intelligence. Widens coaching_memory.memory_type to
-- allow one new generic value, 'outcome_progress', covering all outcome
-- (measurement-based) patterns — weight/body-fat/muscle-mass/waist. The
-- specific interpretation (progressing toward goal / stable / away from
-- target / body-composition-progressing) lives in evidence.direction, not
-- in a new memory_type per variant, so identity stays (memory_type,
-- subject) = ('outcome_progress', <metric>) — one row per metric, updated
-- or deactivated exactly like every other Day 6 memory type.
ALTER TABLE public.coaching_memory DROP CONSTRAINT IF EXISTS coaching_memory_memory_type_check;
ALTER TABLE public.coaching_memory ADD CONSTRAINT coaching_memory_memory_type_check CHECK (memory_type IN (
  'overall_summary',
  'category_success', 'category_difficulty',
  'day_success', 'day_difficulty',
  'duration_success', 'duration_difficulty',
  'nutrition_focus_persistence', 'support_opportunity_persistence',
  'outcome_progress'
));
