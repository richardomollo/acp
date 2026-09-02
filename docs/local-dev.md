# ACP — Local Development & Database Baseline

## Run ACP locally

```bash
# 1. Docker Desktop must be running.
docker info

# 2. Start the local Supabase stack (Postgres 17, Auth, PostgREST, Studio, …).
supabase start

# 3. Build the database from zero: baseline + post-baseline migrations + seed.
supabase db reset            # add --local to be explicit; never pass --linked here

# 4. Local env for the apps
#    apps/mobile/.env.local  (git-ignored) — points the mobile app at local:
#      EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#      EXPO_PUBLIC_SUPABASE_ANON_KEY=<local "Publishable" key from `supabase status`>
#    apps/web/.env.local     (git-ignored) — same idea for NEXT_PUBLIC_SUPABASE_*.

# 5. Run an app
pnpm --filter mobile start        # Expo
pnpm --filter web dev             # Next.js
```

`supabase status` prints the local URLs and keys. The mobile client
(`apps/mobile/lib/supabase.tsx`) reads `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` when set and falls back to production otherwise —
so a local build needs only `apps/mobile/.env.local`, and production builds are
unaffected.

## Database baseline strategy

The migration history was **not** a from-zero chain: the oldest delta migration
(May 2026) already assumed ~30 core tables that no migration ever created, and no
schema dump lived in the repo. Fixed with a **current squashed baseline**:

```
supabase/
  migrations/
    20260505000000_baseline_remote_schema.sql   ← authoritative current schema
    20260505000001_auth_storage_bootstrap.sql   ← auth/storage objects a public-only dump can't carry
    20260901000001_nutrition_food_evidence.sql  ← post-baseline migration
    20260901000002_nutrition_food_seed.sql      ← post-baseline migration
  migrations_legacy/
    20260506*..20260831*  (165 files)           ← pre-baseline deltas, archived for history only
  seed.sql                                      ← LOCAL-ONLY seed (never deployed)
```

- **`20260505000000_baseline_remote_schema.sql`** is a read-only
  `supabase db dump --linked --schema public` of production
  (`kdmhmkwzanqnwehcddvr / fitpass-nbi`), taken 2026-09-01, **schema only — no
  row data**. Two documented, behaviour-preserving edits: `CREATE EXTENSION
  "vector"`, and hard-coded production Edge Function URLs replaced with
  `public.edge_function_url(name)` (see below).
- **`20260505000001_auth_storage_bootstrap.sql`** re-creates the
  `auth.users → handle_new_user()` trigger and the `fitpass-images` / `pt-photos`
  storage buckets + policies. A `--schema public` dump structurally cannot
  include `auth`/`storage` objects; every statement here is idempotent.
- **`migrations_legacy/`** is history. It is **not** on the Supabase migration
  path and never replays. Do not add to it.
- The baseline timestamp (`20260505000000`) predates production's recorded
  migration history, so `supabase db push` treats it as already-applied and will
  never push it to production.

## Migration rules going forward

- **Never edit `20260505000000_baseline_remote_schema.sql`** (or the legacy
  files) to add a feature. Baselines are frozen snapshots.
- Every schema change = a **new timestamped migration** in `supabase/migrations/`
  (`supabase migration new <name>`), applied locally with `supabase db reset`,
  reviewed, then deployed by whoever owns production deploys.
- Post-baseline migrations must apply cleanly on **both** a fresh local DB
  (baseline + migrations) and production (migrations only).

## Refreshing the baseline (rare, deliberate)

When the baseline has drifted far from production (many legacy-style deltas
accumulated, or a big out-of-band change):

1. `supabase db dump --linked --schema public -f /tmp/prod.sql` (read-only).
2. Re-apply the two documented edits (`vector` extension; `edge_function_url`).
3. Replace `20260505000000_baseline_remote_schema.sql` with the new dump under a
   **new** timestamp just after the last folded-in migration.
4. Move every now-incorporated `supabase/migrations/*` into `migrations_legacy/`.
5. `supabase db reset` locally and run the schema-parity check
   (`supabase db dump --local --schema public` vs the prod dump).
6. Never `supabase db push` a baseline.

## Production-link safety

- Local commands only: `supabase start`, `supabase db reset`, `supabase status`,
  `supabase db dump --local`.
- **Read-only** against production is allowed: `supabase db dump --linked
  --schema public` (schema only). It provisions an ephemeral CLI login role and
  runs `pg_dump --schema-only`; it writes nothing to production.
- **Never** run `supabase db push`, `supabase db reset --linked`, or any
  `--linked` write command as part of local work.
- The baseline contains **no** production row data, secrets, JWT keys or
  connection strings.

## Edge Function URLs (no production coupling locally)

Postgres-side Edge Function calls (`pg_net`, from `handle_new_user()` and the
`notify_*` / `trigger_*_notification` functions) previously hard-coded
`https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/...`. They now call
`public.edge_function_url('<fn>')`, which resolves the base URL from
`public.app_settings` key `edge_base_url` and **falls back to the production URL
when that row is absent** — so production behaviour is unchanged.

`supabase/seed.sql` (local only, never deployed) inserts
`edge_base_url = http://host.docker.internal:54321/functions/v1`, so local
signup / booking / notification triggers hit the local stack and never call
production.

## Local test credentials

- Local keys come from `supabase status` (shared local dev defaults — safe to
  use locally, safe to reference in `.env.local`; **never** in committed files).
- **Never put the `service_role` / `Secret` key in the mobile app.** Mobile uses
  the anon / Publishable key only. `service_role` is server-side (web API routes,
  Edge Functions) exclusively.
- `.env.local` files are git-ignored. Do not commit local secrets.
- Create local auth users via the Auth API (`POST /auth/v1/signup`) or Studio
  (`http://127.0.0.1:54323`).
