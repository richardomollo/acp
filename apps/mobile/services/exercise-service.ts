// ACP Intelligence™ — Day 1: the one application-facing exercise API.
// Fitness Hub, the workout generator, and (eventually) ACP Intelligence and
// trainer tools call this — never a provider directly. Swapping the content
// source (or adding a second one later) means changing `activeProvider`
// here, nothing else.
// Relative (not @/) imports — this file is exercised directly by
// lib/__tests__/exercise-selection-service.test.ts under plain `node --test`,
// which doesn't resolve the Metro `@/` alias or extension-less imports.
import type { ACPExercise, ExerciseSearchFilters } from '../lib/exercise-types.ts';
import { exercisedbProvider } from './providers/exercisedb-provider.ts';
import { musclewikiProvider } from './providers/musclewiki-provider.ts';

// ExerciseDB Primary / MuscleWiki Optional (2026-09 product decision) —
// ExerciseDB is Lana's PRIMARY exercise catalogue: `list`/`search`/`getById`
// below (the critical path every workout-generation call goes through, via
// exercise-selection-service.ts's fetchCandidates) resolve against it only.
// MuscleWiki is no longer in that path at all — it's reached exclusively
// through `getMediaExercise` below, which nothing in workout generation
// calls; only activity-recommendation-service.ts's hydrateWorkoutExerciseMedia
// does, itself an on-demand, best-effort, already-non-blocking backfill for
// ALREADY-persisted MuscleWiki-sourced rows (called from the Home screen
// after a workout has already resolved — see that function's own header).
// A MuscleWiki failure there was already silent/non-blocking before this
// change and needs no further changes to stay that way.
const activeProvider = exercisedbProvider;
const mediaProvider = musclewikiProvider;

// Simple in-memory TTL cache — per section 14, kept deliberately simple for
// Day 1 (no persistence, no new infra). Avoids re-fetching the same body-part
// page/search repeatedly within one session (e.g. flipping between chips, or
// reopening the exercise picker).
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: ACPExercise[] }>();

function readCache(key: string): ACPExercise[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

export const exerciseService = {
  async list(bodyPart: string, limit = 15, offset = 0): Promise<ACPExercise[]> {
    const key = `list:${activeProvider.id}:${bodyPart}:${limit}:${offset}`;
    const cached = readCache(key);
    if (cached) return cached;
    const data = await activeProvider.getExercises(bodyPart, limit, offset);
    cache.set(key, { at: Date.now(), data });
    return data;
  },

  async search(filters: ExerciseSearchFilters): Promise<ACPExercise[]> {
    const key = `search:${activeProvider.id}:${JSON.stringify(filters)}`;
    const cached = readCache(key);
    if (cached) return cached;
    const data = await activeProvider.searchExercises(filters);
    cache.set(key, { at: Date.now(), data });
    return data;
  },

  async getById(externalId: string): Promise<ACPExercise | null> {
    return activeProvider.getExercise(externalId);
  },

  /** MuscleWiki-specific lookup — used ONLY by the on-demand media/
   *  enrichment backfill (activity-recommendation-service.ts's
   *  hydrateWorkoutExerciseMedia), never by workout generation. Deliberately
   *  a separate method from getById rather than a parameter on it, so it's
   *  never accidentally reachable from the critical path. */
  async getMediaExercise(externalId: string): Promise<ACPExercise | null> {
    return mediaProvider.getExercise(externalId);
  },
};
