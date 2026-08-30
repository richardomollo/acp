// ACP Intelligence™ Day 7.1 — metadata canonicalization (section 18/19).
// Pure, framework-free. Prevents drift like "Build Strength" / "build strength"
// / "build-strength" all being persisted as different strings when ACP
// already has a canonical `build_strength`.
//
// `goals` and `experience_levels` are ACP's own closed vocabularies (mirrored
// from apps/mobile/lib/programme-types.ts's ProgrammeGoal and the
// beginner/intermediate/advanced experience tiers used throughout that app —
// duplicated here as a plain string set rather than a cross-app import,
// since apps/web and apps/mobile are separate deployables with no shared
// package). `activities`/`topics`/`barriers`/`locale` are open vocabularies
// in ACP today (no fixed enum exists for them anywhere in the app), so they
// are only case/spacing-normalized, never validated against a closed set —
// this does NOT create a second goal/activity/barrier vocabulary (section 18),
// it reuses the one that already exists and normalizes casing for the rest.
import type { KnowledgeMetadata } from './types.ts';

const KNOWN_GOALS = new Set([
  'lose_weight', 'build_muscle', 'maintain_weight', 'general_fitness',
  'improve_mobility', 'eat_healthier', 'improve_running', 'body_recomposition',
  'reduce_stress',
]);
const KNOWN_EXPERIENCE_LEVELS = new Set(['beginner', 'intermediate', 'advanced']);

function canonicalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function canonicalizeArray(values: unknown, knownSet: Set<string> | null, fieldName: string): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.filter((v): v is string => typeof v === 'string').map(v => {
    const canon = canonicalizeValue(v);
    if (knownSet && !knownSet.has(canon)) {
      console.warn(`[knowledge-normalize] "${canon}" is not a recognised ACP ${fieldName} value — kept as-is, not rejected (open field or new value)`);
    }
    return canon;
  });
}

export function normalizeMetadata(metadata: KnowledgeMetadata): KnowledgeMetadata {
  const out: KnowledgeMetadata = { ...metadata };
  const goals = canonicalizeArray(metadata.goals, KNOWN_GOALS, 'goal');
  if (goals) out.goals = goals;
  const experienceLevels = canonicalizeArray(metadata.experience_levels, KNOWN_EXPERIENCE_LEVELS, 'experience_level');
  if (experienceLevels) out.experience_levels = experienceLevels;
  const activities = canonicalizeArray(metadata.activities, null, 'activity');
  if (activities) out.activities = activities;
  const topics = canonicalizeArray(metadata.topics, null, 'topic');
  if (topics) out.topics = topics;
  const barriers = canonicalizeArray(metadata.barriers, null, 'barrier');
  if (barriers) out.barriers = barriers;
  const locale = canonicalizeArray(metadata.locale, null, 'locale');
  if (locale) out.locale = locale;
  return out;
}
