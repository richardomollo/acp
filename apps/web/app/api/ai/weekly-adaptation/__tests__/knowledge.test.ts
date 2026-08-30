import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildKnowledgeRetrievalRequests, buildCompactKnowledgeContext, retrieveKnowledgeForAdaptation,
  hasRepeatedChallengingSessions, type KnowledgeAdaptationInput,
} from '../knowledge.ts';
import type { RetrieveKnowledgeParams, RetrieveKnowledgeResult, KnowledgeSearchResult } from '../../../../../lib/knowledge/types.ts';

function input(overrides: Partial<KnowledgeAdaptationInput> = {}): KnowledgeAdaptationInput {
  return {
    goal: 'build_muscle', experience: 'beginner', barriers: [],
    behaviourAdherenceRate: 0.8, hasDifficultyPattern: false, hasRepeatedChallengingSessions: false,
    ...overrides,
  };
}

function chunk(overrides: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult {
  return {
    chunkId: 'c1', documentId: 'd1', domain: 'training', title: 'Doc', heading: null,
    content: 'Beginners should progress load gradually.', source: 'internal', sourceType: 'internal',
    version: 1, metadata: {}, similarity: 0.5,
    ...overrides,
  };
}

describe('Test K — deterministic retrieval query builder', () => {
  test('the same structured context always produces the same requests', () => {
    const a = buildKnowledgeRetrievalRequests(input({ barriers: ['time'] }));
    const b = buildKnowledgeRetrievalRequests(input({ barriers: ['time'] }));
    assert.deepEqual(a, b);
  });

  test('requests are predictable templates, not free-form text', () => {
    const requests = buildKnowledgeRetrievalRequests(input());
    const training = requests.find(r => r.domain === 'training')!;
    assert.equal(training.query, 'beginner build_muscle progression with high adherence');
  });
});

describe('Test L — domain selection', () => {
  test('a time barrier requests the coaching domain', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ goal: null, barriers: ['time'] }));
    assert.ok(requests.some(r => r.domain === 'coaching'));
  });

  test('no unnecessary nutrition domain unless goal or barrier makes it relevant', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ goal: null, barriers: ['time'] }));
    assert.ok(!requests.some(r => r.domain === 'nutrition'));
  });

  test('a nutrition barrier requests the nutrition domain regardless of goal', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ goal: 'reduce_stress', barriers: ['nutrition'] }));
    assert.ok(requests.some(r => r.domain === 'nutrition'));
  });

  test('no training domain requested when there is no goal at all', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ goal: null }));
    assert.ok(!requests.some(r => r.domain === 'training'));
  });

  test('repeated challenging sessions requests the recovery domain', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ hasRepeatedChallengingSessions: true }));
    assert.ok(requests.some(r => r.domain === 'recovery'));
  });

  test('low adherence alone requests the coaching domain even with no named barrier', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ behaviourAdherenceRate: 0.1, barriers: [] }));
    assert.ok(requests.some(r => r.domain === 'coaching'));
  });
});

describe('Test R — knowledge context size caps', () => {
  test('per-domain topK never exceeds the documented maxima', () => {
    const requests = buildKnowledgeRetrievalRequests(input({
      barriers: ['time', 'nutrition'], hasRepeatedChallengingSessions: true,
    }));
    const capByDomain = { training: 3, recovery: 2, nutrition: 2, coaching: 2 };
    for (const r of requests) {
      assert.ok(r.topK <= capByDomain[r.domain], `${r.domain} topK ${r.topK} exceeds cap`);
    }
  });

  test('Test H (implicit) — no request ever overrides the production approved-only status default', () => {
    const requests = buildKnowledgeRetrievalRequests(input({ barriers: ['time', 'nutrition'] }));
    for (const r of requests) {
      assert.ok(!('status' in r), 'a retrieval request must never carry a status override');
    }
  });
});

describe('buildCompactKnowledgeContext — never dumps raw rows', () => {
  test('groups by domain with numbered [K1]/[K2] labels, in a fixed domain order', () => {
    const context = buildCompactKnowledgeContext({
      coaching: [chunk({ chunkId: 'co1', domain: 'coaching', content: 'Time barrier guidance.' })],
      training: [chunk({ chunkId: 'tr1', domain: 'training', content: 'Progression guidance.' })],
    });
    assert.ok(context.startsWith('RELEVANT ACP KNOWLEDGE'));
    const trainingIdx = context.indexOf('Training:');
    const coachingIdx = context.indexOf('Coaching:');
    assert.ok(trainingIdx > -1 && coachingIdx > -1 && trainingIdx < coachingIdx); // fixed order regardless of input key order
    assert.ok(context.includes('[K1] Progression guidance.'));
    assert.ok(context.includes('[K2] Time barrier guidance.'));
  });

  test('Test I — zero results across every domain produces an empty string, not an empty section', () => {
    assert.equal(buildCompactKnowledgeContext({}), '');
    assert.equal(buildCompactKnowledgeContext({ training: [] }), '');
  });
});

