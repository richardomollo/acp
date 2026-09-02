import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { analysePhoto } from '../nutrition/nutrition-photo-request.ts';

// A base64 payload comfortably over the "too short to be an image" floor.
const B64 = 'AAAA'.repeat(64); // 256 chars → 192 bytes
const okPhoto = { base64: B64, mimeType: 'image/jpeg' };

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}
function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({ error: 'x' }) } as unknown as Response;
}

afterEach(() => { delete process.env.EXPO_PUBLIC_ACP_NUTRITION_CAMERA_ENABLED; });

describe('analysePhoto (§53 — bounded single attempt, never throws)', () => {
  test('CASE A — success returns validated candidate labels only', async () => {
    let sentUrl = '';
    const fetchImpl = (async (url: string) => {
      sentUrl = url;
      return jsonResponse({ foods: [{ label: 'banana', confidence: 'high' }], uncertain: false });
    }) as unknown as typeof fetch;

    const out = await analysePhoto('tok', okPhoto, fetchImpl, 5_000);
    assert.deepEqual(out, { ok: true, result: { foods: [{ label: 'banana', confidence: 'high' }], uncertain: false } });
    assert.match(sentUrl, /\/api\/ai\/nutrition-photo-analysis$/);
  });

  test('the request body carries ONLY accessToken + imageBase64 + mimeType, and strips any data: prefix (no EXIF/URL)', async () => {
    let sentBody: any = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(String(init.body));
      return jsonResponse({ foods: [], uncertain: true });
    }) as unknown as typeof fetch;

    await analysePhoto('tok', { base64: `data:image/jpeg;base64,${B64}`, mimeType: 'image/jpeg' }, fetchImpl, 5_000);
    assert.deepEqual(Object.keys(sentBody).sort(), ['accessToken', 'imageBase64', 'mimeType']);
    assert.equal(sentBody.imageBase64.startsWith('data:'), false);
    assert.equal(sentBody.imageBase64, B64);
  });

  test('CASE B — disabled flag: no network call', async () => {
    process.env.EXPO_PUBLIC_ACP_NUTRITION_CAMERA_ENABLED = 'false';
    let called = false;
    const fetchImpl = (async () => { called = true; return jsonResponse({}); }) as unknown as typeof fetch;
    const out = await analysePhoto('tok', okPhoto, fetchImpl, 5_000);
    assert.deepEqual(out, { ok: false, reason: 'disabled' });
    assert.equal(called, false);
  });

  test('CASE C — unsupported mime: fails fast, no network call', async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return jsonResponse({}); }) as unknown as typeof fetch;
    const out = await analysePhoto('tok', { base64: B64, mimeType: 'image/gif' }, fetchImpl, 5_000);
    assert.deepEqual(out, { ok: false, reason: 'invalid_image' });
    assert.equal(called, false);
  });

  test('CASE D — oversize image: fails fast, no network call', async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return jsonResponse({}); }) as unknown as typeof fetch;
    const huge = 'AAAA'.repeat(2 * 1024 * 1024); // ~6 MB decoded
    const out = await analysePhoto('tok', { base64: huge, mimeType: 'image/jpeg' }, fetchImpl, 5_000);
    assert.deepEqual(out, { ok: false, reason: 'invalid_image' });
    assert.equal(called, false);
  });

  // N10 N5 device defect — the failure taxonomy must distinguish a
  // config/network/service outage from a genuinely unreadable photo, so the
  // UI never blames the user's photo for a server problem (§5/§14).
  test('CASE E — a 2xx body that is not a usable result → unreadable (the model couldn’t read it)', async () => {
    const fetchImpl = (async () => jsonResponse('not an object')) as unknown as typeof fetch;
    assert.deepEqual(await analysePhoto('tok', okPhoto, fetchImpl, 5_000), { ok: false, reason: 'unreadable' });
  });

  test('CASE F — network throw → network, never rejects (offline / wrong base URL / ATS block)', async () => {
    const fetchImpl = (async () => { throw new Error('Network request failed'); }) as unknown as typeof fetch;
    assert.deepEqual(await analysePhoto('tok', okPhoto, fetchImpl, 5_000), { ok: false, reason: 'network' });
  });

  for (const [status, reason] of [
    [401, 'auth'],
    [403, 'unavailable'],
    [404, 'unavailable'],   // route not deployed — the actual N10 device failure
    [413, 'too_large'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [502, 'server_error'],  // the route's own OpenAI-failure wrapper
    [503, 'unavailable'],
  ] as const) {
    test(`CASE E${status} — HTTP ${status} → ${reason}`, async () => {
      const fetchImpl = (async () => errorResponse(status)) as unknown as typeof fetch;
      assert.deepEqual(await analysePhoto('tok', okPhoto, fetchImpl, 5_000), { ok: false, reason });
    });
  }

  test('a valid empty candidate list is still ok:true (uncertain handled by the review screen, not a failure)', async () => {
    const fetchImpl = (async () => jsonResponse({ foods: [], uncertain: true })) as unknown as typeof fetch;
    assert.deepEqual(await analysePhoto('tok', okPhoto, fetchImpl, 5_000), { ok: true, result: { foods: [], uncertain: true } });
  });

  test('CASE H — slow endpoint loses the race to the UI deadline → timeout', async () => {
    const fetchImpl = (async () => {
      await new Promise(r => setTimeout(r, 200));
      return jsonResponse({ foods: [{ label: 'late', confidence: 'high' }], uncertain: false });
    }) as unknown as typeof fetch;
    const out = await analysePhoto('tok', okPhoto, fetchImpl, 20);
    assert.deepEqual(out, { ok: false, reason: 'timeout' });
  });
});
