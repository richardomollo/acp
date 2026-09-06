# Lana Pro — production migration plan (9 migrations)

Migrations `20260908000001` … `20260915000001`. Additive only — no column drop,
no `NOT NULL` added to an existing table, no `CHECK` tightened on existing data,
no table rewrite. **Not yet applied to production.**

Apply **in filename order**. The app code that depends on these must deploy
**only after all 9 are confirmed on production**.

---

## 0. Pre-flight (must verify on production before applying)

These migrations assume the following already exist in production. Check first —
a missing dependency aborts the migration (each is now transaction-wrapped, so
it rolls back cleanly, but you don't want the surprise mid-window):

| Dependency | Used by | Check |
|---|---|---|
| `public.set_updated_at()` trigger fn | 03, 05, 07 | `SELECT proname FROM pg_proc WHERE proname='set_updated_at';` |
| `public.edge_function_url(text)` | 06 | `SELECT proname FROM pg_proc WHERE proname='edge_function_url';` |
| `vault.decrypted_secrets` row `service_role_key` | 06, 07 | `SELECT name FROM vault.decrypted_secrets WHERE name='service_role_key';` |
| `net.http_post` (pg_net) | 06, 07 | `SELECT extname FROM pg_extension WHERE extname='pg_net';` |
| Tables `gym_trainers`, `gym_trainer_clients` (+ `.share_progress`) | 07, 14 | `\d public.gym_trainer_clients` |
| `pt_clients.invite_code`, `pt_clients.invited_name`, `pt_clients.share_progress` | 02, 05 | `\d public.pt_clients` |
| `client_tasks` cols: `title,notes,pt_id,due_date,recurrence,weekdays,client_user_id,created_at,status,last_completed_date` | 06 | `\d public.client_tasks` |
| `personal_trainers.professional_name`, `.full_name` | 02, 05, 07 | `\d public.personal_trainers` |
| `redeem_pt_invite_code()` | 02 (referenced in comments only) | informational |

**Also diff the two functions 06 replaces against production's current version**
— `06` does `CREATE OR REPLACE` on `trigger_session_completed_notification()` and
`trigger_client_task_assigned_notification()`, and `trigger_client_task_assigned_notification`
fires on **every `client_tasks` INSERT in production today**. `06`'s replacement
only adds a `session_record_id IS NOT NULL` early-return, but it is a *whole-body*
replacement — if production's current version does anything `06`'s doesn't, that
logic is lost. Same for `05`'s `DROP POLICY IF EXISTS "Professionals view shared
food log"` + recreate (if a prod policy of that exact name already exists with
different logic, `05` changes `food_log_entries` SELECT behaviour).

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc
 WHERE proname IN ('trigger_session_completed_notification',
                   'trigger_client_task_assigned_notification');
SELECT polname, pg_get_expr(polqual, polrelid)
  FROM pg_policy WHERE polrelid = 'public.food_log_entries'::regclass;
```

### Backup

Take a **PITR checkpoint / on-demand backup** of the project immediately before
starting. Note the timestamp — it is the rollback target for the destructive
edge cases in §3.

---

## 1. Apply

### Option A — Supabase CLI (preferred)

```
supabase link --project-ref <prod-ref>
supabase migration list          # confirm the 9 show as "local only"
supabase db push                 # applies pending, in order, records in schema_migrations
supabase migration list          # confirm all 9 now "applied"
```

### Option B — one file at a time (SQL editor or psql)

```
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260908000001_pt_client_goals.sql
# …repeat for each, in order…
```
After each: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;`
(Option B does **not** auto-record `schema_migrations` — insert the row yourself
or the CLI will try to re-run it later.)

### Lock / duration expectations

