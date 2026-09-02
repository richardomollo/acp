-- ACP Intelligence™ — Nutrition N8: Advice Effectiveness & Behaviour Change Evidence.
--
-- Fully ADDITIVE. One small user-owned table that records, when an N4
-- nutrition coaching card was ACTUALLY SHOWN to the user, the deterministic
-- STRUCTURED intervention identity plus a FROZEN "before" evidence snapshot
-- (N8 §6/§7/§11). N8 then measures, on read, how the user's SUBSEQUENT
-- logged nutrition moved relative to that frozen snapshot — an OBSERVATION,
-- never a causal claim (N8 §2/§27).
--
-- Does NOT touch food_log_entries, coaching_memory, fitness_plans, the I0
-- baseline, or any N1–N7 migration. No generated/LLM prose is stored (§7);
-- the row is the intervention, not the sentence. Owner-only RLS (§38).

CREATE TABLE IF NOT EXISTS public.nutrition_coaching_exposures (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Deterministic semantic identity (§8) — no food names, no LLM text ──
  -- opportunity_key: `nutrition:<nutrient>:<comparison>` e.g. nutrition:proteinG:below_range
  -- episode_key:     `<opportunity_key>:<shown_local_date>` — one continuous
  --                  run of this card being shown is ONE episode (§9/§35);
  --                  a new run after the evaluation horizon gets a new row.
  opportunity_key text      NOT NULL,
  episode_key     text      NOT NULL,
  nutrient        text      NOT NULL,
  comparison      text      NOT NULL CHECK (comparison IN ('below_range', 'below_reference')),
  -- Coarse action shape from the N4 opportunity (route), never prose. Nullable.
  action_kind     text,

  -- ── When it was shown (client-authored local date, like food_log_entries) ──
  shown_at         timestamptz NOT NULL DEFAULT now(),
  shown_local_date date        NOT NULL,
  timezone         text,

  -- ── FROZEN "before" snapshot (§11) — the evidence that justified coaching.
  -- Never rewritten if N3's reference later changes (§32); the episode is
  -- evaluated against THESE numbers.
  before_average       numeric,          -- avg logged nutrient/day at exposure (null only if unknown)
  before_logged_days   integer NOT NULL CHECK (before_logged_days >= 0),
  before_window_days   integer NOT NULL CHECK (before_window_days > 0),
  before_coverage_band text    NOT NULL CHECK (before_coverage_band IN ('high', 'moderate')),
  before_readiness     text    NOT NULL CHECK (before_readiness IN ('high', 'moderate')),
  reference_type       text    NOT NULL CHECK (reference_type IN ('exact', 'range')),
  reference_low        numeric,          -- range min, or exact floor value
  reference_high       numeric,          -- range max; null for an exact/floor reference
  reference_unit       text    NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Same-day idempotency (§39): re-rendering Today Nutrition many times in one
  -- day can never create a second row. Cross-day episode dedup is enforced by
  -- the service (an open episode within the horizon is reused, not rewritten).
  UNIQUE (user_id, opportunity_key, shown_local_date)
);

CREATE INDEX IF NOT EXISTS nutrition_coaching_exposures_user_idx
  ON public.nutrition_coaching_exposures (user_id, opportunity_key, shown_local_date DESC);

ALTER TABLE public.nutrition_coaching_exposures ENABLE ROW LEVEL SECURITY;

-- Owner-only. No DELETE policy — an exposure is evidence and is not user-
-- editable content (mirrors human_support_dismissals). UPDATE is allowed so
-- the service can touch updated_at / action_kind on a repeat render.
CREATE POLICY "Users view own coaching exposures"
  ON public.nutrition_coaching_exposures FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own coaching exposures"
  ON public.nutrition_coaching_exposures FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own coaching exposures"
  ON public.nutrition_coaching_exposures FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER nutrition_coaching_exposures_updated_at
  BEFORE UPDATE ON public.nutrition_coaching_exposures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
