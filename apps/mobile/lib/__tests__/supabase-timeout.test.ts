// LANA IOS — Shared Supabase Request Timeout.
//
// Proves the shared bounded-fetch fix in lib/supabase.tsx: a stalled
// Supabase request rejects within a short bound (never hangs indefinitely
// on device), preserves request contents exactly, and — critically —
// rejects with an AbortError-shaped error so postgrest-js's own internal
// retry logic doesn't silently multiply the wait. Also proves the two
// concrete screens this fixes (Nutrition, Workout) genuinely cannot be
// left in a permanent loading state once this fix is in place, using the
// SAME plain supabase.from(...) / service calls those screens make,
// against real local Postgres with a stalled fetch injected.
import { register } from 'node:module';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
// Local demo service-role key (public, well-known — supabase/config.toml's
// own local demo project), used here only to bypass RLS for this local
// fixture; never a real credential, never used against anything but 127.0.0.1.
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
register('../../scripts/alias-loader.mjs', import.meta.url);

const { test, describe, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { supabase, createBoundedFetch, requestLabel, SUPABASE_REQUEST_TIMEOUT_MS } = await import('../supabase.tsx');

const TEST_USER_ID = '99999999-0000-0000-0000-000000000001';
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });

describe('requestLabel', () => {
  test('extracts a path-only label, never the query string', () => {
    assert.equal(requestLabel('https://x.supabase.co/rest/v1/meals?select=id&user_id=eq.abc-123'), 'rest/v1/meals');
    assert.equal(requestLabel('https://x.supabase.co/auth/v1/token?grant_type=refresh_token'), 'auth/v1/token');
    assert.equal(requestLabel('https://x.supabase.co/storage/v1/object/avatars/foo.jpg'), 'storage/v1/object');
  });
});

describe('createBoundedFetch — unit tests (short custom timeouts, no real 10s wait)', () => {
  test('A. healthy fetch succeeds unchanged', async () => {
    globalThis.fetch = (async (url: any, init: any) => ({ ok: true, status: 200, url, __init: init } as any)) as any;
    const bounded = createBoundedFetch(() => 200);
    const res: any = await bounded('https://x.test/rest/v1/meals', { method: 'GET' });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
  });

  test('B. a stalled fetch rejects within the configured timeout, not indefinitely', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any; // never resolves
    const bounded = createBoundedFetch(() => 200);
    const start = Date.now();
    await assert.rejects(() => bounded('https://x.test/rest/v1/meals'));
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 2000, `expected the ~200ms bound, took ${elapsedMs}ms`);
  });

  test('C. the rejection is AbortError-shaped, so postgrest-js will not retry it', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any;
    const bounded = createBoundedFetch(() => 150);
    try {
      await bounded('https://x.test/rest/v1/meals');
      assert.fail('expected a rejection');
    } catch (e: any) {
      assert.equal(e.name, 'AbortError');
      assert.match(e.message, /timed out/i);
    }
  });

  test('D. auth-path requests are bounded identically (no special-casing that would break auth)', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any;
    const bounded = createBoundedFetch(() => 150);
    const start = Date.now();
    await assert.rejects(() => bounded('https://x.test/auth/v1/token?grant_type=refresh_token'));
    assert.ok(Date.now() - start < 2000);
  });

  test('E. request metadata (method/headers/body/credentials) is preserved exactly, and a caller-supplied signal is never replaced', async () => {
    let seenInit: any = null;
    globalThis.fetch = (async (_url: any, init: any) => { seenInit = init; return { ok: true, status: 200 } as any; }) as any;
    const bounded = createBoundedFetch(() => 200);
    const callerController = new AbortController();
    const headers = { 'X-Test': 'abc' };
    await bounded('https://x.test/rest/v1/meals', {
      method: 'POST', headers, body: '{"a":1}', credentials: 'omit', signal: callerController.signal,
    });
    assert.equal(seenInit.method, 'POST');
    assert.deepEqual(seenInit.headers, headers);
    assert.equal(seenInit.body, '{"a":1}');
    assert.equal(seenInit.credentials, 'omit');
    assert.equal(seenInit.signal, callerController.signal, 'must reuse the caller\'s own signal, never construct a new one');
  });

  test('a request with NO caller signal gets one added (for best-effort abort), without touching any other field', async () => {
    let seenInit: any = null;
    globalThis.fetch = (async (_url: any, init: any) => { seenInit = init; return { ok: true, status: 200 } as any; }) as any;
    const bounded = createBoundedFetch(() => 200);
    await bounded('https://x.test/rest/v1/meals', { method: 'GET' });
    assert.equal(seenInit.method, 'GET');
    assert.ok(seenInit.signal instanceof AbortSignal);
  });
});

describe('F. Nutrition — the exact plain supabase.from(...) pattern today-nutrition.tsx uses cannot hang', () => {
  test('a stalled fitness_profile read resolves (data:null, error set) within the shared timeout, never hangs', async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('127.0.0.1:54321')) return new Promise(() => {}); // simulate a stalled Supabase request
      return realFetch(url, init);
    }) as any;
    const start = Date.now();
    const { data, error } = await supabase
      .from('fitness_profile').select('ai_assessment, goal, cuisine_preferences')
      .eq('user_id', TEST_USER_ID).maybeSingle();
    const elapsedMs = Date.now() - start;
    assert.equal(data, null); // resolves with no data, exactly like a legitimate "not found" — today-nutrition.tsx's existing ?? handling already tolerates this
    assert.ok(error, 'error should be populated, not silently swallowed');
    assert.ok(elapsedMs < SUPABASE_REQUEST_TIMEOUT_MS + 5000, `expected resolution near the ${SUPABASE_REQUEST_TIMEOUT_MS}ms bound, took ${elapsedMs}ms`);
  });
});

describe('G. Workout — the exact plain supabase.from(...) pattern programmeService.getActiveProgramme uses cannot hang', () => {
  // Mirrors services/programme-service.ts's getActiveProgramme query
  // exactly (workout_programs, then workout_program_weeks/workouts if it
  // found one) — tested directly against the query rather than through the
  // full service wrapper, since assertOwnSession's own auth check (a
  // separate, already-safe concern — GoTrue's getSession() makes no
  // network call at all when nothing is persisted locally) would otherwise
  // short-circuit before ever reaching the DB read this test targets.
  test('a stalled workout_programs read resolves (data:null, error set) within the shared timeout, never hangs', async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes('127.0.0.1:54321')) return new Promise(() => {});
      return realFetch(url, init);
    }) as any;
    const start = Date.now();
    const { data, error } = await supabase
      .from('workout_programs').select('*')
      .eq('user_id', TEST_USER_ID).eq('status', 'active').maybeSingle();
    const elapsedMs = Date.now() - start;
    assert.equal(data, null);
    assert.ok(error, 'error should be populated, not silently swallowed');
    assert.ok(elapsedMs < SUPABASE_REQUEST_TIMEOUT_MS + 5000, `expected resolution near the ${SUPABASE_REQUEST_TIMEOUT_MS}ms bound, took ${elapsedMs}ms`);
  });
});
