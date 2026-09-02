// ACP Intelligence™ Day 10 — minimum-viable production observability.
//
// Structured, single-line JSON events to stdout (captured by Vercel's log
// stream / any log drain — see docs/acp-intelligence-mvp-release-readiness.md).
// NO metrics vendor, NO analytics SDK. NEVER logs raw prompts, model
// responses, measurements, coaching memory, tokens/keys, emails or names —
// only counts, durations, coarse flags and a stable failure code.

export type AcpFailureCode =
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_RATE_LIMIT'
  | 'OPENAI_INVALID_RESPONSE'
  | 'OPENAI_SERVER_ERROR'
  | 'RAG_EMBEDDING_ERROR'
  | 'RAG_QUERY_ERROR'
  | 'SUPABASE_READ_ERROR'
  | 'SUPABASE_WRITE_ERROR'
  | 'SUPPLY_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

export type AcpEvent =
  | 'initial_assessment_started'
  | 'initial_assessment_completed'
  | 'initial_assessment_failed'
  | 'initial_assessment_fallback'
  | 'weekly_adaptation_started'
  | 'weekly_adaptation_completed'
  | 'weekly_adaptation_failed'
  | 'weekly_adaptation_fallback'
  | 'knowledge_retrieval_completed'
  | 'knowledge_retrieval_failed'
  | 'embedding_request_failed'
  | 'execution_summary_built'
  | 'coaching_memory_sync_completed'
  | 'coaching_memory_sync_failed'
  | 'nutrition_coaching_started'
  | 'nutrition_coaching_completed'
  | 'nutrition_coaching_failed'
  | 'nutrition_coaching_fallback'
  | 'nutrition_camera_started'
  | 'nutrition_camera_analysis_completed'
  | 'nutrition_camera_analysis_failed'
  | 'nutrition_camera_fallback';

/** Small, non-sensitive fields only. Anything not on this list must be omitted. */
export interface AcpEventFields {
  durationMs?: number;
  usedFallback?: boolean;
  failureCode?: AcpFailureCode;
  httpStatus?: number;
  ragDomains?: string[];
  ragFailedDomains?: string[];
  executionEvidencePresent?: boolean;
  /** OpenAI usage.* — token COUNTS only, never content. */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
  /** Coarse counts for a memory sync, never the rows themselves. */
  upserted?: number;
  deactivated?: number;
  attempt?: number;
  /** Beta Feedback #001 — Sunday next-week preview. */
  scheduled?: boolean;
  promoted?: boolean;
  /** A week-start date string (no time, not sensitive). */
  targetWeekStart?: string;
  /** Beta Feedback #002 — training schedule preference. COUNT only (0 when
   *  no explicit preference); the specific weekdays are never logged (§30/§31). */
  scheduleDaysPerWeek?: number;
  /** Beta Feedback #003 — this completion was an explicit user-initiated
   *  rebuild of an already-prepared future plan, not a first generation. */
  regenerated?: boolean;
  /** Nutrition N4 — coarse coaching counts only. Never a nutrient, food,
   *  quantity, weight, reference value or any generated text (§38). */
  opportunityCount?: number;
  llmUsedCount?: number;
  droppedCount?: number;
  /** Nutrition N5 — camera-assisted logging. Coarse only: how many textual
   *  food candidates the vision model returned. NEVER an image, base64,
   *  signed URL, EXIF/location, a candidate label, or any raw model output
   *  (§11). `uncertain` is the model's own hard-to-read flag. */
  candidateCount?: number;
  uncertain?: boolean;
}

const SERVICE = 'acp-intelligence';

/**
 * Emits one structured line. Best-effort — never throws, never blocks a
 * request. In test runs (`NODE_ENV==='test'` or ACP_SILENCE_LOGS=1) it is a
 * no-op so suites stay quiet.
 */
export function logAcpEvent(event: AcpEvent, fields: AcpEventFields = {}): void {
  if (process.env.NODE_ENV === 'test' || process.env.ACP_SILENCE_LOGS === '1') return;
  try {
    const clean: Record<string, unknown> = { t: new Date().toISOString(), service: SERVICE, event };
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      clean[k] = v;
    }
    console.log(JSON.stringify(clean));
  } catch {
    /* observability must never break a request */
  }
}

/** Maps a caught error / HTTP status from an OpenAI call to a stable failure code. */
export function classifyOpenAiFailure(status: number | null, err?: unknown): AcpFailureCode {
  if (status === 429) return 'OPENAI_RATE_LIMIT';
  if (status != null && status >= 500) return 'OPENAI_SERVER_ERROR';
  const name = (err as { name?: string } | undefined)?.name;
  const msg = (err as { message?: string } | undefined)?.message ?? '';
  if (name === 'AbortError' || /timeout|timed out|aborted/i.test(msg)) return 'OPENAI_TIMEOUT';
  if (/json|parse|validation|schema/i.test(msg)) return 'OPENAI_INVALID_RESPONSE';
  return 'OPENAI_SERVER_ERROR';
}

/**
 * fetch() with a hard client-side deadline (§8) — a bounded single attempt,
 * NOT a retry loop. Throws an AbortError on timeout so the caller's existing
 * catch → deterministic-fallback path runs immediately instead of the
 * request hanging up to the platform's function ceiling.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
