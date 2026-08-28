// ACP Intelligence™ Day 5 — orchestrates the weekly check-in + adaptation
// loop. UI calls only this. Never mutates historical/past weeks — every
// mutator below only ever touches workout_program_weeks with
// week_number >= the target week, and workouts/workout_exercises linked to
// them (Day 2's programme-week model already makes "future" unambiguous).
import { supabase } from '@/lib/supabase';
import { authService } from './auth';
import { exerciseService } from './exercise-service';
import {
  parseLocalDateOnly, resolveWeekNumber,
} from '@/lib/workout-execution';
import { evaluateAdaptation } from '@/lib/adaptation-engine';
import { getProgressSnapshot } from './progress-service';
import type { WeeklyCheckIn, AdaptationDecision, AdaptationContext } from '@/lib/adaptation-types';

async function assertOwnSession(userId: string): Promise<boolean> {
  const session = await authService.getSession();
  return session?.user.id === userId;
}

interface ActiveProgramRow {
  id: string; source: string; goal: string; start_date: string;
  duration_weeks: number; sessions_per_week: number; session_duration_minutes: number;
}

async function fetchActiveProgram(userId: string): Promise<ActiveProgramRow | null> {
  const { data } = await supabase
    .from('workout_programs')
    .select('id, source, goal, start_date, duration_weeks, sessions_per_week, session_duration_minutes')
    .eq('user_id', userId).eq('status', 'active').maybeSingle();
  return data as ActiveProgramRow | null;
}

export interface DueCheckIn { programId: string; weekNumber: number }

/** A check-in is due once at least one full programme week has elapsed and hasn't been checked in on yet. */
export async function getDueCheckIn(userId: string): Promise<DueCheckIn | null> {
  if (!(await assertOwnSession(userId))) return null;
  const program = await fetchActiveProgram(userId);
  if (!program) return null;

  const currentWeek = resolveWeekNumber(parseLocalDateOnly(program.start_date), new Date());
  const evaluationWeek = currentWeek - 1;
  if (evaluationWeek < 1) return null;

  const { data: existing } = await supabase
    .from('workout_program_checkins').select('id')
    .eq('user_id', userId).eq('program_id', program.id).eq('week_number', evaluationWeek).maybeSingle();
  if (existing) return null;

  return { programId: program.id, weekNumber: evaluationWeek };
}

/** Idempotent — resubmitting for the same (user, programme, week) updates rather than duplicates (UNIQUE constraint + upsert). */
export async function submitWeeklyCheckIn(
  userId: string, programId: string, weekNumber: number, checkIn: WeeklyCheckIn,
): Promise<{ checkinId: string } | { error: string }> {
  if (!(await assertOwnSession(userId))) return { error: 'Not authorized' };
  const { data, error } = await supabase
    .from('workout_program_checkins')
    .upsert(
      {
        user_id: userId, program_id: programId, week_number: weekNumber,
        difficulty: checkIn.difficulty, energy: checkIn.energy,
        pain_reported: checkIn.painReported, schedule_changed: checkIn.scheduleChanged,
      },
      { onConflict: 'user_id,program_id,week_number' },
    )
    .select('id').single();
  if (error || !data) return { error: error?.message ?? 'Failed to save check-in' };
  return { checkinId: data.id };
}

// ── Mutators — each touches ONLY workouts/workout_exercises belonging to ────
// weeks with week_number >= targetWeek. Bounded, single-parameter changes,
// never a blanket percentage sweep (section 9/10).

const MAX_REPS = 15;
const MIN_SETS = 2;
const MIN_DURATION_MINUTES = 20;
const DURATION_STEP_MINUTES = 5;
const REP_STEP = 2;

// A fixed, deterministic day rotation — reschedule shifts every future
// week's workouts to the next slot in this sequence, preserving order and
// session count (section 12). Documented V1 simplification: there's no
// "which day works better" input from the check-in yet, so this rotates by
// a fixed +1 day offset rather than targeting a specific new day.
const DAY_ROTATION: Record<string, string> = {
  monday: 'tuesday', tuesday: 'wednesday', wednesday: 'thursday', thursday: 'friday',
  friday: 'saturday', saturday: 'sunday', sunday: 'monday',
};

async function futureWeekIds(programId: string, targetWeek: number): Promise<string[]> {
  const { data } = await supabase.from('workout_program_weeks').select('id').eq('program_id', programId).gte('week_number', targetWeek);
  return (data ?? []).map((w: any) => w.id);
}

async function futureWorkouts(weekIds: string[]) {
  if (weekIds.length === 0) return [];
  const { data } = await supabase.from('workouts').select('id, is_activity_block, duration_minutes, day_of_week').in('program_week_id', weekIds).eq('is_active', true);
  return (data as any[]) ?? [];
}

