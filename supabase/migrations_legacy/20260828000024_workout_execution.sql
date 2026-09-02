-- ACP Intelligence™ Day 3 — Today's Workout, execution, and performance
-- logging. Reuses the existing `workout_history` (already the one row per
-- attempted/completed workout, with rating/notes/exercise_notes) and
-- `workout_set_logs` (already actual-performance-per-set, keyed by
-- workout_history_id + exercise_id + set_number) tables rather than
-- introducing a parallel workout_sessions/exercise_sets schema — they
-- already cover ~everything section 7/8 of the spec asks for. The only real
-- gap: a row was previously only ever inserted at FINISH time (completed_at
-- NOT NULL DEFAULT now()), so there was no way to represent — or resume — a
-- workout that's still in progress. This migration adds that.

-- ── workout_history: add session lifecycle ──────────────────────────────────
ALTER TABLE public.workout_history
  ADD COLUMN IF NOT EXISTS started_at            timestamptz,
  ADD COLUMN IF NOT EXISTS status                text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  ADD COLUMN IF NOT EXISTS completion_percentage  numeric,
  ADD COLUMN IF NOT EXISTS perceived_difficulty   text
    CHECK (perceived_difficulty IN ('easy', 'about_right', 'difficult'));

-- Backfill: every existing row was, by definition, a completed session
-- (they were only ever inserted at finish) — started_at is unknown for these,
-- left null rather than guessed.
UPDATE public.workout_history SET status = 'completed' WHERE status IS NULL;

-- completed_at can no longer be "now() at insert time" — a session now gets
-- its row at START (completed_at = NULL, status = 'in_progress') and is
-- updated at finish. Existing rows keep their real completed_at value.
ALTER TABLE public.workout_history ALTER COLUMN completed_at DROP NOT NULL;
ALTER TABLE public.workout_history ALTER COLUMN completed_at DROP DEFAULT;

-- One in-progress session per (user, workout) at a time — the DB-level
-- backstop for "multiple Start taps -> one active session" (section 20),
-- behind the app-level check in workoutExecutionService.startWorkout.
CREATE UNIQUE INDEX workout_history_one_in_progress_uidx
  ON public.workout_history (user_id, workout_id) WHERE status = 'in_progress';

CREATE INDEX workout_history_user_workout_idx ON public.workout_history (user_id, workout_id);

-- ── workout_set_logs: make "save this set" idempotent ───────────────────────
-- No existing identity constraint meant repeatedly saving the same set could
-- only ever insert duplicates. (workout_history_id, exercise_id, set_number)
-- is the natural identity for one logged set within one session.
CREATE UNIQUE INDEX workout_set_logs_session_exercise_set_uidx
  ON public.workout_set_logs (workout_history_id, exercise_id, set_number);

-- UPDATE was missing entirely (only SELECT/INSERT/DELETE existed) — needed
-- for the upsert-on-conflict saveSet() now relies on.
CREATE POLICY "Users update own set logs"
  ON public.workout_set_logs FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