- All `ADD COLUMN` are nullable or non-volatile-default → **metadata-only, no rewrite** (Postgres 11+).
- `ADD CONSTRAINT … CHECK` / `FOREIGN KEY` scan the target table. `pt_clients` (02) is the only pre-existing non-trivial table scanned — a cheap `IN (...)` check; still, run off-peak. `professional_session_records` (06,07,09) is brand-new/tiny.
- `CREATE TRIGGER` on `pt_clients` (02) and `client_tasks` (06) takes a brief `SHARE ROW EXCLUSIVE` lock — milliseconds, but it blocks writes to that table for that instant. Prefer a low-traffic window.
- No `CREATE INDEX CONCURRENTLY` anywhere, so every index build is inside its transaction — fine, the new tables are empty.

---

## 2. Verify (after all 9)

```sql
-- tables
SELECT tablename FROM pg_tables WHERE schemaname='public'
 AND tablename IN ('gym_services','gym_access_passes','gym_service_providers',
                   'gym_service_bookings','professional_session_records');   -- expect 5

-- new columns
SELECT column_name FROM information_schema.columns
 WHERE table_name='professional_session_records'
   AND column_name IN ('client_response','plan_intent','notified_at','gym_trainer_id');  -- expect 4
SELECT 1 FROM information_schema.columns
 WHERE table_name='pt_clients' AND column_name='invite_state';
SELECT 1 FROM information_schema.columns
 WHERE table_name='client_tasks' AND column_name='session_record_id';
SELECT 1 FROM information_schema.columns
 WHERE table_name='personal_trainers' AND column_name='client_goals';

-- RLS present
SELECT tablename, count(*) FROM pg_policies
 WHERE tablename IN ('gym_services','gym_access_passes','gym_service_providers',
                     'gym_service_bookings','professional_session_records')
 GROUP BY tablename;

-- functions
SELECT proname FROM pg_proc
 WHERE proname IN ('preview_pt_invite','get_client_session_feed',
                   'client_tasks_guard_consumer_update','gym_service_bookings_guard',
                   'pt_clients_sync_invite_state');

-- grants: get_client_session_feed must be authenticated-only, NOT anon
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_name='get_client_session_feed';
```

Smoke test as a real consumer JWT: `SELECT * FROM get_client_session_feed(5);`
should return the caller's own completed sessions and nothing else.
Confirm an existing consumer can still INSERT/UPDATE a `client_tasks` row
(the new `client_tasks_guard_consumer_update` trigger must not block a normal
status update).

---

## 3. Rollback

Each migration is its own transaction, so a **failure during apply** leaves that
file un-applied and the previous files applied — fix forward or restore.

Manual `DOWN` for a migration that committed but must be reverted (run in
reverse order; stop at the point you need):

