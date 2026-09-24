// buildLanaChatContext — tested against an injected fake Supabase client
// (no real DB), proving the honesty rules a chat context must never break:
// a planned workout is never reported as completed without real completion
// evidence (Test G), a no-log nutrition day is never reported as zero
// (Test F), and a single emerging-confidence coaching pattern never reaches
// the model as a durable pattern (Test H).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildLanaChatContext } from '../context.ts';

type TableData = Record<string, { single?: unknown; list?: unknown[] }>;

function fakeChain(result: { single?: unknown; list?: unknown[] } | undefined) {
  const obj: any = {
    select: () => obj,
    eq: () => obj,
    gte: () => obj,
    lte: () => obj,
    in: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: () => Promise.resolve({ data: result?.single ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: result?.list ?? [], error: null }).then(resolve, reject),
  };
  return obj;
}

function fakeSupabase(byTable: TableData) {
  return { from: (table: string) => fakeChain(byTable[table]) } as any;
}

const TODAY = '2026-09-23';

describe('buildLanaChatContext — honesty guarantees', () => {
  test('G. a planned workout with NO completion evidence is reported as planned, never completed', async () => {
    const byTable: TableData = {
      fitness_profile: {
        single: {
          goal: 'build_muscle', experience_level: 'intermediate',
          ai_assessment_generated_at: 'plan-1',
          ai_assessment: {
            starting_plan: {
              week_start_date: '2026-09-21', week_end_date: '2026-09-27',
              activities: [{ day: 'Wednesday', category: 'strength', activity: 'lift', duration_minutes: 45, intensity: 'moderate', title: 'Upper body', description: '', planned_date: TODAY }],
            },
          },
        },
      },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: null, list: [] },
      plan_activity_completions: { list: [] }, // no completion row at all
      plan_activity_execution: { single: null },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.ok(ctx.today.plannedWorkout);
    assert.equal(ctx.today.plannedWorkout?.title, 'Upper body');
    assert.equal(ctx.today.workoutStatus, 'planned');
    assert.notEqual(ctx.today.workoutStatus, 'completed');
  });

  test('a planned workout WITH a real completion row is reported as completed', async () => {
    const byTable: TableData = {
      fitness_profile: {
        single: {
          goal: 'build_muscle', experience_level: 'intermediate', ai_assessment_generated_at: 'plan-1',
          ai_assessment: {
            starting_plan: {
              activities: [{ day: 'Wednesday', category: 'strength', activity: 'lift', duration_minutes: 45, intensity: 'moderate', title: 'Upper body', description: '', planned_date: TODAY }],
            },
          },
        },
      },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: null, list: [] },
      plan_activity_completions: { list: [{ activity_index: 0 }] },
      plan_activity_execution: { single: null },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.today.workoutStatus, 'completed');
  });

  test('F. a no-log nutrition day today is represented as null, never a fabricated zero', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      // a row exists (view always returns one per logged local_date) but
      // with entry_count 0 — must NOT be treated as "ate 0 kcal/0g protein".
      nutrition_day: { single: { entry_count: 0, energy_kcal: 0, protein_g: 0 }, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.nutrition.consumedTodayKcal, null);
    assert.equal(ctx.nutrition.consumedTodayProteinG, null);
  });

  test('a real logged day is represented with its actual totals', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: { entry_count: 3, energy_kcal: 1450, protein_g: 88 }, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.nutrition.consumedTodayKcal, 1450);
    assert.equal(ctx.nutrition.consumedTodayProteinG, 88);
  });

  test('H. a single emerging-confidence pattern never reaches the model as a durable pattern', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [{ memory_type: 'category_success', subject: 'strength', confidence: 'emerging', evidence: {}, user_message: 'One good strength session so far.' }] },
      nutrition_day: { single: null, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.deepEqual(ctx.fitness.supportedPatterns, []);
  });

  test('a moderate+ confidence pattern DOES reach the model', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [{ memory_type: 'category_success', subject: 'strength', confidence: 'strong', evidence: {}, user_message: 'Strength sessions are consistently completed.' }] },
      nutrition_day: { single: null, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.fitness.supportedPatterns.length, 1);
    assert.equal(ctx.fitness.supportedPatterns[0].confidence, 'strong');
  });

  test('a brand-new user with no fitness_profile row at all resolves every field safely to null/empty, never throws', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: null, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.user.goal, null);
    assert.equal(ctx.today.plannedWorkout, null);
    assert.equal(ctx.today.workoutStatus, 'unknown');
    assert.equal(ctx.fitness.recentCompletion, null);
    assert.equal(ctx.nutrition.weeklyObjective, null);
  });

  test('the already-persisted weekly objective + reason pass through verbatim (no re-derivation)', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: { objective: 'Focus on protein', objective_reason: 'Carried forward: below target on 4 of 6 days', objective_theme: 'protein_consistency' } },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: null, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', null, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.equal(ctx.nutrition.weeklyObjective, 'Focus on protein');
    assert.match(ctx.nutrition.weeklyObjectiveReason ?? '', /Carried forward/);
  });

  test('a client-supplied protein target passes through unchanged (the one trusted client-computed fact)', async () => {
    const byTable: TableData = {
      fitness_profile: { single: null },
      nutrition_weekly_plans: { single: null },
      nutrition_planned_meals: { list: [] },
      coaching_memory: { list: [] },
      nutrition_day: { single: null, list: [] },
    };
    const ctx = await buildLanaChatContext('u1', { min: 112, max: 160 }, { supabase: fakeSupabase(byTable), today: TODAY });
    assert.deepEqual(ctx.nutrition.proteinTargetG, { min: 112, max: 160 });
  });
});
