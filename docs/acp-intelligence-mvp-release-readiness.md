# ACP Intelligence™ — MVP Release Readiness

_Last updated: 2026-08-30 (Day 10). Owner: engineering. This is an engineering
readiness record, not a legal/policy document._

---

## 1. Architecture summary

The closed product loop, all built Days 1–9:

```
GOAL → ASSESS (onboarding-assessment route) → PLAN (AIAssessment / fitness_plans)
     → FULFIL (supply orchestration, self-directed fallback)
     → EXECUTE (workout hub / activity cards)
     → CAPTURE (plan_activity_completions + plan_activity_execution)
     → LEARN (longitudinal.ts + execution.ts → coaching_memory)
     → ADAPT (weekly-adaptation route, deterministic guardrails)
     → EXPLAIN (Day 8 coaching layer, deterministic, no LLM)
     → NEXT WEEK
```

**LLM usage:** exactly two OpenAI *chat* calls (`gpt-5-mini`, `reasoning_effort:minimal`,
`max_completion_tokens:1600`) — one per onboarding assessment, one per weekly
adaptation. One embeddings model (`text-embedding-3-small`, 1536-dim) for the
knowledge corpus only. **No LLM call on**: feedback submission, activity
completion, any Day 8 explanation surface, or any Home/My Plan/My Goals render.

**Determinism:** plan comparison, "why this plan", the weekly coaching brief,
progress explanation, execution reconciliation, execution patterns, meal
selection, supply matching, support eligibility, and all adaptation guardrails
are pure deterministic code.

---

## 2. Production dependencies

| Dependency | Used for | Failure behaviour |
|---|---|---|
| OpenAI Chat (`gpt-5-mini`) | onboarding assessment, weekly adaptation | onboarding → 502, mobile client falls back to deterministic rule-based plan; adaptation → `buildDeterministicFallbackPlan` (current plan carried forward). 45s hard client-side timeout. |
| OpenAI Embeddings (`text-embedding-3-small`) | knowledge corpus ingestion + retrieval query embedding | retrieval returns `{ok:false}` → domain marked failed → adaptation runs with no knowledge block. 30s timeout, ≤2 retries (429/5xx only). |
| Supabase (Postgres + Auth) | everything (RLS-enforced) | read/write errors surface as 500 on the failing route only; the current plan mirror in `fitness_profile` is written before best-effort history/memory writes. |
| MuscleWiki | exercise video enrichment in strength execution | pre-existing local/seeded exercise fallback; not on the ACP Intelligence critical path. |
| Strava (read-only) | run/walk/cycle completion evidence | manual completion + plan + adaptation all work without it. |
| ACP marketplace / supply | fulfilling a plan activity with a class/PT | self-directed option shown when no supply matches; zero-result is a normal path. |
| Sentry (`@sentry/react-native`) | mobile crash + error monitoring | best-effort; no app impact if unreachable. |

---

## 3. Required environment variables

**Web (Vercel) — required for AI features:**

| Var | Required? | Missing behaviour |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **required** | routes 500 |
| `SUPABASE_SERVICE_ROLE_KEY` | **required** | routes 500 |
| `OPENAI_API_KEY` | **required for AI** | onboarding → 503 (client rule-based fallback); adaptation → deterministic fallback (current plan) |
| `OPENAI_EMBEDDING_MODEL` | optional | defaults to `text-embedding-3-small` |

**Web — optional operational controls (see §4):**
`ACP_WEEKLY_ADAPTATION_ENABLED`, `ACP_RAG_ENABLED`, `ACP_EXECUTION_FEEDBACK_ENABLED`,
`ACP_DEBUG_ADAPTATION` (dev-only verbose stage logs), `ACP_SILENCE_LOGS`.

**Mobile (Expo, build-time inlined):**
`EXPO_PUBLIC_ACP_EXECUTION_FEEDBACK_ENABLED`, `EXPO_PUBLIC_ACP_INTELLIGENCE_ENABLED`
(both default enabled), Sentry DSN (currently hardcoded in `app/_layout.tsx` — see §9 P3).

