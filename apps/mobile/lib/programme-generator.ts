// ACP Intelligence™ Day 2 — deterministic programme generation. Pure,
// framework-free (no Supabase/React) so every rule is unit-testable in
// isolation, mirroring lib/ai-assessment.ts / lib/coaching-memory.ts. ACP
// Intelligence owns every decision here (session count, split, movement
// requirements, sets/reps); the exercise provider only ever supplies
// candidate exercises for a requirement this file already decided on
// (Day 2 section 9).
import type { ExerciseDifficulty } from './exercise-types.ts';
import {
  REPS_BY_ROLE,
  type ProgrammeGoal, type GenerationContext, type TrainingStrategy,
  type WorkoutSlot, type DayOfWeek, type ExerciseRequirement,
} from './programme-types.ts';

// ─── Goal support ───────────────────────────────────────────────────────────

// Every goal mapped to a programmable strategy family. 'reduce_stress' is
// deliberately excluded — it's a wellbeing goal, not something a strength/
// cardio programme can safely claim to address (Day 2 section 23), and it's
// already been removed from the onboarding goal picker for the same reason.
const STRENGTH_FAMILY_GOALS = new Set<ProgrammeGoal>([
  'lose_weight', 'build_muscle', 'maintain_weight', 'general_fitness',
  'body_recomposition', 'healthy_lifestyle', 'improve_health', 'eat_healthier',
  'improve_mobility',
]);
const RUNNING_FAMILY_GOALS = new Set<ProgrammeGoal>(['improve_running']);

export function isGoalSupported(goal: ProgrammeGoal | null | undefined): boolean {
  if (!goal) return false;
  return STRENGTH_FAMILY_GOALS.has(goal) || RUNNING_FAMILY_GOALS.has(goal);
}

// ─── Generation context — deterministic mapping from existing onboarding/profile data ──

export interface ProfileLike {
  goal: string | null;
  experience_level: string | null;
  activity_level: string | null;
  preferred_activities: string[] | null;
  goal_target_date: string | null;
}

const VALID_EXPERIENCE: ExerciseDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/** inactive/occasional -> 2x/week, active_2_3/active_4_plus/serious -> 3x/week. Capped at {2,3} for V1's deliberately bounded structures (Day 2 section 10). */
export function deriveSessionsPerWeek(activityLevel: string | null): number {
  if (activityLevel === 'active_2_3' || activityLevel === 'active_4_plus' || activityLevel === 'serious') return 3;
  return 2;
}

/** 'gym' in preferred_activities -> gym access; otherwise the safe default is 'home' (bodyweight-executable regardless of what equipment the user actually has). */
export function deriveEquipmentLocation(preferredActivities: string[] | null): 'home' | 'gym' {
  return (preferredActivities ?? []).includes('gym') ? 'gym' : 'home';
}

const DEFAULT_DURATION_WEEKS = 8;
const MIN_DURATION_WEEKS = 4;
const MAX_DURATION_WEEKS = 16;

/**
 * Uses goal_target_date only if it implies a realistic programme length;
 * otherwise falls back to the documented 8-week default (Day 2 section 13) —
 * never generates an absurd 1-week or 2-year schedule from an unrealistic date.
 */
