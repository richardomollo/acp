// ACP Intelligence™ — pure decision logic for the activity recommendation
// surface (My Plan / Weekly Plan / Home). Kept separate from
// services/activity-recommendation-service.ts (which touches Supabase) so
// this reshaping/routing logic is directly unit-testable without mocking a
// database. Activity-agnostic by construction: every export here is keyed by
// lib/fulfilment.ts's existing NormalizedActivityKey, never a
// strength-specific branch.
import type { ProviderMatch } from './professional-support.ts';
import type { HumanSupportSignal } from './human-support-types.ts';
import type { ProfessionalSupportRecommendation } from './activity-recommendation-types.ts';
import { textMatchesActivityKeyword, type NormalizedActivityKey } from './fulfilment.ts';

// Mirrors services/human-support-service.ts's HumanSupportInsight shape —
// duplicated as a structural type here (not imported) so this pure module
// has zero dependency on a Supabase-touching service file.
export interface HumanSupportInsightLike {
  primary: HumanSupportSignal | null;
  trainerOwned: boolean;
  ptRecommendations: ProviderMatch[];
}

export const HUMAN_SUPPORT_HEADLINE: Record<string, string> = {
  PAIN_REPORTED: 'Consider getting professional guidance',
  REPEATED_DIFFICULTY: 'A trainer could help you progress further',
  REPEATED_LOW_ADHERENCE: 'A trainer could help you stay on track',
  PROGRESS_PLATEAU: 'A trainer could help you progress further',
  REPEATED_ADAPTATION: 'A trainer could take a closer look',
  BEGINNER_TECHNIQUE_SUPPORT: 'Want some expert guidance?',
  TRAINER_REVIEW_RECOMMENDED: 'Review this with your trainer',
};

/**
 * Reshapes Day 6's HumanSupportInsight (unchanged, reused as-is) into the
 * professionalSupport half of an ActivityRecommendation. Never re-evaluates
 * or re-prioritises signals — that decision stays entirely inside
 * lib/human-support-evaluator.ts; this only relabels/reasons about display.
 * Activity-agnostic: nothing here reads or branches on activityType.
 */
export function buildProfessionalSupport(insight: HumanSupportInsightLike | null): ProfessionalSupportRecommendation | undefined {
  if (!insight?.primary) return undefined;
  const trigger = insight.primary.trigger;
  const mode = insight.trainerOwned ? 'CURRENT_TRAINER_REVIEW' as const
    : trigger === 'BEGINNER_TECHNIQUE_SUPPORT' ? 'OPTIONAL_SUPPORT' as const
    : 'HUMAN_SUPPORT_TRIGGER' as const;
  return {
    mode,
    headline: HUMAN_SUPPORT_HEADLINE[trigger] ?? 'A trainer could help',
    reason: insight.primary.reason,
    trainers: mode === 'CURRENT_TRAINER_REVIEW' ? undefined : insight.ptRecommendations,
  };
}

// ── Which activities ACP can safely prescribe a concrete session for ───────
// (section 7/28) — every other NormalizedActivityKey (yoga/football/
// swimming/boxing/cycling/other) degrades to GENERIC_FALLBACK, preserving
// today's existing fulfilment.ts routing unchanged rather than fabricating
// a session ACP has no structured content/model for.
export type SupportedActivityKey = 'gym' | 'mobility' | 'running' | 'walking';
export const SUPPORTED_ACTIVITY_KEYS: SupportedActivityKey[] = ['gym', 'mobility', 'running', 'walking'];

export function isSupportedActivity(key: NormalizedActivityKey): key is SupportedActivityKey {
  return (SUPPORTED_ACTIVITY_KEYS as string[]).includes(key);
}

// Chunk 4 (section 2/28) — the execution strategy for every activity key
// currently produced by lib/fulfilment.ts's normalizeActivity(). Explicit
// and exhaustive so a newly-added NormalizedActivityKey can't silently fall
// through un-classified — TypeScript's Record<NormalizedActivityKey, ...>
// forces every key to be listed here.
export type ActivityStrategy = 'EXERCISE_SESSION' | 'ACTIVITY_BLOCK' | 'GENERIC_FALLBACK';

const ACTIVITY_STRATEGY: Record<NormalizedActivityKey, ActivityStrategy> = {
  gym: 'EXERCISE_SESSION',        // MuscleWiki + ExerciseFitValidator, workouts + workout_exercises
  mobility: 'EXERCISE_SESSION',   // same, with the mobility requirement/fit-validation policy
  running: 'ACTIVITY_BLOCK',      // workouts with is_activity_block=true, no exercises
  walking: 'ACTIVITY_BLOCK',      // same
  cycling: 'GENERIC_FALLBACK',    // no structured cycling content/model — existing Strava route
  yoga: 'GENERIC_FALLBACK',       // no structured pose content
  football: 'GENERIC_FALLBACK',   // venue/team activity, marketplace-led
  swimming: 'GENERIC_FALLBACK',   // no structured swim-session content
  boxing: 'GENERIC_FALLBACK',     // no structured boxing content
  other: 'GENERIC_FALLBACK',
};

export function classifyActivityStrategy(key: NormalizedActivityKey): ActivityStrategy {
  return ACTIVITY_STRATEGY[key];
}

