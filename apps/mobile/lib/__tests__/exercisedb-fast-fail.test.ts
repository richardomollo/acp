// LANA FITNESS — ExerciseDB Fast-Fail Hardening.
//
// Root cause this file guards against: an unreachable ExerciseDB could
// previously consume ~46.9s during workout generation — not because any
// single request lacked a timeout (it didn't, REQUEST_TIMEOUT_MS=15s
// already bounded every call), but because THREE sequential tiers per
// requirement each independently paid their own full timeout with no
// shared memory that the provider was already known down.
//
// The fix has two parts, both covered here:
//   1. searchExercises (the method workout generation actually calls) now
//      uses a much shorter FAST_FAIL_TIMEOUT_MS (3s) per request.
//   2. A shared ProviderHealth flag (services/exercise-selection-service.ts)
//      is threaded through every selectExerciseForRequirement call in one
//      populateExerciseWorkout attempt — the FIRST genuine provider
//      failure marks it down, and every remaining tier/requirement then
//      skips the network immediately rather than retrying.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectExerciseForRequirement, createProviderHealth } from '../../services/exercise-selection-service.ts';
import type { ExerciseRequirement } from '../programme-types.ts';

const EXERCISEDB_PREFIX = 'https://exercisedb.p.rapidapi.com';
const realFetch = globalThis.fetch;

// exerciseService caches search results in-memory per exact filter object,
// keyed on (among other things) the query string — which is muscleHint when
// present, per selectExerciseForRequirement's own primaryQuery logic. Every
// call below passes its own distinct bodyPart specifically so it gets its
// own cache entry; muscleHint must therefore default from bodyPart here
// too; a shared literal default would silently collide across tests.
function req(overrides: Partial<ExerciseRequirement> & { bodyPart: string }): ExerciseRequirement {
  return { pattern: 'squat', role: 'compound', muscleHint: overrides.bodyPart, ...overrides };
}

function assertResolvedViaFallback(result: Awaited<ReturnType<typeof selectExerciseForRequirement>>, pattern: string) {
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.exercise.provider, 'acp');
  assert.ok(!result.exercise.id.includes('musclewiki'), 'must never fall through to MuscleWiki');
}