export function deriveDurationWeeks(goalTargetDate: string | null, startDate: Date): number {
  if (!goalTargetDate) return DEFAULT_DURATION_WEEKS;
  const target = new Date(goalTargetDate);
  if (Number.isNaN(target.getTime())) return DEFAULT_DURATION_WEEKS;
  const weeks = Math.round((target.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (weeks < MIN_DURATION_WEEKS || weeks > MAX_DURATION_WEEKS) return DEFAULT_DURATION_WEEKS;
  return weeks;
}

const DEFAULT_SESSION_DURATION_MINUTES = 30;

export function buildGenerationContext(
  profile: ProfileLike,
  startDate: Date,
  /**
   * The minutes ACP Intelligence prescribed for this member's Strength
   * activity (from starting_plan.activities[].duration_minutes). When known,
   * it is the ceiling the generated Strength session is fitted under — the
   * session is trimmed to the time, never generated long and relabelled.
   */
  prescribedStrengthMinutes?: number | null,
): GenerationContext {
  const defaultsUsed: string[] = [];

  const experience = VALID_EXPERIENCE.includes(profile.experience_level as ExerciseDifficulty)
    ? (profile.experience_level as ExerciseDifficulty)
    : (defaultsUsed.push('experience'), 'beginner' as ExerciseDifficulty);

  const sessionsPerWeek = deriveSessionsPerWeek(profile.activity_level);
  if (!profile.activity_level) defaultsUsed.push('sessions_per_week');

  const equipmentLocation = deriveEquipmentLocation(profile.preferred_activities);
  if (!(profile.preferred_activities ?? []).length) defaultsUsed.push('equipment_location');

  defaultsUsed.push('session_duration_minutes'); // no onboarding input exists for this at all today

  const durationWeeks = deriveDurationWeeks(profile.goal_target_date, startDate);
  if (!profile.goal_target_date || durationWeeks === DEFAULT_DURATION_WEEKS) defaultsUsed.push('duration_weeks');

  return {
    goal: (profile.goal as ProgrammeGoal) ?? 'general_fitness',
    experience,
    sessionsPerWeek,
    sessionDurationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
    prescribedStrengthMinutes:
      prescribedStrengthMinutes != null && prescribedStrengthMinutes > 0 ? prescribedStrengthMinutes : null,
    equipmentLocation,
    preferredActivities: profile.preferred_activities ?? [],
    activityLevel: profile.activity_level,
    durationWeeks,
    defaultsUsed,
    sourceVersion: 'v1',
  };
}

// ─── Training strategy ──────────────────────────────────────────────────────

const ACTIVITY_LEVEL_LABEL: Record<string, string> = {
  inactive: 'currently mostly inactive',
  occasional: 'occasionally active',
  active_2_3: 'active 2–3 times a week',
  active_4_plus: 'active 4+ times a week',
  serious: 'training seriously already',
};

function goalSentence(goal: ProgrammeGoal, isRunning: boolean): string {
  if (isRunning) return 'The programme balances running with one full-body strength session to support your running and reduce injury risk.';
  if (goal === 'build_muscle' || goal === 'body_recomposition') return 'The programme uses full-body strength sessions so every muscle group gets trained multiple times a week, which drives muscle growth better than splitting body parts across few sessions.';
  return 'The programme uses full-body sessions to help build consistency while still giving you recovery time between workouts.';
}

export function buildTrainingStrategy(context: GenerationContext): TrainingStrategy {
  const isRunning = RUNNING_FAMILY_GOALS.has(context.goal);
  const weeklyWorkoutTypes = isRunning
    ? (context.sessionsPerWeek >= 3 ? ['full_body_a', 'run_easy', 'run_intervals'] : ['full_body_a', 'run_easy'])
    : (context.sessionsPerWeek >= 3 ? ['full_body_a', 'full_body_b', 'full_body_a'] : ['full_body_a', 'full_body_b']);

  const activityLabel = ACTIVITY_LEVEL_LABEL[context.activityLevel ?? ''] ?? 'just getting started';
  const explanation =
    `We've created a ${context.durationWeeks}-week programme with ${context.sessionsPerWeek} sessions a week because this matches you being ${activityLabel} and your ${context.experience} experience level. ` +
    goalSentence(context.goal, isRunning);

  return { goal: context.goal, weeklyWorkoutTypes, explanation };
}

// ─── Workout slots ──────────────────────────────────────────────────────────

const DAYS_BY_FREQUENCY: Record<number, DayOfWeek[]> = {
  2: ['monday', 'thursday'],
  3: ['monday', 'wednesday', 'saturday'],
};

// Exported so a single ad-hoc "suggested workout" (activity-recommendation-service.ts)
// can reuse the exact same requirement set instead of duplicating it.
export const FULL_BODY_A_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound' },
  { pattern: 'horizontal_push', bodyPart: 'chest', role: 'compound' },
  { pattern: 'horizontal_pull', bodyPart: 'back', role: 'compound' },
  { pattern: 'core', bodyPart: 'waist', role: 'core' },
];

// Exported (Beta #014) so a standalone canonical full-body activity can
// alternate A/B across the week the same way the multi-week generator does,
// instead of every full-body day resolving to the identical A programme.
export const FULL_BODY_B_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'hinge', bodyPart: 'upper legs', muscleHint: 'hamstring', role: 'compound' },
  { pattern: 'vertical_push', bodyPart: 'shoulders', role: 'compound' },
  { pattern: 'horizontal_pull', bodyPart: 'back', role: 'accessory' },
  { pattern: 'core', bodyPart: 'waist', role: 'core' },
];

// Exported for the same reason as FULL_BODY_A_REQUIREMENTS — reused by the
// generalized activity-recommendation-service.ts for a standalone mobility
// session, rather than a second copy of this requirement set.
export const MOBILITY_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'hip_mobility', bodyPart: 'upper legs', muscleHint: 'hip', role: 'mobility' },
  { pattern: 'shoulder_mobility', bodyPart: 'shoulders', muscleHint: 'shoulder', role: 'mobility' },
  { pattern: 'thoracic_mobility', bodyPart: 'back', muscleHint: 'spine', role: 'mobility' },
];

interface WorkoutTypeSpec {
  title: string;
  isActivityBlock: boolean;
  activityDescription?: string;
  requirements?: ExerciseRequirement[];
}

// ─── Strength prescription policy (Chunk 4.5C2) ─────────────────────────────
// The single deterministic source for Strength session duration/volume,
// shared by full multi-week programme generation (buildWorkoutSlots below)
// and standalone acp_suggested_strength generation
// (activity-recommendation-service.ts) — section 18's "one shared policy,
// never two". Previously, experience_level was persisted (workouts.difficulty)
// and used to filter/rank MuscleWiki candidates, but never affected duration
// or exercise count at all — every Strength session got the same fixed
// 40-minute, 4-exercise prescription regardless of experience.

// Sensible defaults inside each guidance band (Day 2/Chunk 4.5C2 product
// direction: beginner ~30-45, intermediate ~45-60, advanced ~60-90) — not the
// band's maximum, since Advanced should get a meaningfully longer session
// without automatically maxing out (chunk section 3).
const STRENGTH_DURATION_DEFAULT: Record<ExerciseDifficulty, number> = {
  beginner: 40,
  intermediate: 55,
  advanced: 70,
};