```sql
-- 20260915000001  (session outcome cols)
ALTER TABLE public.professional_session_records
  DROP COLUMN IF EXISTS client_response, DROP COLUMN IF EXISTS plan_intent;

-- 20260914000001  (hardening: indexes + fk/check swap) — safe to leave; to revert:
DROP INDEX IF EXISTS public.gym_trainer_clients_client_idx;
DROP INDEX IF EXISTS public.gym_trainer_clients_trainer_idx;
-- (the fk/check swap only relaxed ON DELETE behaviour; reverting is optional)

-- 20260913000001  (venue teams) — DROPS A TABLE:
DROP TABLE IF EXISTS public.gym_service_bookings CASCADE;   -- destroys any bookings taken since apply
DROP FUNCTION IF EXISTS public.gym_service_bookings_guard();
DROP POLICY IF EXISTS "Gym trainers manage their own session records" ON public.professional_session_records;
DROP POLICY IF EXISTS "Gym trainers view shared measurements"   ON public.client_measurements;
DROP POLICY IF EXISTS "Gym trainers view shared workout history" ON public.workout_history;
DROP POLICY IF EXISTS "Gym trainers view shared set logs"        ON public.workout_set_logs;
DROP POLICY IF EXISTS "Gym trainers view shared checkins"        ON public.daily_checkins;
DROP POLICY IF EXISTS "Gym trainers view shared fitness profile" ON public.fitness_profile;
DROP POLICY IF EXISTS "Gym trainers view shared food log"        ON public.food_log_entries;
-- get_client_session_feed / trigger_session_completed_notification were CREATE OR REPLACE'd
-- here — restore the prior definitions from your pre-apply pg_get_functiondef capture.

-- 20260912000001  (continuity) — CREATE OR REPLACE on two live trigger fns:
-- restore trigger_session_completed_notification + trigger_client_task_assigned_notification
-- from the pre-apply capture. Then:
DROP TRIGGER IF EXISTS client_tasks_guard_consumer_update_trg ON public.client_tasks;
DROP FUNCTION IF EXISTS public.client_tasks_guard_consumer_update();
DROP TRIGGER IF EXISTS session_completed_notification_trg     ON public.professional_session_records;
DROP TRIGGER IF EXISTS session_completed_notification_ins_trg ON public.professional_session_records;
ALTER TABLE public.professional_session_records DROP COLUMN IF EXISTS notified_at;

-- 20260911000001  (session delivery) — DROPS A TABLE:
ALTER TABLE public.client_tasks DROP COLUMN IF EXISTS session_record_id;
DROP FUNCTION IF EXISTS public.get_client_session_feed(int);
DROP POLICY IF EXISTS "Professionals view shared food log" ON public.food_log_entries;  -- restore prior if one existed
DROP TABLE IF EXISTS public.professional_session_records CASCADE;   -- destroys any session records taken since apply

-- 20260910000001  (booking ops)
DROP POLICY IF EXISTS "PTs create bookings for their active clients" ON public.pt_bookings;

-- 20260909000001  (gym services) — DROPS 3 TABLES:
DROP TABLE IF EXISTS public.gym_service_providers CASCADE;
DROP TABLE IF EXISTS public.gym_services CASCADE;
DROP TABLE IF EXISTS public.gym_access_passes CASCADE;

-- 20260908000002  (client invites)
DROP TRIGGER IF EXISTS pt_clients_sync_invite_state_trigger ON public.pt_clients;
DROP FUNCTION IF EXISTS public.pt_clients_sync_invite_state();
DROP FUNCTION IF EXISTS public.preview_pt_invite(text);
ALTER TABLE public.pt_clients
  DROP COLUMN IF EXISTS invited_email, DROP COLUMN IF EXISTS invited_phone,
  DROP COLUMN IF EXISTS invited_at,    DROP COLUMN IF EXISTS accepted_at,
  DROP COLUMN IF EXISTS invite_state;
ALTER TABLE public.personal_trainers DROP COLUMN IF EXISTS base_location;

-- 20260908000001  (pt_client_goals)
ALTER TABLE public.personal_trainers DROP COLUMN IF EXISTS client_goals;
```

Remember to delete the corresponding `supabase_migrations.schema_migrations` rows
for anything you manually reverted.

If any consumer-facing regression appears after apply (broken `client_tasks`
edits, `food_log_entries` visibility change, notification storm), **restore from
the pre-apply PITR checkpoint** rather than hand-reverting — the two
`CREATE OR REPLACE`'d live trigger functions are the hardest part to get right by hand.

---

## 4. Idempotency notes (for a retry after a partial failure)

| Migration | Re-runnable as-is? |
|---|---|
| 20260908000001 | yes (`ADD COLUMN IF NOT EXISTS`) |
| 20260908000002 | yes (`IF NOT EXISTS`, `DROP … IF EXISTS`, `CREATE OR REPLACE`) |
| 20260909000001 | **no** — `CREATE POLICY` has no `IF NOT EXISTS`; drop the 5 policies first |
| 20260910000001 | yes (`DO $$ … IF NOT EXISTS` guard around the policy) |
| 20260911000001 | **no** — `CREATE POLICY "PTs manage their own session records"` unguarded; drop it first |
| 20260912000001 | yes (now guarded for the kind_ids_check; `CREATE OR REPLACE` / `DROP … IF EXISTS` elsewhere) |
| 20260913000001 | **no** — bare `create table` + `create policy`; drop the objects first |
| 20260914000001 | yes (`if not exists`, `drop … if exists`) |
| 20260915000001 | yes |

Because each file is transaction-wrapped, a failure rolls the whole file back —
so a retry starts that file clean. The "no" rows above only matter if a file
*committed* and you then re-run it.
