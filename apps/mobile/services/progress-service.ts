// ACP Intelligence™ Day 4 — the one service boundary for Progress
// Intelligence. Fetches persisted data and hands it to the pure calculation
// layer (lib/progress-calculations.ts) — no aggregation logic lives here.
// Read-only: never writes to workout_programs/workouts/workout_history.
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import {
  parseLocalDateOnly, resolveWeekNumber, weekStartDate, dateForDayInWeek, formatLocalDateOnly,
} from '@/lib/workout-execution';
import {
  calculateBehaviouralProgress, calculateExerciseTrend, calculateActivityTrend,
  selectBaselineMeasurement, calculateMetricTrend, groupSetLogsBySessionAndExercise,
  type HistoryOutcome, type MeasurementPoint,
} from '@/lib/progress-calculations';
import type { ProgressSnapshot } from '@/lib/progress-types';
import { computeStreak } from './fitnessStats';

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

const WORKOUT_TYPE_LABEL: Record<string, string> = {
  run_easy: 'run', run_intervals: 'interval run', cardio_mobility: 'cardio & mobility',
};

export async function getProgressSnapshot(userId: string): Promise<ProgressSnapshot | null> {
  if (!(await assertOwnSession(userId))) return null;

  const today = new Date();
  const todayStr = formatLocalDateOnly(today);

  const { data: program } = await supabase
    .from('workout_programs')
    .select('id, source, goal, start_date, duration_weeks')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  // ── Behavioural + performance (both depend on having an active programme) ──
  let eligibleAll: { id: string; date: string; is_activity_block: boolean; workout_type: string | null }[] = [];
  let historyByWorkoutId = new Map<string, HistoryOutcome>();
  let exerciseTrends: ProgressSnapshot['performance']['exerciseTrends'] = [];
  let activityTrends: ProgressSnapshot['performance']['activityTrends'] = [];

  if (program) {
    const startDate = parseLocalDateOnly(program.start_date);
    const currentWeek = Math.min(resolveWeekNumber(startDate, today), program.duration_weeks);

    const { data: weeks } = await supabase
      .from('workout_program_weeks').select('id, week_number').eq('program_id', program.id).lte('week_number', currentWeek);
    const weekIds = (weeks ?? []).map((w: any) => w.id);
    const weekNumberById = new Map((weeks ?? []).map((w: any) => [w.id, w.week_number]));

    const { data: allWorkouts } = weekIds.length
      ? await supabase.from('workouts').select('id, program_week_id, day_of_week, is_activity_block, workout_type').in('program_week_id', weekIds)
      : { data: [] as any[] };

    eligibleAll = ((allWorkouts as any[]) ?? [])
      .map(w => {
        const weekNum = weekNumberById.get(w.program_week_id);
        const date = formatLocalDateOnly(dateForDayInWeek(weekStartDate(startDate, weekNum), w.day_of_week));
        return { id: w.id, date, is_activity_block: w.is_activity_block, workout_type: w.workout_type };
      })
      .filter(w => w.date < todayStr); // today's own workout is excluded — see calculateBehaviouralProgress's docstring

    const workoutIds = eligibleAll.map(w => w.id);
    const { data: historyRows } = workoutIds.length
      ? await supabase.from('workout_history').select('id, workout_id, status, completion_percentage, duration_minutes').eq('user_id', userId).in('workout_id', workoutIds)
      : { data: [] as any[] };
    for (const h of (historyRows as any[]) ?? []) {
      historyByWorkoutId.set(h.workout_id, { status: h.status, completionPercentage: h.completion_percentage });
    }

    // Performance — strength exercises
    const strengthWorkoutIds = eligibleAll.filter(w => !w.is_activity_block).map(w => w.id);
    if (strengthWorkoutIds.length > 0) {
      const { data: weRows } = await supabase
        .from('workout_exercises').select('workout_id, exercise_id, exercises(name)').in('workout_id', strengthWorkoutIds);
      const exerciseNameById = new Map<string, string>();
      for (const we of (weRows as any[]) ?? []) exerciseNameById.set(we.exercise_id, we.exercises?.name ?? 'Exercise');
      const exerciseIds = [...exerciseNameById.keys()];

      const completedHistoryIds = ((historyRows as any[]) ?? []).filter(h => h.status === 'completed' && strengthWorkoutIds.includes(h.workout_id)).map(h => h.id);
      const sessionDateByHistoryId = new Map<string, string>();
      for (const w of eligibleAll) {
        const h = ((historyRows as any[]) ?? []).find(hr => hr.workout_id === w.id && hr.status === 'completed');
        if (h) sessionDateByHistoryId.set(h.id, w.date);
      }

      if (exerciseIds.length > 0 && completedHistoryIds.length > 0) {
        const { data: setLogs } = await supabase
          .from('workout_set_logs').select('workout_history_id, exercise_id, weight_kg, reps')
          .in('workout_history_id', completedHistoryIds).in('exercise_id', exerciseIds);
        const grouped = groupSetLogsBySessionAndExercise(
          ((setLogs as any[]) ?? []).map(l => ({ workoutHistoryId: l.workout_history_id, exerciseId: l.exercise_id, weightKg: l.weight_kg, reps: l.reps })),
          sessionDateByHistoryId,
        );
        exerciseTrends = [...grouped.entries()].map(([exerciseId, sessions]) =>
          calculateExerciseTrend(exerciseId, exerciseNameById.get(exerciseId) ?? 'Exercise', sessions));
      }
    }

    // Performance — activity blocks
    const activityTypes = [...new Set(eligibleAll.filter(w => w.is_activity_block && w.workout_type).map(w => w.workout_type!))];
    for (const type of activityTypes) {
      const rows = eligibleAll.filter(w => w.workout_type === type);
      const planned = rows.length;
      const completedRows = rows.filter(w => historyByWorkoutId.get(w.id)?.status === 'completed');
      const completed = completedRows.length;
      const durations = ((historyRows as any[]) ?? [])
        .filter(h => h.status === 'completed' && rows.some(r => r.id === h.workout_id) && typeof h.duration_minutes === 'number')
        .map(h => h.duration_minutes as number);
      activityTrends.push(calculateActivityTrend(type, WORKOUT_TYPE_LABEL[type] ?? type, planned, completed, durations));
    }
  }

  // Streak — reuses ALL completed workout_history (not just this programme's), matching fitness-journey.tsx's own definition.
  const { data: streakRows } = await supabase.from('workout_history').select('completed_at').eq('user_id', userId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(500);
  const { current: currentStreak } = computeStreak(((streakRows as any[]) ?? []).filter(r => r.completed_at).map(r => ({ completed_at: r.completed_at })));

  const behavioural = calculateBehaviouralProgress(eligibleAll, historyByWorkoutId, currentStreak);

  // ── Outcomes ────────────────────────────────────────────────────────────────
  const { data: measurementRows } = await supabase
    .from('client_measurements').select('logged_at, weight_kg, waist_cm, body_fat_percentage').eq('user_id', userId).order('logged_at', { ascending: true }).limit(500);
  const rows = (measurementRows as any[]) ?? [];
  const toPoints = (field: string): MeasurementPoint[] =>
    rows.filter(r => r[field] != null).map(r => ({ date: r.logged_at.slice(0, 10), value: r[field] }));

  const weightPoints = toPoints('weight_kg');
  const waistPoints = toPoints('waist_cm');
  const bodyFatPoints = toPoints('body_fat_percentage');

  const programStart = program ? parseLocalDateOnly(program.start_date) : (rows[0] ? parseLocalDateOnly(rows[0].logged_at.slice(0, 10)) : today);

  const weightTrend = calculateMetricTrend('weight', weightPoints, selectBaselineMeasurement(weightPoints, programStart), today);
  const waistTrend = calculateMetricTrend('waist', waistPoints, selectBaselineMeasurement(waistPoints, programStart), today);
  const bodyFatTrend = calculateMetricTrend('bodyFat', bodyFatPoints, selectBaselineMeasurement(bodyFatPoints, programStart), today);

  const hasEnoughPerformanceData = exerciseTrends.some(t => t.direction !== 'insufficient_data') || activityTrends.some(t => t.direction !== 'insufficient_data');
  const hasEnoughOutcomeData = [weightTrend, waistTrend, bodyFatTrend].some(t => t.direction !== 'insufficient_data');

  return {
    period: { start: program?.start_date ?? formatLocalDateOnly(programStart), end: todayStr },
    behavioural,
    performance: { exerciseTrends, activityTrends },
    outcomes: {
      weight: weightTrend.measurementCount > 0 ? weightTrend : undefined,
      waist: waistTrend.measurementCount > 0 ? waistTrend : undefined,
      bodyFat: bodyFatTrend.measurementCount > 0 ? bodyFatTrend : undefined,
    },
    programme: program ? { goal: program.goal, source: program.source, startedAt: program.start_date } : null,
    dataQuality: {
      hasEnoughBehaviouralData: behavioural.plannedWorkouts >= 2,
      hasEnoughPerformanceData,
      hasEnoughOutcomeData,
    },
  };
}