/**
 * SUPERSEDED as the stored `workouts.duration_minutes` source — kept only as
 * a coarse experience-tier reference (and for existing callers/tests). The
 * value actually stored on a generated Strength workout is now
 * `estimateSessionMinutes()` computed from the SAME sets/reps/rest that
 * generate its workout_exercises rows, so "N exercises · M min" is
 * internally consistent and can't diverge from the plan card. See
 * `fitStrengthSession()`.
 */
export function strengthDurationMinutes(experience: ExerciseDifficulty, explicitAvailableMinutes?: number | null): number {
  const base = STRENGTH_DURATION_DEFAULT[experience];
  if (explicitAvailableMinutes != null && explicitAvailableMinutes > 0) return Math.min(base, explicitAvailableMinutes);
  return base;
}

// ─── Session-duration estimate — the single source of truth ─────────────────
// A generated Strength session's stored duration is a computed estimate of
// its ACTUAL prescription (the sets × reps × rest that become its
// workout_exercises rows, via REPS_BY_ROLE), never a flat experience band.
// This is what makes the weekly-plan card, Home card, workout-detail and ACP
// Intelligence reasoning agree: they all resolve to this one number.
const SECONDS_PER_REP = 3;            // ~1s concentric + ~2s eccentric
const MOBILITY_HOLD_SECONDS = 30;    // per set when reps === 0 (a timed hold)
const SETUP_SECONDS_PER_EXERCISE = 60; // move to the station, set up, first cue
const WARMUP_SECONDS = 300;          // 5 min general + movement-specific warm-up

type SetPrescription = { sets: number; reps: number; restSeconds: number };

// Beta #015B — light ramp/working-up sets before each COMPOUND main lift.
// Advanced/intermediate strength work genuinely spends time here; the flat
// WARMUP_SECONDS only covered a general warm-up, which is part of why a
// canonical 55-min advanced session estimated to ~34. Not "filler" — real
// gym time (§9). `estimateSessionMinutes` adds it per compound movement.
const RAMP_SECONDS_PER_COMPOUND = 90;

/** Minutes a session of these set prescriptions realistically takes (warm-up
 *  + per-compound ramp sets + work + inter-set rest + per-exercise setup). */
export function estimateSessionMinutes(prescriptions: SetPrescription[], compoundCount = 0): number {
  if (prescriptions.length === 0) return 0;
  let seconds = WARMUP_SECONDS + Math.max(0, compoundCount) * RAMP_SECONDS_PER_COMPOUND;
  for (const p of prescriptions) {
    const workPerSet = p.reps > 0 ? p.reps * SECONDS_PER_REP : MOBILITY_HOLD_SECONDS;
    const restBetweenSets = Math.max(p.sets - 1, 0) * p.restSeconds;
    seconds += p.sets * workPerSet + restBetweenSets + SETUP_SECONDS_PER_EXERCISE;
  }
  return Math.round(seconds / 60);
}

// Beta #015B — experience-aware COMPOUND prescription. An advanced primary
// compound is trained with more working sets, lower reps and longer recovery
// than a beginner's — that is the main lever for filling a 55-min advanced
// window with real training, not extra exercises (§6/§7/§8/§11). Accessory
// and core roles are unchanged (REPS_BY_ROLE).
const COMPOUND_BY_EXPERIENCE: Record<ExerciseDifficulty, SetPrescription> = {
  beginner: { sets: 3, reps: 10, restSeconds: 75 },   // unchanged
  intermediate: { sets: 4, reps: 9, restSeconds: 120 },
  advanced: { sets: 4, reps: 8, restSeconds: 150 },
};

/** The compound-lift set prescription for an experience tier (#015B) — the
 *  exact sets/reps/rest exercise selection must persist for a compound row
 *  so the stored workout matches the estimated duration. */
export function compoundPrescription(experience: ExerciseDifficulty): SetPrescription {
  return { ...COMPOUND_BY_EXPERIENCE[experience] };
}

/** Concrete set prescription for each requirement — the exact rows exercise
 *  selection will persist. Compound rows scale with `experience` (#015B);
 *  omit `experience` for the legacy beginner-level prescription. */
export function prescriptionForRequirements(
  reqs: ExerciseRequirement[], experience?: ExerciseDifficulty,
): SetPrescription[] {
  return reqs.map(r => {
    if (r.role === 'compound' && experience) return { ...COMPOUND_BY_EXPERIENCE[experience] };
    const { sets, reps, restSeconds } = REPS_BY_ROLE[r.role];
    return { sets, reps, restSeconds };
  });
}

function countCompounds(reqs: ExerciseRequirement[]): number {
  return reqs.reduce((n, r) => n + (r.role === 'compound' ? 1 : 0), 0);
}
/** The generator's own duration estimate for a requirement list at an
 *  experience tier — experience-scaled compound prescription + per-compound
 *  ramp time. The single number the stored workout duration is derived from
 *  (#015B). */
