// ACP Intelligence™ Day 7.1 — knowledge ingestion service.
// Orchestrates: validate → normalize → chunk → hash → detect duplicate/
// reusable chunks → generate missing embeddings → persist (section 11's
// pipeline). Server-only — never imported by mobile or client components.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { KNOWLEDGE_DOMAINS, KNOWLEDGE_STATUSES } from './types.ts';
import type { IngestKnowledgeResult, KnowledgeDocumentInput, KnowledgeStatus } from './types.ts';
import { sectionsToChunks } from './chunking.ts';
import { hashDocument, hashChunk } from './hashing.ts';
import { embedTexts, type EmbedResult } from './embeddings.ts';
import { normalizeMetadata } from './normalize.ts';
import { ACP_EMBEDDING_MODEL } from './constants.ts';

function defaultSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface IngestDeps {
  supabase?: SupabaseClient;
  embed?: (inputs: string[]) => Promise<EmbedResult>;
}

/**
 * `deps` is injectable (real Supabase/OpenAI by default) so this can be unit
 * tested with an in-memory fake — see __tests__/ingestion.test.ts — without
 * depending on a live database or live OpenAI (section 55).
 */
export async function ingestKnowledgeDocument(
  input: KnowledgeDocumentInput,
  deps: IngestDeps = {},
): Promise<IngestKnowledgeResult> {
  const supabase = deps.supabase ?? defaultSupabase();
  const embed = deps.embed ?? embedTexts;

  if (!KNOWLEDGE_DOMAINS.includes(input.domain)) {
    return { ok: false, error: `Invalid domain: ${input.domain}` };
  }
  if (!input.title || !input.title.trim()) {
    return { ok: false, error: 'title is required' };
  }
  const status: KnowledgeStatus = input.status ?? 'draft';
  if (!KNOWLEDGE_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid status: ${status}` };
  }
  const version = input.version ?? 1;
  if (version < 1) {
    return { ok: false, error: 'version must be >= 1' };
  }
  if (!input.sections || input.sections.length === 0) {
    return { ok: false, error: 'sections is required and must be non-empty' };
  }

  const metadata = normalizeMetadata(input.metadata ?? {});
  const chunks = sectionsToChunks(input.sections, metadata);
  if (chunks.length === 0) {
    return { ok: false, error: 'No non-empty content to ingest' };
  }

  const documentHash = hashDocument({
    domain: input.domain, title: input.title, source: input.source ?? null,
    version, metadata, sections: input.sections,
  });

  // Idempotent re-ingestion (section 22/23): the exact same logical input
  // hashes identically — reuse the existing document instead of creating a
  // clone or spending a second embedding call.
  const { data: existingDoc, error: existingErr } = await supabase
    .from('knowledge_documents')
    .select('id, version, status')
    .eq('content_hash', documentHash)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existingDoc) {
    return {
      ok: true,
      documentId: existingDoc.id, version: existingDoc.version, status: existingDoc.status,
      chunksCreated: 0, chunksReused: chunks.length,
      embeddingModel: ACP_EMBEDDING_MODEL, duplicate: true,
    };
  }

  const chunkHashes = chunks.map(c => hashChunk({ content: c.content, heading: c.heading, metadata: c.metadata }));

  // Reuse embeddings for chunks whose exact content already exists anywhere
  // in the store — never re-embed identical text (section 10/23).
  const { data: reusableRows, error: reusableErr } = await supabase
    .from('knowledge_chunks')
    .select('content_hash, embedding')
    .in('content_hash', chunkHashes);
  if (reusableErr) return { ok: false, error: reusableErr.message };
  const reusableByHash = new Map<string, unknown>(
    (reusableRows ?? []).map((r: { content_hash: string; embedding: unknown }) => [r.content_hash, r.embedding]),
  );

  const toEmbedTexts: string[] = [];
  chunks.forEach((c, i) => {
    if (!reusableByHash.has(chunkHashes[i])) toEmbedTexts.push(c.content);
  });

  let newVectors: number[][] = [];
  if (toEmbedTexts.length > 0) {
    const embedResult = await embed(toEmbedTexts);
    if (!embedResult.ok) return { ok: false, error: embedResult.error };
    newVectors = embedResult.vectors;
  }

  let nextNewVectorIndex = 0;
  const embeddingByChunkIndex = new Map<number, unknown>();
  chunks.forEach((c, i) => {
    if (reusableByHash.has(chunkHashes[i])) {
      embeddingByChunkIndex.set(i, reusableByHash.get(chunkHashes[i]));
    } else {
      embeddingByChunkIndex.set(i, newVectors[nextNewVectorIndex++]);
    }
  });

  // Insert the document only once every chunk's embedding is already known
  // (section 11) — a document is never created if any embedding is missing,
  // so retrieval (which only reads persisted rows) can never observe a
  // partially-embedded document.
  const { data: newDoc, error: docInsertErr } = await supabase
    .from('knowledge_documents')
    .insert({
      document_key: input.documentKey ?? null,
      domain: input.domain, title: input.title,
      source: input.source ?? null, source_type: input.sourceType ?? null,
      version, status, metadata, content_hash: documentHash,
      last_reviewed_at: status === 'approved' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (docInsertErr || !newDoc) return { ok: false, error: docInsertErr?.message ?? 'Failed to create document' };

  const rows = chunks.map((c, i) => ({
    document_id: newDoc.id, domain: input.domain, chunk_index: c.chunkIndex,
    heading: c.heading ?? null, content: c.content,
    embedding: embeddingByChunkIndex.get(i),
    metadata: c.metadata, content_hash: chunkHashes[i],
  }));
  const { error: chunkInsertErr } = await supabase.from('knowledge_chunks').insert(rows);
  if (chunkInsertErr) {
    // Roll back the now-orphaned document rather than leaving a zero-chunk
    // document behind (section 11 — never partially usable).
    await supabase.from('knowledge_documents').delete().eq('id', newDoc.id);
    return { ok: false, error: chunkInsertErr.message };
  }

  const embeddedCount = toEmbedTexts.length;
  console.log(`[knowledge-ingestion] document=${newDoc.id} chunks=${chunks.length} embedded=${embeddedCount} reused=${chunks.length - embeddedCount} model=${ACP_EMBEDDING_MODEL}`);

  return {
    ok: true, documentId: newDoc.id, version, status,
    chunksCreated: chunks.length, chunksReused: chunks.length - embeddedCount,
    embeddingModel: ACP_EMBEDDING_MODEL, duplicate: false,
  };
}

export interface ApproveResult { ok: true; supersededDocumentId: string | null }
export interface LifecycleFailure { ok: false; error: string }

/**
 * Approves a document, and — if it has a `document_key` (section 21) —
 * automatically retires the previous approved version of that SAME logical
 * document (never an unrelated document with a similar title, section 49).
 */
export async function approveKnowledgeDocument(
  documentId: string,
  deps: IngestDeps = {},
): Promise<ApproveResult | LifecycleFailure> {
  const supabase = deps.supabase ?? defaultSupabase();

  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select('id, document_key')
    .eq('id', documentId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!doc) return { ok: false, error: 'Document not found' };

  let supersededDocumentId: string | null = null;
  if (doc.document_key) {
    const { data: previous, error: prevErr } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('document_key', doc.document_key)
      .eq('status', 'approved')
      .neq('id', documentId)
      .maybeSingle();
    if (prevErr) return { ok: false, error: prevErr.message };
    if (previous) {
      const { error: retireErr } = await supabase.from('knowledge_documents').update({ status: 'retired' }).eq('id', previous.id);
      if (retireErr) return { ok: false, error: retireErr.message };
      supersededDocumentId = previous.id;
    }
  }

  const { error: approveErr } = await supabase
    .from('knowledge_documents')
    .update({ status: 'approved', last_reviewed_at: new Date().toISOString() })
    .eq('id', documentId);
  if (approveErr) return { ok: false, error: approveErr.message };

  return { ok: true, supersededDocumentId };
}

/** draft → reviewed → approved → retired (section 47). Approving goes through approveKnowledgeDocument() for the supersession behaviour; every other transition is a plain status update. */
export async function setKnowledgeDocumentStatus(
  documentId: string,
  status: KnowledgeStatus,
  deps: IngestDeps = {},
): Promise<{ ok: true } | LifecycleFailure> {
  const supabase = deps.supabase ?? defaultSupabase();
  if (!KNOWLEDGE_STATUSES.includes(status)) return { ok: false, error: `Invalid status: ${status}` };

  if (status === 'approved') {
    const result = await approveKnowledgeDocument(documentId, deps);
    return result.ok ? { ok: true } : result;
  }
  const { error } = await supabase.from('knowledge_documents').update({ status }).eq('id', documentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