`apps/{mobile,partners}/service-account.json` are **local-only** (git-ignored,
never committed) and are not bundled by Expo (project-root files aren't imported).

---

## 4. Feature flags / kill switches

Three env-controlled switches. Each defaults **ON**; off only when the value is
exactly the string `"false"`. Implemented in `apps/web/lib/flags.ts` +
`apps/mobile/lib/flags.ts`.

| Flag | Off behaviour |
|---|---|
| `ACP_WEEKLY_ADAPTATION_ENABLED=false` | weekly-adaptation route returns the user's **current plan unchanged** (`alreadyExisted:true`). Onboarding, My Plan, completion, feedback unaffected. |
| `ACP_RAG_ENABLED=false` | weekly adaptation runs with **no RELEVANT ACP KNOWLEDGE block** (identical to a live RAG outage — already handled). |
| `ACP_EXECUTION_FEEDBACK_ENABLED=false` | adaptation prompt gets **no EXECUTION EVIDENCE block**, no execution-pattern memory written. Mobile hides the feedback/skip UI via `EXPO_PUBLIC_ACP_EXECUTION_FEEDBACK_ENABLED=false`. Completion/partial/skip still work. |

There is deliberately **no** `ACP_INTELLIGENCE_ENABLED` server flag — disabling
onboarding assessment wholesale would strand a new user. Use
`EXPO_PUBLIC_ACP_INTELLIGENCE_ENABLED=false` on the client if the whole surface
must be hidden (falls back to the static rule-based plan).

---

## 5. Failure behaviour (validated Day 10)

| Injected failure | Result |
|---|---|
| OpenAI chat timeout / abort | 45s deadline → `AbortError` → onboarding 502 → client rule-based plan; adaptation → `buildDeterministicFallbackPlan`. Unit-tested (`fetchWithTimeout`). |
| OpenAI 429 / 5xx | classified (`OPENAI_RATE_LIMIT` / `OPENAI_SERVER_ERROR`), logged, same fallback. |
| RAG retrieval throws / embedding fails | `try/catch` non-blocking; `Promise.allSettled` per domain; `knowledge_retrieval_failed` + `embedding_request_failed` logged; adaptation runs without the block. Live-validated (`ACP_RAG_ENABLED=false`, A1 → PASS). |
| Execution table/evidence unavailable | `try/catch` non-blocking; adaptation runs from behaviour evidence. Live-validated (`ACP_EXECUTION_FEEDBACK_ENABLED=false`, N2 → PASS). |
| Coaching-memory sync fails | `try/catch` non-blocking; plan already saved; `coaching_memory_sync_failed` logged. |
| Supabase write to `fitness_plans` history fails | best-effort, not awaited-as-hard-error; current plan mirror in `fitness_profile` already saved. |
| Concurrent adaptation requests (same week) | idempotency by `(user_id, week_start_date)` before the OpenAI call; `23505` race handled by returning the winner. |
| Rapid "Mark done" / feedback taps | `plan_activity_completions` `UNIQUE(user_id,plan_id,activity_index)`; `plan_activity_execution` `onConflict` upsert; mobile `inFlightRef` / `generatingReview` guards. |

---

## 6. Observability

**Web** — structured single-line JSON to stdout (`apps/web/lib/observability.ts`,
`logAcpEvent`), captured by the Vercel log stream / any drain. No PII, no
prompts, no responses, no measurements — counts, durations, coarse flags, a
stable `failureCode`, and OpenAI `usage.*` token **counts** only.

Events: `initial_assessment_started|completed|failed`,
`weekly_adaptation_started|completed|fallback`,
`knowledge_retrieval_completed|failed`, `embedding_request_failed`,
`execution_summary_built`, `coaching_memory_sync_completed|failed`.

Failure taxonomy (`AcpFailureCode`): `OPENAI_TIMEOUT`, `OPENAI_RATE_LIMIT`,
`OPENAI_INVALID_RESPONSE`, `OPENAI_SERVER_ERROR`, `RAG_EMBEDDING_ERROR`,
`RAG_QUERY_ERROR`, `SUPABASE_READ_ERROR`, `SUPABASE_WRITE_ERROR`, `SUPPLY_ERROR`,
`VALIDATION_ERROR`, `UNKNOWN_ERROR`. **Never surfaced to users.**

**Latency** captured in `durationMs` on `*_completed` / `*_fallback`.
**LLM cost:** `promptTokens` / `completionTokens` / `totalTokens` on
`*_completed` (from the OpenAI `usage` field); embeddings expose no per-request
usage in this integration — documented gap.

**Mobile** — Sentry crash reporting + on-error session replay (masked, see §9).

Dev-only deep trace: `ACP_DEBUG_ADAPTATION=1` → `logAdaptationStage` (stdout,
plan-shape data only, never PII).

---

## 7. MVP behavioural metrics (derive from operational tables — no analytics SDK)

No analytics provider is installed (deliberate — §18 of the Day 10 brief). The
tables answer the MVP questions directly. Reference queries (adjust window):

| Metric | Source |
|---|---|
| Onboarding → first plan | `fitness_profile` rows with `ai_assessment_generated_at NOT NULL` ÷ onboarded users |
| First plan → first activity completed | users with ≥1 `plan_activity_completions` row ÷ users with a plan |
| Planned / completed / partial / skipped | `fitness_plans.assessment→activities` count vs `plan_activity_completions` count vs `plan_activity_execution.execution_status` tallies |
| Feedback participation | `plan_activity_execution` rows with `difficulty NOT NULL` ÷ completed+partial eligible activities |
| Plan fit | `plan_activity_execution` `difficulty` histogram (`too_easy` / `about_right` / `too_hard`) |
| Common barriers | `plan_activity_execution` `skip_reason` histogram (status = `skipped`) |
| Week 1 → week 2 | users with ≥2 `fitness_plans` rows |
| Weekly adaptation success | `weekly_adaptation_completed` vs `weekly_adaptation_fallback` log-event counts |
| Coaching interaction (brief / Why plan / What changed / ACP noticed) | **not measurable** without client analytics — see post-MVP backlog |

---

## 8. Known limitations

| ID | Severity | Description |
|---|---|---|
| **H1** | P2 debt | Recovery-spacing scenario: model may label a re-spaced week `progress` where the benchmark expects `keep|rebalance`. Stable across 7.5B/D/E. Deterministic guards contain the plan; label only. |
| **N1** | **P1** | On an extreme synthetic week (3 of 4 sessions all `too_hard`, 4/4 completed, sessions `challenging` by design) the model may still label `progress` and nudge weekly minutes up ~+9% (+20 min on 240). Bounded by magnitude/time-budget/continuity guards — not a guard bypass — but a conservatism miss. Removing the execution feedback does not change it (it's the model's baseline read of "4/4 completed + challenging"). Fix path: a deterministic "repeated `too_hard` in-week ⇒ cap workload delta at 0" reconciliation (Day-9-style guard; needs its own validation; not built in Day 10). |
| **N8** | P2 debt | `N8` benchmark `allowedDecisions` is tighter than equivalent Day 7 mixed-adherence scenarios; `rebalance` on a 50%-adherence week is acceptable pre-Day-9 behaviour. Not a regression. |
| Planned-vs-performed sets | P2 | `workout_set_logs` has actual sets/reps/load but no stored **planned** sets per session → "fewer sets than planned" is not derivable. |
| Embedding token/cost visibility | P2 | this integration's embeddings response is not parsed for `usage`; only failures/counts are logged. |
| Coaching-surface engagement | P2 | no client analytics → brief/Why/What-changed/ACP-noticed interaction is unmeasured. |
| Onboarding server-side fallback | P2 | onboarding route returns 502 on model failure; the deterministic plan is produced **client-side** only. Acceptable (user never stuck) but server has no fallback plan. |
| Mobile Sentry DSN | P3 | hardcoded in `app/_layout.tsx` (DSNs are client-embedded by design). |

---

## 9. Privacy / security review

- **RLS**: every ACP table (`fitness_profile`, `fitness_plans`,
  `plan_activity_completions`, `plan_activity_execution`, `coaching_memory`,
  `client_measurements`, `workout_history`, `workout_set_logs`, `health_profile`)
  is `ENABLE ROW LEVEL SECURITY` with owner-only (`user_id = auth.uid()`)
  SELECT/INSERT/UPDATE/DELETE as appropriate. `coaching_memory` is
  **SELECT-only** for the user (writes are service-role from the adaptation
  route). `knowledge_documents`/`knowledge_chunks` have **zero policies** →
  anon/authenticated can neither read nor write; service-role only.
- **Admin knowledge routes** (`/api/admin/knowledge/*`) require `requireAdmin`
  (Bearer token → `users.role = 'admin'`).
- **Account deletion**: `/api/admin/delete-user` → `auth.admin.deleteUser()`;
  every ACP table has `user_id … REFERENCES auth.users(id) ON DELETE CASCADE`
  → **no orphan rows**.
- **Data minimisation**: no raw prompts or raw model responses are persisted
  anywhere. `fitness_profile.ai_assessment` stores the **validated structured
  output** only. No chain-of-thought. `logAcpEvent` never logs content.
- **Server logs**: `console.error` on the OpenAI-failure path was trimmed to
  `errText.slice(0, 200)` and no longer logs the full raw model response.
- **Secrets in source**: none found in tracked files. `.env*` and
  `*service-account.json` are git-ignored (`.gitignore` lines 44-49);
  `git ls-files` confirms `service-account.json` is not tracked.
- **Sentry (mobile)** — hardened Day 10: `sendDefaultPii: false`,
  `replaysSessionSampleRate: 0` (error-replays only), and
  `mobileReplayIntegration({ maskAllText, maskAllImages, maskAllVectors })` so a
  replay can never capture a body measurement, goal, or coaching message.

---

## 10. Migration validation

163 migrations, chronologically ordered, latest `20260830000001_execution_evidence.sql`.
Day 10 adds no migration. `plan_activity_execution` is additive/parallel to
`plan_activity_completions` — every existing binary-completion read is unchanged.
`coaching_memory.memory_type` CHECK was extended (`DROP IF EXISTS` / `ADD`,
full prior list preserved + `execution_pattern`). Constraints match app code
(execution status / difficulty / skip-reason enums mirror `lib/execution.ts`).
**Action before beta:** apply migrations to the production DB from a clean
baseline and confirm they run in order (Supabase CLI `db push` or equivalent).

---

## 11. Release state — subsystems

- **RAG:** 17 approved documents / 29 chunks (training 10, nutrition 2,
  coaching 3, recovery 2), 0 non-approved rows. Production retrieval is
  approved-only; `KNOWLEDGE_MIN_SIMILARITY = 0.3`; embedding model/dimension
  consistent (`text-embedding-3-small` / 1536). RAG-disabled fallback validated.
- **Nutrition:** deterministic selection (hash, never `Math.random()`); Kenyan
  data intact; no fabricated nutrition records; missing meal slots degrade
  gracefully. No corpus change in Day 10.
- **Supply:** eligibility-gated, commercially neutral (no commission/ranking
  weighting), self-directed fallback on zero results. No change in Day 10.
- **Day 8:** internal decision labels (`keep/progress/simplify/rebalance/adjust`)
  never reach the user — verified by tests + `copy-safety` guard; brief / Why
  this plan / What changed / progress / ACP noticed all handle missing data.
- **Day 9:** completed/partial/skipped, optional feedback, optional skip reason,
  undo, skip→complete, partial→complete, single-event ≠ pattern — all
  test-covered; no LLM on feedback; no mid-week regeneration; no embeddings.
- **Adaptation guards:** time-budget, magnitude, continuity, support, grounding
  — unchanged, still downstream of any execution-influenced adaptation.

---

## 12. Test status (Day 10)

| Suite | Result |
|---|---|
| Web `npm test` | **377 pass / 0 fail** |
| Web `tsc --noEmit` | **0 errors** |
| Mobile `npm test` | **520 pass / 0 fail** |
| Mobile `tsc --noEmit` (main config) | **0 errors** (5 pre-existing errors in untouched `lib/__tests__/{ai-assessment,home-intelligence}.test.ts`) |
| Deterministic 50-scenario evaluation | **50/50 retrieval-domain pass**, expectations unchanged |
| Bounded live smoke (7 cases) | J1, A1, C1, N2, K1 PASS · N1 CRITICAL (P1 known debt) · H1 MAJOR (P2 known debt) |
| Failure injection | RAG kill switch, execution kill switch, OpenAI timeout, embedding failure — all degrade as intended |

---

## 13. Rollback / kill-switch instructions

Incident response, least-disruptive first (all env-var only, no redeploy of app
code needed — set on Vercel and redeploy the web project, or use runtime env if
the platform supports it):

1. **RAG misbehaving / embeddings failing** → `ACP_RAG_ENABLED=false`.
   Weekly adaptation keeps working without knowledge context.
2. **Execution feedback causing bad adaptations** → `ACP_EXECUTION_FEEDBACK_ENABLED=false`
   (web) **and** `EXPO_PUBLIC_ACP_EXECUTION_FEEDBACK_ENABLED=false` (mobile OTA/build).
   Completion, partial and skip still work; the feedback UI hides.
3. **Weekly adaptation producing unsafe/odd plans** → `ACP_WEEKLY_ADAPTATION_ENABLED=false`.
   Every user keeps their current plan; nothing regenerates. Investigate via
   `weekly_adaptation_fallback` / `weekly_adaptation_completed` log events.
4. **Onboarding assessment failing at scale** → the mobile client already falls
   back to the deterministic rule-based plan on any route failure; no switch
   needed. If desired, unset `OPENAI_API_KEY` to force the fallback path.
5. **Total AI incident** → `EXPO_PUBLIC_ACP_INTELLIGENCE_ENABLED=false` (mobile)
   hides the AI surfaces; static plan remains.

Preserve DB state throughout — no ACP table is dropped or truncated by any of
the above.

---

## 14. Beta checklist

- [ ] Production `OPENAI_API_KEY`, Supabase URL + service-role key configured on Vercel.
- [ ] All migrations applied to the production DB from a clean baseline, in order.
- [ ] Kill-switch env vars present and set to enabled (or omitted).
- [ ] Web deploy emitting structured `acp-intelligence` log events (spot-check Vercel logs).
- [ ] Mobile build with hardened Sentry config (masked replay, `sendDefaultPii:false`).
- [ ] Manual iOS QA checklist (§15) run on a physical device — **PENDING**.
- [ ] Manual Android QA checklist (§15) run on a physical device — **PENDING**.
- [ ] Beta cohort scoped to 10–20 users.
- [ ] Research guide (§16) shared with the product team.
- [ ] Metric baseline queries (§7) saved and runnable.
- [ ] Known limitations (§8) acknowledged by product; N1 accepted for beta or capped by the deterministic guard fix first.

---

## 15. Manual QA checklist (physical device — PENDING)

Claude cannot run devices; every item below is **PENDING** manual execution.

**iOS + Android, critical journey:**
- [ ] Sign up → onboarding → goal set → first plan renders (< ~15s or fallback shown)
- [ ] Home: coaching brief renders; today's activity card correct
- [ ] My Plan: activities, "Why this plan?" expands with real reasons, "What changed?" (or absent on first week)
- [ ] Open an activity → workout execution → finish
- [ ] Mark as done → "How did that feel?" appears for a strength/cardio activity → tap a chip → dismisses
- [ ] "Couldn't do this one?" → skip reason chips → tap one → "Marked as not done" → undo works
- [ ] Undo a completion → feedback prompt clears, execution row gone
- [ ] My Goals: outcome/ACP-noticed cards or the "needs more data" empty state
- [ ] Trigger weekly review (week ended) → new plan → "What changed?" shows deterministic deltas
- [ ] **Airplane mode**: Home/My Plan render from cache-or-empty; no crash; taps queue or no-op, no duplicate rows on reconnect
- [ ] Background → foreground mid-generation: no stuck spinner, no duplicate plan
- [ ] Force-quit → relaunch: session restored, plan intact
- [ ] Long goal name / long activity title / long coaching message: no overflow, chips wrap cleanly
- [ ] Dynamic type (large font): feedback chips + cards remain usable
- [ ] VoiceOver / TalkBack: "Why this plan?" announces expanded/collapsed; feedback chips announce role + label

---

## 16. Beta research guide (for the founder/product team — NOT in the app)

1. What did you think ACP was helping you with?
2. Did the weekly plan feel realistic for your week?
3. Was anything confusing?
4. Which recommendations did you actually use? Which did you ignore, and why?
5. Did "Why this plan?" make sense?
6. Did ACP's changes from one week to the next feel sensible?
7. Did the "how did that feel?" / skip prompts feel useful or annoying?
8. What would make you come back next week?

---

## 17. Post-MVP backlog (do NOT build pre-beta)

- **Intelligence quality:** deterministic "repeated `too_hard` ⇒ no workload
  increase" reconciliation (fixes N1); decision-label/plan consistency guard
  (H1); loosen/re-derive N8 expectation.
- **Observability:** web error-monitoring provider; embedding `usage` parsing;
  a cheap cost dashboard from the token-count events.
- **Analytics:** lightweight client event capture for coaching-surface
  engagement (brief / Why plan / What changed / ACP noticed / feedback taps).
- **Workout execution depth:** capture planned sets/reps per session to enable
  planned-vs-performed comparison.
- **Onboarding:** server-side deterministic fallback plan (parity with adaptation).
- **Config:** move Sentry DSN to an env var.
- Everything explicitly out of scope in the Day-10 brief §0 (chat, agents, new
  engines, wearables, predictive modelling, etc.) — evidence-gated only.

---

## 17b. Beta Feedback #001 — Sunday next-week preview (post-MVP iteration 1)

Evidence-driven change (a Week-1 user wanted next week's plan on Sunday to
plan/book ahead). **No intelligence change** — model, prompt, RAG, corpus,
guardrails, thresholds all unchanged; this is a timing/eligibility/persistence
change to weekly adaptation.

- **Migration `20260831000001`**: `fitness_plans.status` gains `'scheduled'`
  (additive CHECK extension). A plan generated before its week starts is
  stored as `scheduled`; it is **not** promoted into
  `fitness_profile.ai_assessment` until its week begins, so the user keeps
  the current week through Sunday. Promotion happens on the next
  weekly-adaptation call once the week has started (idempotency branch — no
  second LLM call).
- **Eligibility**: `isSundayPlanningWindow` — the current plan's own last day
  (a Sunday by construction), in the **device local timezone**. 100%
  completion is not required; a remaining Sunday activity does not block it.
- **Surface (iteration 1a)**: a dedicated `apps/mobile/app/next-week-plan.tsx`
  screen, replacing the earlier in-page `This week | Next week` toggle on My
  Plan. My Plan (and Home) only show a "Your next week" CTA on the last day
  of the week; the CTA routes to `/next-week-plan`. That screen owns the
  prepare/review + book-ahead flow: it renders the `scheduled` plan
  read-only (no completion controls) with each activity's future
  `planned_date` and its own `ActivityFulfilmentCard`, plus deterministic
  "Why this plan?" / "What changed vs this week?" (same `@/lib/coaching`
  helpers). "Prepare next week" calls the unchanged
  `/api/ai/weekly-adaptation` route; on a non-Sunday with nothing prepared
  the screen just links back to My Plan for the current week. My Plan's
  Monday auto-promotion effect is unchanged.
- **Idempotency**: unchanged `UNIQUE(user_id, week_start_date)` guard — one
  canonical plan per target week; later Sunday evidence is **not** reconciled
  into an already-prepared plan (§6 of the feedback brief — planning
  stability over last-minute information).
- **Fulfilment**: next-week activities resolve their own future
  `planned_date` (supply matcher already prefers `planActivity.planned_date`),
  so a Wednesday-next-week class books the coming Wednesday, not the current
  week's.
- **Kill switch**: `ACP_WEEKLY_ADAPTATION_ENABLED=false` disables generation
  (the CTA becomes a no-op that returns the current plan); no new flag added.
- **Timezone (client is local-date driven)**: the server's target-week math
  stays UTC (`week_end_date + 1`, TZ-independent), but every client-side
  week-boundary judgment on My Plan is the user's **local** calendar date —
  `sundayWindow` (`isSundayPlanningWindow`), `reviewReady` (local
  `today > week_end_date`), and the Monday auto-promotion guard. This keeps a
  user west of UTC from being shown next week's promoted plan, or a "Last
  week" label / "See my weekly review" button, while it's still their last
  day (their Sunday, UTC already Monday). If the client calls promote while
  its local date has crossed but server UTC hasn't, the route just re-returns
  the plan as `scheduled` (no-op) and promotion completes on the next open.
  No timezone architecture introduced.
- **Known UI limitation**: the next-week screen intentionally omits the
  "Want extra support?" / progress / execution-feedback sections — those are
  current-week concerns and stay on My Plan.
- Observability: `weekly_adaptation_completed` now carries `scheduled` /
  `promoted` / `targetWeekStart`. Beta funnel (window shown → prepared →
  reviewed → booked → executed) is derivable from `fitness_plans` (a
  `status='scheduled'` row = prepared; it flipping to `'active'` = reached
  its week) plus the existing booking/completion tables.

## 17c. Beta Feedback #002 — user-controlled training schedule (post-MVP iteration 2)

Evidence-driven: an advanced user (Paul) with a settled Mon–Fri routine felt
ACP constrained him to ~3 training days. **No intelligence change** — model,
RAG, corpus, embedding model, supply ranking, nutrition, execution/coaching-
memory thresholds, and the time-budget / magnitude / continuity / recovery /
support guardrails are all unchanged. This adds one structured user
preference and threads it into the two existing planning prompts + the
deterministic fallback.

- **Root cause**: ACP had no *training frequency / preferred days* concept
  anywhere. The ~3-day outcome came from (a) the onboarding prompt's
  `"prefer fewer/shorter sessions over more"` bias, (b) the weekly minutes
  budget × the model's ~60–90 min session sizing, and (c) `enforceTimeBudget`
  trimming to ~115% of budget. There is **no** deterministic "advanced → N
  sessions" cap and **no** enforced strength-day spacing (recovery spacing is
  prompt/RAG guidance only). `MAX_ACTIVITIES` was already 7.
