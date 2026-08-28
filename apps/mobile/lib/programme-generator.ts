// ACP Intelligence™ Day 2 — deterministic programme generation. Pure,
// framework-free (no Supabase/React) so every rule is unit-testable in
// isolation, mirroring lib/ai-assessment.ts / lib/coaching-memory.ts. ACP
// Intelligence owns every decision here (session count, split, movement
// requirements, sets/reps); the exercise provider only ever supplies
// candidate exercises for a requirement this file already decided on
// (Day 2 section 9).
import type { ExerciseDifficulty } from './exercise-types.ts';
import {
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

export function buildGenerationContext(profile: ProfileLike, startDate: Date): GenerationContext {
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

const FULL_BODY_B_REQUIREMENTS: ExerciseRequirement[] = [
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
 * `explicitAvailableMinutes` is a hard per-session time ceiling, used only
 * when ACP genuinely knows one. No caller passes this today — there is no
 * structured "available session minutes" field anywhere in fitness_profile
 * (only a free-text weekly `starting_point.available_time` string inside the
 * AI-assessment blob, which isn't a reliable per-session minute value) — so
 * this parameter exists so the policy correctly handles that input if it
 * ever becomes available, without inventing a fake source for it now
 * (section 4's "do not invent unavailable time data"). When supplied, it
 * caps the experience-tier default rather than downgrading the member's
 * tier — an Advanced member constrained to 45 minutes stays Advanced
 * (section 13), the duration is simply capped.
 */
export function strengthDurationMinutes(experience: ExerciseDifficulty, explicitAvailableMinutes?: number | null): number {
  const base = STRENGTH_DURATION_DEFAULT[experience];
  if (explicitAvailableMinutes != null && explicitAvailableMinutes > 0) return Math.min(base, explicitAvailableMinutes);
  return base;
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
      slots.push({
        weekNumber: week,
        dayOfWeek: days[i] ?? days[days.length - 1],
        workoutType,
        title: spec.title,
        isActivityBlock: spec.isActivityBlock,
        activityDescription: spec.activityDescription,
        requirements: isStrength ? buildStrengthRequirements(spec.requirements!, context.experience) : spec.requirements,
        durationMinutes: isStrength ? strengthDurationMinutes(context.experience) : context.sessionDurationMinutes,
        sequence: i,
      });
    });
  }
  return slots;
}