describe('Test G/I/J — retrieveKnowledgeForAdaptation', () => {
  test('Test G — a successful domain retrieval enters resultsByDomain and the compact context', async () => {
    const fakeRetrieve = async (params: RetrieveKnowledgeParams): Promise<RetrieveKnowledgeResult> =>
      ({ ok: true, results: [chunk({ domain: params.domains![0] })] });
    const result = await retrieveKnowledgeForAdaptation(
      [{ domain: 'training', query: 'q', topK: 3 }],
      { retrieve: fakeRetrieve },
    );
    assert.equal(result.resultsByDomain.training?.length, 1);
    assert.ok(result.compactContext.includes('Training:'));
    assert.equal(result.failedDomains.length, 0);
  });

  test('Test I — a successful retrieval that legitimately returns zero results is not a failure', async () => {
    const fakeRetrieve = async (): Promise<RetrieveKnowledgeResult> => ({ ok: true, results: [] });
    const result = await retrieveKnowledgeForAdaptation(
      [{ domain: 'training', query: 'q', topK: 3 }],
      { retrieve: fakeRetrieve },
    );
    assert.equal(result.failedDomains.length, 0);
    assert.equal(result.compactContext, '');
  });

  test('Test J — one domain failing (ok:false) never discards another domain\'s successful results', async () => {
    const fakeRetrieve = async (params: RetrieveKnowledgeParams): Promise<RetrieveKnowledgeResult> =>
      params.domains![0] === 'coaching'
        ? { ok: false, error: 'RPC unavailable' }
        : { ok: true, results: [chunk({ domain: params.domains![0] })] };
    const result = await retrieveKnowledgeForAdaptation(
      [{ domain: 'training', query: 'q1', topK: 3 }, { domain: 'coaching', query: 'q2', topK: 2 }],
      { retrieve: fakeRetrieve },
    );
    assert.deepEqual(result.failedDomains, ['coaching']);
    assert.equal(result.resultsByDomain.training?.length, 1);
    assert.equal(result.resultsByDomain.coaching, undefined);
    assert.ok(result.compactContext.includes('Training:'));
    assert.ok(!result.compactContext.includes('Coaching:'));
  });

  test('a rejected promise (infrastructure failure, not a valid {ok:false}) is handled identically — never throws', async () => {
    const fakeRetrieve = async (params: RetrieveKnowledgeParams): Promise<RetrieveKnowledgeResult> => {
      if (params.domains![0] === 'coaching') throw new Error('network error');
      return { ok: true, results: [chunk({ domain: params.domains![0] })] };
    };
    const result = await retrieveKnowledgeForAdaptation(
      [{ domain: 'training', query: 'q1', topK: 3 }, { domain: 'coaching', query: 'q2', topK: 2 }],
      { retrieve: fakeRetrieve },
    );
    assert.deepEqual(result.failedDomains, ['coaching']);
    assert.equal(result.resultsByDomain.training?.length, 1);
  });
});

describe('Test S — traceability', () => {
  test('every returned chunk retains chunkId/documentId/source/version/similarity for logging', async () => {
    const fakeRetrieve = async (params: RetrieveKnowledgeParams): Promise<RetrieveKnowledgeResult> =>
      ({ ok: true, results: [chunk({ domain: params.domains![0], chunkId: 'abc', documentId: 'doc1', source: 'internal', version: 2, similarity: 0.42 })] });
    const result = await retrieveKnowledgeForAdaptation([{ domain: 'training', query: 'q', topK: 3 }], { retrieve: fakeRetrieve });
    assert.equal(result.allChunks[0].chunkId, 'abc');
    assert.equal(result.allChunks[0].documentId, 'doc1');
    assert.equal(result.allChunks[0].source, 'internal');
    assert.equal(result.allChunks[0].version, 2);
    assert.equal(result.allChunks[0].similarity, 0.42);
  });
});

describe('Test T — no user embeddings, read-only knowledge access', () => {
  test('knowledge.ts never imports ingestion/embedding/approval functions — retrieval only', () => {
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge.ts');
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const importLine = /^\s*import\b.*from\s+['"]([^'"]+)['"]/;
    const forbiddenNamedImports = ['ingestKnowledgeDocument', 'approveKnowledgeDocument', 'embedTexts'];
    for (const line of lines) {
      const match = line.match(importLine);
      if (!match) continue;
      assert.ok(!match[1].includes('ingestion'), 'must not import the ingestion module');
      assert.ok(!match[1].includes('embeddings'), 'must not import the embeddings module directly');
      for (const forbidden of forbiddenNamedImports) {
        assert.ok(!line.includes(forbidden), `must not import ${forbidden}`);
      }
    }
  });

  test('does not import Day 7.3 supply or Day 7.2 nutrition-matching logic', () => {
    const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge.ts');
    const content = readFileSync(filePath, 'utf8');
    assert.ok(!content.includes('supply/'));
    assert.ok(!content.includes('nutrition-matching'));
    assert.ok(!content.includes('meal-ranking'));
  });
});

describe('hasRepeatedChallengingSessions', () => {
  test('true only with 2 or more challenging-intensity activities', () => {
    assert.equal(hasRepeatedChallengingSessions([{ intensity: 'challenging' }]), false);
    assert.equal(hasRepeatedChallengingSessions([{ intensity: 'challenging' }, { intensity: 'challenging' }]), true);
    assert.equal(hasRepeatedChallengingSessions([{ intensity: 'moderate' }, { intensity: 'light' }]), false);
  });
});
