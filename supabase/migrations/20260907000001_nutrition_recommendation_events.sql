-- Beta Feedback #022 — Adaptive Nutrition Planning & Learning Loop.
--
-- The ONE new table this feature needs. Everything else (meals, saved_meals/
-- saved_meal_items, food_log_entries) already exists and is reused unchanged.
--
-- RECOMMENDED / PLANNED / CONSUMED are distinct, all preserved (spec §4):
--   recommended_*  — what Lana proposed for this slot, frozen at generation time.
--   planned_*      — what the user currently intends (starts equal to
--                    recommended; changes on swap/portion — recommended is
--                    NEVER overwritten, so the original suggestion stays
--                    historical evidence even after a swap).
--   consumed_log_group_id — links to food_log_entries.log_group_id (or a
--                    single entry's own id when nothing groups it), the sole
--                    source of truth for what was ACTUALLY eaten (N1). This
--                    table never stores nutrient numbers of its own for
--                    "consumed" — it only points at the real evidence.
--
-- One row per (user, local_date, meal_slot) — the slot's whole lifecycle for
-- that day lives in one row, updated in place as the user swaps/adjusts/logs,
-- never duplicated.
CREATE TABLE IF NOT EXISTS public.nutrition_recommendation_events (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date                date        NOT NULL,
  meal_slot                 text        NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- RECOMMENDED — frozen at generation time, never overwritten by a swap.
  recommended_meal_id       uuid        REFERENCES public.meals(id) ON DELETE SET NULL,
  recommended_saved_meal_id uuid        REFERENCES public.saved_meals(id) ON DELETE SET NULL,
  recommended_label         text        NOT NULL, -- display name snapshot; survives the referenced row being deleted/deactivated later
  recommendation_reason     text,                 -- a fixed, deterministic reason code/string — never AI-invented (spec §16)

  -- PLANNED / SELECTED — what the user currently intends. Starts equal to
  -- the recommendation; a swap replaces these fields (recommended_* above is
  -- untouched), a portion change only updates planned_portion_multiplier.
  planned_meal_id           uuid        REFERENCES public.meals(id) ON DELETE SET NULL,
  planned_saved_meal_id     uuid        REFERENCES public.saved_meals(id) ON DELETE SET NULL,
  planned_label             text        NOT NULL,
  planned_portion_multiplier numeric    NOT NULL DEFAULT 1 CHECK (planned_portion_multiplier > 0),
  swapped                   boolean     NOT NULL DEFAULT false,

  -- CONSUMED — filled once the user actually logs something for this slot.
  -- Points at the real N1 evidence; no nutrient numbers duplicated here.
  consumed_log_group_id     uuid,
  consumed_at               timestamptz,

  -- 'recommended'  → nothing logged yet, still today's suggestion.
  -- 'planned'      → swapped/portioned but not yet logged.
  -- 'consumed'     → the user logged the planned meal itself ("Log this").
  -- 'replaced'     → the user logged something else entirely ("Having
  --                   something else?") — recommended/planned stay as
  --                   historical evidence; consumed_log_group_id still
  --                   records what was actually eaten, so recommended ≠
  --                   consumed is preserved rather than overwritten.
  status                    text        NOT NULL DEFAULT 'recommended'
                                         CHECK (status IN ('recommended', 'planned', 'consumed', 'replaced')),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, local_date, meal_slot),
  -- at least one recommended reference OR a label must exist; enforced at
  -- the application layer (recommended_label is NOT NULL above) rather than
  -- a cross-column CHECK, since a name-only fallback candidate is valid too.
  CHECK ((recommended_meal_id IS NULL) OR (recommended_saved_meal_id IS NULL)) -- never both at once
);

ALTER TABLE public.nutrition_recommendation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition recommendation events"
  ON public.nutrition_recommendation_events FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX nutrition_recommendation_events_user_date_idx
  ON public.nutrition_recommendation_events (user_id, local_date);
