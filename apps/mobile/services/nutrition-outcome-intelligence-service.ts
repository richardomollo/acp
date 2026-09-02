// ACP Intelligence™ — Nutrition N9. Outcome-intelligence service.
//
// Read-only and self-contained. Given a user + their local "today" it:
//   1. replays every N8 coaching-exposure episode from the longitudinal
//      window through the SHARED pure classifier (N8's `classifyEpisode`),
//      evaluating each one AT ITS OWN 21-day close date so old episodes stay
//      in the longitudinal record (§8/§22);
//   2. buckets the user's ACTUAL plan completions into Monday-start weeks and
//      derives that week's protein-vs-reference state from the same N2/N3
//      engine the rest of Nutrition uses;
// then hands both to the pure aggregation layer, which decides whether any
// REPEATED pattern has cleared its gate.
//
// No LLM (§4/§42), no RAG (§43), no durable memory write (§44), no plan or
// coaching adaptation (§45). Does NO work when the flag is off (§41). Never
// throws — any failure yields an empty list so the Journey screen is never
// blocked.

import { supabase } from '@/lib/supabase';
import { isNutritionOutcomeIntelligenceEnabled } from '@/lib/flags';
import { foodLogService } from '@/services/food-log-service';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { addLocalDays, buildHistory } from '@/lib/nutrition/nutrition-history';
import { buildNutritionPatterns } from '@/lib/nutrition/nutrition-patterns';
import { buildNutritionReferenceComparisons } from '@/lib/nutrition/nutrition-reference-engine';
import {
  classifyEpisode, EXPOSURE_HORIZON_DAYS,
  type ExposureRecord,
} from '@/lib/nutrition/nutrition-advice-effectiveness';
import type { UserReferenceContext } from '@/lib/nutrition/nutrition-reference-engine';
import type { DayNutrition } from '@/lib/nutrition/nutrition-history';
import type { FoodLogEntry } from '@/lib/nutrition/food-types';
import {
  buildOutcomeObservations, assertSafeOutcomeObservation, mondayOf, weekdayName,
  type EpisodeOutcome, type OutcomeWeekEvidence, type OutcomeObservation,
} from '@/lib/nutrition/nutrition-outcome-intelligence';

/** How far back the longitudinal view reaches. 12 weeks is "recent weeks"
 *  without turning into a full history dump (§6/§11). */
const LONGITUDINAL_DAYS = 84;

/** Comparison states that carry no usable protein signal for a given week. */
const NON_SIGNAL_STATES = new Set([
  'insufficient_days', 'insufficient_data', 'insufficient_context', 'not_applicable', 'unsupported',
]);

export interface NutritionOutcomeIntelligenceResult {
  enabled: boolean;
  observations: OutcomeObservation[];
}

const EMPTY: NutritionOutcomeIntelligenceResult = { enabled: false, observations: [] };

function minDate(a: string, b: string): string { return a <= b ? a : b; }

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase row shape; mirrors nutrition-advice-effectiveness-service.mapRow */
function mapExposureRow(r: any): ExposureRecord {
  return {
    id: String(r.id),
    episodeKey: String(r.episode_key),
    shownLocalDate: String(r.shown_local_date),
    opportunityKey: String(r.opportunity_key),
    nutrient: r.nutrient,
    comparison: r.comparison,
    actionKind: r.action_kind ?? null,
    beforeAverage: r.before_average == null ? null : Number(r.before_average),
    beforeLoggedDays: Number(r.before_logged_days),
    beforeWindowDays: Number(r.before_window_days),
    beforeCoverageBand: r.before_coverage_band,
    beforeReadiness: r.before_readiness,
    referenceType: r.reference_type,
    referenceLow: r.reference_low == null ? null : Number(r.reference_low),
    referenceHigh: r.reference_high == null ? null : Number(r.reference_high),
    referenceUnit: String(r.reference_unit),
  };
}

/** Replay N8 episodes as longitudinal outcomes. Each episode is classified
 *  once, at min(today, shown + horizon) — never re-opened, never expired out
 *  of the record. */
function buildEpisodeOutcomes(
  exposures: ExposureRecord[],
  days: DayNutrition[],
  todayLocalDate: string,
): EpisodeOutcome[] {
  return exposures.map(ex => {
    const closeDate = minDate(todayLocalDate, addLocalDays(ex.shownLocalDate, EXPOSURE_HORIZON_DAYS));
    const after = days.filter(d => d.localDate > ex.shownLocalDate && d.localDate <= closeDate);
    const cls = classifyEpisode(ex, after, closeDate);
    return {
      nutrient: ex.nutrient,
      shownLocalDate: ex.shownLocalDate,
      direction: cls ? cls.direction : null,
    };
  });
}

