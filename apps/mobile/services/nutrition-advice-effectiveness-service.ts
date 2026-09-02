// ACP Intelligence™ — Nutrition N8. Advice-effectiveness service.
//
// Two jobs, both read-only except one small idempotent write:
//   1. recordExposure — when an N4 coaching card is ACTUALLY SHOWN on Today
//      Nutrition, persist its STRUCTURED identity + a FROZEN before-evidence
//      snapshot, exactly once per episode (§5/§9/§39).
//   2. getEffectivenessObservations — for each open episode within the
//      horizon, compare the user's SUBSEQUENT logged nutrition to the frozen
//      snapshot and return the observational before/after result (§15).
//
// No LLM (§42), no RAG (§43), no coaching_memory write (§44), no plan
// adaptation (§45/§46). Fully no-ops when the flag is off (§40). Never throws.

import { supabase } from '@/lib/supabase';
import { isNutritionAdviceEffectivenessEnabled } from '@/lib/flags';
import { foodLogService } from '@/services/food-log-service';
import type { NutritionCoachingOpportunity } from '@/lib/nutrition/nutrition-coaching-opportunity';
import type { NutritionReferenceComparison } from '@/lib/nutrition/nutrition-reference-engine';
import {
  buildBeforeSnapshot, evaluateEffectiveness, episodeKey, afterWindowDays,
  EXPOSURE_HORIZON_DAYS,
  type ExposureRecord, type NutritionAdviceEffectiveness,
} from '@/lib/nutrition/nutrition-advice-effectiveness';

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  const b = Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
function subtractDays(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function mapRow(r: any): ExposureRecord {
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

export interface ShownCoachingCard {
  opportunity: NutritionCoachingOpportunity;
  comparison: NutritionReferenceComparison | undefined;
}

export const nutritionAdviceEffectivenessService = {
  /**
   * Record an exposure for each coaching card that was actually rendered.
   * Idempotent: a card already inside an OPEN episode (an exposure for the
   * same opportunity_key within the horizon) is not re-written — the clock
   * is never restarted (§35). Only a card outside the horizon, or a new
   * opportunity_key, creates a row.
   */
  async recordExposures(userId: string, shown: ShownCoachingCard[], nowLocalDate: string, timezone: string | null = null): Promise<void> {
    if (!isNutritionAdviceEffectivenessEnabled() || shown.length === 0) return;
    try {
      const snapshots = shown
        .map(s => buildBeforeSnapshot(s.opportunity, s.comparison))
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (snapshots.length === 0) return;

      const horizonStart = subtractDays(nowLocalDate, EXPOSURE_HORIZON_DAYS);
      const { data: openRows } = await supabase
        .from('nutrition_coaching_exposures')
        .select('opportunity_key, shown_local_date')
        .eq('user_id', userId)
        .in('opportunity_key', snapshots.map(s => s.opportunityKey))
        .gte('shown_local_date', horizonStart);
      const openKeys = new Set((openRows ?? []).map(r => String(r.opportunity_key)));

      const toInsert = snapshots
        .filter(s => !openKeys.has(s.opportunityKey))
        .map(s => ({
          user_id: userId,
          opportunity_key: s.opportunityKey,
          episode_key: episodeKey(s.opportunityKey, nowLocalDate),
          nutrient: s.nutrient,
          comparison: s.comparison,
          action_kind: s.actionKind,
          shown_local_date: nowLocalDate,
          timezone,
          before_average: s.beforeAverage,
          before_logged_days: s.beforeLoggedDays,
          before_window_days: s.beforeWindowDays,
          before_coverage_band: s.beforeCoverageBand,
          before_readiness: s.beforeReadiness,
          reference_type: s.referenceType,
          reference_low: s.referenceLow,
          reference_high: s.referenceHigh,
          reference_unit: s.referenceUnit,
        }));
      if (toInsert.length === 0) return;

      // onConflict on the (user_id, opportunity_key, shown_local_date) unique
      // key makes a same-day double render a no-op at the DB level too.
      await supabase
        .from('nutrition_coaching_exposures')
        .upsert(toInsert, { onConflict: 'user_id,opportunity_key,shown_local_date', ignoreDuplicates: true });
    } catch {
      /* exposure recording must never break Today Nutrition */
    }
  },

  /**
   * The N8 "What's changed" observations for Today Nutrition. One bounded
   * nutrition query covers every open episode's after-window; each episode is
   * evaluated by the pure layer. Returns only episodes with enough subsequent
   * evidence and a surfaceable direction (§28/§30). Never throws.
   */
  async getEffectivenessObservations(userId: string, nowLocalDate: string): Promise<NutritionAdviceEffectiveness[]> {
    if (!isNutritionAdviceEffectivenessEnabled()) return [];
    try {
      const horizonStart = subtractDays(nowLocalDate, EXPOSURE_HORIZON_DAYS);
      const { data: rows } = await supabase
        .from('nutrition_coaching_exposures')
        .select('*')
        .eq('user_id', userId)
        .gte('shown_local_date', horizonStart)
        .order('shown_local_date', { ascending: true });
      const exposures = (rows ?? []).map(mapRow);
      if (exposures.length === 0) return [];

      // One query: from the day after the OLDEST open exposure, to today.
      const oldest = exposures[0].shownLocalDate;
      const span = Math.min(daysBetween(oldest, nowLocalDate) + 1, EXPOSURE_HORIZON_DAYS + 2);
      const range = await foodLogService.getNutritionRange(userId, Math.max(1, span), nowLocalDate);

      const out: NutritionAdviceEffectiveness[] = [];
      for (const ex of exposures) {
        const after = afterWindowDays(range.days, ex.shownLocalDate, nowLocalDate);
        const result = evaluateEffectiveness(ex, after, nowLocalDate);
        if (result) out.push(result);
      }
      return out;
    } catch {
      return [];
    }
  },
};
