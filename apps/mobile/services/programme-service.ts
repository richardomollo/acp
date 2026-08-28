// ACP Intelligence™ Day 2 — the one service boundary for programme
// generation. Fitness Hub UI calls only this — never Supabase directly, and
// never lib/programme-generator.ts directly (Day 2 section 18).
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import { selectExerciseForRequirement, type SelectedExercise } from './exercise-selection-service';
import {
  buildGenerationContext, buildTrainingStrategy, buildWorkoutSlots, isGoalSupported,
  type ProfileLike,
} from '@/lib/programme-generator';
import type { WorkoutSlot, ProgrammeGoal } from '@/lib/programme-types';
import { decideProgrammeAction } from '@/lib/programme-ownership';

export type GenerateProgrammeResult =
  | { status: 'generated'; programId: string }
  | { status: 'already_active'; programId: string }
  | { status: 'trainer_programme_active' }
  | { status: 'unsupported_goal'; goal: string | null }
  | { status: 'not_authorized' }
  | { status: 'error'; message: string };

function toWorkoutGoal(goal: string): 'lose_weight' | 'build_muscle' | 'improve_mobility' | 'general_fitness' {
  if (goal === 'lose_weight' || goal === 'build_muscle' || goal === 'improve_mobility') return goal;
  return 'general_fitness';
}

function categoryForWorkoutType(workoutType: string): string {
  return workoutType.startsWith('full_body') ? 'strength' : 'cardio';
}

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

/**
 * Runs exercise selection exactly once per distinct workout type (not once
 * per week) — every week repeats the same structure in V1 (no progression
 * logic), so re-selecting per-week would be wasted provider calls and could
 * pick different exercises for "the same" workout across weeks.
 */
async function selectExercisesByWorkoutType(
  slots: WorkoutSlot[],
  equipmentLocation: 'home' | 'gym',
  difficulty: 'beginner' | 'intermediate' | 'advanced',
): Promise<Map<string, SelectedExercise[]>> {
  const byType = new Map<string, WorkoutSlot>();
  for (const slot of slots) if (!byType.has(slot.workoutType)) byType.set(slot.workoutType, slot);

  const result = new Map<string, SelectedExercise[]>();
  for (const [workoutType, slot] of byType) {
    if (slot.isActivityBlock || !slot.requirements) { result.set(workoutType, []); continue; }
    const alreadySelected = new Set<string>();
    const selected: SelectedExercise[] = [];
    for (const requirement of slot.requirements) {
      const picked = await selectExerciseForRequirement(requirement, equipmentLocation, difficulty, alreadySelected);
      alreadySelected.add(picked.exercise.id);
      selected.push(picked);
    }
    result.set(workoutType, selected);
  }
  return result;
}

