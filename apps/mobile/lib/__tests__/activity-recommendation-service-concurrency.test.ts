// LANA MOBILE — Shared Workout Concurrency Fix. Regression test for the
// approved root-cause audit: findReusableSuggested()'s self-heal branch
// could let multiple concurrent callers (Home's up to 2 + My Plan's up to N
// ActivityFulfilmentCard instances) all see a workout at exerciseCount = 0
// and each independently run the full population loop against the same
// row, appending rather than replacing (production evidence: 38
// workout_exercises rows on one workout vs. ~11-13 for a normal pass).
//
// This is a genuine integration test against a REAL local Postgres — the
// fix's whole premise is that Postgres's own row-level UPDATE...WHERE
// locking makes the claim atomic, which a hand-rolled in-memory mock cannot
// meaningfully prove (JS's single-threaded interleaving isn't the same
// guarantee). `node:module`'s `register()` activates
// scripts/alias-loader.mjs for this file only — Metro's `@/...` alias and
// this repo's extensionless `services/*.ts` imports have no meaning under
// plain `node --test`, and this loader lets those real modules run as-is.
//
// LOCAL ONLY. Requires local Supabase running (`supabase start`) with the
// concurrency-fix migration (20260919000001) and a minimal workouts/
// exercises schema applied — see the accompanying fix report for exactly
// what was applied to this repo's local instance to make this test runnable.
import { register } from 'node:module';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
// Local demo service-role key (public, well-known — supabase/config.toml's
// own local demo project) used here only to bypass RLS for this local test
// fixture; never a real credential, never used against anything but 127.0.0.1.
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
register('../../scripts/alias-loader.mjs', import.meta.url);

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { supabase } = await import('@/lib/supabase');
const { findReusableSuggested, countWorkoutExercises } = await import('../../services/activity-recommendation-service.ts');

const TEST_USER_ID = '99999999-0000-0000-0000-000000000001';

// globalThis.fetch is ALSO how supabase-js itself makes every real request
// (the workouts/workout_exercises calls this test is actually trying to
// observe) — so the mock must only intercept calls bound for an exercise
// provider and pass everything else through to the real fetch untouched.
// ExerciseDB Primary / MuscleWiki Optional — populateExerciseWorkout now
// resolves exercises via exercisedb-provider.ts by default (MuscleWiki is
// reachable only through the separate media-enrichment path, never here),
// so BOTH hosts are intercepted; without this, a REQUIREMENTS call would
// otherwise fall through to the real, rate-limited exercisedb.p.rapidapi.com
// during a plain test run.
const realFetch = globalThis.fetch;
const MUSCLEWIKI_PREFIX = 'https://activecitypass.com/api/musclewiki';
const EXERCISEDB_PREFIX = 'https://exercisedb.p.rapidapi.com';
function mockSearchResponse(exercises: any[]) {
  return (async (url: any, init?: any) => {
    if (typeof url === 'string' && (url.startsWith(MUSCLEWIKI_PREFIX) || url.startsWith(EXERCISEDB_PREFIX))) {
      return { ok: true, json: async () => exercises, text: async () => JSON.stringify(exercises) } as any;
    }
    return realFetch(url, init);
  }) as any;
}

const REQUIREMENTS = [
  { pattern: 'squat', bodyPart: 'legs', role: 'compound' },
  { pattern: 'hinge', bodyPart: 'legs', role: 'compound' },
  { pattern: 'core', bodyPart: 'waist', role: 'core' },
] as any;

const CONTEXT = {
  goal: 'build_muscle', experience: 'intermediate', sessionsPerWeek: 3, sessionDurationMinutes: 45,
  prescribedStrengthMinutes: 45, equipmentLocation: 'gym', preferredActivities: [], activityLevel: 'active_2_3',
  durationWeeks: 8, defaultsUsed: [], sourceVersion: 'v1',
} as any;

async function createEmptyStandaloneWorkout(workoutType: string, suggestedLocalDate: string, title = 'Test Strength') {
  const { data, error } = await supabase.from('workouts').insert({
    title, category: 'strength', location_type: 'gym', difficulty: 'intermediate',
    duration_minutes: 45, is_active: true, is_activity_block: false,
    workout_type: workoutType, suggested_local_date: suggestedLocalDate,
    user_id: TEST_USER_ID, program_week_id: null,
  }).select('id').single();
  if (error) throw error;
  return data!.id as string;
}

async function cleanupWorkout(workoutId: string) {
  await supabase.from('workout_exercises').delete().eq('workout_id', workoutId);
  await supabase.from('workouts').delete().eq('id', workoutId);
}

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test('concurrency fix — two concurrent resolutions of the SAME empty workout populate exactly once', async () => {
  globalThis.fetch = mockSearchResponse([]); // deterministic curated Tier-5 fallback for every requirement, no real network
  const workoutType = 'acp_suggested_strength_support_concurrency_test_same';
  const date = '2026-09-07';
  const workoutId = await createEmptyStandaloneWorkout(workoutType, date, 'Lower strength (heavy)');
  try {
    assert.equal(await countWorkoutExercises(workoutId), 0);

    const call = () => findReusableSuggested(
      TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, workoutType, undefined, date,
    );
    // Force interleaving around the population boundary: both calls start
    // together via Promise.all, so both reach the claimPopulation() UPDATE
    // at nearly the same instant — exactly the race the audit found.
    const [r1, r2] = await Promise.all([call(), call()]);

    assert.ok(r1, 'first caller must resolve a session');
    assert.ok(r2, 'second caller must resolve a session');
    assert.equal(r1!.id, workoutId);
    assert.equal(r2!.id, workoutId); // both callers resolve the SAME workout/session id

    const finalCount = await countWorkoutExercises(workoutId);
    assert.equal(finalCount, REQUIREMENTS.length, // exactly ONE population pass, never appended twice
      `expected exactly ${REQUIREMENTS.length} workout_exercises rows (one population pass) but found ${finalCount} — the concurrency fix regressed`);
  } finally {
    await cleanupWorkout(workoutId);
  }
});

