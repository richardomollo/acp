-- LANA PRO — Web Partner Onboarding, Phase 2 (Professional branch).
--
-- The ONLY schema change Phase 2 needs. Everything else the professional
-- onboarding captures already has a truthful home on personal_trainers:
--   profession       → specialisations   (existing text[])
--   service model    → session_types     (existing text[])
--   working model    → training_locations(existing text[])
--   travel/own areas → service_areas     (existing text[])
--   experience       → years_of_experience (existing int)
--   certifications   → certifications    (existing text[])
--   approval         → status = 'pending' (existing workflow, unchanged)
--
-- "Who do you help?" — the client GOALS a professional supports (§P2) — has
-- no existing column. `specialisations` is "what I do", not "the outcomes I
-- help clients reach", and the spec requires the two taxonomies stay
-- distinct. So this adds one nullable-but-defaulted text[] column. Fully
-- additive: every existing personal_trainers row backfills to '{}' as a
-- metadata-only change (Postgres 11+), and no reader is required to consume
-- it.
--
-- Deliberately NOT a lookup table: the goal vocabulary adapts to profession
-- (client-side logic in lib/lana-pro-onboarding/professional-taxonomy.ts),
-- which is not something an admin-editable flat list models well. A
-- pt_client_goals lookup can be added later if curation is needed.


begin;
ALTER TABLE public.personal_trainers
  ADD COLUMN IF NOT EXISTS client_goals text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.personal_trainers.client_goals IS
  'Client outcomes this professional supports ("who do you help"), captured at Lana Pro onboarding. Distinct from specialisations ("what I do").';

commit;
