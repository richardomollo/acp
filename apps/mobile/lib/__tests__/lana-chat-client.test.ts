import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sendLanaChatMessage } from '../lana-chat/client.ts';

afterEach(() => { delete process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED; });

describe('sendLanaChatMessage — race + fallback (mirrors nutrition-coaching\'s own convention)', () => {
  test('flag disabled → never even calls fetch', async () => {
    let called = false;
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, async () => { called = true; return new Response('{}'); });
    assert.equal(res.ok, false);
    assert.equal(called, false);
  });

  test('flag enabled, OpenAI/network unreachable (fetch throws) → ok:false, never throws', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, () => { throw new Error('network'); });
    assert.equal(res.ok, false);
    assert.equal(res.reply, null);
  });

  test('non-200 → ok:false', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, async () => new Response('nope', { status: 502 }));
    assert.equal(res.ok, false);
  });

  test('invalid JSON shape → ok:false', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, async () => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    assert.equal(res.ok, false);
  });

  test('slow response beyond the UX deadline → ok:false (Test J — safe UI state, not a hang)', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    const slow: typeof fetch = () => new Promise(r => setTimeout(() => r(new Response(JSON.stringify({ reply: 'x' }), { status: 200 })), 200));
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, slow, 20);
    assert.equal(res.ok, false);
  });

  test('valid reply → returned as-is', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    const res = await sendLanaChatMessage('u1', 'tok', 'hi', [], null, async () => new Response(JSON.stringify({ reply: 'You are on track.' }), { status: 200 }));
    assert.equal(res.ok, true);
    assert.equal(res.reply, 'You are on track.');
  });

  test('an empty message never calls fetch', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    let called = false;
    const res = await sendLanaChatMessage('u1', 'tok', '   ', [], null, async () => { called = true; return new Response('{}'); });
    assert.equal(res.ok, false);
    assert.equal(called, false);
  });

  test('the request body never includes a full conversation dump beyond what was passed — caller controls history size', async () => {
    process.env.EXPO_PUBLIC_LANA_CHAT_ENABLED = 'true';
    let sentBody: any = null;
    const capture: typeof fetch = async (_url, init: any) => {
      sentBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ reply: 'ok' }), { status: 200 });
    };
    const history = [{ role: 'user' as const, content: 'earlier msg' }];
    await sendLanaChatMessage('u1', 'tok', 'hi', history, { min: 100, max: 150 }, capture);
    assert.deepEqual(sentBody.conversationHistory, history);
    assert.deepEqual(sentBody.proteinTargetG, { min: 100, max: 150 });
    assert.equal(sentBody.message, 'hi');
  });
});

describe('Test L — no OpenAI secret ships in the mobile client', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const serviceSource = readFileSync(path.resolve(__dirname, '../lana-chat/client.ts'), 'utf-8');
  const screenSource = readFileSync(path.resolve(__dirname, '../../app/(tabs)/chat.tsx'), 'utf-8');

  test('lib/lana-chat/client.ts never references an OpenAI key/secret', () => {
    assert.ok(!/OPENAI_API_KEY|sk-[a-zA-Z0-9]/i.test(serviceSource));
  });
  test('lib/lana-chat/client.ts never calls api.openai.com directly — only the app\'s own server route', () => {
    assert.ok(!/api\.openai\.com/i.test(serviceSource));
    assert.match(serviceSource, /\/api\/ai\/lana-chat/);
  });
  test('the chat screen never references an OpenAI key/secret either', () => {
    assert.ok(!/OPENAI_API_KEY|sk-[a-zA-Z0-9]/i.test(screenSource));
  });
});