test('concurrency fix — a THIRD late caller after both winners finish also reuses the same populated workout, no further writes', async () => {
  globalThis.fetch = mockSearchResponse([]);
  const workoutType = 'acp_suggested_strength_support_concurrency_test_late';
  const date = '2026-09-07';
  const workoutId = await createEmptyStandaloneWorkout(workoutType, date);
  try {
    await Promise.all([
      findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, workoutType, undefined, date),
      findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, workoutType, undefined, date),
    ]);
    const afterTwo = await countWorkoutExercises(workoutId);
    assert.equal(afterTwo, REQUIREMENTS.length);

    const r3 = await findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, workoutType, undefined, date);
    assert.equal(r3?.id, workoutId);
    assert.equal(await countWorkoutExercises(workoutId), REQUIREMENTS.length); // isValidSuggestedSession short-circuits — no re-entry into the claim/populate path at all
  } finally {
    await cleanupWorkout(workoutId);
  }
});

test('normal regression — independent workout_type/date identities remain fully independent under concurrency', async () => {
  globalThis.fetch = mockSearchResponse([]);
  // Mirrors Richard's real week: Upper and Lower SHARE workout_type
  // (acp_suggested_strength_support) but differ by suggested_local_date;
  // Full-body uses a different workout_type entirely. All three must
  // resolve to three distinct rows with three distinct, correctly-sized
  // exercise sets, even when resolved concurrently.
  const sharedType = 'acp_suggested_strength_support_concurrency_test_shared_type';
  const otherType = 'acp_suggested_strength_concurrency_test_other_type';
  const monday = await createEmptyStandaloneWorkout(sharedType, '2026-09-07', 'Lower strength (heavy)');
  const wednesday = await createEmptyStandaloneWorkout(sharedType, '2026-09-09', 'Upper strength (push/pull)');
  const friday = await createEmptyStandaloneWorkout(otherType, '2026-09-11', 'Full-body strength (lighter)');
  try {
    const [rMon, rWed, rFri] = await Promise.all([
      findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, sharedType, undefined, '2026-09-07'),
      findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, sharedType, undefined, '2026-09-09'),
      findReusableSuggested(TEST_USER_ID, 'gym', REQUIREMENTS, CONTEXT, undefined, otherType, undefined, '2026-09-11'),
    ]);
    assert.equal(rMon?.id, monday);
    assert.equal(rWed?.id, wednesday);
    assert.equal(rFri?.id, friday);
    // Distinct ids — Upper/Lower sharing workout_type never collided even
    // resolved in the same instant, because suggested_local_date differs.
    assert.notEqual(rMon!.id, rWed!.id);

    assert.equal(await countWorkoutExercises(monday), REQUIREMENTS.length);
    assert.equal(await countWorkoutExercises(wednesday), REQUIREMENTS.length);
    assert.equal(await countWorkoutExercises(friday), REQUIREMENTS.length);
  } finally {
    await cleanupWorkout(monday);
    await cleanupWorkout(wednesday);
    await cleanupWorkout(friday);
  }
});

test('failure state — claimPopulation/releasePopulationClaim are exclusive and reversible (the atomic primitive the fix relies on)', async () => {
  const workoutType = 'acp_suggested_strength_support_concurrency_test_claim_primitive';
  const date = '2026-09-07';
  const workoutId = await createEmptyStandaloneWorkout(workoutType, date);
  try {
    const { claimPopulation, releasePopulationClaim } = await import('../../services/activity-recommendation-service.ts');

    assert.equal(await claimPopulation(workoutId), true); // first claim wins
    assert.equal(await claimPopulation(workoutId), false); // a second, concurrent claim on the SAME still-held row loses — this is the exact primitive the race relied on being missing

    await releasePopulationClaim(workoutId); // simulates the winner's own catch-block release after a hard failure (network outage mid-generation, etc.)
    assert.equal(await claimPopulation(workoutId), true); // released → immediately reclaimable, never waiting out the full staleness window
  } finally {
    await cleanupWorkout(workoutId);
  }
});

test('failure state — a losing caller\'s bounded wait resolves in well under the 45s generation budget, never indefinitely', async () => {
  // Directly exercises waitForPopulation's bound in isolation: a workout
  // that NEVER becomes populated (nothing ever claims/writes to it) must
  // still return within ~5s, not hang. This is the literal "no infinite
  // population wait" invariant (section 6), independent of whichever
  // downstream layer (exercise selection, persistence) a real failure
  // happens to occur in — exercise-selection-service.ts is deliberately
  // resilient (Beta #017's curated fallback pool) and does not itself throw
  // on a network failure, so this is tested at the wait primitive directly
  // rather than by fighting that (correct, existing) resilience.
  const workoutType = 'acp_suggested_strength_support_concurrency_test_never_populated';
  const date = '2026-09-07';
  const workoutId = await createEmptyStandaloneWorkout(workoutType, date);
  try {
    const { waitForPopulation } = await import('../../services/activity-recommendation-service.ts');
    const start = Date.now();
    const finalCount = await waitForPopulation(workoutId);
    const elapsedMs = Date.now() - start;

    assert.equal(finalCount, 0);
    assert.ok(elapsedMs < 10_000, `expected a bounded wait (~4.5s), took ${elapsedMs}ms`);
  } finally {
    await cleanupWorkout(workoutId);
  }
});
