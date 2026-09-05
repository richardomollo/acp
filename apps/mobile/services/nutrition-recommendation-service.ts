// ACP Intelligence™ — Nutrition #022. The one service boundary for the
// adaptive daily nutrition plan (Today's Meals: Log this / Swap / Portion /
// "Having something else?"). UI calls only this; never Supabase directly for
// any of this feature's own state.
//
// Reuses, never duplicates: `meals` (catalogue), `saved_meals` (#018/N6),
// `food_log_entries` (N1, via foodLogService/savedMealService — the SOLE
// consumed-nutrition writer), and N3's protein reference. The only new
// storage is `nutrition_recommendation_events` — one additive row per
// (user, date, slot) carrying the RECOMMENDED → PLANNED → CONSUMED/REPLACED
// lifecycle (see the migration's own header for the full contract).
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { foodLogService } from './food-log-service';
import { savedMealService } from './saved-meal-service';
import { nutritionReferenceService } from './nutrition-reference-service';
import { getNutritionReferences } from '@/lib/nutrition/nutrition-reference-engine';
import { draftFromSavedMeal, computeSavedMealPreview } from '@/lib/nutrition/saved-meal';
import type { MealSlot, FoodSourceType } from '@/lib/nutrition/food-types';
import {
  mealCandidateFromCatalogueRow, mealCandidateFromSavedMeal, mealCandidateKey, scaleMealCandidate,
  type MealCandidate, type CatalogueMealRow,
} from '@/lib/nutrition/nutrition-meal-model';
import { computeMealPreferenceScores, type MealPreferenceEvent } from '@/lib/nutrition/meal-preference-learning';
import {
  buildDailyNutritionPlan, swapSlotCandidate,
  type DailyNutritionPlan, type ProteinBudget,
} from '@/lib/nutrition/daily-nutrition-plan';

export const NUTRITION_PLAN_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const PREFERENCE_HISTORY_DAYS = 30;

// ── nutrition_recommendation_events row shape ───────────────────────────────

type EventStatus = 'recommended' | 'planned' | 'consumed' | 'replaced';

interface RecommendationEventRow {
  id: string;
  local_date: string;
  meal_slot: MealSlot;
  recommended_meal_id: string | null;
  recommended_saved_meal_id: string | null;
  recommended_label: string;
  recommendation_reason: string | null;
  planned_meal_id: string | null;
  planned_saved_meal_id: string | null;
  planned_label: string;
  planned_portion_multiplier: number;
  swapped: boolean;
  consumed_log_group_id: string | null;
  consumed_at: string | null;
  status: EventStatus;
}

const EVENT_SELECT = [
  'id', 'local_date', 'meal_slot', 'recommended_meal_id', 'recommended_saved_meal_id',
  'recommended_label', 'recommendation_reason', 'planned_meal_id', 'planned_saved_meal_id',
  'planned_label', 'planned_portion_multiplier', 'swapped', 'consumed_log_group_id', 'consumed_at', 'status',
].join(', ');

function candidateRef(c: MealCandidate): { meal_id: string | null; saved_meal_id: string | null } {
  return c.source === 'catalogue' ? { meal_id: c.id, saved_meal_id: null } : { meal_id: null, saved_meal_id: c.id };
}

// ── Candidate fetching ───────────────────────────────────────────────────

async function fetchCandidatesBySlot(userId: string, slots: readonly MealSlot[]): Promise<Partial<Record<MealSlot, MealCandidate[]>>> {
  const [catalogueResults, savedMeals] = await Promise.all([
    Promise.all(slots.map(slot =>
      supabase.from('meals')
        .select('id, name, category, cuisine, tags, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes, image_url')
        .eq('is_active', true).eq('category', slot).limit(30),
    )),
    savedMealService.list().catch(() => []), // never blocks the plan — a saved-meal fetch failure just means fewer candidates
  ]);

  const out: Partial<Record<MealSlot, MealCandidate[]>> = {};
  slots.forEach((slot, i) => {
    const rows = ((catalogueResults[i].data ?? []) as CatalogueMealRow[]);
    const catalogueCandidates = rows.map(mealCandidateFromCatalogueRow);
    // A user's own saved meals are eligible for EVERY slot (spec §3 — a
    // homemade meal is a first-class candidate, never slot-locked to
    // whichever meal it happened to be created for).
    const savedCandidates = savedMeals.map(m => {
      const preview = computeSavedMealPreview(draftFromSavedMeal(m).components);
      return mealCandidateFromSavedMeal(
        { id: m.id, name: m.name, provenance: m.provenance, preview },
        slot,
      );
    });
    out[slot] = [...catalogueCandidates, ...savedCandidates];
  });
  return out;
}

