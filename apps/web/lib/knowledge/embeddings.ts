// ACP Intelligence™ Day 7.1 — OpenAI embeddings, kept in the exact same
// architectural style as this repo's existing gpt-5-mini calls
// (apps/web/app/api/ai/{onboarding-assessment,weekly-adaptation}/route.ts):
// a raw server-side fetch(), never the openai npm SDK (section 8).
import {
  ACP_EMBEDDING_MODEL, ACP_EMBEDDING_DIMENSIONS, EMBEDDING_BATCH_SIZE,
  EMBEDDING_TIMEOUT_MS, EMBEDDING_MAX_RETRIES,
} from './constants.ts';
import { logAcpEvent } from '../observability.ts';

export interface EmbedSuccess { ok: true; vectors: number[][] }
export interface EmbedFailure { ok: false; error: string }
export type EmbedResult = EmbedSuccess | EmbedFailure;

async function embedBatch(inputs: string[]): Promise<EmbedResult> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: 'OPENAI_API_KEY is not configured' };

  let lastError = 'Embedding request failed';
  for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: ACP_EMBEDDING_MODEL, input: inputs }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        lastError = `OpenAI embeddings request failed: ${res.status} ${text}`;
        // Only 429/5xx are transient (section 52) — malformed-input errors
        // (4xx other than 429) fail immediately, never retried.
        if (res.status === 429 || res.status >= 500) continue;
        return { ok: false, error: lastError };
      }

      const body = await res.json();
      const data = body?.data;
      if (!Array.isArray(data) || data.length !== inputs.length) {
        return { ok: false, error: `Embedding count mismatch: expected ${inputs.length}, got ${Array.isArray(data) ? data.length : 'malformed response'}` };
      }
      const vectors: number[][] = [];
      for (const item of data) {
        const vec = item?.embedding;
        if (!Array.isArray(vec) || vec.length !== ACP_EMBEDDING_DIMENSIONS) {
          return { ok: false, error: `Malformed embedding vector (expected ${ACP_EMBEDDING_DIMENSIONS} dimensions)` };
        }
        vectors.push(vec);
      }
      return { ok: true, vectors };
    } catch (err) {
      clearTimeout(timeout);
      const e = err as { name?: string; message?: string } | undefined;
      lastError = e?.name === 'AbortError' ? 'Embedding request timed out' : (e?.message ?? 'Embedding request failed');
    }
  }
  logAcpEvent('embedding_request_failed', {
    model: ACP_EMBEDDING_MODEL,
    failureCode: /timed out|aborted/i.test(lastError) ? 'OPENAI_TIMEOUT' : 'RAG_EMBEDDING_ERROR',
  });
  return { ok: false, error: lastError };
}

/**
 * Batches inputs (section 9/10) — never one OpenAI request per chunk. Fails
 * the entire call on any single batch failure (section 11) — there is no
 * partial-success return; a caller either gets every vector or none, so a
 * document can never be persisted with only some chunks embedded.
 */
export async function embedTexts(inputs: string[]): Promise<EmbedResult> {
  if (inputs.length === 0) return { ok: true, vectors: [] };
  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
    const result = await embedBatch(batch);
    if (!result.ok) return result;
    vectors.push(...result.vectors);
  }
  return { ok: true, vectors };
}
