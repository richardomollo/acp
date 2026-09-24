// Lana Chat V1 — structured evidence context for one user. Read-only,
// service-role. Composes ALREADY-EXISTING Lana Intelligence surfaces
// (fitness_profile.ai_assessment, the Day 9 execution-evidence reconciler,
// coaching_memory, the nutrition planning tables, and the nutrition_day
// view) — this file adds no new nutrition or fitness arithmetic of its own,
// it only reads and reshapes what those systems already computed and
// persisted (§1/§8's own "do not duplicate intelligence" instruction).
//
// The one number this file cannot honestly resolve itself is the
// personalised protein target (apps/mobile's nutrition-reference-engine
// resolves it from a multi-source body-weight/age/sex lookup that only
// exists mobile-side, and re-deriving it here would BE the duplication
// this task forbids) — the caller passes it through as an
// already-computed value, exactly like nutrition-coaching's client-built
// `opportunities` payload.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildActivityExecutionEvidence, type ExecutionRecordInput, type WorkoutExecutionSignal } from '../weekly-adaptation/execution.ts';
import type { StartingPlanActivity } from '../onboarding-assessment/assessment.ts';

export type WorkoutStatus = 'completed' | 'partial' | 'skipped' | 'planned' | 'rest_day' | 'unknown';

export interface LanaChatContext {
  user: {
    goal: string | null;
    fitnessLevel: string | null;
  };
  today: {
    plannedWorkout: { title: string; category: string; intensity: string; durationMinutes: number } | null;
    workoutStatus: WorkoutStatus;
    plannedMeals: { slot: string; label: string; status: string }[];
  };
  fitness: {
    weekStartDate: string | null;
    weekEndDate: string | null;
    recentCompletion: { weeksUsed: number; planned: number; completed: number; completionRate: number; trendDirection: string } | null;
    supportedPatterns: { subject: string; kind: 'success' | 'difficulty'; confidence: string; message: string }[];
  };
  nutrition: {
    proteinTargetG: { min: number; max: number } | null;
    consumedTodayKcal: number | null;
    consumedTodayProteinG: number | null;
    weeklyObjective: string | null;
    weeklyObjectiveReason: string | null;
    weeklyObjectiveTheme: string | null;
    recentProteinEvidence: { daysWithLogs: number; averageProteinG: number | null } | null;
  };
}

export interface BuildContextDeps {
  supabase?: SupabaseClient;
  today?: string; // YYYY-MM-DD override for tests
}

function defaultSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SUCCESS_TYPES = new Set(['category_success', 'day_success', 'duration_success']);
const DIFFICULTY_TYPES = new Set(['category_difficulty', 'day_difficulty', 'duration_difficulty']);
// Test H — a single session/week must never read as a durable pattern.
// coaching_memory already confidence-gates at write time; this is a second,
// independent floor at the read layer so an 'emerging' row (deliberately
// not yet a stated fact anywhere else in the app either — see mobile's
// lib/coaching-memory.ts formatCoachingPatterns) never reaches the model.
const PATTERN_CONFIDENCE_FLOOR = new Set(['moderate', 'strong']);
const MAX_PATTERNS = 3;

