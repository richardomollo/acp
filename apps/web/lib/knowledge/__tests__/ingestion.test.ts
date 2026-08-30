import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestKnowledgeDocument, approveKnowledgeDocument, setKnowledgeDocumentStatus } from '../ingestion.ts';
import { FakeKnowledgeDb } from './fake-supabase.ts';
import type { KnowledgeDocumentInput } from '../types.ts';

// FakeKnowledgeDb only implements the small slice of the real SupabaseClient
// surface ingestion.ts actually calls — this cast documents that
// intentional gap rather than widening IngestDeps.supabase's real type.
function asSupabase(db: FakeKnowledgeDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

const FAKE_VECTOR = (seed: number) => Array(1536).fill(0).map((_, i) => (i === 0 ? seed : 0));

function fakeEmbedTracking() {
  const calls: string[][] = [];
  const embed = async (inputs: string[]) => {
    calls.push(inputs);
    return { ok: true as const, vectors: inputs.map((_, i) => FAKE_VECTOR(calls.length * 10 + i)) };
  };
  return { embed, calls };
}

function validInput(overrides: Partial<KnowledgeDocumentInput> = {}): KnowledgeDocumentInput {
  return {
    domain: 'training',
    title: 'Test Document',
    sections: [
      { heading: 'One', content: 'First section content.' },
      { heading: 'Two', content: 'Second section content.' },
    ],
    ...overrides,
  };
}

describe('ingestKnowledgeDocument', () => {
  test('test A — valid ingestion creates the document and its ordered chunks, embeddings requested', async () => {
    const db = new FakeKnowledgeDb();
    const { embed, calls } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput(), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.chunksCreated, 2);
    assert.equal(result.duplicate, false);
    assert.equal(db.documents.length, 1);
    assert.equal(db.chunks.length, 2);
    assert.deepEqual(db.chunks.map(c => c.chunk_index).sort(), [0, 1]);
    assert.equal(calls.length, 1); // one batched embedding call, not one per chunk
    assert.equal(calls[0].length, 2);
  });

  test('test B — duplicate ingestion reuses the document, no second embedding request', async () => {
    const db = new FakeKnowledgeDb();
    const { embed, calls } = fakeEmbedTracking();
    const input = validInput();

    const first = await ingestKnowledgeDocument(input, { supabase: asSupabase(db), embed });
    assert.equal(first.ok, true);
    const second = await ingestKnowledgeDocument(input, { supabase: asSupabase(db), embed });

    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.duplicate, true);
    assert.equal(second.chunksCreated, 0);
    assert.equal(second.chunksReused, 2);
    assert.equal(db.documents.length, 1, 'no duplicate document row created');
    assert.equal(db.chunks.length, 2, 'no duplicate chunk rows created');
    assert.equal(calls.length, 1, 'no second embedding request for identical content');
  });

  test('test C — chunk ordering is deterministic across three sections', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({
      sections: [{ content: 'A' }, { content: 'B' }, { content: 'C' }],
    }), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, true);
    const ordered = db.chunks.slice().sort((a, b) => a.chunk_index - b.chunk_index);
    assert.deepEqual(ordered.map(c => c.chunk_index), [0, 1, 2]);
    assert.deepEqual(ordered.map(c => c.content), ['A', 'B', 'C']);
  });

  test('test D — invalid domain is rejected before embedding/persistence', async () => {
    const db = new FakeKnowledgeDb();
    const { embed, calls } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ domain: 'medical' as unknown as KnowledgeDocumentInput['domain'] }), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Invalid domain/);
    assert.equal(db.documents.length, 0);
    assert.equal(calls.length, 0, 'never calls the embedding API for invalid input');
  });

  test('rejects an empty title', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ title: '   ' }), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, false);
  });

  test('rejects an empty sections array', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ sections: [] }), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, false);
  });

  test('rejects version < 1', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ version: 0 }), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, false);
  });

  test('rejects an invalid status', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ status: 'published' as unknown as KnowledgeDocumentInput['status'] }), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, false);
  });

  test('test M — embedding failure fails ingestion explicitly, no partially-embedded document persisted', async () => {
    const db = new FakeKnowledgeDb();
    const embed = async () => ({ ok: false as const, error: 'OpenAI embeddings request failed: 500 simulated' });
    const result = await ingestKnowledgeDocument(validInput(), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /simulated/);
    assert.equal(db.documents.length, 0, 'no document persisted when embedding fails');
    assert.equal(db.chunks.length, 0);
  });

  test('test P — fewer embeddings returned than requested fails ingestion, nothing persisted', async () => {
    const db = new FakeKnowledgeDb();
    const embed = async (inputs: string[]) => ({ ok: false as const, error: `Embedding count mismatch: expected ${inputs.length}, got 1` });
    const result = await ingestKnowledgeDocument(validInput(), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, false);
    assert.equal(db.documents.length, 0);
  });

  test('test Q — metadata is normalized during ingestion (drift prevention)', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput({ metadata: { goals: ['Build Muscle'] } }), { supabase: asSupabase(db), embed });

    assert.equal(result.ok, true);
    assert.deepEqual(db.documents[0].metadata.goals, ['build_muscle']);
  });
});