async function applyProgress(workoutIds: string[]) {
  if (workoutIds.length === 0) return;
  const { data: rows } = await supabase.from('workout_exercises').select('id, reps').in('workout_id', workoutIds).not('reps', 'is', null);
  for (const row of (rows as any[]) ?? []) {
    await supabase.from('workout_exercises').update({ reps: Math.min(MAX_REPS, row.reps + REP_STEP) }).eq('id', row.id);
  }
}

async function applyRegress(workoutIds: string[]) {
  if (workoutIds.length === 0) return;
  const { data: rows } = await supabase.from('workout_exercises').select('id, sets').in('workout_id', workoutIds).not('sets', 'is', null);
  for (const row of (rows as any[]) ?? []) {
    await supabase.from('workout_exercises').update({ sets: Math.max(MIN_SETS, row.sets - 1) }).eq('id', row.id);
  }
}

async function applyChangeVolume(workouts: { id: string; duration_minutes: number }[]) {
  for (const w of workouts) {
    await supabase.from('workouts').update({ duration_minutes: Math.max(MIN_DURATION_MINUTES, w.duration_minutes - DURATION_STEP_MINUTES) }).eq('id', w.id);
  }
}

const INTENSITY_UP_NOTE = 'ACP progression: aim for the top of your rep range, or add slight resistance where possible.';
const INTENSITY_DOWN_NOTE = 'ACP adjustment: ease off slightly — prioritise good form over pushing hard this week.';

async function applyChangeIntensity(workoutIds: string[], direction: 'up' | 'down') {
  if (workoutIds.length === 0) return;
  const { data: rows } = await supabase.from('workout_exercises').select('id').in('workout_id', workoutIds);
  const note = direction === 'up' ? INTENSITY_UP_NOTE : INTENSITY_DOWN_NOTE;
  for (const row of (rows as any[]) ?? []) {
    await supabase.from('workout_exercises').update({ notes: note }).eq('id', row.id);
  }
}

async function applyReschedule(workouts: { id: string; day_of_week: string }[]) {
  for (const w of workouts) {
    const nextDay = DAY_ROTATION[w.day_of_week] ?? w.day_of_week;
    await supabase.from('workouts').update({ day_of_week: nextDay }).eq('id', w.id);
  }
}

/** Approximate substitution: reuses the declining exercise's own persisted body_part/target_muscle/difficulty as the search filter — Day 2 doesn't persist per-slot movement-pattern metadata, so this is the closest available signal, documented as a known V1 limitation. */
async function applySubstitute(workoutIds: string[], decliningExerciseId: string) {
  if (workoutIds.length === 0) return;
  const { data: original } = await supabase.from('exercises').select('id, body_part, target_muscle, equipment, difficulty, source, external_id').eq('id', decliningExerciseId).maybeSingle();
  if (!original) return;

  const candidates = await exerciseService.search({ bodyPart: original.body_part ?? undefined, difficulty: original.difficulty ?? undefined }).catch(() => []);
  const replacement = candidates.find(c => !(c.provider === original.source && c.id === original.external_id));
  if (!replacement) return;

  const { data: persisted } = await supabase
    .from('exercises')
    .upsert(
      { name: replacement.name, body_part: replacement.bodyPart, target_muscle: replacement.target, equipment: replacement.equipment, difficulty: replacement.difficulty, instructions: replacement.instructions, external_id: replacement.id, source: replacement.provider },
      { onConflict: 'source,external_id' },
    ).select('id').single();
  if (!persisted) return;

  await supabase.from('workout_exercises').update({ exercise_id: persisted.id }).in('workout_id', workoutIds).eq('exercise_id', decliningExerciseId);
}

async function applyDecision(programId: string, targetWeek: number, decision: AdaptationDecision, decliningExerciseId?: string) {
  const weekIds = await futureWeekIds(programId, targetWeek);
  const workouts = await futureWorkouts(weekIds);
  const strengthWorkoutIds = workouts.filter(w => !w.is_activity_block).map(w => w.id);

  switch (decision.type) {
    case 'PROGRESS': return applyProgress(strengthWorkoutIds);
    case 'REGRESS': return applyRegress(strengthWorkoutIds);
    case 'CHANGE_VOLUME': return applyChangeVolume(workouts.map(w => ({ id: w.id, duration_minutes: w.duration_minutes })));
    case 'CHANGE_INTENSITY': return applyChangeIntensity(strengthWorkoutIds, decision.reason.includes('nudges') || decision.reason.includes('progression') ? 'up' : 'down');
    case 'RESCHEDULE': return applyReschedule(workouts.map(w => ({ id: w.id, day_of_week: w.day_of_week })));
    case 'SUBSTITUTE': return decliningExerciseId ? applySubstitute(strengthWorkoutIds, decliningExerciseId) : undefined;
    case 'KEEP': case 'INSUFFICIENT_EVIDENCE': return;
  }
}