export async function buildLanaChatContext(
  userId: string,
  proteinTargetG: { min: number; max: number } | null,
  deps: BuildContextDeps = {},
): Promise<LanaChatContext> {
  const supabase = deps.supabase ?? defaultSupabase();
  const today = deps.today ?? todayIso();
  const weekAgo = addDaysIso(today, -7);
  const yesterday = addDaysIso(today, -1);

  const [{ data: profile }, { data: currentWeek }, { data: plannedMealRows }, { data: memoryRows }, { data: todayNutrition }, { data: recentNutritionDays }] = await Promise.all([
    supabase.from('fitness_profile')
      .select('goal, experience_level, ai_assessment, ai_assessment_generated_at')
      .eq('user_id', userId).maybeSingle(),
    supabase.from('nutrition_weekly_plans')
      .select('objective, objective_reason, objective_theme')
      .eq('user_id', userId).eq('status', 'current').maybeSingle(),
    supabase.from('nutrition_planned_meals')
      .select('meal_slot, planned_label, status')
      .eq('user_id', userId).eq('local_date', today),
    supabase.from('coaching_memory')
      .select('memory_type, subject, confidence, evidence, user_message')
      .eq('user_id', userId).eq('active', true),
    supabase.from('nutrition_day').select('entry_count, energy_kcal, protein_g').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    supabase.from('nutrition_day').select('local_date, entry_count, protein_g').eq('user_id', userId).gte('local_date', weekAgo).lte('local_date', yesterday),
  ]);

  // ── today.plannedWorkout / workoutStatus — reuses the Day 9 execution
  // evidence reconciler for exactly ONE activity (today's), rather than the
  // full weekly aggregation this file has no need for.
  let plannedWorkout: LanaChatContext['today']['plannedWorkout'] = null;
  let workoutStatus: WorkoutStatus = 'unknown';
  const assessment = profile?.ai_assessment as { starting_plan?: { activities?: StartingPlanActivity[] } } | null;
  const currentPlanId = profile?.ai_assessment_generated_at as string | undefined;
  const activities = assessment?.starting_plan?.activities ?? [];
  const activityIndex = activities.findIndex(a => a.planned_date === today);

  if (activityIndex === -1) {
    workoutStatus = activities.length > 0 ? 'rest_day' : 'unknown';
  } else {
    const activity = activities[activityIndex];
    plannedWorkout = {
      title: activity.title, category: activity.category, intensity: activity.intensity,
      durationMinutes: Number.isFinite(activity.duration_minutes) ? activity.duration_minutes : 0,
    };
    if (currentPlanId) {
      const [{ data: completions }, { data: executionRows }] = await Promise.all([
        supabase.from('plan_activity_completions')
          .select('activity_index').eq('user_id', userId).eq('plan_id', currentPlanId).eq('activity_index', activityIndex),
        supabase.from('plan_activity_execution')
          .select('execution_status, difficulty, skip_reason, actual_duration_minutes')
          .eq('user_id', userId).eq('plan_id', currentPlanId).eq('activity_index', activityIndex).maybeSingle(),
      ]);
      const isCompleted = (completions ?? []).length > 0;
      const record: ExecutionRecordInput | undefined = executionRows ? {
        activityIndex,
        executionStatus: executionRows.execution_status,
        difficulty: executionRows.difficulty ?? null,
        skipReason: executionRows.skip_reason ?? null,
        actualDurationMinutes: executionRows.actual_duration_minutes ?? null,
      } : undefined;
      const workout: WorkoutExecutionSignal | undefined = undefined; // no linked-workout signal lookup — §1's "quick MVP" scope
      const evidence = buildActivityExecutionEvidence(activity, activityIndex, isCompleted, record, workout);
      workoutStatus = evidence.status as WorkoutStatus;
    }
  }

  // ── fitness.recentCompletion / supportedPatterns — coaching_memory rows,
  // already computed & persisted server-side during weekly adaptation.
  const overall = (memoryRows ?? []).find(r => r.memory_type === 'overall_summary');
  const recentCompletion: LanaChatContext['fitness']['recentCompletion'] = overall ? (() => {
    const e = overall.evidence as {
      window?: { weeks_used?: number };
      overall?: { planned_sessions?: number; completed_sessions?: number; completion_rate?: number };
      trend?: { direction?: string };
    };
    return {
      weeksUsed: e.window?.weeks_used ?? 0,
      planned: e.overall?.planned_sessions ?? 0,
      completed: e.overall?.completed_sessions ?? 0,
      completionRate: e.overall?.completion_rate ?? 0,
      trendDirection: e.trend?.direction ?? 'insufficient_data',
    };
  })() : null;

  const supportedPatterns = (memoryRows ?? [])
    .filter(r => (SUCCESS_TYPES.has(r.memory_type) || DIFFICULTY_TYPES.has(r.memory_type)) && PATTERN_CONFIDENCE_FLOOR.has(r.confidence))
    .slice(0, MAX_PATTERNS)
    .map(r => ({
      subject: r.subject, kind: (SUCCESS_TYPES.has(r.memory_type) ? 'success' : 'difficulty') as 'success' | 'difficulty',
      confidence: r.confidence, message: r.user_message ?? '',
    }));

  // ── nutrition — today's totals only when there's real logged evidence
  // (entry_count > 0); a no-log day stays null, never a fabricated 0
  // (Test F). Weekly objective/reason are already-persisted evidence
  // (nutrition_weekly_plans.objective_reason IS the "why" — no adaptation
  // logic re-run here).
  const hasLoggedToday = !!todayNutrition && todayNutrition.entry_count > 0;
  const loggedDays = (recentNutritionDays ?? []).filter(d => d.entry_count > 0);

  return {
    user: {
      goal: profile?.goal ?? null,
      fitnessLevel: profile?.experience_level ?? null,
    },
    today: {
      plannedWorkout,
      workoutStatus,
      plannedMeals: (plannedMealRows ?? []).map(m => ({ slot: m.meal_slot, label: m.planned_label, status: m.status })),
    },
    fitness: {
      weekStartDate: assessment?.starting_plan && (assessment.starting_plan as any).week_start_date || null,
      weekEndDate: assessment?.starting_plan && (assessment.starting_plan as any).week_end_date || null,
      recentCompletion,
      supportedPatterns,
    },
    nutrition: {
      proteinTargetG,
      consumedTodayKcal: hasLoggedToday ? Number(todayNutrition!.energy_kcal) : null,
      consumedTodayProteinG: hasLoggedToday ? Number(todayNutrition!.protein_g) : null,
      weeklyObjective: currentWeek?.objective ?? null,
      weeklyObjectiveReason: currentWeek?.objective_reason ?? null,
      weeklyObjectiveTheme: currentWeek?.objective_theme ?? null,
      recentProteinEvidence: loggedDays.length > 0 ? {
        daysWithLogs: loggedDays.length,
        averageProteinG: Math.round(loggedDays.reduce((s, d) => s + Number(d.protein_g), 0) / loggedDays.length),
      } : null,
    },
  };
}