// ── Existing-session matching (section 5) ───────────────────────────────────

// workout_type values the structured multi-week programme generator
// (lib/programme-generator.ts) actually assigns for each supported key —
// the primary, structural "does this week's programme already have one"
// signal. Mobility/walking have no dedicated slot in the generator's
// weeklyWorkoutTypes today (only a trainer could create one), so they fall
// straight through to the text-keyword fallback below — correctly, since
// there is nothing generator-owned to match structurally yet.
const PROGRAMME_WORKOUT_TYPES: Partial<Record<NormalizedActivityKey, string[]>> = {
  gym: ['full_body_a', 'full_body_b'],
  running: ['run_easy', 'run_intervals'],
};

export interface ExistingSessionCandidate {
  title: string;
  description: string | null;
  workout_type: string | null;
}

/**
 * Does this week's programme workout satisfy the given activity key —
 * regardless of who owns the programme (ACP_GENERATED / TRAINER_CREATED /
 * TRAINER_MODIFIED, section 5/22)? Structural match on the generator's own
 * workout_type first; text-keyword match (reusing fulfilment.ts's existing
 * alias table) as the fallback for a trainer-created or otherwise untyped
 * workout whose title/description names the activity directly.
 */
export function matchesExistingSession(workout: ExistingSessionCandidate, key: NormalizedActivityKey): boolean {
  if (workout.workout_type && PROGRAMME_WORKOUT_TYPES[key]?.includes(workout.workout_type)) return true;
  return textMatchesActivityKeyword(`${workout.title} ${workout.description ?? ''}`, key);
}

// ── Standalone suggested-session identity (section 12) ──────────────────────
// Generalizes the original single 'acp_suggested_strength' workout_type
// (kept verbatim — no migration/backfill needed) into one value per
// supported activity. Still a plain workouts.workout_type string.
export const SUGGESTED_WORKOUT_TYPE: Record<SupportedActivityKey, string> = {
  gym: 'acp_suggested_strength',
  mobility: 'acp_suggested_mobility',
  running: 'acp_suggested_running',
  walking: 'acp_suggested_walking',
};

// ── Session validity (Chunk 4.5A) ────────────────────────────────────────────
// An atomically-claimed workouts row can exist yet still not be a genuinely
// reusable session — generation can fail or still be in progress after the
// row itself is created. A session is only safe to return as a successful
// recommendation if it's actually executable:
//   exercise_workout -> at least one persisted workout_exercises row.
//   activity_block   -> valid by construction the moment the row exists
//     (its title/description/duration are written in the same insert that
//     claims the slot — there is no separate exercise-persistence step that
//     can fail independently, unlike gym/mobility). exerciseCount is never
//     meaningful for this session type and must never gate its validity.
export interface SuggestedSessionValidity {
  isActivityBlock: boolean;
  exerciseCount?: number;
}

export function isValidSuggestedSession(session: SuggestedSessionValidity): boolean {
  if (session.isActivityBlock) return true;
  return (session.exerciseCount ?? 0) > 0;
}

// ── Idempotency (section 13/32) ──────────────────────────────────────────────

export interface SuggestedSessionRow {
  id: string;
  title: string;
  createdAt: string; // ISO timestamp, as stored in workouts.created_at
}

/** yyyy-mm-dd for the device's local calendar day — the single definition of "same day" used both to decide reuse client-side and as the DB-level idempotency key (workouts.suggested_local_date) that makes concurrent generation attempts race-safe. */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Reuse rule: a standalone suggested session created earlier TODAY (the
 * member's local calendar day) is reused regardless of its completion state
 * — tapping the CTA again should reopen it, not fork a second "recommended"
 * session for the same day. A session from a PRIOR day is stale and must
 * never block a future day's fresh generation, whether or not it was
 * completed — so this only ever looks at same-day rows; the caller is
 * responsible for having already scoped the query to (user, activity type).
 */
export function findReusableSuggestedSession(sessions: SuggestedSessionRow[], now: Date): SuggestedSessionRow | undefined {
  const today = toLocalDateKey(now);
  return sessions.find(s => toLocalDateKey(new Date(s.createdAt)) === today);
}

// ── Session copy (section 10/14) — short, fixed templates, never AI prose ──

export const SESSION_HEADLINE: Record<SupportedActivityKey, string> = {
  gym: 'Full-body strength',
  mobility: 'Mobility reset',
  running: 'Easy run',
  walking: 'Brisk walk',
};

export const SESSION_TITLE: Record<SupportedActivityKey, string> = {
  gym: 'Your strength workout',
  mobility: 'Your mobility session',
  running: 'Your run',
  walking: 'Your walk',
};

export const SESSION_REASON: Record<SupportedActivityKey, string> = {
  gym: 'Personalised to your goal and current fitness level.',
  mobility: 'Personalised to support recovery and movement quality.',
  running: 'Based on your running goal and current activity level.',
  walking: 'A comfortable, purposeful walk based on your current activity level.',
};

export const SESSION_DURATION_MINUTES: Record<SupportedActivityKey, number> = {
  gym: 40, mobility: 20, running: 30, walking: 30,
};
