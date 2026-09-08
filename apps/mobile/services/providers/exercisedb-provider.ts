// ACP Intelligence™ — ExerciseDB provider (restored as Lana's PRIMARY
// exercise catalogue, 2026-09 product decision: "ExerciseDB Primary /
// MuscleWiki Optional").
//
// This is a direct client → RapidAPI call (EXPO_PUBLIC_EXERCISEDB_KEY is a
// public-safe, client-embeddable key by design — same convention as every
// other EXPO_PUBLIC_* var, unlike MuscleWiki's server-only key), restoring
// the pattern the original services/exercisedb.ts (deleted in
// d8b3d24 when MuscleWiki replaced it) used, updated with the same
// hard-timeout-race lesson learned from the TestFlight MuscleWiki incident
// (services/providers/musclewiki-provider.ts's callProxy) so this new
// PRIMARY provider can never itself become a source of indefinite hangs.
//
// Real, stable, long-unchanged RapidAPI "ExerciseDB" v1 contract:
//   GET /exercises/bodyPart/{bodyPart}?limit=&offset=
//   GET /exercises/target/{target}?limit=&offset=
//   GET /exercises/name/{name}?limit=&offset=
//   GET /exercises/exercise/{id}
// Every list endpoint returns a bare JSON array; no results is `[]`, not an
// error. The real API has NO difficulty field and NO exercise "category"
// (cardio/strength/stretching) field — every result is implicitly a
// resistance/strength-catalogue entry (see mapExerciseDBExercise below).
import {
  type ACPExercise,
  type ExerciseDifficulty,
  type ExerciseProvider,
  type ExerciseSearchFilters,
  ExerciseProviderError,
} from '../../lib/exercise-types.ts';

const BASE = 'https://exercisedb.p.rapidapi.com';
// Same bound as musclewiki-provider.ts's REQUEST_TIMEOUT_MS, and for the
// same reason (a mobile network round-trip to a third-party API can be
// materially slower than a warm dev connection) — kept as its own constant
// rather than shared, since the two providers are free to tune
// independently and must never depend on each other's timing. Used by
// getExercises/getExercise (Fitness Hub browsing — no fallback substitute
// exists there, so it's worth waiting longer for real data).
const REQUEST_TIMEOUT_MS = 15000;
// Fast-fail hardening (2026-09) — workout GENERATION (searchExercises,
// exercise-selection-service.ts's fetchCandidates) has a safe curated
// fallback the moment ExerciseDB doesn't answer quickly, so waiting the
// full REQUEST_TIMEOUT_MS there only delays a user-visible "Preparing your
// workout…" state for no benefit. Target from the approved hardening spec:
// ~2-4s per request maximum.
const FAST_FAIL_TIMEOUT_MS = 3000;

interface ExerciseDBRawExercise {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl?: string;
  secondaryMuscles?: string[];
  instructions?: string[];
}

// Real ExerciseDB equipment vocabulary -> ACP's existing equipment
// vocabulary (the one exercise-selection-service.ts's HOME_EQUIPMENT set
// and every curated-fallback entry already use). Translating here — inside
// the provider, at the mapping boundary — is what lets every downstream
// consumer (equipment/location matching, the curated fallback, the fit
// ranker) stay completely unaware ExerciseDB even exists, exactly like
// musclewiki-provider.ts's own equipment mapping does today. Unrecognised
// values pass through lowercased/trimmed rather than being dropped.
const EQUIPMENT_MAP: Record<string, string> = {
  'body weight': 'bodyweight',
  'assisted': 'machine',
  'leverage machine': 'machine',
  'smith machine': 'machine',
  'sled machine': 'machine',
  'hammer': 'machine',
  'resistance band': 'band',
  'olympic barbell': 'barbell',
  'ez barbell': 'barbell',
  'trap bar': 'barbell',
  'rope': 'cable',
  'wheel roller': 'bodyweight',
  'roller': 'bodyweight',
  'tire': 'bodyweight',
};

function normalizeExerciseDBEquipment(raw: string): string {
  const lower = (raw ?? '').trim().toLowerCase();
  return EQUIPMENT_MAP[lower] ?? lower;
}

/**
 * Real ExerciseDB exercise -> ACPExercise. Pure and exported so mapping is
 * tested against a real (sanitized) fixture without a network call, same
 * pattern as mapMuscleWikiExercise.
 */
export function mapExerciseDBExercise(raw: ExerciseDBRawExercise): ACPExercise {
  return {
    id: String(raw.id),
    provider: 'exercisedb',
    name: raw.name || 'Unnamed exercise',
    // ExerciseDB's own bodyPart vocabulary IS ACP's bodyPart vocabulary —
    // ACPExercise.bodyPart was originally modelled on the pre-MuscleWiki
    // ExerciseDB integration (lib/exercise-types.ts's own header comment) —
    // passed through verbatim, never translated.
    bodyPart: (raw.bodyPart ?? '').trim().toLowerCase(),
    target: (raw.target ?? '').trim().toLowerCase(),
    secondaryMuscles: Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : [],
    equipment: normalizeExerciseDBEquipment(raw.equipment),
    // The real API supplies no difficulty rating at all (unlike the old,
    // deleted services/exercisedb.ts's ExerciseDBExercise type, which
    // declared a `difficulty: string` field never actually populated by the
    // real response) — a fixed 'intermediate' default rather than a
    // fabricated per-exercise value. Documented gap; see the architecture
    // report's coverage audit.
    difficulty: 'intermediate' as ExerciseDifficulty,
    category: 'strength', // ExerciseDB is a pure resistance-training catalogue — no cardio/mobility/stretching content or category field.
    description: null,
    instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
    media: raw.gifUrl ? [{ type: 'gif', url: raw.gifUrl }] : [],
  };
}

