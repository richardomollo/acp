-- ACP Intelligence™ Day 6 — human-support escalation. The human-support
-- signal itself is always re-derived from existing structured data
-- (ProgressSnapshot + workout_program_checkins + workout_program_adaptations
-- + fitness_profile + pt_clients) — cheap to recompute, so no
-- human_support_signals table is introduced (section 20's own guidance:
-- don't persist what's safely derivable). The one genuinely new piece of
-- state is the member's own dismissal action, which is not derivable from
-- anything else.
CREATE TABLE public.human_support_dismissals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger       text        NOT NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trigger)
);

ALTER TABLE public.human_support_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dismissals"
  ON public.human_support_dismissals FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users create own dismissals"
  ON public.human_support_dismissals FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Re-dismissing (e.g. after the cooldown lapses and it resurfaces) is an
-- upsert on the same row, not a new one — keeps history minimal and simple.
CREATE POLICY "Users update own dismissals"
  ON public.human_support_dismissals FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