export function estimateStrengthSessionMinutes(reqs: ExerciseRequirement[], experience: ExerciseDifficulty): number {
  return estimateSessionMinutes(prescriptionForRequirements(reqs, experience), countCompounds(reqs));
}
const estimateForReqs = estimateStrengthSessionMinutes;

/**
 * Builds the experience-aware Strength requirement list AND its computed
 * duration, fitted under `ceilingMinutes` when ACP Intelligence prescribed
 * one for this activity. Trailing accessory movements are dropped one at a
 * time until the estimate fits or the floor (base compound + core work) is
 * reached — the session is fitted to the time, never generated long and
 * relabelled. The returned `requirements` is what must be persisted, so the
 * stored duration and the actual exercise rows always match.
 */
// Beta #015B — how close to the canonical window a PRIMARY session should
// land. Not equality: the UI shows the honest generated estimate (§20). A
// gap larger than this means the session under-delivers the planned dose.
const PRIMARY_WINDOW_MARGIN_MIN = 6;
const PRIMARY_MAX_FILL = 3;
// Structure-scoped accessory movements a primary session grows into when its
// window has room — never a compound of an already-present pattern, never
// cross-structure (§6/§12). Existing patterns only.
const PRIMARY_FILL_BY_STRUCTURE: Record<'full_body' | 'upper' | 'lower', ExerciseRequirement[]> = {
  full_body: [
    { pattern: 'horizontal_pull', bodyPart: 'back', muscleHint: 'lat', role: 'accessory' },
    { pattern: 'core', bodyPart: 'waist', muscleHint: 'oblique', role: 'accessory' },
    { pattern: 'vertical_push', bodyPart: 'shoulders', role: 'accessory' },
  ],
  upper: [
    { pattern: 'horizontal_pull', bodyPart: 'back', muscleHint: 'lat', role: 'accessory' },
    { pattern: 'horizontal_push', bodyPart: 'chest', role: 'accessory' },
    { pattern: 'core', bodyPart: 'waist', muscleHint: 'oblique', role: 'accessory' },
  ],
  lower: [
    { pattern: 'hinge', bodyPart: 'upper legs', muscleHint: 'hamstring', role: 'accessory' },
    { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'accessory' },
    { pattern: 'core', bodyPart: 'waist', muscleHint: 'lower back', role: 'accessory' },
  ],
};

export function fitStrengthSession(
  base: ExerciseRequirement[], experience: ExerciseDifficulty, ceilingMinutes?: number | null,
  // Beta #015B — the structure, so a primary session can grow structure-
  // appropriate accessory volume toward its window. Omitted (support / tests)
  // → no growth, only the legacy trim-to-fit.
  fillStructure?: 'full_body' | 'upper' | 'lower',
): { requirements: ExerciseRequirement[]; durationMinutes: number } {
  const ceiling = ceilingMinutes != null && ceilingMinutes > 0 ? ceilingMinutes : null;
  let requirements = buildStrengthRequirements(base, experience);
  let estimate = estimateForReqs(requirements, experience);

  // Beta #015B — GROW toward the canonical window first (volume already came
  // from the experience-aware compound prescription; then structure-scoped
  // accessory movements), so a canonical 55-min advanced session isn't left
  // a fixed ~34-min prescription. Bounded, deterministic, never exceeds the
  // ceiling.
  if (ceiling != null && fillStructure) {
    const pool = PRIMARY_FILL_BY_STRUCTURE[fillStructure];
    for (let i = 0; i < PRIMARY_MAX_FILL && i < pool.length; i++) {
      if (estimate >= ceiling - PRIMARY_WINDOW_MARGIN_MIN) break;
      const next = [...requirements, pool[i]];
      const nextEstimate = estimateForReqs(next, experience);
      if (nextEstimate > ceiling) break; // adding this one overshoots — stop
      requirements = next;
      estimate = nextEstimate;
    }
  }

  // Then trim if still over a known ceiling (unchanged behaviour).
  while (ceiling != null && estimate > ceiling && requirements.length > base.length) {
    requirements = requirements.slice(0, -1);
    estimate = estimateForReqs(requirements, experience);
  }

  // Beta #016 — requirement-layer guard: no two requirements identical on
  // (pattern, role, muscleHint, bodyPart) — they would resolve to the same
  // exercise. Distinct-hint repeats of a pattern are still allowed (they
  // resolve to different exercises); the selection layer holds the hard
  // intra-session uniqueness invariant when the provider can't deliver
  // enough distinct candidates.
  const seenReq = new Set<string>();
  requirements = requirements.filter(r => {
    const k = `${r.pattern}|${r.role}|${r.muscleHint ?? ''}|${r.bodyPart}`;
    if (seenReq.has(k)) return false;
    seenReq.add(k);
    return true;
  });
  estimate = estimateForReqs(requirements, experience);

  const durationMinutes = ceiling != null ? Math.min(estimate, ceiling) : estimate;
  return { requirements, durationMinutes };
}

