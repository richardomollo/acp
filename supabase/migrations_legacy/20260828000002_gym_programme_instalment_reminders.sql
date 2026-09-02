-- Tracks whether a due-soon reminder has already gone out for an instalment,
-- separate from whether it's been paid — same pattern as
-- bookings.feedback_requested_at (20260827000001_feedback_system.sql).
ALTER TABLE public.gym_programme_instalments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
