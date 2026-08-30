// ACP Intelligence™ Day 7.1 — deterministic semantic chunking (section 25/26/27).
// Pure, framework-free — no GPT call ever rewrites/summarizes source content
// into chunks (section 25's explicit prohibition); this only ever splits an
// oversized section at paragraph, then sentence, boundaries.
import { MAX_SECTION_CHARS } from './constants.ts';
import type { KnowledgeMetadata, KnowledgeSectionInput } from './types.ts';

export interface Chunk {
  chunkIndex: number;
  heading?: string;
  content: string;
  metadata: KnowledgeMetadata;
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

// Deterministic, no NLP dependency — splits after ., !, or ? followed by
// whitespace and then a capital letter/digit (or end of string).
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9]|$)/).map(s => s.trim()).filter(Boolean);
}

// Greedily repacks smaller units back together up to the limit so an
// oversized section doesn't degrade into one chunk per sentence — a chunk
// must still make sense standalone (section 27), and a pile of one-sentence
// chunks would not.
function packToLimit(units: string[], limit: number): string[] {
  const packed: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (candidate.length > limit && current) {
      packed.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) packed.push(current);
  return packed;
}

function splitOversizedSection(content: string): string[] {
  if (content.length <= MAX_SECTION_CHARS) return [content];

  const paragraphs = splitParagraphs(content);
  const pieces: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= MAX_SECTION_CHARS) {
      pieces.push(para);
    } else {
      pieces.push(...packToLimit(splitSentences(para), MAX_SECTION_CHARS));
    }
  }
  // Repack once more across paragraph boundaries too, so an undersized
  // trailing paragraph still merges with its neighbour instead of standing
  // alone as a tiny, context-poor chunk.
  return packToLimit(pieces, MAX_SECTION_CHARS);
}

/**
 * Each semantic section normally becomes exactly one chunk (section 25).
 * chunk_index is continuous across every section in document order — never
 * reset per-section — so persisted ordering matches authoring order exactly
 * (section 12's unique(document_id, chunk_index) constraint depends on this
 * being contiguous and gap-free).
 */
export function sectionsToChunks(sections: KnowledgeSectionInput[], documentMetadata: KnowledgeMetadata): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const section of sections) {
    const trimmed = section.content.trim();
    if (!trimmed) continue;
    const pieces = splitOversizedSection(trimmed);
    for (const piece of pieces) {
      chunks.push({
        chunkIndex: index++,
        heading: section.heading,
        content: piece,
        // Chunk metadata inherits document metadata and section metadata
        // adds to/overrides it (section 19) — never duplicated wholesale
        // beyond what's needed to make the chunk independently filterable.
        metadata: { ...documentMetadata, ...(section.metadata ?? {}) },
      });
    }
  }
  return chunks;
}