- **Data model**: one additive nullable column
  `fitness_profile.preferred_training_days text[]` (migration
  `20260901000001`). Canonical lowercase weekday names, Monday-first;
  CHECK enforces 2–6 entries and the canonical set. **Frequency is derived**
  from the array length — never a second stored number, so the two can't
  disagree (spec §7 option B). `NULL` = "no explicit preference" ⇒ **exact
  existing planning behaviour** (spec §32/§33); it never means "3 days".
- **Availability vs preference**: availability stays
  `health_profile.hours_exercising_per_week` (the canonical time budget);
  the new column is the *structure* preference. They are never collapsed.
- **Initial assessment**: `buildUserPrompt` adds a "Preferred training days
  (user-stated)" line when ≥2 canonical days are present — organise onto
  those days, keep others free, distribute the *same* budget, not every day
  demanding, still bounded by budget/experience/safety. `"prefer fewer
  sessions"` is now scoped to the no-preference case.
- **Weekly adaptation**: route now selects `preferred_training_days` and
  passes it to `buildWeeklyAdaptationUserPrompt`, which emits a "TRAINING
  SCHEDULE PREFERENCE" section, and to `buildDeterministicFallbackPlan`. The
  system prompt gains a matching block: strongly respect; do not inflate
  minutes or session count; do not assume every day is demanding; **never
  rewrite/narrow the stated preference from behaviour — adapt the plan, not
  the preference** (spec §13/§14). Time budget, magnitude, adherence/
  recovery precedence and continuity are explicitly unchanged.