function headers(): Record<string, string> {
  return {
    'X-RapidAPI-Key': process.env.EXPO_PUBLIC_EXERCISEDB_KEY ?? '',
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
  };
}

/**
 * Bounded fetch — the exact hard-timeout-race pattern musclewiki-provider.ts
 * adopted after the TestFlight incident (AbortController.abort() alone does
 * not reliably settle fetch() on every React Native network stack for a
 * request that never got any response), applied here from day one so the
 * new PRIMARY provider can never repeat that failure mode.
 */
async function boundedFetch(path: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new ExerciseProviderError('timeout', 'ExerciseDB request timed out'));
    }, timeoutMs);
  });

  console.log(`[exercisedb] request path=${path}`);
  try {
    const res = await Promise.race([
      fetch(`${BASE}${path}`, { headers: headers(), signal: controller.signal }),
      timeoutPromise,
    ]);
    console.log(`[exercisedb] response path=${path} status=${res.status}`);
    return res;
  } catch (e: any) {
    console.warn(`[exercisedb] fetch failed for path=${path}: ${e?.name ?? 'Error'} ${e?.message ?? ''}`);
    if (e instanceof ExerciseProviderError) throw e;
    if (e?.name === 'AbortError') throw new ExerciseProviderError('timeout', 'ExerciseDB request timed out');
    throw new ExerciseProviderError('network_error', e?.message ?? 'Network request failed');
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

async function fetchList(path: string, timeoutMs?: number): Promise<ExerciseDBRawExercise[]> {
  const res = await boundedFetch(path, timeoutMs);
  if (!res.ok) {
    if (res.status === 401) throw new ExerciseProviderError('unauthorized', 'ExerciseDB request unauthorized');
    if (res.status === 403) throw new ExerciseProviderError('forbidden', 'ExerciseDB request forbidden');
    if (res.status === 404) return []; // no matches for this bodyPart/target/name — not an error (Tier 5 fallback handles an empty pool)
    if (res.status === 429) throw new ExerciseProviderError('rate_limited', 'ExerciseDB rate limit exceeded');
    if (res.status >= 500) throw new ExerciseProviderError('server_error', `ExerciseDB server error ${res.status}`);
    throw new ExerciseProviderError('server_error', `ExerciseDB error ${res.status}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ExerciseProviderError('malformed_response', 'ExerciseDB returned a malformed response');
  }
  if (!Array.isArray(body)) throw new ExerciseProviderError('malformed_response', 'ExerciseDB response was not the expected array shape');
  return body as ExerciseDBRawExercise[];
}

function paginate<T>(items: T[], limit: number, offset: number): T[] {
  return items.slice(offset, offset + limit);
}

export const exercisedbProvider: ExerciseProvider = {
  id: 'exercisedb',

  async getExercises(bodyPart: string, limit: number, offset: number): Promise<ACPExercise[]> {
    const raw = await fetchList(`/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=${limit}&offset=${offset}`);
    const mapped = raw.map(mapExerciseDBExercise);
    console.log(`[exercisedb] getExercises('${bodyPart}') received=${raw.length} mapped=${mapped.length}`);
    return mapped;
  },

  // The real API has no free-text/multi-filter search endpoint — searches
  // by exactly one of target, bodyPart, or name. Preference order matches
  // how selectExerciseForRequirement actually calls this (muscleHint first,
  // then bodyPart) — see exercise-selection-service.ts's fetchCandidates.
  //
  // Fast-fail hardening — this is THE method workout generation calls, so
  // every request here uses FAST_FAIL_TIMEOUT_MS (3s), not the longer
  // browse-context REQUEST_TIMEOUT_MS. A safe curated fallback always
  // exists on this path (exercise-selection-service.ts's Tier 5), so
  // there's nothing gained by waiting longer for ExerciseDB specifically.
  async searchExercises(filters: ExerciseSearchFilters): Promise<ACPExercise[]> {
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    let raw: ExerciseDBRawExercise[];
    if (filters.muscle) {
      raw = await fetchList(`/exercises/target/${encodeURIComponent(filters.muscle)}?limit=${limit + offset}&offset=0`, FAST_FAIL_TIMEOUT_MS);
    } else if (filters.bodyPart) {
      raw = await fetchList(`/exercises/bodyPart/${encodeURIComponent(filters.bodyPart)}?limit=${limit + offset}&offset=0`, FAST_FAIL_TIMEOUT_MS);
    } else if (filters.query) {
      raw = await fetchList(`/exercises/name/${encodeURIComponent(filters.query)}?limit=${limit + offset}&offset=0`, FAST_FAIL_TIMEOUT_MS);
    } else {
      raw = [];
    }
    const mapped = paginate(raw, limit, offset).map(mapExerciseDBExercise);
    console.log(`[exercisedb] searchExercises received=${raw.length} mapped=${mapped.length}`);
    return mapped;
  },

  async getExercise(externalId: string): Promise<ACPExercise | null> {
    try {
      const res = await boundedFetch(`/exercises/exercise/${encodeURIComponent(externalId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new ExerciseProviderError('server_error', `ExerciseDB error ${res.status}`);
      const body = await res.json();
      return body ? mapExerciseDBExercise(body as ExerciseDBRawExercise) : null;
    } catch (e) {
      if (e instanceof ExerciseProviderError && e.code === 'not_found') return null;
      throw e;
    }
  },
};
