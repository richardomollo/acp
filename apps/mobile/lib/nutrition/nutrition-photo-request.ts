// ACP Intelligence™ — Nutrition N5. The mobile → web bridge for photo
// analysis. Mirrors nutrition-coaching.ts: a bounded single attempt, raced
// against a short UX deadline, never throws. A null result means "the camera
// couldn't help this time — fall back to manual search" (§37/§40).
//
// This module sends ONLY the base64 image bytes + its mime type + the access
// token. No EXIF is forwarded (the picker is asked for raw base64, not the
// original file), no location, no device metadata (§11). The response is a
// list of textual candidate labels; it is parsed and hard-validated by the
// pure layer (parseVisionResult) before the UI ever sees it.

import { isNutritionCameraEnabled } from '../flags.ts';
import {
  parseVisionResult, isAllowedMimeType, approxBase64Bytes, IMAGE_CONSTRAINTS,
  type VisionResult,
} from './nutrition-photo.ts';

const ANALYSIS_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://activecitypass.com';
const ANALYSIS_ENDPOINT = `${ANALYSIS_BASE}/api/ai/nutrition-photo-analysis`;

/** Host + scheme only — never the path, query, token or body. For the
 *  privacy-safe device diagnostic below. */
function endpointHost(): string {
  const m = /^(https?:)\/\/([^/]+)/i.exec(ANALYSIS_BASE);
  return m ? `${m[1]}//${m[2]}` : ANALYSIS_BASE;
}

/**
 * N10 N5 service-path diagnostic. Coarse, privacy-safe (§4): host+scheme only,
 * whether a session token was supplied, the HTTP status, the stable
 * failureCode, and duration. NEVER the token, image bytes, data URL, food
 * labels, user data or any response body. Dev builds only.
 */
function logAnalyseDiag(fields: {
  phase: 'start' | 'end';
  sessionPresent?: boolean;
  httpStatus?: number | null;
  failureCode?: PhotoAnalysisFailure | 'ok';
  durationMs?: number;
  bytesKB?: number;
}): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[n5:analyse]', { host: endpointHost(), ...fields });
  }
}

// The user is watching a "Looking at your meal…" spinner; don't make them wait
// longer than this before offering the manual path. The server keeps its own,
// longer bound.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Precise failure taxonomy (N10 N5 device-defect — the old single `'failed'`
 * hid a config/network problem behind a "bad photo" message). The UI maps
 * these into three honest buckets (see photo-meal.tsx): a genuinely
 * unreadable photo, a photo we couldn't process, or the service being
 * unavailable. None of these ever carry image bytes, labels, or the token.
 */
export type PhotoAnalysisFailure =
  | 'disabled'      // client feature flag off
  | 'invalid_image' // client guard: bad mime / empty / oversize
  | 'too_large'     // server rejected the payload size (413)
  | 'auth'          // 401 — token missing/expired/wrong project
  | 'unavailable'   // 403 / 404 / 503 — route missing, server flag off, not configured
  | 'rate_limited'  // 429
  | 'server_error'  // 5xx (incl. the route's own 502 OpenAI wrapper)
  | 'network'       // fetch threw — offline, DNS, unreachable host, iOS ATS block
  | 'timeout'       // lost the race to the UI deadline
  | 'unreadable';   // 2xx but no usable result — the model genuinely couldn't read it

export type PhotoAnalysisOutcome =
  | { ok: true; result: VisionResult }
  | { ok: false; reason: PhotoAnalysisFailure };

/** Map an HTTP status from the analysis route to a precise failure reason. */
function reasonForStatus(status: number): PhotoAnalysisFailure {
  if (status === 401) return 'auth';
  if (status === 403 || status === 404 || status === 503) return 'unavailable';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'server_error';
}

export interface PhotoBytes {
  base64: string;
  mimeType: string;
}

/**
 * Never throws. Resolves within `timeoutMs` to the validated candidate list,
 * or a typed `PhotoAnalysisFailure` the UI turns into calm, non-blaming copy.
 * Every failure path lands the user on manual search with the photo discarded.
 */
export async function analysePhoto(
  accessToken: string,
  photo: PhotoBytes,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<PhotoAnalysisOutcome> {
  if (!isNutritionCameraEnabled()) return { ok: false, reason: 'disabled' };

  // Client-side mirror of the server guard (§39) — fail fast, save a round trip.
  if (!isAllowedMimeType(photo.mimeType) || !photo.base64) {
    return { ok: false, reason: 'invalid_image' };
  }
  const bytes = approxBase64Bytes(photo.base64);
  if (bytes <= 0 || bytes > IMAGE_CONSTRAINTS.maxBytes) {
    return { ok: false, reason: 'invalid_image' };
  }

  const bytesKB = Math.round(bytes / 1024);
  const sessionPresent = typeof accessToken === 'string' && accessToken.length > 0;
  const startedAt = Date.now();
  logAnalyseDiag({ phase: 'start', sessionPresent, bytesKB });

  const request = (async (): Promise<PhotoAnalysisOutcome> => {
    let res: Response;
    try {
      res = await fetchImpl(ANALYSIS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          imageBase64: photo.base64.replace(/^data:[^,]*,/, ''),
          mimeType: photo.mimeType,
        }),
      });
    } catch {
      // The request never reached (or never got a response from) the server:
      // offline, DNS, wrong/unreachable base URL, or an iOS ATS block on a
      // cleartext dev URL. This is NOT "the photo was bad".
      logAnalyseDiag({ phase: 'end', sessionPresent, httpStatus: null, failureCode: 'network', durationMs: Date.now() - startedAt });
      return { ok: false, reason: 'network' };
    }

    if (!res.ok) {
      const reason = reasonForStatus(res.status);
      logAnalyseDiag({ phase: 'end', sessionPresent, httpStatus: res.status, failureCode: reason, durationMs: Date.now() - startedAt });
      return { ok: false, reason };
    }

    const json = await res.json().catch(() => null);
    const parsed = parseVisionResult(json);
    if (!parsed) {
      logAnalyseDiag({ phase: 'end', sessionPresent, httpStatus: res.status, failureCode: 'unreadable', durationMs: Date.now() - startedAt });
      return { ok: false, reason: 'unreadable' };
    }
    logAnalyseDiag({ phase: 'end', sessionPresent, httpStatus: res.status, failureCode: 'ok', durationMs: Date.now() - startedAt });
    return { ok: true, result: parsed };
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const uiTimeout = new Promise<PhotoAnalysisOutcome>(resolve => {
    timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
  });
  try {
    return await Promise.race([request, uiTimeout]);
  } finally {
    if (timer) clearTimeout(timer); // don't leak the deadline timer once settled
  }
}