// Appended, in order, beyond a base full-body requirement list to grow
// session volume for higher experience tiers — reuses two patterns already
// defined in StrengthMovementPattern (core, horizontal_pull), never a new
// movement category or a second exercise engine (section 7/18). Deliberately
// NOT the compound lift patterns (squat/hinge/horizontal_push/vertical_push)
// — extra volume goes into accessory/core work, which is both realistic
// full-body-session programming and lower-risk for MuscleWiki match quality
// (section 15) than forcing a second compound movement of the same pattern.
const STRENGTH_ACCESSORY_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'core', bodyPart: 'waist', muscleHint: 'oblique', role: 'accessory' },
  { pattern: 'horizontal_pull', bodyPart: 'back', muscleHint: 'lat', role: 'accessory' },
];

// Conservative (low) end of each band from section 7's suggested ranges
// (beginner 4-5, intermediate 5-6, advanced 6-7) — fewer forced additions
// means fewer chances of accepting a lower-quality MuscleWiki match just to
// hit a count (section 15/16's "quality > count").
const STRENGTH_EXTRA_EXERCISE_COUNT: Record<ExerciseDifficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

/** Applies the experience-aware volume policy to any base full-body requirement list (FULL_BODY_A/B_REQUIREMENTS today). */
export function buildStrengthRequirements(base: ExerciseRequirement[], experience: ExerciseDifficulty): ExerciseRequirement[] {
  const extra = STRENGTH_ACCESSORY_REQUIREMENTS.slice(0, STRENGTH_EXTRA_EXERCISE_COUNT[experience]);
  return [...base, ...extra];
}

// ─── Beta Feedback #013 — canonical strength-activity fidelity (Bug B) ──────
// A plan activity's TITLE/DESCRIPTION carry the session's intended shape
// ("Upper/lower support", "upper/lower split light day"). Nothing structured
// records the split, and building an NLP system is out of scope — so this is
// a small deterministic classifier that picks the requirement BASE, keeping
// `full_body` as the safe default for any existing/ambiguous plan (§15/§16).
export type StrengthStructure = 'full_body' | 'upper' | 'lower' | 'support';

const SUPPORT_RE = /\b(support|light|recovery|deload|technique|accessor(?:y|ies)|easy day)\b/i;
const UPPER_RE = /\bupper(?:[\s-]?body)?\b/i;
const LOWER_RE = /\b(lower(?:[\s-]?body)?|leg day|legs)\b/i;

export function classifyStrengthStructure(title?: string | null, description?: string | null): StrengthStructure {
  const t = `${title ?? ''} ${description ?? ''}`;
  if (SUPPORT_RE.test(t)) return 'support';        // "…support", "light day" → a deliberately lighter session
  const upper = UPPER_RE.test(t);
  const lower = LOWER_RE.test(t);
  if (upper && !lower) return 'upper';
  if (lower && !upper) return 'lower';
  return 'full_body';                              // "full body", "upper/lower split", or unknown
}

/** Upper-body compound base — reuses existing StrengthMovementPattern values only. */
export const UPPER_BODY_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'horizontal_push', bodyPart: 'chest', role: 'compound' },
  { pattern: 'horizontal_pull', bodyPart: 'back', role: 'compound' },
  { pattern: 'vertical_push', bodyPart: 'shoulders', role: 'compound' },
  { pattern: 'core', bodyPart: 'waist', role: 'core' },
];

/** Lower-body compound base — reuses existing StrengthMovementPattern values only. */
export const LOWER_BODY_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'compound' },
  { pattern: 'hinge', bodyPart: 'upper legs', muscleHint: 'hamstring', role: 'compound' },
  { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'glute', role: 'accessory' },
  { pattern: 'core', bodyPart: 'waist', role: 'core' },
];

// Beta #014 — a SUPPORT day is the week's deliberately lighter session and
// must reflect that ROLE, not be a shortened copy of the full-body compound
// day (§8). It leads with accessory-role pulls / posterior-chain / shoulder
// work + core — reusing existing StrengthMovementPattern values only, and
// sharing no (pattern, role) tuple with FULL_BODY_A_REQUIREMENTS so it never
// resolves to the same exercise selection as a full-body day.
export const SUPPORT_REQUIREMENTS: ExerciseRequirement[] = [
  { pattern: 'horizontal_pull', bodyPart: 'back', muscleHint: 'lat', role: 'accessory' },
  { pattern: 'hinge', bodyPart: 'upper legs', muscleHint: 'glute', role: 'accessory' },
  { pattern: 'vertical_push', bodyPart: 'shoulders', role: 'accessory' },
  { pattern: 'core', bodyPart: 'waist', muscleHint: 'oblique', role: 'core' },
];

/**
 * Beta #014 follow-up — which full-body base a canonical full-body activity
 * uses. Two full-body sessions in a plan must alternate A/B.
 *
 * `seed` is the STABLE 0-based ORDINAL of this session among the plan's
 * full-body sessions (1st → 0 → A, 2nd → 1 → B, 3rd → 0 → A). Position in
 * the canonical plan, NOT a calendar coincidence — the first follow-up
 * device result proved a `planned_date` digit-sum-parity seed does NOT
 * guarantee alternation (two full-body dates in a week can share parity and
 * both pick A). Never a clock or RNG (§8/§16/§17). Same plan_id + activity
 * ⇒ same ordinal ⇒ same variant (§9).
 *
 * A string seed (a bare planned_date, when the ordinal genuinely cannot be
 * computed — e.g. a legacy plan the caller can't enumerate) is a documented
 * best-effort fallback only: digit-sum parity, which varies most days but
 * carries no alternation guarantee.
 */