describe('ExerciseDB success', () => {
  test('a real candidate resolves normally, fallbackUsed=false', async () => {
    globalThis.fetch = (async (url: any) => {
      if (String(url).startsWith(EXERCISEDB_PREFIX)) {
        return { ok: true, json: async () => [{ id: '1', name: 'Barbell Squat', bodyPart: 'upper legs', target: 'quads', equipment: 'barbell' }] } as any;
      }
      return realFetch(url as any);
    }) as any;
    try {
      const result = await selectExerciseForRequirement(req({ bodyPart: 'ff-success' }), 'gym', 'intermediate', new Set());
      assert.equal(result.fallbackUsed, false);
      assert.equal(result.exercise.id, '1');
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('ExerciseDB failure modes — every one resolves through the curated fallback, never MuscleWiki', () => {
  test('network rejection (fetch throws)', async () => {
    globalThis.fetch = (async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as any;
    try {
      const result = await selectExerciseForRequirement(req({ bodyPart: 'ff-network' }), 'gym', 'intermediate', new Set());
      assertResolvedViaFallback(result, 'squat');
    } finally { globalThis.fetch = realFetch; }
  });

  test('429 rate limited', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 429, json: async () => ({}) } as any)) as any;
    try {
      const result = await selectExerciseForRequirement(req({ bodyPart: 'ff-429' }), 'gym', 'intermediate', new Set());
      assertResolvedViaFallback(result, 'squat');
    } finally { globalThis.fetch = realFetch; }
  });

  test('500 server error', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) } as any)) as any;
    try {
      const result = await selectExerciseForRequirement(req({ bodyPart: 'ff-500' }), 'gym', 'intermediate', new Set());
      assertResolvedViaFallback(result, 'squat');
    } finally { globalThis.fetch = realFetch; }
  });

  test('hanging request resolves within a few seconds, not 15s+', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any; // never resolves
    const start = Date.now();
    try {
      const result = await selectExerciseForRequirement(req({ bodyPart: 'ff-hang' }), 'gym', 'intermediate', new Set());
      const elapsedMs = Date.now() - start;
      assertResolvedViaFallback(result, 'squat');
      // FAST_FAIL_TIMEOUT_MS is 3s; allow generous headroom for CI/local
      // scheduling jitter, but this must be nowhere near the old 15s bound.
      assert.ok(elapsedMs < 8000, `expected a fast-fail bound well under 15s, took ${elapsedMs}ms`);
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('shared provider-availability budget (the actual 46.9s fix)', () => {
  test('once ProviderHealth is marked down, later requirements in the SAME attempt make zero further network calls', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => { callCount++; throw new Error('ExerciseDB down'); }) as any;
    const providerHealth = createProviderHealth();
    try {
      const r1 = await selectExerciseForRequirement(req({ bodyPart: 'ff-shared-1' }), 'gym', 'intermediate', new Set(), { providerHealth });
      assert.equal(providerHealth.down, true, 'the first failure must mark providerHealth down');
      const callsAfterFirst = callCount;
      assert.ok(callsAfterFirst >= 1);

      // Two more "requirements" in the same attempt, sharing the SAME
      // providerHealth object exactly like populateExerciseWorkout's loop.
      const r2 = await selectExerciseForRequirement(req({ pattern: 'hinge', bodyPart: 'ff-shared-2' }), 'gym', 'intermediate', new Set(), { providerHealth });
      const r3 = await selectExerciseForRequirement(req({ pattern: 'core', bodyPart: 'ff-shared-3' }), 'gym', 'intermediate', new Set(), { providerHealth });

      assert.equal(callCount, callsAfterFirst, 'no further network calls once providerHealth is down');
      for (const r of [r1, r2, r3]) assertResolvedViaFallback(r, r.exercise.id);
    } finally { globalThis.fetch = realFetch; }
  });

  test('a full 3-requirement session with ExerciseDB hanging resolves in a few seconds total, not ~46.9s', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any; // never resolves — the exact 46.9s repro condition
    const providerHealth = createProviderHealth();
    const requirements: ExerciseRequirement[] = [
      req({ pattern: 'squat', bodyPart: 'ff-session-1' }),
      req({ pattern: 'hinge', bodyPart: 'ff-session-2' }),
      req({ pattern: 'horizontal_push', bodyPart: 'ff-session-3' }),
    ];
    const start = Date.now();
    try {
      for (const r of requirements) {
        const result = await selectExerciseForRequirement(r, 'gym', 'intermediate', new Set(), { providerHealth });
        assert.equal(result.fallbackUsed, true);
      }
      const elapsedMs = Date.now() - start;
      // One ~3s timeout total (only the FIRST requirement ever touches the
      // network), not 3 requirements × up to 3 tiers × 3s each (~27s), and
      // nowhere near the original 46.9s.
      assert.ok(elapsedMs < 8000, `expected the whole session bounded by ~one fast-fail timeout, took ${elapsedMs}ms`);
    } finally { globalThis.fetch = realFetch; }
  });
});

describe('Monday/Wednesday/Friday still resolve independently with a hanging provider (§5)', () => {
  test('three concurrent requirement resolutions (mirroring Richard\'s week) all resolve via fallback, bounded, no MuscleWiki', async () => {
    globalThis.fetch = (async () => new Promise(() => {})) as any;
    const start = Date.now();
    try {
      const [monday, wednesday, friday] = await Promise.all([
        selectExerciseForRequirement(req({ pattern: 'squat', bodyPart: 'monday-lower' }), 'gym', 'advanced', new Set(), { providerHealth: createProviderHealth() }),
        selectExerciseForRequirement(req({ pattern: 'horizontal_push', bodyPart: 'wednesday-upper' }), 'gym', 'advanced', new Set(), { providerHealth: createProviderHealth() }),
        selectExerciseForRequirement(req({ pattern: 'squat', bodyPart: 'friday-fullbody' }), 'gym', 'intermediate', new Set(), { providerHealth: createProviderHealth() }),
      ]);
      const elapsedMs = Date.now() - start;
      for (const r of [monday, wednesday, friday]) assertResolvedViaFallback(r, r.exercise.id);
      assert.ok(elapsedMs < 8000, `expected all three bounded well under 15s, took ${elapsedMs}ms`);
    } finally { globalThis.fetch = realFetch; }
  });
});
