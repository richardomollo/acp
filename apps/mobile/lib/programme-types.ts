// ACP Intelligence™ Day 2 — programme generation domain types.
// Pure types only, zero framework/Supabase imports — mirrors the convention
// already used by lib/ai-assessment.ts, lib/coaching-memory.ts, etc.
import type { ExerciseDifficulty } from './exercise-types.ts';

export type ProgrammeSource = 'ACP_GENERATED' | 'TRAINER_CREATED' | 'TRAINER_MODIFIED';
export type ProgrammeStatus = 'active' | 'archived';
export type EquipmentLocation = 'home' | 'gym';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// Every goal value the DB accepts (fitness_profile_goal_check). Not every one
// is programmable yet — see SUPPORTED_GOALS in programme-generator.ts.
export type ProgrammeGoal =
  | 'lose_weight' | 'build_muscle' | 'improve_mobility' | 'general_fitness'
  | 'maintain_weight' | 'eat_healthier' | 'improve_running' | 'improve_health'
  | 'healthy_lifestyle' | 'body_recomposition' | 'reduce_stress';

/**
 * The deterministic inputs used to generate a programme — persisted verbatim
 * as workout_programs.generation_context so ACP can later answer "why did we
 * give this user this programme?" (Day 2 section 6). `defaultsUsed` records
 * which fields were NOT sourced from real onboarding data, for transparency.
 */
export interface GenerationContext {
  goal: ProgrammeGoal;
  experience: ExerciseDifficulty;
  sessionsPerWeek: number;
  sessionDurationMinutes: number;
  /**
   * Minutes ACP Intelligence prescribed for the Strength activity, if known
   * (starting_plan.activities[].duration_minutes). Used as the ceiling the
   * generated Strength session's volume/duration is fitted under. Null when
   * no assessment/strength activity is available.
   */
  prescribedStrengthMinutes?: number | null;
  equipmentLocation: EquipmentLocation;
  preferredActivities: string[];
  activityLevel: string | null;
  durationWeeks: number;
  defaultsUsed: string[];
  sourceVersion: 'v1';
}

// A movement-pattern requirement for one strength or mobility workout slot.
// ACP owns this decision; ExerciseSelectionService only finds candidates
// that satisfy it (Day 2 section 9's separation of training strategy from
// exercise pick). Split into two sub-unions (rather than one flat union) so
// each domain's keyword-lookup Record (lib/exercise-fit-validator.ts) stays
// exhaustively typed on exactly its own patterns — adding a mobility pattern
// can never silently leave a strength lookup table with a missing case.
export type StrengthMovementPattern = 'squat' | 'hinge' | 'horizontal_push' | 'horizontal_pull' | 'vertical_push' | 'core';
export type MobilityMovementPattern = 'hip_mobility' | 'shoulder_mobility' | 'thoracic_mobility';
export type MovementPattern = StrengthMovementPattern | MobilityMovementPattern;

export interface ExerciseRequirement {
  pattern: MovementPattern;
  bodyPart: string;      // ACPExercise.bodyPart candidate pool to search within
  muscleHint?: string;   // substring to prefer within ex.target, e.g. 'hamstring' for hinge
  role: 'compound' | 'accessory' | 'core' | 'mobility';
}

export interface WorkoutSlot {
  weekNumber: number;
  dayOfWeek: DayOfWeek;
  workoutType: string;        // e.g. 'full_body_a', 'cardio_mobility', 'run_easy'
  title: string;
  isActivityBlock: boolean;
  activityDescription?: string;   // set only when isActivityBlock
  requirements?: ExerciseRequirement[]; // set only when !isActivityBlock
  durationMinutes: number;    // Chunk 4.5C2: per-slot, so a strength slot's experience-aware duration never gets overwritten by the flat session default used for activity blocks
  sequence: number;
}

export interface TrainingStrategy {
  goal: ProgrammeGoal;
  weeklyWorkoutTypes: string[]; // the repeating per-week structure, e.g. ['full_body_a','cardio_mobility','full_body_b']
  explanation: string;
}

// reps: 0 is a deliberate sentinel for "not rep-based" (mobility holds) —
// workout-detail.tsx's prescriptionLabel already treats a falsy reps as
// "omit this field", so a mobility entry naturally shows only sets/rest
// without a schema change or a UI-side special case.
export const REPS_BY_ROLE: Record<ExerciseRequirement['role'], { sets: number; reps: number; restSeconds: number; notes: string }> = {
  compound: { sets: 3, reps: 10, restSeconds: 75, notes: 'Aim for 8–12 reps. Choose a weight where the last 2–3 reps feel challenging but doable with good form.' },
  accessory: { sets: 3, reps: 12, restSeconds: 60, notes: 'Aim for 10–15 reps with good form.' },
  core: { sets: 3, reps: 15, restSeconds: 45, notes: 'Aim for 12–15 reps, or hold for 30–45 seconds if it’s a timed exercise.' },
  mobility: { sets: 2, reps: 0, restSeconds: 15, notes: 'Move slowly through the full range of motion — hold briefly at end range if it feels tight.' },
};