- **Deterministic fallback**: when a preference is set, carried-forward
  activities are reassigned onto the preferred weekdays (same activities,
  durations, categories, intensities, **count** — only `day` changes), then
  the usual `enforceTimeBudget` + `attachPlanDates`. No new activities, no
  new coaching logic. Without a preference, days are carried forward verbatim
  as before.
- **Time budget**: frequency distributes the budget, never expands it —
  `hours_exercising_per_week` is untouched by day selection; `enforceTimeBudget`
  still the hard ceiling. Covered by fallback tests (count + minutes
  unchanged) and prompt wording.
- **Plan stability (spec §11/§28)**: editing the preference in My Goals /
  onboarding only writes the column — it does **not** regenerate. The
  current plan and any already-prepared `scheduled` next-week plan are
  untouched; the preference is read the next time weekly adaptation /
  initial assessment runs. Feedback #001's Sunday "prepare next week" reads
  the latest column value like any other profile field — no separate
  regeneration path was added.
- **My Goals**: new always-visible "Training Schedule" section — 7 day pills,
  a derived "N days per week · Mon · Tue · …" line, and the note "Changes
  apply the next time ACP prepares your plan — your current week stays as it
  is." Onboarding adds the same compact day picker to the existing
  "activities" step (no new step); skipping it, or picking <2 days, persists
  `NULL`.
