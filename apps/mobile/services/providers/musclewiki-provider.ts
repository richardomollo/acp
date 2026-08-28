// ACP Intelligence™ — MuscleWiki provider.
//
// Beta Readiness Step 1: the real MuscleWiki contract has now been live-
// validated (base URL, auth header, endpoint paths, response shapes, media
// token flow) — see the completion report for the exact requests made. The
// shapes below are the VERIFIED real contract, not an assumption, replacing
// Day 1's placeholder. Isolated to this one file plus its proxy route
// (apps/web/app/api/musclewiki/route.ts) and the media-token route.
//
// Credentials: MUSCLEWIKI_API_KEY lives server-side only (apps/web env),
// never in an EXPO_PUBLIC_* var — the mobile app never talks to MuscleWiki
// directly, only to our own proxy, exactly like the pre-existing ExerciseDB
// web route this mirrors.
import {
  type ACPExercise,
  type ACPExerciseMedia,
  type ExerciseDifficulty,
  type ExerciseProvider,
  type ExerciseSearchFilters,
  ExerciseProviderError,
} from '../../lib/exercise-types.ts';

const PROXY_BASE = 'https://activecitypass.com/api/musclewiki';
// 15s (not 8s) — a mobile network round-trip through a Vercel serverless
// function (which can cold-start) plus the real MuscleWiki upstream call is
// materially slower than the sub-1s response seen when testing from a
// warm, low-latency connection; 8s was tripping the client-side timeout
// for some real devices even when the backend itself was healthy.
const REQUEST_TIMEOUT_MS = 15000;

// Verified real shape (GET /exercises/{id} and GET /search — both return
// this full object; GET /exercises without an id only returns {id, name}
// per result, so list/search browsing is routed through /search instead,
// see musclewikiProvider.getExercises below).
interface MuscleWikiRawExercise {
  id: number | string;
  name: string;
  primary_muscles?: string[];
  category?: string;      // this is MuscleWiki's EQUIPMENT field (e.g. "Barbell", "Bodyweight", "Cables") — not an exercise type
  force?: string;         // "Push" | "Pull"
  grips?: string[];
  mechanic?: string;      // "Compound" | "Isolation" — closest real analogue to an exercise-type chip
  difficulty?: string;
  steps?: string[];       // MuscleWiki's instructions field
  videos?: { url: string; angle?: string; gender?: string; og_image?: string }[];
}

interface MuscleWikiListResponse { total: number; limit: number; offset: number; count: number; results: MuscleWikiRawExercise[] }

const DIFFICULTIES: ExerciseDifficulty[] = ['beginner', 'intermediate', 'advanced'];

function normalizeDifficulty(raw?: string): ExerciseDifficulty {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'novice') return 'beginner'; // MuscleWiki's own difficulty vocabulary includes "Novice" alongside Beginner/Intermediate/Advanced
  return (DIFFICULTIES as string[]).includes(lower) ? (lower as ExerciseDifficulty) : 'beginner';
}

// Real primary_muscles values observed live (Biceps, Triceps, Quads, Chest)
// mapped onto ACP's existing bodyPart vocabulary (the same one
// exercises-by-body-part.tsx's BODY_PARTS chips already use) — extended with
// the standard muscle-anatomy names most exercise catalogues use, so an
// unfamiliar-but-plausible value degrades to '' rather than mis-mapping.
const MUSCLE_TO_BODY_PART: Record<string, string> = {
  chest: 'chest', pectorals: 'chest',
  back: 'back', lats: 'back', 'upper back': 'back', traps: 'back', trapezius: 'back', 'lower back': 'back',
  shoulders: 'shoulders', delts: 'shoulders', deltoids: 'shoulders', 'front delts': 'shoulders', 'rear delts': 'shoulders', 'side delts': 'shoulders',
  biceps: 'upper arms', triceps: 'upper arms',
  forearms: 'lower arms',
  abs: 'waist', abdominals: 'waist', core: 'waist', obliques: 'waist',
  quads: 'upper legs', quadriceps: 'upper legs', hamstrings: 'upper legs', glutes: 'upper legs', glutei: 'upper legs', adductors: 'upper legs', abductors: 'upper legs',
  calves: 'lower legs',
  neck: 'neck',
};

