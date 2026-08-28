// ACP Intelligence™ Day 3 — the one service boundary for resolving and
// executing a workout. UI screens call only this, never Supabase directly.
// Works identically regardless of programme source (ACP_GENERATED/
// TRAINER_CREATED/TRAINER_MODIFIED) and identically for a plain (non-
// programme) workout — execution never reads or depends on MuscleWiki.
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import {
  parseLocalDateOnly, resolveWeekNumber, weekStartDate, resolveTodaysWorkout,
  calculateCompletionPercentage, type WeekWorkoutRow, type WorkoutHistoryStatus,
} from '@/lib/workout-execution';

export type PerceivedDifficulty = 'easy' | 'about_right' | 'difficult';

export type TodaysWorkoutResult =
  | { status: 'no_active_programme' }
  | { status: 'programme_complete' }
  | { status: 'rest_day'; nextWorkoutTitle?: string; nextWorkoutDate?: string }
  | { status: 'missed'; workoutId: string; title: string }
  | { status: 'scheduled'; workoutId: string; title: string }
  | { status: 'in_progress'; workoutId: string; title: string; historyId: string }
  | { status: 'completed'; workoutId: string; title: string; historyId: string }
  | { status: 'not_authorized' };

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

async function fetchHistoryStatusByWorkoutId(userId: string, workoutIds: string[]): Promise<Map<string, WorkoutHistoryStatus>> {
  if (workoutIds.length === 0) return new Map();
  const { data } = await supabase
    .from('workout_history')
    .select('workout_id, status, id, started_at')
    .eq('user_id', userId)
    .in('workout_id', workoutIds)
    .neq('status', 'abandoned')
    .order('started_at', { ascending: false });

  const map = new Map<string, WorkoutHistoryStatus>();
  for (const row of (data as { workout_id: string; status: WorkoutHistoryStatus }[]) ?? []) {
    if (!map.has(row.workout_id)) map.set(row.workout_id, row.status);
  }
  return map;
}

async function fetchHistoryIdForWorkout(userId: string, workoutId: string): Promise<{ id: string; status: WorkoutHistoryStatus } | null> {
  const { data } = await supabase
    .from('workout_history')
    .select('id, status')
    .eq('user_id', userId)
    .eq('workout_id', workoutId)
    .neq('status', 'abandoned')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; status: WorkoutHistoryStatus } | null;
}