- **Explainability (Day 8)**: `buildPlanExplanation` gains one `schedule`
  reason — "Built around the days you prefer to train" — surfaced only when
  a preference is set AND the plan's activity days actually sit within it
  (`provenance.source = 'profile'`, `detail = 'training_schedule'`). Only one
  schedule reason is ever emitted (the time-budget one is the fallback).
- **RAG / coaching memory (spec §15/§16)**: unchanged. The preference is
  structured profile state — never embedded, never a `knowledge_chunk`,
  never written as inferred coaching memory.
- **Privacy / observability (spec §30/§31)**: normal `fitness_profile`
  owner-only RLS; no new service-role path (editing is a direct client
  upsert). `initial_assessment_completed` / `weekly_adaptation_completed`
  carry a non-sensitive `scheduleDaysPerWeek` **count** only — the specific
  weekdays are never logged.
- **Bounded AI validation (spec §41)**: PENDING — requires
  `ACP_RUN_LIVE_AI_EVAL=1` + an OpenAI key (not available in this
  environment). The deterministic eval (`evaluate-weekly-adaptation.ts`)
  still passes 50/50 with 0 model calls and no scenario-expectation changes.
- **Known limitations**: (1) live schedule-adherence of the model is
  unverified pending the bounded eval above; (2) if a fallback plan has more
  activities than preferred days, some days double up (acceptable for a
  rare fallback; the AI path spreads them); (3) physical-device persistence
  QA is PENDING.