function muscleToBodyPart(muscle?: string): string {
  if (!muscle) return '';
  return MUSCLE_TO_BODY_PART[muscle.trim().toLowerCase()] ?? '';
}

function mapMedia(raw: MuscleWikiRawExercise): ACPExerciseMedia[] {
  const media: ACPExerciseMedia[] = [];
  for (const v of raw.videos ?? []) {
    if (v?.url) media.push({ type: 'video', url: v.url, angle: v.angle });
    if (v?.og_image) media.push({ type: 'image', url: v.og_image, angle: v.angle });
  }
  return media;
}

/**
 * Real MuscleWiki exercise -> ACPExercise. Pure and exported so mapping is
 * tested against a real (sanitized) fixture without a network call. Missing/
 * malformed optional fields degrade to safe defaults rather than throwing —
 * a partial MuscleWiki record should never crash the Fitness Hub.
 */
export function mapMuscleWikiExercise(raw: MuscleWikiRawExercise): ACPExercise {
  const muscles = Array.isArray(raw.primary_muscles) ? raw.primary_muscles : [];
  return {
    id: String(raw.id),
    provider: 'musclewiki',
    name: raw.name || 'Unnamed exercise',
    bodyPart: muscleToBodyPart(muscles[0]),
    target: muscles[0] ?? '',
    secondaryMuscles: muscles.slice(1),
    equipment: (raw.category ?? 'bodyweight').toLowerCase(),
    difficulty: normalizeDifficulty(raw.difficulty),
    category: raw.mechanic ?? null,
    description: null, // MuscleWiki has no separate description field — `steps` (instructions) already carries the how-to content
    instructions: Array.isArray(raw.steps) ? raw.steps : [],
    media: mapMedia(raw),
  };
}

