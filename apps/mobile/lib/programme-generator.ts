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

const FULL_BODY_A_REQUIREMENTS: ExerciseRequirement[] = [
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

interface WorkoutTypeSpec {
  title: string;
  isActivityBlock: boolean;
  activityDescription?: string;
  requirements?: ExerciseRequirement[];
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
      slots.push({
        weekNumber: week,
        dayOfWeek: days[i] ?? days[days.length - 1],
        workoutType,
        title: spec.title,
        isActivityBlock: spec.isActivityBlock,
        activityDescription: spec.activityDescription,
        requirements: spec.requirements,
        sequence: i,
      });
    });
  }
  return slots;
}
