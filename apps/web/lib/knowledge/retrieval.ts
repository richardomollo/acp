// ACP Intelligence™ Day 7.1 — knowledge retrieval service.
// query → embed once → Postgres similarity search (RPC) → threshold →
// diversify → topK (section 33). Server-only. Deliberately does NOT wire
// into any product surface yet (section 32/75) — this is the reusable
// function later chunks will call.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { embedTexts, type EmbedResult } from './embeddings.ts';
import { KNOWLEDGE_MIN_SIMILARITY, MAX_CHUNKS_PER_DOCUMENT_IN_RESULTS, DEFAULT_TOP_K, CANDIDATE_MULTIPLIER } from './constants.ts';
import type { RetrieveKnowledgeParams, RetrieveKnowledgeResult, KnowledgeSearchResult } from './types.ts';

// Shape of one row returned by the match_knowledge_chunks() RPC (see the
// migration's `returns table (...)`).
interface MatchKnowledgeChunksRow {
  chunk_id: string; document_id: string; domain: KnowledgeSearchResult['domain']; title: string;
  heading: string | null; content: string; source: string | null; source_type: string | null;
  version: number; metadata: Record<string, unknown>; similarity: number;
}

function defaultSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Pure — unit-testable without a database (test K/L's threshold/topK/diversification behaviour). */
export function passesThreshold(similarity: number, threshold: number = KNOWLEDGE_MIN_SIMILARITY): boolean {
  return similarity >= threshold;
}

/** Pure — caps how many results may come from the same document (section 42), preserving rank order otherwise. */
export function diversify<T extends { documentId: string }>(
  rows: T[],
  maxPerDocument: number = MAX_CHUNKS_PER_DOCUMENT_IN_RESULTS,
): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const row of rows) {
    const count = counts.get(row.documentId) ?? 0;
    if (count >= maxPerDocument) continue;
    counts.set(row.documentId, count + 1);
    out.push(row);
  }
  return out;
}

export interface RetrieveDeps {
  supabase?: SupabaseClient;
  embed?: (inputs: string[]) => Promise<EmbedResult>;
}

export async function retrieveKnowledge(
  params: RetrieveKnowledgeParams,
  deps: RetrieveDeps = {},
): Promise<RetrieveKnowledgeResult> {
  if (!params.query || !params.query.trim()) return { ok: false, error: 'query is required' };

  const supabase = deps.supabase ?? defaultSupabase();
  const embed = deps.embed ?? embedTexts;
  const topK = params.topK ?? DEFAULT_TOP_K;
  // Production default enforced here regardless of caller (section 4/32) —
  // only an explicit internal/test override changes it.
  const status = params.status ?? 'approved';

  const embedResult = await embed([params.query.trim()]);
  if (!embedResult.ok) return { ok: false, error: embedResult.error };
  const [queryEmbedding] = embedResult.vectors;

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_domains: params.domains ?? null,
    match_status: status,
    match_goals: params.goals ?? null,
    match_experience_levels: params.experienceLevels ?? null,
    match_activities: params.activities ?? null,
    match_topics: params.topics ?? null,
    match_barriers: params.barriers ?? null,
    match_count: topK * CANDIDATE_MULTIPLIER,
  });
  if (error) {
    console.error('[knowledge-retrieval] RPC failed', error.message);
    return { ok: false, error: error.message };
  }

  const candidates: KnowledgeSearchResult[] = (data ?? []).map((row: MatchKnowledgeChunksRow) => ({
    chunkId: row.chunk_id, documentId: row.document_id, domain: row.domain,
    title: row.title, heading: row.heading ?? null, content: row.content,
    source: row.source ?? null, sourceType: row.source_type ?? null, version: row.version,
    metadata: row.metadata ?? {}, similarity: row.similarity,
  }));

  const aboveThreshold = candidates.filter(c => passesThreshold(c.similarity));
  const diversified = diversify(aboveThreshold);
  const results = diversified.slice(0, topK);

  // Never logs raw embeddings or credentials (section 15/50).
  console.log('[knowledge-retrieval]', JSON.stringify({
    query: params.query, domains: params.domains ?? null, status,
    candidateCount: candidates.length, returnedCount: results.length,
    threshold: KNOWLEDGE_MIN_SIMILARITY,
    chunkIds: results.map(r => r.chunkId), documentIds: results.map(r => r.documentId),
    similarities: results.map(r => Number(r.similarity.toFixed(4))),
  }));

  return { ok: true, results };
}
