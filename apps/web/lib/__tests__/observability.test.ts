import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { logAcpEvent, classifyOpenAiFailure, fetchWithTimeout } from '../observability.ts';

describe('logAcpEvent', () => {
  test('is a no-op under NODE_ENV=test (suites stay quiet) and never throws', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s?: unknown) => { logs.push(String(s)); };
    try {
      logAcpEvent('weekly_adaptation_completed', { durationMs: 10, totalTokens: 42 });
      assert.equal(logs.length, 0);
    } finally {
      console.log = orig;
      process.env.NODE_ENV = prev;
    }
  });

  test('emits a single-line JSON object with event + omits empty/undefined fields', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s?: unknown) => { logs.push(String(s)); };
    try {
      logAcpEvent('knowledge_retrieval_completed', { ragDomains: ['training'], ragFailedDomains: [], durationMs: undefined });
    } finally {
      console.log = orig;
      process.env.NODE_ENV = prev;
    }
    assert.equal(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.event, 'knowledge_retrieval_completed');
    assert.equal(parsed.service, 'acp-intelligence');
    assert.deepEqual(parsed.ragDomains, ['training']);
    assert.ok(!('ragFailedDomains' in parsed)); // empty array omitted
    assert.ok(!('durationMs' in parsed));
    assert.ok(typeof parsed.t === 'string');
  });

  test('never logs raw content — the field allowlist is counts/flags/codes only', () => {
    // Type-level: AcpEventFields has no prompt/response/measurement field.
    // Runtime: an unknown key passed via a cast is still serialised, so the
    // contract is "callers pass only allowlisted fields" — assert the shape
    // the routes actually use contains no free text.
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s?: unknown) => { logs.push(String(s)); };
    try {
      logAcpEvent('weekly_adaptation_completed', {
        durationMs: 4210, usedFallback: false, model: 'gpt-5-mini',
        promptTokens: 1200, completionTokens: 300, totalTokens: 1500,
        executionEvidencePresent: true,
      });
    } finally {
      console.log = orig;
      process.env.NODE_ENV = prev;
    }
    const parsed = JSON.parse(logs[0]);
    for (const k of Object.keys(parsed)) {
      assert.ok(!/prompt(?!Tokens)|response|message|content|email|token(?!s)|measurement|weight|bodyfat/i.test(k), `leaky key: ${k}`);
    }
  });
});

describe('classifyOpenAiFailure', () => {
  test('429 → rate limit; 5xx → server error; abort → timeout; parse → invalid response', () => {
    assert.equal(classifyOpenAiFailure(429), 'OPENAI_RATE_LIMIT');
    assert.equal(classifyOpenAiFailure(503), 'OPENAI_SERVER_ERROR');
    assert.equal(classifyOpenAiFailure(null, { name: 'AbortError' }), 'OPENAI_TIMEOUT');
    assert.equal(classifyOpenAiFailure(null, new Error('Unexpected token in JSON')), 'OPENAI_INVALID_RESPONSE');
    assert.equal(classifyOpenAiFailure(null, new Error('socket hang up')), 'OPENAI_SERVER_ERROR');
  });
});

describe('fetchWithTimeout', () => {
  test('aborts a slow request at the deadline (AbortError, not a hang)', async () => {
    const orig = globalThis.fetch;
    // A fetch that only settles when its signal aborts.
    globalThis.fetch = ((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as typeof fetch;
    try {
      await assert.rejects(
        fetchWithTimeout('https://x', { method: 'POST' }, 20),
        (e: unknown) => (e as { name?: string }).name === 'AbortError',
      );
    } finally {
      globalThis.fetch = orig;
    }
  });

  test('passes a fast response straight through and clears its timer', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    try {
      const res = await fetchWithTimeout('https://x', { method: 'GET' }, 1000);
      assert.equal(res.status, 200);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