describe('approveKnowledgeDocument / setKnowledgeDocumentStatus', () => {
  test('test E/F/G — draft is not approved by default; explicit approval sets status', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput(), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(db.documents[0].status, 'draft');

    const approved = await approveKnowledgeDocument(result.documentId, { supabase: asSupabase(db) });
    assert.equal(approved.ok, true);
    assert.equal(db.documents[0].status, 'approved');
    assert.ok(db.documents[0].last_reviewed_at, 'last_reviewed_at is set on approval (section 48)');
  });

  test('test O — approving a v2 with the same document_key retires the previously-approved v1, no other document affected', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();

    const v1 = await ingestKnowledgeDocument(validInput({ documentKey: 'doc-x', version: 1 }), { supabase: asSupabase(db), embed });
    assert.equal(v1.ok, true);
    if (!v1.ok) return;
    await approveKnowledgeDocument(v1.documentId, { supabase: asSupabase(db) });

    // An unrelated document that happens to share a similar title must never be touched.
    const unrelated = await ingestKnowledgeDocument(validInput({ title: 'Test Document (unrelated)', sections: [{ content: 'Different content entirely.' }] }), { supabase: asSupabase(db), embed });
    assert.equal(unrelated.ok, true);
    if (!unrelated.ok) return;
    await approveKnowledgeDocument(unrelated.documentId, { supabase: asSupabase(db) });

    const v2 = await ingestKnowledgeDocument(validInput({ documentKey: 'doc-x', version: 2, sections: [{ content: 'Updated content for v2.' }] }), { supabase: asSupabase(db), embed });
    assert.equal(v2.ok, true);
    if (!v2.ok) return;
    const approveV2 = await approveKnowledgeDocument(v2.documentId, { supabase: asSupabase(db) });

    assert.equal(approveV2.ok, true);
    if (!approveV2.ok) return;
    assert.equal(approveV2.supersededDocumentId, v1.documentId);

    const v1Row = db.documents.find(d => d.id === v1.documentId);
    const v2Row = db.documents.find(d => d.id === v2.documentId);
    const unrelatedRow = db.documents.find(d => d.id === unrelated.documentId);
    assert.equal(v1Row.status, 'retired');
    assert.equal(v2Row.status, 'approved');
    assert.equal(unrelatedRow.status, 'approved', 'an unrelated document with a similar title is never retired (section 49)');
  });

  test('retiring a document via setKnowledgeDocumentStatus', async () => {
    const db = new FakeKnowledgeDb();
    const { embed } = fakeEmbedTracking();
    const result = await ingestKnowledgeDocument(validInput(), { supabase: asSupabase(db), embed });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const retired = await setKnowledgeDocumentStatus(result.documentId, 'retired', { supabase: asSupabase(db) });
    assert.equal(retired.ok, true);
    assert.equal(db.documents[0].status, 'retired');
  });
});