## 17d. Beta Feedback #003 — explicit rebuild of an already-prepared future plan (post-MVP iteration 3)

Beta #002 correctly protects plan stability: changing `preferred_training_days`
never mutates the current plan **or** an already-generated `scheduled`
next-week plan. That left a gap — a user who *deliberately* changes their
preference before the upcoming week starts had no way to ask ACP to rebuild
the prepared plan. **No intelligence change**: same model, prompt, RAG,
corpus, guardrails, and the same weekly-adaptation engine. The only route
changes are an eligibility gate and an in-place row replacement.

- **Why the plan didn't update**: the weekly-adaptation route's idempotency
  branch — `existingPlan` for `week_start_date === nextWeekStart` →
  early-return — is hit before any generation. Beta #001/#002 intentionally
  never regenerate a `scheduled` row.
- **Explicit intent**: the request body gains an optional
  `regenerateFuturePlan: boolean`. `isFutureRegenerationEligible()` (pure,
  unit-tested) accepts it **only** when all hold: flag is strict `true`;
  `isAdvanceGeneration` (target week still in the future); an existing row
  for that week with `status === 'scheduled'`; and this call is not
  simultaneously a promotion. Any call without the flag is unchanged and
  stays idempotent. Authentication is enforced first, unconditionally.
- **Current-week protection**: a started week has `isAdvanceGeneration ===
  false` ⇒ not eligible ⇒ falls into the normal branch (promote or return).
  An already-`active` plan is never `scheduled` ⇒ never replaced. The
  `fitness_profile.ai_assessment` mirror is never touched by this flow.