export function strengthSeedParity(seed: string | number | null | undefined): 0 | 1 {
  if (seed == null) return 0;
  if (typeof seed === 'number') return (((Math.trunc(seed) % 2) + 2) % 2) as 0 | 1;
  const digits = seed.replace(/\D/g, '');
  if (digits.length === 0) {
    const sum = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return (sum % 2) as 0 | 1;
  }
  const sum = digits.split('').reduce((a, d) => a + Number(d), 0);
  return (sum % 2) as 0 | 1;
}

export function fullBodyBaseForSeed(seed: string | number | null | undefined): ExerciseRequirement[] {
  return strengthSeedParity(seed) === 0 ? FULL_BODY_A_REQUIREMENTS : FULL_BODY_B_REQUIREMENTS;
}

/**
 * The 0-based ordinal of a canonical activity among the plan's full-body
 * strength sessions — the stable seed for the A/B choice. Pure: the caller
 * passes the plan's activity list + the target activity's own index.
 * `activities[i]` is classified full-body when its category is strength/gym
 * AND classifyStrengthStructure(title, description) === 'full_body'.
 */
export function fullBodyOrdinalInPlan(
  activities: { category?: string | null; title?: string | null; description?: string | null }[],
  targetIndex: number,
): number {
  let ordinal = 0;
  for (let i = 0; i < activities.length && i < targetIndex; i++) {
    const a = activities[i];
    const cat = (a.category ?? '').toLowerCase();
    if (cat !== 'strength' && cat !== 'gym') continue;
    if (classifyStrengthStructure(a.title, a.description) === 'full_body') ordinal++;
  }
  return ordinal;
}

export function strengthRequirementBase(
  structure: StrengthStructure, seed?: string | number | null,
): ExerciseRequirement[] {
  if (structure === 'upper') return UPPER_BODY_REQUIREMENTS;
  if (structure === 'lower') return LOWER_BODY_REQUIREMENTS;
  if (structure === 'support') return SUPPORT_REQUIREMENTS;
  return fullBodyBaseForSeed(seed); // full_body — A or B by the stable per-activity seed
}

// Beta #015 / #015C — a SUPPORT session grows to fill its planned window
// with ACCESSORY volume: unilateral work, complementary movement patterns
// and core (§5) — existing StrengthMovementPattern values, all
// accessory/core role, NEVER a compound lift, so a 60-minute support day is
// a substantive accessory session and still not a second primary workout
// (§5/§6/§12). The pool is a deterministic rotation of complementary
// patterns; it repeats a pattern only after every pattern has appeared once
// (a different muscleHint each time keeps exercise selection distinct).
const SUPPORT_FILL_ACCESSORIES: ExerciseRequirement[] = [
  { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'glute', role: 'accessory' },
  { pattern: 'horizontal_push', bodyPart: 'chest', role: 'accessory' },
  { pattern: 'core', bodyPart: 'waist', muscleHint: 'lower back', role: 'accessory' },
  { pattern: 'horizontal_pull', bodyPart: 'back', muscleHint: 'rear delt', role: 'accessory' },
  { pattern: 'hinge', bodyPart: 'upper legs', muscleHint: 'hamstring', role: 'accessory' },
  { pattern: 'vertical_push', bodyPart: 'shoulders', muscleHint: 'lateral delt', role: 'accessory' },
  { pattern: 'squat', bodyPart: 'upper legs', muscleHint: 'quad', role: 'accessory' },
  { pattern: 'core', bodyPart: 'waist', muscleHint: 'rectus', role: 'accessory' },
];
// Land just under the planned minutes, not over.
const SUPPORT_WINDOW_MARGIN_MIN = 4;

/** Grow a support base toward its planned window (§12/§19/§015C) with
 *  accessory volume only — while the running estimate stays under the
 *  ceiling. Bounded by the pool size. */
function growSupportToWindow(base: ExerciseRequirement[], ceilingMinutes: number | null | undefined): ExerciseRequirement[] {
  const ceiling = ceilingMinutes != null && ceilingMinutes > 0 ? ceilingMinutes : null;
  if (ceiling == null) return base;
  let reqs = base;
  for (let i = 0; i < SUPPORT_FILL_ACCESSORIES.length; i++) {
    const est = estimateSessionMinutes(prescriptionForRequirements(reqs));
    if (est >= ceiling - SUPPORT_WINDOW_MARGIN_MIN) break;
    const next = [...reqs, SUPPORT_FILL_ACCESSORIES[i]];
    if (estimateSessionMinutes(prescriptionForRequirements(next)) > ceiling) break;
    reqs = next;
  }
  return reqs;
}

/**
 * `fitStrengthSession` for a canonical activity of a known structure. A
 * `support` day carries NO experience-tier accessory volume (it's the week's
 * lighter session, §013), but Beta #015 grows it to fill its PLANNED window
 * with accessory work when the base would leave the window largely empty —
 * so a "30 min support" delivers ~28–30 min, not 24, and is worth doing as a
 * session. Everything else uses the normal experience-aware policy, still
 * fitted under the prescribed ceiling. `seed` (Beta #014) picks the
 * full-body A/B variant.
 */
