// ACP Intelligence™ Day 7.1 — deterministic hashing for idempotent ingestion
// (section 22/23). Pure, framework-free — no Supabase/network dependency, so
// every rule here is unit-testable in isolation.
import { createHash } from 'crypto';

const FIELD_SEP = '\x01'; // a control character, never real content — prevents field-boundary collisions when parts are joined (e.g. domain="ab"+title="c" vs domain="a"+title="bc").

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Whitespace/case noise must never produce a different hash for
// semantically-identical input (section 22).
function normalize(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Deterministic regardless of key insertion order — plain JSON.stringify
// does not guarantee key order is stable across equivalent objects built
// differently, so object keys are sorted before stringifying.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** Includes normalized domain/title/source/version/metadata/every section's heading+content (section 22). */
export function hashDocument(input: {
  domain: string;
  title: string;
  source?: string | null;
  version: number;
  metadata: Record<string, unknown>;
  sections: { heading?: string; content: string }[];
}): string {
  const parts = [
    normalize(input.domain),
    normalize(input.title),
    normalize(input.source ?? ''),
    String(input.version),
    stableStringify(input.metadata),
    input.sections.map(s => `${normalize(s.heading ?? '')}::${normalize(s.content)}`).join('|'),
  ];
  return sha256(parts.join(FIELD_SEP));
}

/** Includes normalized content/heading/metadata (section 22) — identical chunk content always hashes identically, enabling cross-document embedding reuse. */
export function hashChunk(input: { content: string; heading?: string | null; metadata: Record<string, unknown> }): string {
  return sha256([normalize(input.heading ?? ''), normalize(input.content), stableStringify(input.metadata)].join(FIELD_SEP));
}
