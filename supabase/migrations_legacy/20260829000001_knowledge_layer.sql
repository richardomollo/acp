-- ACP Intelligence™ Day 7.1 — Knowledge Foundation.
--
-- A governed, versioned, queryable store for STABLE domain knowledge
-- (training/nutrition/recovery/coaching principles) — deliberately separate
-- from every other retrieval system already in this schema:
--   - coaching_memory (20260828000020) stores per-user longitudinal
--     behavioural facts, never shared domain knowledge.
--   - sessions/pt_offerings/gyms/communities/etc remain structured
--     live-inventory sources of truth — never embedded.
--   - meals/food nutrient values remain structured (Day 7.2 handles
--     international nutrition data) — never embedded.
--   - fitness_profile/measurements/workout_history/Strava activities remain
--     structured user intelligence — never embedded.
--
-- This migration ONLY creates the knowledge store + its retrieval RPC.
-- Nothing here is wired into weekly-adaptation, My Plan, Home, onboarding,
-- nutrition selection, or provider matching (Day 7.1's explicit scope
-- boundary — those integrations come in later chunks).

create extension if not exists vector;

create table if not exists public.knowledge_documents (
  id                uuid primary key default gen_random_uuid(),

  -- Stable logical identity across versions (section 6/21) — null until a
  -- document actually gets a v2, at which point both versions share this
  -- key so approval can retire the specific prior version, never a
  -- same-titled but unrelated document.
  document_key      text,

  domain            text not null check (domain in ('training', 'nutrition', 'recovery', 'coaching')),
  title             text not null check (length(trim(title)) > 0),

  source            text,
  source_type       text, -- deliberately a free string, not an enum (section 20): internal | editorial | public_guideline | licensed | partner | ...

  version           integer not null default 1 check (version >= 1),
  status            text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'retired')),

  metadata          jsonb not null default '{}'::jsonb,

  content_hash      text, -- idempotent-ingestion guard (section 22/23)

  last_reviewed_at  timestamptz, -- only ever set when a document actually becomes 'approved' — never fabricated for draft content (section 48)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id             uuid primary key default gen_random_uuid(),

  document_id    uuid not null references public.knowledge_documents(id) on delete cascade,
  -- Derived from the parent document at ingestion time (section 12) —
  -- duplicated here (not just joined) so domain filtering/indexing never
  -- needs to touch knowledge_documents at retrieval time.
  domain         text not null check (domain in ('training', 'nutrition', 'recovery', 'coaching')),

  chunk_index    integer not null check (chunk_index >= 0),

  heading        text,
  content        text not null check (length(trim(content)) > 0),

  -- text-embedding-3-small's real output dimension (section 7/8's "choose
  -- the actual embedding model first" — see apps/web/lib/knowledge/constants.ts
  -- and the completion report's section D for the model decision itself).
  embedding      vector(1536),

  metadata       jsonb not null default '{}'::jsonb,

  content_hash   text, -- idempotent chunk reuse — never re-embeds identical content (section 22/23)

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (document_id, chunk_index)
);

create index if not exists knowledge_documents_domain_idx on public.knowledge_documents (domain);
create index if not exists knowledge_documents_status_idx on public.knowledge_documents (status);
create index if not exists knowledge_documents_domain_status_idx on public.knowledge_documents (domain, status);
create index if not exists knowledge_documents_document_key_idx on public.knowledge_documents (document_key);
create unique index if not exists knowledge_documents_content_hash_idx on public.knowledge_documents (content_hash) where content_hash is not null;

create index if not exists knowledge_chunks_document_id_idx on public.knowledge_chunks (document_id);
create index if not exists knowledge_chunks_domain_idx on public.knowledge_chunks (domain);
create index if not exists knowledge_chunks_content_hash_idx on public.knowledge_chunks (content_hash);

-- No ANN index (HNSW/IVFFlat) yet — section 13's explicit call: the initial
-- corpus is a handful of seed documents (tens of chunks), where exact cosine
-- search via the `<=>` operator is both fast enough and exact (no recall
-- trade-off an approximate index would introduce). Adding an ANN index later
-- is purely additive (an index on this same `embedding` column) and requires
-- zero caller changes, since every caller goes through match_knowledge_chunks
-- below rather than querying this table directly.

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
-- Deliberately NO policies at all (section 15/16). The service-role client
-- (this project's existing convention for every platform-owned table, e.g.
-- fitness_plans/coaching_memory) bypasses RLS entirely; with zero policies
-- defined, the anon/authenticated roles can neither read nor write this
-- table under any circumstance. There is no "user's own row" concept here —
-- knowledge content is platform-owned, not per-user.

-- ── Retrieval RPC (section 35/36) ────────────────────────────────────────
-- Similarity search must run inside Postgres, never by pulling every
-- embedding into Node and looping in JavaScript. `match_status` defaults to
-- 'approved' as a defense-in-depth backstop — the real enforcement lives in
-- the TypeScript retrieval service (section 4), but a caller that somehow
-- omits it still can't accidentally see draft/retired content.
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_domains text[] default null,
  match_status text default 'approved',
  match_goals text[] default null,
  match_experience_levels text[] default null,
  match_activities text[] default null,
  match_topics text[] default null,
  match_barriers text[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  domain text,
  title text,
  heading text,
  content text,
  source text,
  source_type text,
  version integer,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id as chunk_id,
    c.document_id,
    c.domain,
    d.title,
    c.heading,
    c.content,
    d.source,
    d.source_type,
    d.version,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where d.status = match_status
    and (match_domains is null or c.domain = any(match_domains))
    -- Intersection semantics (section 41), but only once a document actually
    -- declares the field — absence of e.g. `goals` metadata is "no opinion",
    -- not "incompatible" (section 17's "do not require every field"), so an
    -- explicit goal filter never excludes a document that simply never
    -- targeted any goal.
    and (match_goals is null or not (d.metadata ? 'goals') or (d.metadata -> 'goals') ?| match_goals)
    and (match_experience_levels is null or not (d.metadata ? 'experience_levels') or (d.metadata -> 'experience_levels') ?| match_experience_levels)
    and (match_activities is null or not (d.metadata ? 'activities') or (d.metadata -> 'activities') ?| match_activities)
    and (match_topics is null or not (d.metadata ? 'topics') or (d.metadata -> 'topics') ?| match_topics)
    and (match_barriers is null or not (d.metadata ? 'barriers') or (d.metadata -> 'barriers') ?| match_barriers)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