// Beta #016 §8 — a canonical title can call for a conditioning tail
// ("…plus short conditioning", "strength + finisher", "metcon"). ACP has NO
// canonical representation of a conditioning block (no cardio/interval
// movement pattern in the strength requirement model) — documented gap. The
// only safe thing this flag does today is stop #015B from PADDING the
// strength portion with extra accessory movements to backfill the minutes
// the plan intended for conditioning; the UI then shows the honest (shorter)
// strength estimate rather than a squat/core session masquerading as
// "strength + conditioning". Building a conditioning engine is out of scope.
const CONDITIONING_RE = /\b(conditioning|metcon|finisher|circuit|interval|amrap|emom|wod)\b/i;
export function titleImpliesConditioning(title?: string | null, description?: string | null): boolean {
  return CONDITIONING_RE.test(`${title ?? ''} ${description ?? ''}`);
}

export function fitStrengthSessionForStructure(
  structure: StrengthStructure, experience: ExerciseDifficulty, ceilingMinutes?: number | null,
  seed?: string | number | null,
  // Beta #016 §8 — when the canonical activity calls for a conditioning tail
  // ACP can't model, don't let #015B pad the strength portion to fill the
  // whole window with accessory strength work.
  opts?: { skipPrimaryFill?: boolean },
): { requirements: ExerciseRequirement[]; durationMinutes: number; structure: StrengthStructure } {
  const volumeExperience: ExerciseDifficulty = structure === 'support' ? 'beginner' : experience;
  let base = strengthRequirementBase(structure, seed);
  if (structure === 'support') base = growSupportToWindow(base, ceilingMinutes);
  // Beta #015B — a PRIMARY session grows structure-appropriate volume toward
  // its canonical window (support is exempt — #015). #013's advanced floor
  // is now actually delivered by the generated content, not just the label.
  const fillStructure = structure === 'support' || opts?.skipPrimaryFill ? undefined : structure;
  const fitted = fitStrengthSession(base, volumeExperience, ceilingMinutes, fillStructure);
  return { ...fitted, structure };
}

// ── Beta #015 — standalone-session viability (validation / planner check) ──
export type SessionViability = 'viable' | 'short_support' | 'thin';

/**
 * Given a session's ROLE, its generated content estimate, and its planned
 * window, is it worth doing as a dedicated session?
 *   - 'thin'          — a support/light day whose content falls far short of
 *                       its own planned window (the planner should have filled
 *                       it, or not scheduled a standalone trip for it).
 *   - 'short_support' — a legitimately short support/light session (its
 *                       planned window is itself short, or content ≈ window).
 *   - 'viable'        — a substantive standalone session.
 * No commute/travel input (§2/§16) — this is purely content-vs-plan.
 */
export function assessStandaloneViability(
  structure: StrengthStructure, generatedMinutes: number, plannedMinutes: number | null | undefined,
  // Beta #015C — the advanced standalone-strength floor applies to EVERY
  // structure including support/light. Pass the user's experience so the
  // viability check knows the target. Omit → the pre-#015C support/primary
  // heuristics (used by pure tests that don't model a user).
  experience?: ExerciseDifficulty,
): SessionViability {
  const planned = plannedMinutes != null && plannedMinutes > 0 ? plannedMinutes : generatedMinutes;
  if (experience === 'advanced') {
    // any standalone advanced strength session should be ~60 when planned so
    if (planned >= ADVANCED_STANDALONE_FLOOR_MIN - 5 && generatedMinutes < ADVANCED_STANDALONE_FLOOR_MIN - 8) return 'thin';
    return generatedMinutes >= ADVANCED_STANDALONE_FLOOR_MIN - 8 ? 'viable' : 'short_support';
  }
  if (structure !== 'support') {
    return generatedMinutes >= 30 ? 'viable' : 'short_support';
  }
  if (planned >= 30 && generatedMinutes < planned - 5) return 'thin';
  return 'short_support';
}

/** Beta #015C — the canonical-duration floor for an ADVANCED user's
 *  standalone strength session (any structure), applied web-side by
 *  enforceStrengthSessionDuration ONLY within the user's weekly-budget
 *  headroom (§2/§7/§9). Exposed here so the mobile generator's window-fill
 *  and viability check use the same number. */
export const ADVANCED_STANDALONE_FLOOR_MIN = 60;

/**
 * The canonical minutes a standalone strength activity should target for a
 * given experience, given the minutes still free in the weekly budget.
 * `null` weekly headroom = unknown → keep the planned value (never fabricate
 * budget, §9). Returns the planned value when the floor can't be afforded.
 */
export function standaloneStrengthTargetMinutes(
  plannedMinutes: number, experience: ExerciseDifficulty, weeklyHeadroomMinutes: number | null,
): number {
  if (experience !== 'advanced') return plannedMinutes;
  if (weeklyHeadroomMinutes == null) return plannedMinutes;
  const affordable = plannedMinutes + Math.max(0, weeklyHeadroomMinutes);
  return Math.min(ADVANCED_STANDALONE_FLOOR_MIN, Math.max(plannedMinutes, Math.min(ADVANCED_STANDALONE_FLOOR_MIN, affordable)));
}

