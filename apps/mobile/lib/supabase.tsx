import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Production values are the fallback; a local dev build overrides them via
// apps/mobile/.env.local (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY),
// which is git-ignored. Prod builds have no such file → these constants apply.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://kdmhmkwzanqnwehcddvr.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_uV5cQ7DrYiJePBl2gPkUyg_QS9mEiSv';

// LANA IOS — Shared Supabase Request Timeout (2026-09).
//
// Root cause (device-runtime audit): every plain `supabase.from(...)` /
// `supabase.auth.*` / `supabase.rpc(...)` call in this app shares ONE
// underlying fetch, and until now that fetch had no bound at all —
// React Native's fetch/AbortController does not reliably settle on iOS for
// a request that stalls with no response (the same class of bug already
// found and fixed for MuscleWiki's proxy and ExerciseDB, but never applied
// here, where BOTH the Nutrition page and workout resolution ultimately
// bottom out). This is the single shared fix for both — no per-screen
// timeout wrapper exists or should exist elsewhere.
//
// Normal DB/RPC/auth requests get SUPABASE_REQUEST_TIMEOUT_MS. Storage is
// the one identified exception (§9) — a real photo upload
// (app/(tabs)/profile.tsx's avatar upload) can legitimately take longer
// than that on a slow connection and has no safe "curated fallback"
// substitute the way a DB read does, so it gets a longer, separately-named
// bound instead of weakening the bound everyone else relies on.
export const SUPABASE_REQUEST_TIMEOUT_MS = 10_000;
export const SUPABASE_STORAGE_TIMEOUT_MS = 30_000;

/** A short, non-identifying label for diagnostics — request path only
 *  (e.g. "rest/v1/meals", "auth/v1/token"), never the query string (row
 *  filters, ids) or any header/body content. */
export function requestLabel(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const { pathname } = new URL(raw);
    const parts = pathname.split('/').filter(Boolean);
    return parts.slice(0, 3).join('/') || pathname;
  } catch {
    return 'unknown';
  }
}

/**
 * The one shared bounded-fetch implementation every Supabase sub-client
 * (auth, postgrest/db, storage, functions) is wired through via
 * `global.fetch` below — RN-safe Promise.race pattern, the exact one
 * already proven in services/providers/musclewiki-provider.ts's
 * callProxy / exercisedb-provider.ts's boundedFetch: correctness never
 * depends on AbortController actually stopping the underlying connection,
 * only on the timeout promise itself settling first.
 *
 * On timeout this REJECTS (never silently resolves as success/null at
 * this layer) with an error deliberately shaped like the platform's own
 * AbortError (`name: 'AbortError'`) — postgrest-js's own internal retry
 * logic (PostgrestBuilder.ts's executeWithRetry) explicitly never retries
 * a rejection with that name, so a stalled request fires this timeout
 * EXACTLY ONCE. Without that shape, a stalled GET (the vast majority of
 * calls both Nutrition and Workout make) would otherwise be silently
 * retried by postgrest-js itself up to DEFAULT_MAX_RETRIES (3) more times,
 * multiplying the effective wait to ~4x this timeout.
 */
export function createBoundedFetch(getTimeoutMs: (label: string) => number): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const label = requestLabel(input);
    const timeoutMs = getTimeoutMs(label);
    // Never replace a caller-supplied signal (§4 — preserve request
    // contents exactly); only add our own when none was given.
    const hasOwnSignal = !!init?.signal;
    const controller = hasOwnSignal ? null : new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller?.abort(); // best-effort cleanup only — see header comment, correctness doesn't depend on this succeeding
        console.warn(`[SUPABASE] request timeout ${label} ${timeoutMs}ms`);
        const err = new Error(`Supabase request timed out after ${timeoutMs}ms (${label})`);
        err.name = 'AbortError';
        reject(err);
      }, timeoutMs);
    });

    const fetchPromise = fetch(input as any, hasOwnSignal ? init : { ...init, signal: controller!.signal });
    return Promise.race([fetchPromise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
  };
}

const boundedFetch = createBoundedFetch(label =>
  label.startsWith('storage/') ? SUPABASE_STORAGE_TIMEOUT_MS : SUPABASE_REQUEST_TIMEOUT_MS,
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  realtime: {
    // React Native registers WebSocket after module initialisation, so it may
    // be undefined here. This app only uses auth — no realtime channels —
    // so the fallback class is never actually instantiated. Untouched by the
    // bounded fetch above — Realtime's websocket connection uses this
    // `transport`, never `global.fetch` (verified against the installed
    // @supabase/supabase-js: SupabaseClient wires `this.fetch` only into
    // auth/postgrest/storage/functions).
    transport: (global as any).WebSocket ?? class {},
  },
  global: {
    fetch: boundedFetch,
  },
});