async function callProxy(path: string, params: Record<string, string | number | undefined>): Promise<MuscleWikiRawExercise[]> {
  const qs = new URLSearchParams();
  qs.set('path', path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Safe diagnostics only — the request path/params are just body-part and
  // muscle-name text, never a credential (the permanent key never reaches
  // the mobile app at all). Kept deliberately terse: one line per attempt.
  console.log(`[musclewiki] request path=${path} q=${params.q ?? ''}`);

  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}?${qs.toString()}`, { signal: controller.signal });
  } catch (e: any) {
    console.warn(`[musclewiki] fetch failed for path=${path}: ${e?.name ?? 'Error'} ${e?.message ?? ''}`);
    if (e?.name === 'AbortError') throw new ExerciseProviderError('timeout', 'MuscleWiki request timed out');
    throw new ExerciseProviderError('network_error', e?.message ?? 'Network request failed');
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[musclewiki] response path=${path} status=${res.status}`);

  if (!res.ok) {
    // Verified live: an invalid key returns 403 (not 401) — both are treated
    // as auth failures regardless, so this isn't load-bearing, but documented
    // since it differs from the REST convention Day 1 assumed.
    if (res.status === 401) throw new ExerciseProviderError('unauthorized', 'MuscleWiki request unauthorized');
    if (res.status === 403) throw new ExerciseProviderError('forbidden', 'MuscleWiki request forbidden');
    if (res.status === 404) throw new ExerciseProviderError('not_found', 'MuscleWiki resource not found');
    if (res.status === 429) throw new ExerciseProviderError('rate_limited', 'MuscleWiki rate limit exceeded');
    if (res.status >= 500) throw new ExerciseProviderError('server_error', `MuscleWiki server error ${res.status}`);
    throw new ExerciseProviderError('server_error', `MuscleWiki error ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ExerciseProviderError('malformed_response', 'MuscleWiki returned a malformed response');
  }

  // Verified live: /search returns a bare array of full exercise objects;
  // /exercises returns {results:[...]} (but only {id,name} per result, so
  // it's not used for full-detail browsing — see getExercises below);
  // /exercises/{id} returns one bare object. Normalized here so callers
  // never need to know which shape came back.
  if (Array.isArray(body)) return body as MuscleWikiRawExercise[];
  if (body && typeof body === 'object' && 'id' in body) return [body as MuscleWikiRawExercise];
  const list = (body as MuscleWikiListResponse)?.results;
  if (Array.isArray(list)) return list;

  throw new ExerciseProviderError('malformed_response', 'MuscleWiki response was not in a recognised shape');
}

export const musclewikiProvider: ExerciseProvider = {
  id: 'musclewiki',

  // /exercises (the plain list endpoint) only returns {id, name} per result
  // — no muscles/equipment/instructions/media — so body-part browsing is
  // routed through /search (which always returns full detail), using the
  // body part's own label as the free-text query. Confirmed live: /exercises
  // has no working muscle filter at all (only category/difficulty do).
  async getExercises(bodyPart: string, limit: number, offset: number): Promise<ACPExercise[]> {
    const raw = await callProxy('search', { q: bodyPart, limit, offset });
    const mapped = raw.map(mapMuscleWikiExercise);
    console.log(`[musclewiki] getExercises('${bodyPart}') received=${raw.length} mapped=${mapped.length}`);
    return mapped;
  },

  async searchExercises(filters: ExerciseSearchFilters): Promise<ACPExercise[]> {
    const raw = await callProxy('search', {
      q: filters.query ?? filters.muscle ?? filters.bodyPart,
      category: filters.equipment,
      difficulty: filters.difficulty,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    });
    const mapped = raw.map(mapMuscleWikiExercise);
    console.log(`[musclewiki] searchExercises received=${raw.length} mapped=${mapped.length}`);
    return mapped;
  },

  async getExercise(externalId: string): Promise<ACPExercise | null> {
    try {
      const raw = await callProxy(`exercises/${encodeURIComponent(externalId)}`, {});
      return raw[0] ? mapMuscleWikiExercise(raw[0]) : null;
    } catch (e) {
      if (e instanceof ExerciseProviderError && e.code === 'not_found') return null;
      throw e;
    }
  },
};

/**
 * Fetches a short-lived (15-minute) media-access token via our server-side
 * proxy — the permanent MUSCLEWIKI_API_KEY never leaves apps/web. Append as
 * `?token=<token>` to any musclewiki.com/stream/... URL before rendering;
 * the raw stream URLs returned in `media` require it (verified live: a
 * stream URL with no token returns 401).
 */
export async function getMuscleWikiMediaToken(): Promise<{ token: string; expiresInSeconds: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${PROXY_BASE}/media-token`, { method: 'POST', signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (typeof body?.token !== 'string') return null;
    return { token: body.token, expiresInSeconds: body.expires_in ?? 0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isMuscleWikiStreamUrl(url: string): boolean {
  return url.includes('musclewiki.com/stream/');
}

// One media token is good for every stream URL for its whole 15-minute
// lifetime (verified live) — cached in memory so every exercise/thumbnail
// on screen doesn't each mint its own token. Refreshed 60s before actual
// expiry as a safety margin against clock drift/request latency.
let cachedToken: { token: string; expiresAt: number } | null = null;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

async function getValidMediaToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const result = await getMuscleWikiMediaToken();
  if (!result) return null;
  cachedToken = { token: result.token, expiresAt: Date.now() + result.expiresInSeconds * 1000 - TOKEN_REFRESH_MARGIN_MS };
  return cachedToken.token;
}

/**
 * Resolves any media URL for rendering: a MuscleWiki stream URL gets a fresh
 * (cached) token appended; anything else (the jsDelivr GIF fallback, ACP's
 * own fallback exercises with no media) passes through unchanged. Never
 * throws — on token failure, returns the original URL so the image/video
 * component can fail gracefully (already-existing onError handling) rather
 * than the screen crashing.
 */
export async function resolvePlayableMediaUrl(url: string | null): Promise<string | null> {
  if (!url || !isMuscleWikiStreamUrl(url)) return url;
  const token = await getValidMediaToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}