// ── Preference history (derived entirely from our own event table — spec
//    §8's "displayed / consumed / swapped away" all live here already) ──

function addDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

async function fetchPreferenceEvents(userId: string, beforeDate: string): Promise<MealPreferenceEvent[]> {
  const since = addDays(beforeDate, -PREFERENCE_HISTORY_DAYS);
  const { data } = await supabase
    .from('nutrition_recommendation_events')
    .select('local_date, meal_slot, recommended_meal_id, recommended_saved_meal_id, planned_meal_id, planned_saved_meal_id, status, swapped')
    .eq('user_id', userId)
    .gte('local_date', since)
    .lt('local_date', beforeDate); // never let today's own (still-forming) row bias today's ranking

  const events: MealPreferenceEvent[] = [];
  for (const row of (data ?? []) as any[]) {
    const recommendedKey = row.recommended_meal_id ? mealCandidateKey('catalogue', row.recommended_meal_id)
      : row.recommended_saved_meal_id ? mealCandidateKey('saved_meal', row.recommended_saved_meal_id) : null;
    const plannedKey = row.planned_meal_id ? mealCandidateKey('catalogue', row.planned_meal_id)
      : row.planned_saved_meal_id ? mealCandidateKey('saved_meal', row.planned_saved_meal_id) : null;

    if (recommendedKey) events.push({ mealKey: recommendedKey, slot: row.meal_slot, type: 'displayed', localDate: row.local_date });
    if (row.swapped && recommendedKey) events.push({ mealKey: recommendedKey, slot: row.meal_slot, type: 'swapped_away', localDate: row.local_date });
    if (row.status === 'consumed' && plannedKey) events.push({ mealKey: plannedKey, slot: row.meal_slot, type: 'consumed', localDate: row.local_date });
  }
  return events;
  // Known limitation (#022 report §V): this does not slot-isolate a saved
  // meal reused across different occasions on different days — the pure
  // computeMealPreferenceScores DOES support a slot filter (see its tests);
  // this service simply doesn't apply one yet, since every catalogue meal is
  // already slot-fixed by its own `category` column and cross-slot saved-meal
  // reuse is a narrow edge case for the MVP.
}

async function resolveProteinBudget(userId: string): Promise<ProteinBudget | null> {
  const context = await nutritionReferenceService.resolveUserReferenceContext(userId);
  const refs = getNutritionReferences(context);
  const protein = refs.proteinG;
  if (protein.status !== 'available' || protein.reference.min == null || protein.reference.max == null) return null;
  return { minG: protein.reference.min, maxG: protein.reference.max };
}

// ── Public shape ─────────────────────────────────────────────────────────

export interface TodayNutritionPlanSlot {
  slot: MealSlot;
  eventId: string | null;
  status: EventStatus;
  /** the candidate currently planned for this slot (post-swap/portion if any), or null if nothing is safe to suggest */
  planned: MealCandidate | null;
  portionMultiplier: number;
  reasons: string[];
  alternates: MealCandidate[];
  swapped: boolean;
}

export interface TodayNutritionPlanResult {
  date: string;
  slots: TodayNutritionPlanSlot[];
  proteinBudget: ProteinBudget | null;
  proteinPlannedG: number;
  proteinRemainingG: number | null;
}

