import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mapMuscleWikiExercise, musclewikiProvider } from '../../services/providers/musclewiki-provider.ts';
import { ExerciseProviderError } from '../exercise-types.ts';

// A real, live-fetched response (Beta Readiness Step 1 — GET /exercises/1
// with a valid X-API-Key) with no account-specific/sensitive data — the
// exercise content itself is public. Protects the mapper against future
// schema drift now that the real contract is known, instead of only ever
// testing against an assumed shape.
const REAL_FIXTURE_BARBELL_CURL = {
  id: 1,
  name: 'Barbell Curl',
  primary_muscles: ['Biceps'],
  category: 'Barbell',
  force: 'Pull',
  grips: ['Underhand'],
  mechanic: 'Isolation',
  difficulty: 'Intermediate',
  steps: [
    'While holding the upper arms stationary, curl the weights forward while contracting the biceps as you breathe out.',
    'Continue the movement until your biceps are fully contracted and the bar is at shoulder level.',
    'Hold the contracted position for a second and squeeze the biceps hard.',
    'Slowly bring the weight back down to the starting position.',
  ],
  videos: [
    { url: 'https://api.musclewiki.com/stream/videos/branded/male-Barbell-barbell-curl-front.mp4', angle: 'front', gender: 'male', og_image: 'https://api.musclewiki.com/stream/images/og_images/og-male-Barbell-barbell-curl-front.jpg' },
    { url: 'https://api.musclewiki.com/stream/videos/branded/male-Barbell-barbell-curl-side.mp4', angle: 'side', gender: 'male', og_image: 'https://api.musclewiki.com/stream/images/og_images/og-male-Barbell-barbell-curl-side.jpg' },
  ],
  bodymap_male: null,
  bodymap_female: null,
};

describe('mapMuscleWikiExercise — real MuscleWiki contract (Beta Readiness Step 1)', () => {
  test('maps the real fixture correctly', () => {
    const ex = mapMuscleWikiExercise(REAL_FIXTURE_BARBELL_CURL);
    assert.equal(ex.id, '1');
    assert.equal(ex.provider, 'musclewiki');
    assert.equal(ex.name, 'Barbell Curl');
    assert.equal(ex.bodyPart, 'upper arms'); // Biceps -> upper arms, ACP's own bucket vocabulary
    assert.equal(ex.target, 'Biceps');
    assert.deepEqual(ex.secondaryMuscles, []);
    assert.equal(ex.equipment, 'barbell'); // real API's `category` field IS the equipment field, confirmed live
    assert.equal(ex.difficulty, 'intermediate');
    assert.equal(ex.category, 'Isolation'); // real API's `mechanic` field — closest available analogue to an exercise-type chip
    assert.equal(ex.instructions.length, 4); // real API's `steps` field, not `instructions`
    assert.equal(ex.media.length, 4); // 2 videos + 2 og_images
    assert.equal(ex.media[0].type, 'video');
    assert.equal(ex.media[0].url, REAL_FIXTURE_BARBELL_CURL.videos[0].url);
    assert.equal(ex.media[1].type, 'image');
    assert.equal(ex.media[1].url, REAL_FIXTURE_BARBELL_CURL.videos[0].og_image);
  });

  test('maps a secondary muscle from primary_muscles[1+] when present', () => {
    const ex = mapMuscleWikiExercise({ id: 5, name: 'Cable Chest Press', primary_muscles: ['Chest', 'Triceps', 'Front Shoulders'] } as any);
    assert.equal(ex.target, 'Chest');
    assert.deepEqual(ex.secondaryMuscles, ['Triceps', 'Front Shoulders']);
  });

  test('an unrecognised muscle name safely degrades to an empty bodyPart rather than mis-mapping', () => {
    const ex = mapMuscleWikiExercise({ id: 1, name: 'X', primary_muscles: ['Some New Muscle Name'] } as any);
    assert.equal(ex.bodyPart, '');
    assert.equal(ex.target, 'Some New Muscle Name');
  });

  test('never throws on missing optional fields — safe defaults instead', () => {
    const ex = mapMuscleWikiExercise({ id: '7', name: 'Push Up' } as any);
    assert.equal(ex.id, '7');
    assert.equal(ex.bodyPart, '');
    assert.equal(ex.target, '');
    assert.deepEqual(ex.secondaryMuscles, []);
    assert.equal(ex.equipment, 'bodyweight'); // safe default, mirrors MuscleWiki's own real vocabulary
    assert.equal(ex.difficulty, 'beginner');
    assert.equal(ex.category, null);
    assert.equal(ex.description, null);
    assert.deepEqual(ex.instructions, []);
    assert.deepEqual(ex.media, []);
  });

  test('"Novice" (MuscleWiki\'s own extra difficulty value) normalises to beginner', () => {
    const ex = mapMuscleWikiExercise({ id: '1', name: 'X', difficulty: 'Novice' } as any);
    assert.equal(ex.difficulty, 'beginner');
  });

  test('falls back to beginner for an unrecognised difficulty string', () => {
    const ex = mapMuscleWikiExercise({ id: '1', name: 'X', difficulty: 'nonsense' } as any);
    assert.equal(ex.difficulty, 'beginner');
  });

  test('missing name falls back to a placeholder rather than an empty string', () => {
    const ex = mapMuscleWikiExercise({ id: '1' } as any);
    assert.equal(ex.name, 'Unnamed exercise');
  });
});

