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
import type { StrengthStructure } from './programme-generator.ts';

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

// Beta Feedback #013 — a strength activity's standalone-session identity now
// also carries its canonical STRUCTURE, so two strength days in the same
// week (e.g. a primary upper day and a lower/support day) never collide on
// the (user, workout_type, suggested_local_date) idempotency key and never
// reuse each other's content. `full_body` and `support` keep the original
// 'acp_suggested_strength' string verbatim — no migration/backfill (§16).
export function suggestedStrengthWorkoutType(structure: StrengthStructure): string {
  if (structure === 'upper') return 'acp_suggested_strength_upper';
  if (structure === 'lower') return 'acp_suggested_strength_lower';
  // Beta #014 — `support` no longer shares 'acp_suggested_strength' with
  // `full_body`. Two strength activities reviewed in one sitting (a
  // full-body day + an "…support" day) previously collided on
  // (user, 'acp_suggested_strength', today) and the second reused the
  // first's exact workout. `full_body` keeps the original string verbatim
  // (no migration/backfill for existing rows).
  if (structure === 'support') return 'acp_suggested_strength_support';
  return 'acp_suggested_strength';
}

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

// ── Run-type fidelity (Beta Feedback #006) ────────────────────────────────
// ACP's weekly plan already prescribes a run TYPE ("Run intervals", "Easy
// run", "Tempo run", …). The standalone-session generator used to hard-code
// the 'run_easy' slot, silently turning every prescribed run into an easy
// run. This maps the plan activity's own text onto the run slots that
// already exist in lib/programme-generator.ts's WORKOUT_TYPE_SPECS
// ('run_easy' | 'run_intervals') — used ONLY to pick a sensible fallback
// description when the plan activity carries none. Never a new running
// engine, never fabricated pace/HR structure.
const RUN_INTERVAL_KEYWORDS = ['interval', 'intervals', 'tempo', 'fartlek', 'speed', 'sprint', 'threshold', 'hill repeat', 'hills'];

/** 'run_intervals' when the plan clearly prescribes structured faster efforts; 'run_easy' otherwise (easy / steady / long / recovery / run-walk all read as continuous). */
export function classifyRunSlot(activity: { activity?: string | null; title?: string | null; description?: string | null }): 'run_easy' | 'run_intervals' {
  const text = `${activity.activity ?? ''} ${activity.title ?? ''} ${activity.description ?? ''}`.toLowerCase();
  return RUN_INTERVAL_KEYWORDS.some(k => text.includes(k)) ? 'run_intervals' : 'run_easy';
}

// ── Experience-label fidelity (Beta Feedback #007) ────────────────────────
// A suggested exercise-workout row persists `difficulty` + its "…and X
// experience level." blurb ONCE, from the generation context. A degraded
// generation (profile momentarily unreadable → buildGenerationContext
// defaults to 'beginner') then mislabels an advanced user's session on
// every later open. This is the "does the reused row disagree with the
// canonical profile experience, and should be corrected in place" decision
// — never a re-selection of exercises (spec §18: an advanced athlete can
// legitimately be given a Push Up).
export function needsExperienceHeal(rowDifficulty: string | null | undefined, canonicalExperience: string | null | undefined): boolean {
  return !!rowDifficulty && !!canonicalExperience && rowDifficulty !== canonicalExperience;
}
