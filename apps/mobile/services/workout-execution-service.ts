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

  // ── Beta Feedback #010 — plan-activity linkage ─────────────────────────────
  // When a workout is launched from the plan's own recommendation, finishing
  // it must move the CANONICAL plan state, not just workout_history — otherwise
  // Home keeps showing the activity as incomplete until the user separately
  // confirms a detected candidate. Both writes are best-effort and idempotent;
  // the completion flow never fails because of them (spec #010 §4, #011 §26).

  /**
   * Records the binary plan completion (source 'exercise_db' + the
   * workout_history id, so the weekly-adaptation can link this session's
   * perceived_difficulty / completion_percentage to the activity) plus a Day 9
   * execution row (status from completion %, actual duration, source 'workout').
   */
  async linkPlanActivityCompletion(args: {
    userId: string; planId: string; activityIndex: number; plannedDate: string;
    historyId: string; completionPercentage: number | null; durationMinutes: number | null;
  }): Promise<void> {
    const { userId, planId, activityIndex, plannedDate, historyId, completionPercentage, durationMinutes } = args;

    // plan_activity_completions has INSERT-only RLS (a completion is present or
    // not — no UPDATE policy), so this is ON CONFLICT DO NOTHING, never an
    // upsert: a second finish of the same activity is a silent no-op.
    await supabase.from('plan_activity_completions').upsert(
      {
        user_id: userId, plan_id: planId, activity_index: activityIndex,
        planned_date: plannedDate, completion_source: 'exercise_db', source_entity_id: historyId,
      },
      { onConflict: 'user_id,plan_id,activity_index', ignoreDuplicates: true },
    );

    const partial = completionPercentage != null && completionPercentage >= 30 && completionPercentage < 100;
    await supabase.from('plan_activity_execution').upsert(
      {
        user_id: userId, plan_id: planId, activity_index: activityIndex,
        execution_status: partial ? 'partial' : 'completed',
        actual_duration_minutes: durationMinutes != null && durationMinutes >= 0 ? Math.round(durationMinutes) : null,
        source: 'workout',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,plan_id,activity_index' },
    );
  },

  /** Maps a post-workout perceived-difficulty tap onto the linked activity's Day 9 execution row (easy→too_easy, difficult→too_hard). */
  async setPlanActivityDifficulty(args: {
    userId: string; planId: string; activityIndex: number; perceived: PerceivedDifficulty;
  }): Promise<void> {
    const MAP: Record<PerceivedDifficulty, 'too_easy' | 'about_right' | 'too_hard'> = {
      easy: 'too_easy', about_right: 'about_right', difficult: 'too_hard',
    };
    await supabase.from('plan_activity_execution').upsert(
      {
        user_id: args.userId, plan_id: args.planId, activity_index: args.activityIndex,
        difficulty: MAP[args.perceived], source: 'workout',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,plan_id,activity_index' },
    );
  },

  /**
   * The user's PREVIOUS logged sets for each of `exerciseIds`, from their most
   * recent *other* completed session — for deterministic actual-to-actual load
   * comparison in the session summary (#011 §22). Never fabricates progression:
   * an exercise with no prior data simply isn't in the returned map.
   */
  async getPreviousExerciseSets(
    userId: string, currentHistoryId: string, exerciseIds: string[],
  ): Promise<Record<string, { reps: number | null; weightKg: number | null }[]>> {
    if (exerciseIds.length === 0) return {};
    const { data } = await supabase
      .from('workout_set_logs')
      .select('exercise_id, set_number, reps, weight_kg, logged_at, workout_history:workout_history_id ( completed_at, status )')
      .eq('user_id', userId)
      .in('exercise_id', exerciseIds)
      .neq('workout_history_id', currentHistoryId)
      .order('logged_at', { ascending: false })
      .limit(300);

    const byExercise: Record<string, { reps: number | null; weightKg: number | null }[]> = {};
    // Rows arrive newest-first; keep only those from each exercise's single
    // most-recent completed session.
    const seenSessionForExercise: Record<string, string | null> = {};
    for (const row of ((data as any[]) ?? [])) {
      const wh = Array.isArray(row.workout_history) ? row.workout_history[0] : row.workout_history;
      if (!wh || wh.status !== 'completed') continue;
      const exId = row.exercise_id as string;
      const sessionKey = wh.completed_at as string;
      if (seenSessionForExercise[exId] == null) seenSessionForExercise[exId] = sessionKey;
      if (seenSessionForExercise[exId] !== sessionKey) continue; // a later (older) session — ignore
      (byExercise[exId] ??= []).push({ reps: row.reps, weightKg: row.weight_kg });
    }
    return byExercise;
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
