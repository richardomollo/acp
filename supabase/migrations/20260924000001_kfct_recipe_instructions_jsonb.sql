-- Lana Recipes V1 — KFCT preparation-method import.
--
-- food_recipes.instructions was TEXT and NULL for all 142 rows (the KFCT V1
-- import deliberately left it unpopulated — see 20260923000001's report).
-- We are now importing the KFCT/FAO source's own ordered preparation
-- method for each recipe. Preferred storage is structured ordered steps,
-- optionally grouped into named sections for multi-part recipes (e.g.
-- Samosa's filling / casing / frying) — see
-- apps/mobile/lib/nutrition/recipe-instructions.ts for the shape:
--   { "sections": [ { "heading": string|null, "steps": [ { "step": number, "text": string } ] } ] }
--
-- All 142 rows are currently NULL, so this conversion touches no data —
-- USING is included only for defensiveness/documentation, not because any
-- row needs it.
alter table public.food_recipes
  alter column instructions type jsonb using (
    case when instructions is null then null else to_jsonb(instructions) end
  );

comment on column public.food_recipes.instructions is
  'Source-authored KFCT/FAO ordered preparation method (JSONB): { sections: [ { heading: string|null, steps: [ { step, text } ] } ] }. NULL means no reliable method could be extracted from source (REVIEW_REQUIRED) or the recipe genuinely has none — never LLM-generated, never inferred from ingredients.';