/** Bucket completions into Monday-start weeks and attach that week's protein
 *  state from the shared reference engine. Only fully-elapsed weeks (Monday
 *  strictly before the current week's Monday) are considered. */
function buildWeekEvidence(
  completions: { plannedDate: string; activityIndex: number }[],
  preferredDays: string[],
  entries: FoodLogEntry[],
  context: UserReferenceContext,
  windowStartMonday: string,
  currentMonday: string,
): OutcomeWeekEvidence[] {
  const preferred = new Set(preferredDays.map(d => d.toLowerCase()));
  const hasPreferredDays = preferred.size > 0;

  // distinct (activityIndex, plannedDate) → one completed session
  const seen = new Set<string>();
  const sessionsByWeek = new Map<string, string[]>(); // weekMonday → plannedDate[]
  for (const c of completions) {
    const key = `${c.activityIndex}#${c.plannedDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const wk = mondayOf(c.plannedDate);
    const list = sessionsByWeek.get(wk);
    if (list) list.push(c.plannedDate);
    else sessionsByWeek.set(wk, [c.plannedDate]);
  }

  const out: OutcomeWeekEvidence[] = [];
  for (let wk = windowStartMonday; wk < currentMonday; wk = addLocalDays(wk, 7)) {
    const weekEnd = addLocalDays(wk, 6);
    const sessions = sessionsByWeek.get(wk) ?? [];

    const weekEntries = entries.filter(e => e.localDate >= wk && e.localDate <= weekEnd);
    let proteinState: OutcomeWeekEvidence['proteinState'] = null;
    if (weekEntries.length > 0) {
      const weekDays = buildHistory(weekEntries, 7, weekEnd);
      const patterns = buildNutritionPatterns(weekEntries, { windowDays: 7, endLocalDate: weekEnd });
      const protein = buildNutritionReferenceComparisons(context, weekDays, patterns)
        .find(c => c.nutrient === 'proteinG');
      if (protein && !NON_SIGNAL_STATES.has(protein.state)) proteinState = protein.state;
    }

    out.push({
      weekStart: wk,
      completedSessions: sessions.length,
      completedOnPreferredDays: sessions.filter(d => preferred.has(weekdayName(d))).length,
      hasPreferredDays,
      proteinState,
    });
  }
  return out;
}

export const nutritionOutcomeIntelligenceService = {
  /**
   * The N9 "What ACP is learning" observations for the Fitness Journey
   * screen. `todayLocalDate` is the device's local calendar day. Never throws.
   */
  async getObservations(userId: string, todayLocalDate: string): Promise<NutritionOutcomeIntelligenceResult> {
    if (!isNutritionOutcomeIntelligenceEnabled()) return EMPTY;

    try {
      const windowStart = addLocalDays(todayLocalDate, -LONGITUDINAL_DAYS);
      const windowStartMonday = mondayOf(windowStart);
      const currentMonday = mondayOf(todayLocalDate);
      // one bounded fetch covering the oldest week AND the after-window of the
      // oldest episode.
      const rangeDays = LONGITUDINAL_DAYS + EXPOSURE_HORIZON_DAYS + 2;

      const [{ data: exposureRows }, range, context, { data: profileRow }, { data: completionRows }] = await Promise.all([
        supabase
          .from('nutrition_coaching_exposures')
          .select('*')
          .eq('user_id', userId)
          .gte('shown_local_date', windowStart)
          .order('shown_local_date', { ascending: true }),
        foodLogService.getNutritionRange(userId, rangeDays, todayLocalDate),
        nutritionReferenceService.resolveUserReferenceContext(userId),
        supabase
          .from('fitness_profile')
          .select('preferred_training_days')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('plan_activity_completions')
          .select('activity_index, planned_date')
          .eq('user_id', userId)
          .gte('planned_date', windowStartMonday)
          .lte('planned_date', todayLocalDate),
      ]);

      const exposures = (exposureRows ?? []).map(mapExposureRow);
      const episodes = buildEpisodeOutcomes(exposures, range.days, todayLocalDate);

      const completions = (completionRows ?? []).map(r => ({
        plannedDate: String(r.planned_date),
        activityIndex: Number(r.activity_index),
      }));
      const preferredDays: string[] = Array.isArray(profileRow?.preferred_training_days)
        ? (profileRow!.preferred_training_days as string[])
        : [];

      const weeks = buildWeekEvidence(
        completions, preferredDays, range.entries, context, windowStartMonday, currentMonday,
      );

      const observations = buildOutcomeObservations({ episodes, weeks });
      // Defence in depth: never surface unsafe copy even if a template regresses.
      const safe = observations.filter(o => {
        try { assertSafeOutcomeObservation(o); return true; } catch { return false; }
      });
      return { enabled: true, observations: safe };
    } catch {
      return { enabled: true, observations: [] };
    }
  },
};