async function persistExercise(selected: SelectedExercise): Promise<string | null> {
  const ex = selected.exercise;
  const { data, error } = await supabase
    .from('exercises')
    .upsert(
      {
        name: ex.name, body_part: ex.bodyPart, target_muscle: ex.target,
        equipment: ex.equipment, difficulty: ex.difficulty, instructions: ex.instructions,
        // The demonstration media itself (e.g. a MuscleWiki stream URL) is
        // persisted as a plain URL — it needs a fresh short-lived token to
        // actually play (see hooks/use-musclewiki-media.ts), which is
        // resolved at render time, never baked into this stored value.
        gif_url: ex.media[0]?.url ?? null,
        external_id: ex.id, source: ex.provider,
      },
      { onConflict: 'source,external_id' },
    )
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

async function insertProgrammeWorkouts(
  userId: string, weekIdByNumber: Map<number, string>, slots: WorkoutSlot[],
  equipmentLocation: 'home' | 'gym', difficulty: 'beginner' | 'intermediate' | 'advanced',
  goal: string,
  exercisesByType: Map<string, SelectedExercise[]>,
) {
  for (const slot of slots) {
    const programWeekId = weekIdByNumber.get(slot.weekNumber);
    if (!programWeekId) continue;

    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .insert({
        title: slot.title,
        description: slot.isActivityBlock ? slot.activityDescription : null,
        category: categoryForWorkoutType(slot.workoutType),
        location_type: equipmentLocation,
        difficulty,
        goal: toWorkoutGoal(goal),
        // Chunk 4.5C2: per-slot now (buildWorkoutSlots already computed the
        // experience-aware Strength duration for full_body_a/b; activity
        // blocks keep the pre-existing flat session default) — never one
        // flat value forced onto every workout in the programme.
        duration_minutes: slot.durationMinutes,
        is_active: true,
        user_id: userId,
        program_week_id: programWeekId,
        day_of_week: slot.dayOfWeek,
        workout_type: slot.workoutType,
        sequence: slot.sequence,
        is_activity_block: slot.isActivityBlock,
      })
      .select('id')
      .single();
    if (wErr || !workout) continue;

    if (slot.isActivityBlock) continue;

    const selected = exercisesByType.get(slot.workoutType) ?? [];
    for (let i = 0; i < selected.length; i++) {
      const picked = selected[i];
      const exerciseId = await persistExercise(picked);
      if (!exerciseId) continue;
      await supabase.from('workout_exercises').insert({
        workout_id: workout.id,
        exercise_id: exerciseId,
        sort_order: i,
        sets: picked.sets,
        reps: picked.reps,
        rest_seconds: picked.restSeconds,
        notes: picked.notes,
      });
    }
  }
}

async function fetchActiveProgrammeRow(userId: string) {
  const { data } = await supabase
    .from('workout_programs')
    .select('id, source')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data as { id: string; source: string } | null;
}

async function runGeneration(userId: string, createdFromProgramId: string | null): Promise<GenerateProgrammeResult> {
  const { data: profile } = await supabase
    .from('fitness_profile')
    .select('goal, experience_level, activity_level, preferred_activities, goal_target_date')
    .eq('user_id', userId)
    .maybeSingle();

  const profileLike: ProfileLike = {
    goal: profile?.goal ?? null,
    experience_level: profile?.experience_level ?? null,
    activity_level: profile?.activity_level ?? null,
    preferred_activities: profile?.preferred_activities ?? null,
    goal_target_date: profile?.goal_target_date ?? null,
  };

  if (!isGoalSupported(profileLike.goal as ProgrammeGoal | null)) {
    return { status: 'unsupported_goal', goal: profileLike.goal };
  }

  const startDate = new Date();
  const context = buildGenerationContext(profileLike, startDate);
  const strategy = buildTrainingStrategy(context);
  const slots = buildWorkoutSlots(strategy, context);

  // Selection runs before persistence so fallback usage (section 5 — the
  // exercise provider had nothing suitable and a safe built-in exercise was
  // used instead) is recorded in generation_context, never silently treated
  // as a normal provider-backed success.
  const exercisesByType = await selectExercisesByWorkoutType(slots, context.equipmentLocation, context.experience);
  const allSelected = [...exercisesByType.values()].flat();
  const fallbackCount = allSelected.filter(s => s.fallbackUsed).length;
  if (fallbackCount > 0) {
    console.warn(`[programme-service] ${fallbackCount}/${allSelected.length} exercises used the built-in fallback (exercise provider had no suitable result)`);
  }
  const generationContext = {
    ...context,
    fallback_exercise_count: fallbackCount,
    provider_exercise_count: allSelected.length - fallbackCount,
  };

  const { data: program, error: pErr } = await supabase
    .from('workout_programs')
    .insert({
      user_id: userId,
      source: 'ACP_GENERATED',
      status: 'active',
      goal: context.goal,
      experience_level: context.experience,
      sessions_per_week: context.sessionsPerWeek,
      session_duration_minutes: context.sessionDurationMinutes,
      start_date: startDate.toISOString().slice(0, 10),
      duration_weeks: context.durationWeeks,
      generation_context: generationContext,
      generation_version: context.sourceVersion,
      explanation: strategy.explanation,
      created_from_program_id: createdFromProgramId,
    })
    .select('id')
    .single();
  if (pErr || !program) return { status: 'error', message: pErr?.message ?? 'Failed to create programme' };

  const weekIdByNumber = new Map<number, string>();
  for (let week = 1; week <= context.durationWeeks; week++) {
    const { data: weekRow, error: weekErr } = await supabase
      .from('workout_program_weeks')
      .insert({ program_id: program.id, week_number: week })
      .select('id')
      .single();
    if (weekErr || !weekRow) continue;
    weekIdByNumber.set(week, weekRow.id);
  }

  await insertProgrammeWorkouts(userId, weekIdByNumber, slots, context.equipmentLocation, context.experience, context.goal, exercisesByType);

  return { status: 'generated', programId: program.id };
}

export const programmeService = {
  async generateProgramme(userId: string): Promise<GenerateProgrammeResult> {
    if (!(await assertOwnSession(userId))) return { status: 'not_authorized' };

    const active = await fetchActiveProgrammeRow(userId);
    const action = decideProgrammeAction(active);
    if (action === 'trainer_active') return { status: 'trainer_programme_active' };
    if (action === 'already_active') return { status: 'already_active', programId: active!.id };
    return runGeneration(userId, null);
  },

  async regenerateProgramme(userId: string): Promise<GenerateProgrammeResult> {
    if (!(await assertOwnSession(userId))) return { status: 'not_authorized' };

    const active = await fetchActiveProgrammeRow(userId);
    if (decideProgrammeAction(active) === 'trainer_active') return { status: 'trainer_programme_active' };

    if (active) {
      await supabase.from('workout_programs').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', active.id);
    }
    return runGeneration(userId, active?.id ?? null);
  },

  async getActiveProgramme(userId: string) {
    if (!(await assertOwnSession(userId))) return null;

    const { data: program } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!program) return null;

    const { data: weeks } = await supabase
      .from('workout_program_weeks')
      .select('id, week_number')
      .eq('program_id', program.id)
      .order('week_number');

    const weekIds = (weeks ?? []).map(w => w.id);
    const { data: workouts } = weekIds.length
      ? await supabase
          .from('workouts')
          .select('id, title, description, category, day_of_week, workout_type, sequence, is_activity_block, duration_minutes, program_week_id')
          .in('program_week_id', weekIds)
          .order('sequence')
      : { data: [] as any[] };

    return { program, weeks: weeks ?? [], workouts: workouts ?? [] };
  },
};