// ── Beta #014 — same-week duplication analysis (validation/tests only) ─────
// Compares two generated strength sessions at the MOVEMENT-PRESCRIPTION
// level (ACP owns this; exercise IDs are a downstream provider concern).
// Per §14 this does NOT enforce "no movement may repeat" — repeated primary
// movements across a week are intentional and support progression tracking.
// It flags the specific bad case: an identical ORDERED movement prescription
// for two sessions the plan says have different roles.
export interface StrengthSessionPrescription {
  structure: StrengthStructure;
  requirements: ExerciseRequirement[];
}
function patternRoleKey(r: ExerciseRequirement): string {
  return `${r.pattern}:${r.role}:${r.muscleHint ?? ''}`;
}
export function analyseStrengthSessionOverlap(
  a: StrengthSessionPrescription, b: StrengthSessionPrescription,
): { orderedSequenceEqual: boolean; patternOverlapRatio: number; suspicious: boolean } {
  const ka = a.requirements.map(patternRoleKey);
  const kb = b.requirements.map(patternRoleKey);
  const orderedSequenceEqual = ka.length === kb.length && ka.every((k, i) => k === kb[i]);
  const setA = new Set(ka);
  const shared = kb.filter(k => setA.has(k)).length;
  const patternOverlapRatio = Math.max(ka.length, kb.length) === 0
    ? 0 : shared / Math.max(ka.length, kb.length);
  // Prefix-identical also counts: a shorter session whose whole ordered
  // prescription is the other's opening N movements is the "support is just
  // a shorter full-body" bug.
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = ka.length <= kb.length ? kb : ka;
  const prefixIdentical = shorter.length > 0 && shorter.every((k, i) => k === longer[i]);
  const suspicious = a.structure !== b.structure && (orderedSequenceEqual || prefixIdentical);
  return { orderedSequenceEqual, patternOverlapRatio, suspicious };
}

const WORKOUT_TYPE_SPECS: Record<string, WorkoutTypeSpec> = {
  full_body_a: { title: 'Full Body A', isActivityBlock: false, requirements: FULL_BODY_A_REQUIREMENTS },
  full_body_b: { title: 'Full Body B', isActivityBlock: false, requirements: FULL_BODY_B_REQUIREMENTS },
  cardio_mobility: {
    title: 'Cardio + Mobility', isActivityBlock: true,
    activityDescription: '20–25 minutes of brisk walking or light jogging, followed by 10 minutes of full-body mobility stretching.',
  },
  run_easy: {
    title: 'Easy Run', isActivityBlock: true,
    activityDescription: 'Easy-paced run or run/walk for 20–25 minutes at a conversational pace.',
  },
  run_intervals: {
    title: 'Interval Run', isActivityBlock: true,
    activityDescription: 'Interval session: 5–6 rounds of 2 minutes at a moderate-hard pace, with 2 minutes of walking recovery between rounds.',
  },
  walk_easy: {
    title: 'Brisk Walk', isActivityBlock: true,
    activityDescription: 'A brisk, purposeful walk for 30 minutes — comfortable but not a stroll.',
  },
};

export function workoutTypeSpec(workoutType: string): WorkoutTypeSpec {
  return WORKOUT_TYPE_SPECS[workoutType] ?? WORKOUT_TYPE_SPECS.cardio_mobility;
}

/** Every week repeats the same structure — V1 deliberately has no week-to-week progression logic (Day 2 section 10's "prefer conservative, coherent programming over unnecessary complexity"). */
export function buildWorkoutSlots(strategy: TrainingStrategy, context: GenerationContext): WorkoutSlot[] {
  const days = DAYS_BY_FREQUENCY[context.sessionsPerWeek] ?? DAYS_BY_FREQUENCY[2];
  const slots: WorkoutSlot[] = [];

  for (let week = 1; week <= context.durationWeeks; week++) {
    strategy.weeklyWorkoutTypes.forEach((workoutType, i) => {
      const spec = workoutTypeSpec(workoutType);
      // Strength prescription policy applies only to actual Strength slots
      // (full_body_a/b) — activity-block slots (mobility/running/walking)
      // keep the existing flat session default untouched (chunk exclusions).
      const isStrength = !spec.isActivityBlock && !!spec.requirements;
      // Strength: requirements AND stored duration both come from
      // fitStrengthSession — one computed estimate of the real prescription,
      // fitted under the prescribed minutes. Activity-block slots
      // (mobility/running/walking) keep the flat session default untouched.
      const strength = isStrength
        ? fitStrengthSession(spec.requirements!, context.experience, context.prescribedStrengthMinutes)
        : null;
      slots.push({
        weekNumber: week,
        dayOfWeek: days[i] ?? days[days.length - 1],
        workoutType,
        title: spec.title,
        isActivityBlock: spec.isActivityBlock,
        activityDescription: spec.activityDescription,
        requirements: strength ? strength.requirements : spec.requirements,
        durationMinutes: strength ? strength.durationMinutes : context.sessionDurationMinutes,
        sequence: i,
      });
    });
  }
  return slots;
}
