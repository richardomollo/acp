// ACP Intelligence™ Day 7.1 — centralized knowledge-layer configuration.
// Every tunable value lives here (sections 8/10/13/26/38/42) rather than
// scattered across ingestion/retrieval call sites.

// Kept in the same raw-fetch style as the existing gpt-5-mini calls
// (apps/web/app/api/ai/*) — no OpenAI SDK introduced (section 8). Overridable
// via env for a future model change without touching code, matching this
// repo's existing "no config layer beyond plain env vars" convention.
export const ACP_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// text-embedding-3-small's real default output size. Must match the
// `vector(1536)` column in supabase/migrations/20260829000001_knowledge_layer.sql
// — if the model ever changes to one with a different dimension, both this
// constant AND that migration's column type need to change together.
export const ACP_EMBEDDING_DIMENSIONS = 1536;

// Batches multiple chunks into one OpenAI request (section 9/10) — never one
// request per chunk. Generous for the initial handful-of-documents corpus;
// not tuned for scale.
export const EMBEDDING_BATCH_SIZE = 50;

// Initial value only — NOT validated against a large real corpus yet. See
// the Day 7.1 completion report section O for the seed-query calibration
// this was chosen against; requires re-evaluation once real usage exists
// (Day 7.5 per the spec).
export const KNOWLEDGE_MIN_SIMILARITY = 0.3;

// Diversification cap (section 42) — how many chunks from the same document
// may appear in one result set, so one long document can't crowd out other
// relevant material.
export const MAX_CHUNKS_PER_DOCUMENT_IN_RESULTS = 2;

export const DEFAULT_TOP_K = 5;

// The RPC's candidate pool is topK * this multiplier, fetched before
// threshold + diversification are applied in the retrieval service — gives
// those steps enough headroom to still return topK results after filtering.
export const CANDIDATE_MULTIPLIER = 4;

// Conservative deterministic chunk-size guardrail (section 26) — a
// character count, not a token count, to avoid pulling in a tokenizer
// dependency solely for this. A section longer than this is split at
// paragraph, then sentence, boundaries (see chunking.ts).
export const MAX_SECTION_CHARS = 1200;

// Consistent with this repo's other AI routes' generous server-side
// timeouts (section 53) — this is server-side infrastructure, not a
// user-facing spinner budget.
export const EMBEDDING_TIMEOUT_MS = 30_000;

// Bounded retry only for transient failures (429/5xx) — never for malformed
// input (section 52).
export const EMBEDDING_MAX_RETRIES = 2;
