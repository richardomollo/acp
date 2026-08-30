// ACP Intelligence™ Day 7.1 — Knowledge Foundation types.
// Pure types only, no framework/Supabase imports — mirrors the mobile app's
// own convention (lib/programme-types.ts, lib/activity-recommendation-types.ts)
// of keeping domain types importable without pulling in a runtime.

export type KnowledgeDomain = 'training' | 'nutrition' | 'recovery' | 'coaching';
export const KNOWLEDGE_DOMAINS: readonly KnowledgeDomain[] = ['training', 'nutrition', 'recovery', 'coaching'];

export type KnowledgeStatus = 'draft' | 'reviewed' | 'approved' | 'retired';
export const KNOWLEDGE_STATUSES: readonly KnowledgeStatus[] = ['draft', 'reviewed', 'approved', 'retired'];

// Every field optional (section 17's "do not require every field") and open
// to additional keys — this is intentionally not a closed shape.
export interface KnowledgeMetadata {
  goals?: string[];
  experience_levels?: string[];
  activities?: string[];
  topics?: string[];
  barriers?: string[];
  locale?: string[];
  [key: string]: unknown;
}

export interface KnowledgeSectionInput {
  heading?: string;
  content: string;
  metadata?: KnowledgeMetadata;
}

export interface KnowledgeDocumentInput {
  domain: KnowledgeDomain;
  title: string;
  source?: string;
  sourceType?: string;
  version?: number;         // defaults to 1
  status?: KnowledgeStatus; // defaults to 'draft' — ingestion never auto-approves
  documentKey?: string;     // stable logical identity across versions (section 6/21) — only needed once a document gets a v2
  metadata?: KnowledgeMetadata;
  sections: KnowledgeSectionInput[];
}

export interface IngestKnowledgeSuccess {
  ok: true;
  documentId: string;
  version: number;
  status: KnowledgeStatus;
  chunksCreated: number;
  chunksReused: number;
  embeddingModel: string;
  duplicate: boolean;
}
export interface IngestKnowledgeFailure {
  ok: false;
  error: string;
}
export type IngestKnowledgeResult = IngestKnowledgeSuccess | IngestKnowledgeFailure;

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  domain: KnowledgeDomain;
  title: string;
  heading: string | null;
  content: string;
  source: string | null;
  sourceType: string | null;
  version: number;
  metadata: KnowledgeMetadata;
  similarity: number;
}

export interface RetrieveKnowledgeParams {
  query: string;
  domains?: KnowledgeDomain[];
  goals?: string[];
  experienceLevels?: string[];
  activities?: string[];
  topics?: string[];
  barriers?: string[];
  topK?: number;
  /** Internal/test override only — production callers must never set this; the service defaults to 'approved' regardless (section 4/32). */
  status?: KnowledgeStatus;
}

export interface RetrieveKnowledgeSuccess { ok: true; results: KnowledgeSearchResult[] }
export interface RetrieveKnowledgeFailure { ok: false; error: string }
export type RetrieveKnowledgeResult = RetrieveKnowledgeSuccess | RetrieveKnowledgeFailure;