export const workoutExecutionService = {
  async getTodaysWorkout(userId: string): Promise<TodaysWorkoutResult> {
    if (!(await assertOwnSession(userId))) return { status: 'not_authorized' };

    const { data: program } = await supabase
      .from('workout_programs')
      .select('id, start_date, duration_weeks')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (!program) return { status: 'no_active_programme' };

    const today = new Date();
    const startDate = parseLocalDateOnly(program.start_date);
    const weekNumber = resolveWeekNumber(startDate, today);
    if (weekNumber < 1 || weekNumber > program.duration_weeks) return { status: 'programme_complete' };

    const { data: weekRow } = await supabase
      .from('workout_program_weeks')
      .select('id')
      .eq('program_id', program.id)
      .eq('week_number', weekNumber)
      .maybeSingle();
    if (!weekRow) return { status: 'programme_complete' };

    const { data: weekWorkouts } = await supabase
      .from('workouts')
      .select('id, title, day_of_week')
      .eq('program_week_id', weekRow.id);
    const rows = (weekWorkouts as WeekWorkoutRow[]) ?? [];
    if (rows.length === 0) return { status: 'rest_day' };

    const historyStatus = await fetchHistoryStatusByWorkoutId(userId, rows.map(w => w.id));
    const resolution = resolveTodaysWorkout(rows, weekStartDate(startDate, weekNumber), today, historyStatus);

    switch (resolution.status) {
      case 'rest_day':
        return {
          status: 'rest_day',
          nextWorkoutTitle: resolution.nextWorkout?.workout.title,
          nextWorkoutDate: resolution.nextWorkout ? resolution.nextWorkout.date.toISOString().slice(0, 10) : undefined,
        };
      case 'missed':
        return { status: 'missed', workoutId: resolution.workout!.id, title: resolution.workout!.title };
      case 'scheduled':
        return { status: 'scheduled', workoutId: resolution.workout!.id, title: resolution.workout!.title };
      case 'in_progress':
      case 'completed': {
        const hist = await fetchHistoryIdForWorkout(userId, resolution.workout!.id);
        return { status: resolution.status, workoutId: resolution.workout!.id, title: resolution.workout!.title, historyId: hist!.id };
      }
    }
  },

  /** Idempotent: starts a new session, resumes an in-progress one, or reports an already-completed one for read-only reopening — never creates a duplicate. */
  async startWorkout(userId: string, workoutId: string): Promise<{ status: 'started' | 'resumed' | 'already_completed'; historyId: string } | { status: 'not_authorized' }> {
    if (!(await assertOwnSession(userId))) return { status: 'not_authorized' };

    const existing = await fetchHistoryIdForWorkout(userId, workoutId);
    if (existing?.status === 'completed') return { status: 'already_completed', historyId: existing.id };
    if (existing?.status === 'in_progress') return { status: 'resumed', historyId: existing.id };

    const { data, error } = await supabase
      .from('workout_history')
      .insert({ user_id: userId, workout_id: workoutId, status: 'in_progress', started_at: new Date().toISOString() })
      .select('id')
      .single();

    if (error || !data) {
      // Race: another concurrent Start already created the in-progress row —
      // the unique index rejected this insert. Resolve to that row instead
      // of surfacing an error, so a double-tap still resumes cleanly.
      const raced = await fetchHistoryIdForWorkout(userId, workoutId);
      if (raced) return { status: raced.status === 'completed' ? 'already_completed' : 'resumed', historyId: raced.id };
      throw error ?? new Error('Failed to start workout');
    }
    return { status: 'started', historyId: data.id };
  },

  /** Existing logged sets for a session — used to hydrate the UI when resuming. */
  async getLoggedSets(historyId: string): Promise<{ exerciseId: string; setNumber: number; reps: number | null; weightKg: number | null }[]> {
    const { data } = await supabase
      .from('workout_set_logs')
      .select('exercise_id, set_number, reps, weight_kg')
      .eq('workout_history_id', historyId)
      .order('set_number');
    return ((data as any[]) ?? []).map(r => ({ exerciseId: r.exercise_id, setNumber: r.set_number, reps: r.reps, weightKg: r.weight_kg }));
  },

  /** Upserts one set's actual performance — called on every "mark set done" so partial progress always survives leaving the screen (section 13). */
  async saveSet(
    userId: string, historyId: string, exerciseId: string, setNumber: number,
    performance: { reps: number | null; weightKg: number | null; restSecondsActual?: number | null },
  ): Promise<void> {
    await supabase.from('workout_set_logs').upsert(
      {
        user_id: userId, workout_history_id: historyId, exercise_id: exerciseId, set_number: setNumber,
        reps: performance.reps, weight_kg: performance.weightKg, rest_seconds_actual: performance.restSecondsActual ?? null,
      },
      { onConflict: 'workout_history_id,exercise_id,set_number' },
    );
  },

  /** Marks the session complete, computing completion % from prescribed vs logged sets (activity blocks — zero prescribed sets — are always 100% once marked done). Idempotent: re-calling on an already-completed session is a no-op. */
  async completeWorkout(
    userId: string, historyId: string, workoutId: string,
    input: { actualDurationMinutes: number },
  ): Promise<{ completionPercentage: number }> {
    const { data: existing } = await supabase.from('workout_history').select('status, completion_percentage').eq('id', historyId).single();
    if (existing?.status === 'completed') return { completionPercentage: existing.completion_percentage ?? 0 };

    const { data: workoutExercises } = await supabase.from('workout_exercises').select('sets').eq('workout_id', workoutId);
    const plannedSets = (workoutExercises ?? []).reduce((sum, w: any) => sum + (w.sets ?? 0), 0);

    let completionPercentage = 100;
    if (plannedSets > 0) {
      const { count } = await supabase
        .from('workout_set_logs')
        .select('id', { count: 'exact', head: true })
        .eq('workout_history_id', historyId);
      completionPercentage = calculateCompletionPercentage(plannedSets, count ?? 0);
    }

    await supabase
      .from('workout_history')
      .update({
        status: 'completed', completed_at: new Date().toISOString(),
        duration_minutes: input.actualDurationMinutes, completion_percentage: completionPercentage,
      })
      .eq('id', historyId)
      .eq('user_id', userId);

    return { completionPercentage };
  },

  async setPerceivedDifficulty(userId: string, historyId: string, difficulty: PerceivedDifficulty): Promise<void> {
    await supabase.from('workout_history').update({ perceived_difficulty: difficulty }).eq('id', historyId).eq('user_id', userId);
  },

  async getWorkoutSummary(historyId: string) {
    const { data } = await supabase
      .from('workout_history')
      .select('id, workout_id, duration_minutes, completion_percentage, perceived_difficulty, completed_at, workouts ( title, is_activity_block )')
      .eq('id', historyId)
      .single();
    const { count: setsLogged } = await supabase
      .from('workout_set_logs')
      .select('id', { count: 'exact', head: true })
      .eq('workout_history_id', historyId);
    return { history: data, setsLogged: setsLogged ?? 0 };
  },
};