describe('musclewikiProvider — search/list/get against the proxy (real contract)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  function mockBareArray(exercises: any[]) {
    globalThis.fetch = (async () => ({ ok: true, json: async () => exercises } as any)) as any;
  }

  test('getExercises routes through /search using bodyPart as the free-text query', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string) => { capturedUrl = url; return { ok: true, json: async () => [{ id: 8, name: 'Barbell Squat', primary_muscles: ['Quads'] }] } as any; }) as any;

    const result = await musclewikiProvider.getExercises('upper legs', 15, 30);
    assert.equal(result.length, 1);
    assert.match(capturedUrl, /path=search/);
    assert.match(capturedUrl, /q=upper\+legs/);
    assert.match(capturedUrl, /limit=15/);
    assert.match(capturedUrl, /offset=30/);
  });

  test('searchExercises prefers query, falling back to muscle then bodyPart, and maps equipment/difficulty', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string) => { capturedUrl = url; return { ok: true, json: async () => [] } as any; }) as any;

    await musclewikiProvider.searchExercises({ query: 'press', bodyPart: 'chest', muscle: 'pectorals', equipment: 'barbell', difficulty: 'advanced' });
    assert.match(capturedUrl, /q=press/);
    assert.match(capturedUrl, /category=barbell/);
    assert.match(capturedUrl, /difficulty=advanced/);
  });

  test('getExercises/searchExercises handle the real bare-array response shape', async () => {
    mockBareArray([REAL_FIXTURE_BARBELL_CURL]);
    const result = await musclewikiProvider.searchExercises({ query: 'curl' });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Barbell Curl');
  });

  test('getExercise handles the real bare-object response shape (GET /exercises/{id})', async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => REAL_FIXTURE_BARBELL_CURL } as any)) as any;
    const result = await musclewikiProvider.getExercise('1');
    assert.equal(result?.name, 'Barbell Curl');
  });

  test('getExercise also handles a {results:[]} list-shaped response gracefully', async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ total: 1, limit: 20, offset: 0, count: 1, results: [REAL_FIXTURE_BARBELL_CURL] }) } as any)) as any;
    const result = await musclewikiProvider.getExercise('1');
    assert.equal(result?.name, 'Barbell Curl');
  });

  test('empty search results resolve to an empty list, not an error', async () => {
    mockBareArray([]);
    const result = await musclewikiProvider.searchExercises({ query: 'nonexistent-exercise' });
    assert.deepEqual(result, []);
  });

  test('getExercise returns null on a 404 (verified live: unknown id -> 404)', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 404 } as any)) as any;
    const result = await musclewikiProvider.getExercise('does-not-exist');
    assert.equal(result, null);
  });

  // Verified live: an invalid X-API-Key returns 403, not 401 — both are
  // covered since either could occur depending on account/plan state.
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited'], [500, 'server_error']] as const) {
    test(`HTTP ${status} surfaces as ExerciseProviderError('${code}')`, async () => {
      globalThis.fetch = (async () => ({ ok: false, status } as any)) as any;
      await assert.rejects(
        () => musclewikiProvider.getExercises('chest', 15, 0),
        (e: unknown) => e instanceof ExerciseProviderError && e.code === code,
      );
    });
  }

  test('a network-level throw surfaces as network_error', async () => {
    globalThis.fetch = (async () => { throw new Error('offline'); }) as any;
    await assert.rejects(
      () => musclewikiProvider.getExercises('chest', 15, 0),
      (e: unknown) => e instanceof ExerciseProviderError && e.code === 'network_error',
    );
  });

  test('an ok response with malformed JSON surfaces as malformed_response', async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => { throw new Error('bad json'); } } as any)) as any;
    await assert.rejects(
      () => musclewikiProvider.getExercises('chest', 15, 0),
      (e: unknown) => e instanceof ExerciseProviderError && e.code === 'malformed_response',
    );
  });

  test('an ok response in an unrecognised shape surfaces as malformed_response', async () => {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ somethingElse: true }) } as any)) as any;
    await assert.rejects(
      () => musclewikiProvider.getExercises('chest', 15, 0),
      (e: unknown) => e instanceof ExerciseProviderError && e.code === 'malformed_response',
    );
  });
});