- **Safe replacement (atomic)**: generation + every guardrail
  (`enforceTimeBudget`, `enforceAdaptationMagnitude`,
  `preserveMeaningfulActivityContinuity`, `enforceAdaptationSupportLogic`,
  `attachPlanDates`) runs to a validated `finalAssessment` FIRST. Only then
  is the single `fitness_plans` row updated in place — `UPDATE … SET plan_id,
  assessment, week_end_date WHERE id = <row> AND status = 'scheduled'`,
  followed by a read-back that the new `plan_id` landed. `UNIQUE(user_id,
  week_start_date)` + update-by-id guarantee **exactly one** canonical plan
  for the week; `week_start_date` and `based_on_plan_id` are unchanged. On
  AI failure, or if the read-back shows the row was promoted out from under
  us, the route returns `error: 'regeneration_failed'` with the **untouched**
  existing plan and 502/409 — the old plan always survives failure. The
  deterministic fallback is **not** used to replace a prepared plan.
- **Plan history**: the previous `scheduled` version is replaced in place
  (never promoted, never executed against, so nothing that survives it — a
  future week has no completion/execution rows, and bookings never reference
  `plan_id`). No duplicate rows, no orphaned history.
- **Future bookings**: bookings (`bookings` / `pt_bookings` /
  `experience_bookings`) have **no** link to `fitness_plans` — a plan
  activity and a booking are only ever matched later, client-side, at
  check-in (`findAcpBookingCandidates`, keyword+date). Regeneration touches
  only the plan row, so it never cancels, moves, or hides a booking. The
  confirmation dialog shows a best-effort "you already have N bookings for
  next week — updating your plan won't cancel them" line when
  `bookings.booking_date` / `pt_bookings.scheduled_date` fall in the target
  week. Deterministic injection of booked activities into the regenerated
  plan is **not** attempted (the model regenerates freely); documented.
