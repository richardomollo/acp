-- =============================================================================
-- LOCAL DEVELOPMENT SEED — runs only on `supabase db reset` / `supabase start`.
-- Never deployed (not a migration; `supabase db push` does not apply seeds).
--
-- Isolates local dev from production: Postgres-side Edge Function calls (pg_net,
-- from trigger functions such as handle_new_user) resolve their base URL via
-- public.edge_function_url() -> public.app_settings 'edge_base_url'. Pointing it
-- at the local stack here means local signup / booking / notification triggers
-- never reach the production project. Absent this row (production) the resolver
-- falls back to the production URL, so production behaviour is unchanged.
-- =============================================================================

INSERT INTO "public"."app_settings" ("key", "value", "description")
VALUES (
  'edge_base_url',
  'http://host.docker.internal:54321/functions/v1',
  'LOCAL DEV ONLY (supabase/seed.sql) — base URL for pg_net Edge Function calls.'
)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