export interface EvaluateAndApplyResult {
  decisions: AdaptationDecision[];
  applied: boolean;
  memberMessage: string;
}

const DECISION_MEMBER_HEADLINE: Record<string, string> = {
  KEEP: 'Your plan stays the same',
  PROGRESS: 'ACP progressed next week',
  REGRESS: 'ACP made next week more manageable',
  CHANGE_VOLUME: 'ACP simplified next week',
  CHANGE_INTENSITY: 'ACP adjusted next week’s intensity',
  RESCHEDULE: 'ACP updated your schedule',
  SUBSTITUTE: 'ACP swapped an exercise',
  INSUFFICIENT_EVIDENCE: 'ACP needs a bit more data',
};

export async function evaluateAndApplyAdaptation(userId: string, programId: string, weekNumber: number): Promise<EvaluateAndApplyResult | { error: string }> {
  if (!(await assertOwnSession(userId))) return { error: 'Not authorized' };

  const program = await fetchActiveProgram(userId);
  if (!program || program.id !== programId) return { error: 'Programme not found' };

  const { data: checkinRow } = await supabase
    .from('workout_program_checkins').select('difficulty, energy, pain_reported, schedule_changed')
    .eq('user_id', userId).eq('program_id', programId).eq('week_number', weekNumber).maybeSingle();
  if (!checkinRow) return { error: 'No check-in found for this week' };

  const progress = await getProgressSnapshot(userId);
  if (!progress) return { error: 'Could not load progress' };

  const { data: lastAdaptation } = await supabase
    .from('workout_program_adaptations').select('week_number')
    .eq('program_id', programId).order('week_number', { ascending: false }).limit(1).maybeSingle();

  const currentWeek = resolveWeekNumber(parseLocalDateOnly(program.start_date), new Date());
  const targetWeek = weekNumber + 1;

  const context: AdaptationContext = {
    progress,
    checkIn: {
      difficulty: checkinRow.difficulty, energy: checkinRow.energy,
      painReported: checkinRow.pain_reported, scheduleChanged: checkinRow.schedule_changed,
    },
    programme: {
      source: program.source as any, sessionsPerWeek: program.sessions_per_week,
      sessionDurationMinutes: program.session_duration_minutes, currentWeek,
      durationWeeks: program.duration_weeks, lastAdaptedWeek: lastAdaptation?.week_number ?? null,
    },
  };

  const evaluation = evaluateAdaptation(context);
  const primary = evaluation.decisions[0];
  const decliningExercise = progress.performance.exerciseTrends.find(t => t.direction === 'decreased');

  const beforeState = {
    sessions_per_week: program.sessions_per_week, session_duration_minutes: program.session_duration_minutes,
  };

  let applied = false;
  let afterState: Record<string, unknown> | null = null;

  if (evaluation.canApplyAutomatically && targetWeek <= program.duration_weeks && primary.type !== 'KEEP' && primary.type !== 'INSUFFICIENT_EVIDENCE') {
    await applyDecision(programId, targetWeek, primary, decliningExercise?.exerciseId);
    applied = true;
    afterState = { decision: primary.type, target_week: targetWeek };
  }

  await supabase.from('workout_program_adaptations').upsert(
    {
      user_id: userId, program_id: programId, week_number: weekNumber,
      decision_types: evaluation.decisions.map(d => d.type),
      reason: primary.reason,
      signals_used: evaluation.signalsUsed,
      before_state: beforeState,
      after_state: afterState,
      applied,
      source: program.source,
    },
    { onConflict: 'user_id,program_id,week_number' },
  );

  const memberMessage = evaluation.canApplyAutomatically
    ? primary.reason
    : `${primary.reason} Your trainer can review this with you — ACP won't modify a trainer-created programme automatically.`;

  return { decisions: evaluation.decisions, applied, memberMessage };
}

export function memberHeadlineFor(decisionType: string, applied: boolean): string {
  if (!applied && decisionType !== 'KEEP' && decisionType !== 'INSUFFICIENT_EVIDENCE') return 'Insight ready for your trainer';
  return DECISION_MEMBER_HEADLINE[decisionType] ?? 'Your plan stays the same';
}

export async function getLatestAdaptation(userId: string, programId: string) {
  const { data } = await supabase
    .from('workout_program_adaptations').select('*')
    .eq('user_id', userId).eq('program_id', programId)
    .order('week_number', { ascending: false }).limit(1).maybeSingle();
  return data;
}
