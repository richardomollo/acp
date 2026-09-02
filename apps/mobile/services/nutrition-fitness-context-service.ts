// ACP Intelligence™ — Nutrition N7. Fitness × Nutrition context service.
//
// Self-contained and read-only: given a user + their local "today", it loads
// the ACTUAL fitness completions and the N2/N3/N4 nutrition evidence for the
// 7- and 14-day windows, then hands both to the pure cross-domain layer.
// It never writes anything, never calls an LLM, and does NO work at all when
// the feature flag is off (§39). Never throws — any failure yields an empty
// observation list, so Today Nutrition is never blocked or broken.

import { supabase } from '@/lib/supabase';
import { isNutritionFitnessContextEnabled } from '@/lib/flags';
import { foodLogService } from '@/services/food-log-service';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { addLocalDays } from '@/lib/nutrition/nutrition-history';
import { buildNutritionPatterns } from '@/lib/nutrition/nutrition-patterns';
import { buildNutritionReferenceComparisons } from '@/lib/nutrition/nutrition-reference-engine';
import { buildNutritionCoachingOpportunities } from '@/lib/nutrition/nutrition-coaching-opportunity';
import {
  crossDomainWindow, buildFitnessDayEvidence, buildCrossDomainObservations,
  type CrossDomainNutritionObservation, type CompletedActivityInput, type CrossDomainWindow,
} from '@/lib/nutrition/nutrition-fitness-context';
import type { ActivityCategory } from '@/lib/ai-assessment';
import type { FoodLogEntry } from '@/lib/nutrition/food-types';

export interface NutritionFitnessContextResult {
  enabled: boolean;
  observations: CrossDomainNutritionObservation[];
}

const EMPTY: NutritionFitnessContextResult = { enabled: false, observations: [] };

/** Load ACTUAL completed activities across the window, resolving each
 *  completion's category from its own plan (a 14-day window can span two
 *  weekly plans). */
async function loadFitnessWindow(userId: string, window: CrossDomainWindow) {
  // Recent plans that overlap the window (+ a small buffer for a plan that
  // started just before it). Each fitness_plans.assessment holds the
  // canonical starting_plan.activities for that plan_id.
  const bufferStart = addLocalDays(window.startLocalDate, -7);
  const [{ data: planRows }, { data: profileRow }, { data: completionRows }, { data: execRows }] = await Promise.all([
    supabase
      .from('fitness_plans')
      .select('plan_id, assessment, week_start_date')
      .eq('user_id', userId)
      .gte('week_end_date', bufferStart)
      .order('week_start_date', { ascending: false })
      .limit(4),
    supabase
      .from('fitness_profile')
      .select('ai_assessment, ai_assessment_generated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('plan_activity_completions')
      .select('plan_id, activity_index, planned_date, completion_source')
      .eq('user_id', userId)
      .gte('planned_date', window.startLocalDate)
      .lte('planned_date', window.endLocalDate),
    supabase
      .from('plan_activity_execution')
      .select('plan_id, activity_index, actual_duration_minutes')
      .eq('user_id', userId),
  ]);

  const activitiesByPlanId = new Map<string, { category: ActivityCategory }[]>();
  for (const r of (planRows ?? [])) {
    const acts = (r.assessment as any)?.starting_plan?.activities;
    if (Array.isArray(acts)) activitiesByPlanId.set(String(r.plan_id), acts.map((a: any) => ({ category: a.category as ActivityCategory })));
  }
  // The current plan lives on fitness_profile; its id is ai_assessment_generated_at.
  const currentPlanId = profileRow?.ai_assessment_generated_at ? String(profileRow.ai_assessment_generated_at) : null;
  const currentActs = (profileRow?.ai_assessment as any)?.starting_plan?.activities;
  if (currentPlanId && !activitiesByPlanId.has(currentPlanId) && Array.isArray(currentActs)) {
    activitiesByPlanId.set(currentPlanId, currentActs.map((a: any) => ({ category: a.category as ActivityCategory })));
  }

  const completions: CompletedActivityInput[] = (completionRows ?? []).map(r => ({
    planId: String(r.plan_id),
    activityIndex: Number(r.activity_index),
    plannedDate: String(r.planned_date),
    completionSource: r.completion_source,
  }));

  const durationByKey = new Map<string, number>();
  for (const r of (execRows ?? [])) {
    if (r.actual_duration_minutes != null) durationByKey.set(`${r.plan_id}#${r.activity_index}`, Number(r.actual_duration_minutes));
  }

  return { activitiesByPlanId, completions, durationByKey };
}

export const nutritionFitnessContextService = {
  /**
   * The N7 result for Today Nutrition. `endLocalDate` is the user's local
   * calendar day (localISODate(new Date()) on device). Never throws.
   */
  async getObservations(userId: string, endLocalDate: string): Promise<NutritionFitnessContextResult> {
    if (!isNutritionFitnessContextEnabled()) return EMPTY;

    try {
      const window7 = crossDomainWindow(endLocalDate, 7);
      const window14 = crossDomainWindow(endLocalDate, 14);

      const [range, context, fitness] = await Promise.all([
        foodLogService.getNutritionRange(userId, 14, endLocalDate),
        nutritionReferenceService.resolveUserReferenceContext(userId),
        loadFitnessWindow(userId, window14),
      ]);

      const inWin = (d: string, w: CrossDomainWindow) => d >= w.startLocalDate && d <= w.endLocalDate;
      const entries14: FoodLogEntry[] = range.entries;
      const entries7 = entries14.filter(e => inWin(e.localDate, window7));
      const days14 = range.days;
      const days7 = days14.filter(d => inWin(d.localDate, window7));

      const patterns7 = buildNutritionPatterns(entries7, { windowDays: 7, endLocalDate });
      const patterns14 = buildNutritionPatterns(entries14, { windowDays: 14, endLocalDate });
      const comparisons7 = buildNutritionReferenceComparisons(context, days7, patterns7);
      const comparisons14 = buildNutritionReferenceComparisons(context, days14, patterns14);
      const opportunities7 = buildNutritionCoachingOpportunities(comparisons7, entries7);
      const opportunities14 = buildNutritionCoachingOpportunities(comparisons14, entries14);

      const fitnessDays14 = buildFitnessDayEvidence(fitness.activitiesByPlanId, fitness.completions, fitness.durationByKey, window14);
      const fitnessDays7 = fitnessDays14.filter(d => inWin(d.localDate, window7));

      const entriesByLocalDate: Record<string, { mealSlot: FoodLogEntry['mealSlot'] }[]> = {};
      for (const e of entries14) (entriesByLocalDate[e.localDate] ??= []).push({ mealSlot: e.mealSlot });

      const observations = buildCrossDomainObservations({
        window7, window14, fitnessDays7, fitnessDays14, opportunities7, opportunities14, entriesByLocalDate,
      });
      return { enabled: true, observations };
    } catch {
      return { enabled: true, observations: [] };
    }
  },
};
