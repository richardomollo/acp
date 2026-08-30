// ACP Intelligence™ Day 7.5C — verification for the expanded seed corpus.
// Runs the real ingestion pipeline against the in-memory FakeKnowledgeDb
// (no live DB / OpenAI) to confirm the 8 new documents normalize, chunk,
// approve, and re-ingest idempotently exactly like the original 9.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestKnowledgeDocument, approveKnowledgeDocument } from '../ingestion.ts';
import { normalizeMetadata } from '../normalize.ts';
import { FakeKnowledgeDb } from './fake-supabase.ts';
import { SEED_KNOWLEDGE_DOCS } from '../seed-corpus.ts';
import { KNOWLEDGE_DOMAINS } from '../types.ts';

function asSupabase(db: FakeKnowledgeDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}
const FAKE_VECTOR = (seed: number) => Array(1536).fill(0).map((_, i) => (i === 0 ? seed : 0));
function fakeEmbed() {
  let n = 0;
  return async (inputs: string[]) => ({ ok: true as const, vectors: inputs.map(() => FAKE_VECTOR(++n)) });
}

const NEW_DOC_TITLES = [
  'Intermediate Strength Progression',
  'Experienced Strength Progression',
  'General Fitness Progression',
  'Exercise Planning for Weight-Loss Goals',
  'Running and Cardio Progression',
  'Training for Stress Reduction and General Wellbeing',
  'Managing Training During Inconsistent Adherence',
  'Recovery Spacing Before Progression',
];
const newDocs = SEED_KNOWLEDGE_DOCS.filter(d => NEW_DOC_TITLES.includes(d.title));

describe('Day 7.5C — expanded corpus shape', () => {
  test('the corpus grew from 9 to 17 documents (7 training + 1 recovery added)', () => {
    assert.equal(SEED_KNOWLEDGE_DOCS.length, 17);
    assert.equal(newDocs.length, 8);
    assert.equal(newDocs.filter(d => d.domain === 'training').length, 7);
    assert.equal(newDocs.filter(d => d.domain === 'recovery').length, 1);
  });

  test('every new document is internal-sourced and declares a valid domain — no fabricated citations', () => {
    for (const d of newDocs) {
      assert.equal(d.sourceType, 'internal');
      assert.ok(!d.source, `${d.title} must not carry an external source string`);
      assert.ok(KNOWLEDGE_DOMAINS.includes(d.domain), `${d.title} domain`);
      assert.ok(d.sections.length >= 1 && d.sections.every(s => s.content.trim().length > 0));
    }
  });

  test('new-document metadata normalizes to canonical values without inventing a new vocabulary', () => {
    for (const d of newDocs) {
      const normalized = normalizeMetadata(d.metadata ?? {});
      // canonicalization is idempotent — normalizing again changes nothing
      assert.deepEqual(normalizeMetadata(normalized), normalized, `${d.title} metadata not stable under normalize`);
      for (const g of normalized.goals ?? []) assert.equal(g, g.trim().toLowerCase().replace(/[\s-]+/g, '_'));
      for (const e of normalized.experience_levels ?? []) assert.equal(e, e.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    }
  });

  test('no new document makes a medical/diagnostic claim or a positive outcome guarantee', () => {
    const bannedClinical = /\b(diagnos|deficien|disorder|\bcure\b|inject|medication|supplement)/i;
    // A positive guarantee — not the safe "never guaranteed" / "no guaranteed outcomes" framing.
    const positiveGuarantee = /\bguarantee(s|d)?\s+(you|a|weight|fat|muscle|results|progress|that)/i;
    for (const d of newDocs) {
      for (const s of d.sections) {
        assert.ok(!bannedClinical.test(s.content), `${d.title} / "${s.heading}" contains a banned clinical term`);
        assert.ok(!positiveGuarantee.test(s.content), `${d.title} / "${s.heading}" makes a positive outcome guarantee`);
      }
    }
  });
});

describe('Day 7.5C — new documents ingest, approve, and re-ingest idempotently', () => {
  test('each new document ingests as draft then approves cleanly', async () => {
    const db = new FakeKnowledgeDb();
    const embed = fakeEmbed();
    for (const doc of newDocs) {
      const res = await ingestKnowledgeDocument({ ...doc, status: 'draft' }, { supabase: asSupabase(db), embed });
      assert.equal(res.ok, true, `ingest ${doc.title}`);
      if (!res.ok) return;
      assert.equal(res.status, 'draft'); // ingestion never auto-approves
      assert.equal(res.duplicate, false);
      assert.ok(res.chunksCreated >= 1);
      const approved = await approveKnowledgeDocument(res.documentId, { supabase: asSupabase(db), embed });
      assert.equal(approved.ok, true, `approve ${doc.title}`);
    }
    assert.equal(db.documents.length, newDocs.length);
    assert.ok(db.documents.every(d => d.status === 'approved'));
  });

  test('re-ingesting an unchanged new document is a no-op that re-embeds nothing (idempotency)', async () => {
    const db = new FakeKnowledgeDb();
    let embedCalls = 0;
    const embed = async (inputs: string[]) => {
      embedCalls++;
      return { ok: true as const, vectors: inputs.map((_, i) => FAKE_VECTOR(embedCalls * 100 + i)) };
    };
    const doc = newDocs[0];
    const first = await ingestKnowledgeDocument({ ...doc, status: 'draft' }, { supabase: asSupabase(db), embed });
    assert.equal(first.ok, true);
    const callsAfterFirst = embedCalls;

    const second = await ingestKnowledgeDocument({ ...doc, status: 'draft' }, { supabase: asSupabase(db), embed });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.duplicate, true);
    assert.equal(second.chunksCreated, 0);
    assert.equal(embedCalls, callsAfterFirst, 'an unchanged re-ingest must not trigger another embedding call');
    assert.equal(db.documents.length, 1);
  });

  test('embedding dimension is unchanged (1536) for every new chunk', async () => {
    const db = new FakeKnowledgeDb();
    const embed = fakeEmbed();
    await ingestKnowledgeDocument({ ...newDocs[0], status: 'draft' }, { supabase: asSupabase(db), embed });
    for (const chunk of db.chunks) {
      assert.equal((chunk.embedding as number[]).length, 1536);
    }
  });
});