- **Latest preference propagation**: the route already re-reads the full
  profile (`goal`, `experience_level`, `barriers`, `preferred_activities`,
  `preferred_training_days`, `activity_level`) + `hours_exercising_per_week`
  and rebuilds the longitudinal / execution / outcome / coaching-memory
  contexts on every call, so a regeneration inherently uses the latest of
  all of them. No change needed.
- **Dirty-state detection**: purely structural — `scheduledPlanNeedsScheduleUpdate()`
  returns true only when a scheduled future plan exists whose week hasn't
  started, the user has a ≥2-day preference, and at least one of the plan's
  activity weekdays sits outside that preference. Visiting the editor
  without changing anything never trips it; after a successful rebuild the
  new plan fits the preference, so the CTA disappears. No timestamp column,
  no config-version infra.
- **UX**: My Goals shows "Your next-week plan was prepared before this
  change · Review & update →" (links to the next-week screen) when dirty.
  The `/next-week-plan` screen hosts the flow: a "Preference changed"
  card with **[Update next week's plan]** → confirmation Alert ("We'll
  rebuild your upcoming plan using your new training preferences. Your
  current week won't change." + the bookings line) → "Updating next week's
  plan…" → "Next week's plan has been updated." (transient) or "We couldn't
  update next week's plan. Your existing plan is still available." with a
  Try again. A rapid double-tap is guarded client-side (`regenerating`) and
  cannot create a duplicate server-side (update-by-id).
- **Observability**: `weekly_adaptation_completed` carries `regenerated:
  true` for a rebuild; `scheduleDaysPerWeek` unchanged. No weekday combos.
- **Migration**: none.
- **Beta #001 / #002 regression**: Sunday advance generation, Monday
  promotion, idempotency for normal calls, fulfilment dating, and the
  training-schedule preference all covered by existing + new tests, all
  passing (web 401, mobile 590). Deterministic eval 50/50, 0 model calls.
- **Known limitations**: (1) a failed rebuild races only against a
  same-second week-rollover promotion — surfaced as "couldn't update", the
  My Plan promotion path still produces the correct active plan; (2) a
  concurrent double regeneration wastes one generation (same tolerance as
  the existing 23505 race); (3) physical-device QA PENDING.

## 18. Release decision

See the Day 10 completion report. As of 2026-08-30: **all deterministic tests
pass, migrations are safe, RLS/privacy reviewed, kill switches in place, no P0
findings.** The single P1 (N1) is guard-bounded known model debt, not a safety
bypass.