function toPlanSlot(row: RecommendationEventRow | null, ranked: DailyNutritionPlan['slots'][number]): TodayNutritionPlanSlot {
  if (!row) {
    return {
      slot: ranked.slot, eventId: null, status: 'recommended', planned: ranked.recommended,
      portionMultiplier: 1, reasons: ranked.reasons, alternates: ranked.alternates, swapped: false,
    };
  }
  // An existing row is authoritative for what's PLANNED — never silently
  // re-ranked away once the user (or a prior visit) has settled on it. Only
  // an untouched 'recommended' row is truly fresh from this pass.
  const plannedId = row.planned_meal_id ?? row.planned_saved_meal_id;
  const plannedSource = row.planned_meal_id ? 'catalogue' : 'saved_meal';
  const plannedFromRanked = ranked.alternates.concat(ranked.recommended ? [ranked.recommended] : [])
    .find(c => c.source === plannedSource && c.id === plannedId) ?? ranked.recommended;
  const planned = plannedFromRanked ? scaleMealCandidate(plannedFromRanked, row.planned_portion_multiplier) : null;
  return {
    slot: row.meal_slot, eventId: row.id, status: row.status, planned,
    portionMultiplier: row.planned_portion_multiplier,
    reasons: row.status === 'recommended' ? ranked.reasons : [],
    alternates: ranked.alternates, swapped: row.swapped,
  };
}

export const nutritionRecommendationService = {
  /**
   * The whole day's plan. Idempotent: a slot the user already decided on (a
   * swap, a portion change, or a log) keeps reflecting that decision on
   * re-open rather than being silently re-ranked — only a slot with no
   * existing row for `date` is freshly generated this call.
   */
  async getTodayPlan(userId: string, date: string): Promise<TodayNutritionPlanResult> {
    const [profileRes, proteinBudget, candidatesBySlot, events, todaySummaryRes, existingRowsRes] = await Promise.all([
      supabase.from('fitness_profile').select('goal, cuisine_preferences, cuisine_preference').eq('user_id', userId).maybeSingle(),
      resolveProteinBudget(userId).catch(() => null),
      fetchCandidatesBySlot(userId, NUTRITION_PLAN_SLOTS),
      fetchPreferenceEvents(userId, date).catch(() => [] as MealPreferenceEvent[]),
      foodLogService.getDailyNutrition(userId, date).catch(() => ({ summary: { proteinG: 0 } as any })),
      supabase.from('nutrition_recommendation_events').select(EVENT_SELECT).eq('user_id', userId).eq('local_date', date),
    ]);

    const profile = profileRes.data;
    const requireVegetarian = profile?.cuisine_preference === 'vegetarian';
    const preferenceScores = computeMealPreferenceScores(events, date);
    const existingRows = new Map<MealSlot, RecommendationEventRow>(
      ((existingRowsRes.data ?? []) as any[] as RecommendationEventRow[]).map(r => [r.meal_slot, r]),
    );

    const plan = buildDailyNutritionPlan({
      date,
      slots: [...NUTRITION_PLAN_SLOTS],
      candidatesBySlot,
      goal: profile?.goal ?? null,
      cuisinePreferences: profile?.cuisine_preferences ?? [],
      requireVegetarian,
      proteinBudget,
      consumedProteinSoFarG: todaySummaryRes.summary.proteinG ?? 0,
      preferenceScores,
      // #022A §1 — cold-start diversity: ties vary by user+day, never a
      // fixed catalogue-order/id default.
      varietySeed: `${userId}:${date}`,
    });

    // Freshly recommended slots (no existing row yet) are written once, so a
    // reload of the SAME day doesn't re-roll them, and so "displayed" history
    // exists for tomorrow's ranking (spec §8) even if the user never interacts.
    const toInsert = plan.slots
      .filter(s => !existingRows.has(s.slot) && s.recommended)
      .map(s => {
        const ref = candidateRef(s.recommended!);
        return {
          user_id: userId, local_date: date, meal_slot: s.slot,
          recommended_meal_id: ref.meal_id, recommended_saved_meal_id: ref.saved_meal_id,
          recommended_label: s.recommended!.name, recommendation_reason: s.reasons[0] ?? null,
          planned_meal_id: ref.meal_id, planned_saved_meal_id: ref.saved_meal_id,
          planned_label: s.recommended!.name, planned_portion_multiplier: 1, status: 'recommended',
        };
      });
    if (toInsert.length > 0) {
      const { data: inserted } = await supabase.from('nutrition_recommendation_events').insert(toInsert).select(EVENT_SELECT);
      for (const row of (inserted ?? []) as any[] as RecommendationEventRow[]) existingRows.set(row.meal_slot, row);
    }

    const slots = plan.slots.map(s => toPlanSlot(existingRows.get(s.slot) ?? null, s));
    return { date, slots, proteinBudget: plan.proteinBudget, proteinPlannedG: plan.proteinPlannedG, proteinRemainingG: plan.proteinRemainingG };
  },

  /** §11 — Swap. The original recommendation is left untouched; only planned_* changes. */
  async swap(userId: string, date: string, slot: MealSlot): Promise<void> {
    const { data: rowData } = await supabase
      .from('nutrition_recommendation_events').select(EVENT_SELECT)
      .eq('user_id', userId).eq('local_date', date).eq('meal_slot', slot).maybeSingle();
    const row = rowData as RecommendationEventRow | null;
    if (!row) return;

    const [profileRes, proteinBudget, candidatesBySlot, events, todaySummaryRes] = await Promise.all([
      supabase.from('fitness_profile').select('goal, cuisine_preferences, cuisine_preference').eq('user_id', userId).maybeSingle(),
      resolveProteinBudget(userId).catch(() => null),
      fetchCandidatesBySlot(userId, NUTRITION_PLAN_SLOTS),
      fetchPreferenceEvents(userId, date).catch(() => [] as MealPreferenceEvent[]),
      foodLogService.getDailyNutrition(userId, date).catch(() => ({ summary: { proteinG: 0 } as any })),
    ]);
    const profile = profileRes.data;
    const currentPlannedKey = row.planned_meal_id ? mealCandidateKey('catalogue', row.planned_meal_id)
      : row.planned_saved_meal_id ? mealCandidateKey('saved_meal', row.planned_saved_meal_id) : '';

    const replacement = swapSlotCandidate(
      {
        date, slots: [...NUTRITION_PLAN_SLOTS], candidatesBySlot,
        goal: profile?.goal ?? null, cuisinePreferences: profile?.cuisine_preferences ?? [],
        requireVegetarian: profile?.cuisine_preference === 'vegetarian',
        proteinBudget, consumedProteinSoFarG: todaySummaryRes.summary.proteinG ?? 0,
        preferenceScores: computeMealPreferenceScores(events, date),
        varietySeed: `${userId}:${date}`,
      },
      slot, currentPlannedKey, null, 1,
    );
    if (!replacement) return; // nothing else safe to offer — leave the current plan as-is

    const ref = candidateRef(replacement);
    await supabase.from('nutrition_recommendation_events').update({
      planned_meal_id: ref.meal_id, planned_saved_meal_id: ref.saved_meal_id,
      planned_label: replacement.name, planned_portion_multiplier: 1, swapped: true, status: 'planned',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
  },

  /** §12 — Portion. Only the multiplier changes; the underlying candidate is untouched. */
  async setPortion(userId: string, date: string, slot: MealSlot, multiplier: number): Promise<void> {
    await supabase.from('nutrition_recommendation_events')
      .update({ planned_portion_multiplier: multiplier, status: 'planned', updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('local_date', date).eq('meal_slot', slot)
      .in('status', ['recommended', 'planned']); // never rewrite a slot already consumed/replaced
  },

  /**
   * §13 — "Log this": converts the currently PLANNED candidate into consumed
   * evidence through the canonical N1/N6 log paths — never a second log.
   * Idempotent: a slot already 'consumed'/'replaced' is a no-op (prevents a
   * duplicate entry from a repeated tap).
   */
  async logPlanned(userId: string, date: string, slot: MealSlot, now: Date = new Date()): Promise<{ ok: boolean }> {
    const { data: rowData } = await supabase
      .from('nutrition_recommendation_events').select(EVENT_SELECT)
      .eq('user_id', userId).eq('local_date', date).eq('meal_slot', slot).maybeSingle();
    const row = rowData as RecommendationEventRow | null;
    if (!row || row.status === 'consumed' || row.status === 'replaced') return { ok: false };

    let logGroupId: string;
    if (row.planned_saved_meal_id) {
      const meal = await savedMealService.get(row.planned_saved_meal_id);
      if (!meal) return { ok: false };
      const draft = draftFromSavedMeal(meal);
      const scaledComponents = draft.components.map(c => ({ ...c, quantity: String(Number(c.quantity) * row.planned_portion_multiplier) }));
      const result = await savedMealService.log(userId, meal.id, scaledComponents, slot, now);
      if (result.prepareErrors.length > 0) return { ok: false };
      logGroupId = result.logGroupId;
    } else if (row.planned_meal_id) {
      // A catalogue meal has no canonical-food components — its own curated
      // macros are frozen verbatim (scaled by the chosen portion), exactly
      // like any other homemade/packaged entry (never re-derived). Beta
      // #022A §2 — this is Lana's OWN admin-curated data, not the user's own
      // numbers: userProvidedNutrition stays false and source/sourceType are
      // attributed truthfully to the catalogue, even though captureMethod
      // stays 'plan' (recording HOW it entered the log, not who authored the
      // nutrition facts).
      const { data: mealRow } = await supabase.from('meals')
        .select('id, name, category, cuisine, tags, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes, image_url, source, source_type')
        .eq('id', row.planned_meal_id).maybeSingle();
      if (!mealRow) return { ok: false };
      const candidate = scaleMealCandidate(mealCandidateFromCatalogueRow(mealRow as CatalogueMealRow), row.planned_portion_multiplier);
      logGroupId = Crypto.randomUUID();
      const entry = await foodLogService.logFood(userId, {
        foodId: null,
        displayName: candidate.name,
        quantity: 100,
        unit: 'g', // a display-only basis — this entry stores its own frozen totals, never scaled by this (matches every other non-canonical-food entry)
        mealSlot: slot,
        captureMethod: 'plan',
        userProvidedNutrition: false,
        source: (mealRow as any).source ?? 'ACP curated meal library',
        sourceType: ((mealRow as any).source_type as FoodSourceType | null) ?? 'acp_curated',
        logGroupId,
        nutrients: {
          energyKcal: candidate.macros.calories, proteinG: candidate.macros.proteinG,
          carbohydrateG: candidate.macros.carbsG, fatG: candidate.macros.fatG, fibreG: candidate.macros.fibreG,
        },
      }, now);
      logGroupId = entry.logGroupId ?? logGroupId;
    } else {
      return { ok: false };
    }

    await supabase.from('nutrition_recommendation_events').update({
      status: 'consumed', consumed_log_group_id: logGroupId, consumed_at: now.toISOString(), updated_at: now.toISOString(),
    }).eq('id', row.id);
    return { ok: true };
  },

  /**
   * §14 — "Having something else?": the caller logs through the EXISTING
   * universal logging flow (search / saved meal / homemade — unchanged);
   * this only marks the slot 'replaced' so recommended ≠ consumed is
   * preserved as behavioural evidence, never silently overwritten.
   */
  async markReplaced(userId: string, date: string, slot: MealSlot, consumedLogGroupId: string | null, now: Date = new Date()): Promise<void> {
    await supabase.from('nutrition_recommendation_events').update({
      status: 'replaced', consumed_log_group_id: consumedLogGroupId, consumed_at: now.toISOString(), updated_at: now.toISOString(),
    }).eq('user_id', userId).eq('local_date', date).eq('meal_slot', slot).in('status', ['recommended', 'planned']);
  },
};
