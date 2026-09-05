// ACP Intelligence™ — Nutrition N1. The one service boundary for the food
// evidence layer. UI screens call only this; never Supabase directly.
//
// Everything here is deterministic and offline-capable except the DB round
// trips: nutrient maths is lib/nutrition/food-nutrition.ts (pure, tested),
// this file only searches canonical foods, resolves a portion to grams,
// freezes a nutrient snapshot, and persists / reads the user's own log.
// No LLM, no RAG, no meal-plan dependency.

import { supabase } from '@/lib/supabase';
import { localISODate } from '@/lib/fulfilment';
import {
  resolveGrams, computeLogSnapshot, sumDailyNutrition,
} from '@/lib/nutrition/food-nutrition';
import { normaliseUserNutrients, HOMEMADE_MEAL_SOURCE } from '@/lib/nutrition/homemade-meal';
import { buildHistory, addLocalDays, type DayNutrition } from '@/lib/nutrition/nutrition-history';
import {
  NUTRIENT_KEYS, emptyNutrients,
  type CanonicalFood, type FoodSearchResult, type FoodLogEntry, type FoodLogInput,
  type DailyNutritionSummary, type Nutrients, type MealSlot, type LogUnit, type CaptureMethod,
} from '@/lib/nutrition/food-types';
import {
  FOOD_SELECT, NUTRIENT_COLUMN, mapDbFoodRow, mapDbFoodToSearchResult,
} from '@/services/providers/food-provider';

const LOG_SELECT = [
  'id', 'user_id', 'logged_at', 'local_date', 'timezone', 'meal_slot', 'food_id',
  'display_name', 'brand', 'quantity', 'unit', 'serving_label', 'quantity_grams',
  'capture_method', 'source', 'source_type', 'note', 'log_group_id', 'saved_meal_id',
  'user_provided_nutrition',
  ...Object.values(NUTRIENT_COLUMN),
].join(', ');

function nutrientsToColumns(n: Nutrients): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of NUTRIENT_KEYS) out[NUTRIENT_COLUMN[k]] = n[k];
  return out;
}

function readNutrientsFromRow(row: Record<string, unknown>): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) {
    const v = row[NUTRIENT_COLUMN[k]];
    out[k] = v == null ? null : Number(v);
  }
  return out;
}

function mapLogRow(row: Record<string, any>): FoodLogEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    loggedAt: String(row.logged_at),
    localDate: String(row.local_date),
    timezone: row.timezone ?? null,
    mealSlot: (row.meal_slot ?? null) as MealSlot | null,
    foodId: row.food_id ?? null,
    displayName: String(row.display_name),
    brand: row.brand ?? null,
    quantity: Number(row.quantity),
    unit: row.unit as LogUnit,
    servingLabel: row.serving_label ?? null,
    quantityGrams: row.quantity_grams == null ? null : Number(row.quantity_grams),
    captureMethod: row.capture_method as CaptureMethod,
    source: row.source ?? null,
    sourceType: row.source_type ?? null,
    note: row.note ?? null,
    logGroupId: row.log_group_id ?? null,
    savedMealId: row.saved_meal_id ?? null,
    userProvidedNutrition: row.user_provided_nutrition === true,
    nutrients: readNutrientsFromRow(row),
  };
}

export const foodLogService = {
  /** Case-insensitive name match over canonical foods. Generic foods first, then alphabetical. Debounce is the caller's job (N1 §45). */
  async searchFoods(query: string, limit = 20): Promise<FoodSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data } = await supabase
      .from('foods')
      .select(FOOD_SELECT)
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .order('is_generic', { ascending: false })
      .order('name', { ascending: true })
      .limit(limit);
    return ((data as any[]) ?? []).map(mapDbFoodToSearchResult);
  },

  /** Full canonical food (with its named servings) for the portion step. */
  async getFood(id: string): Promise<CanonicalFood | null> {
    const [{ data: food }, { data: servings }] = await Promise.all([
      supabase.from('foods').select(FOOD_SELECT).eq('id', id).maybeSingle(),
      supabase.from('food_servings').select('label, grams, sort_order').eq('food_id', id).order('sort_order'),
    ]);
    if (!food) return null;
    return mapDbFoodRow(food as any, ((servings as any[]) ?? []));
  },

  /** The user's most recently logged distinct foods — a cheap friction reducer (N1 §18). */
  async getRecentFoods(userId: string, limit = 8): Promise<{ foodId: string; displayName: string; brand: string | null }[]> {
    const { data } = await supabase
      .from('food_log_entries')
      .select('food_id, display_name, brand, logged_at')
      .eq('user_id', userId)
      .not('food_id', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(40);
    const seen = new Set<string>();
    const out: { foodId: string; displayName: string; brand: string | null }[] = [];
    for (const r of ((data as any[]) ?? [])) {
      if (seen.has(r.food_id)) continue;
      seen.add(r.food_id);
      out.push({ foodId: r.food_id, displayName: r.display_name, brand: r.brand ?? null });
      if (out.length >= limit) break;
    }
    return out;
  },

  /**
   * Logs one food. Resolves the portion to grams deterministically, freezes
   * the nutrient snapshot at this moment (N1 §11/§12), and inserts an
   * owner-only row.
   *
   *   • `foodId` set          → snapshot is SCALED from the canonical food.
   *   • `userProvidedNutrition` (N6.5 / Beta #018) → the caller supplied the
   *     nutrient TOTALS for the portion (a homemade / packaged / takeaway
   *     item with no canonical row). Frozen verbatim; blanks stay `null`,
   *     never 0; source_type is 'user_custom'.
   *   • `nutrients` + `sourceType` (no `userProvidedNutrition`, Beta #022A) →
   *     a caller-supplied snapshot with a TRUTHFUL non-user source (e.g.
   *     Lana's own curated meal catalogue). Frozen verbatim like the line
   *     above, but never marked as the user's own numbers.
   *   • none of the above       → a name-only custom entry: no grams, no
   *     nutrients, contributes nothing to totals (N1 §13-B).
   *
   * Throws on an unresolvable portion — never persists a fake number.
   */
  async logFood(userId: string, input: FoodLogInput, now: Date = new Date()): Promise<FoodLogEntry> {
    const localDate = localISODate(now);
    let timezone: string | null = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { /* ignore */ }

    let quantityGrams: number | null = null;
    let snapshot: Nutrients = emptyNutrients();
    let source: string | null = null;
    let sourceType: string | null = null;
    const userProvidedNutrition = !input.foodId && input.userProvidedNutrition === true && input.nutrients != null;

    if (input.foodId) {
      const food = await this.getFood(input.foodId);
      if (!food) throw new Error('Food not found');
      quantityGrams = resolveGrams(food, input.quantity, input.unit, input.servingLabel);
      snapshot = computeLogSnapshot(food, quantityGrams);
      source = food.source;
      sourceType = food.sourceType;
    } else if (userProvidedNutrition) {
      // The user's own numbers for the whole portion — not scaled, not
      // invented. Grams-first: a real (approximate) weight makes this a food
      // entry rather than a name-only one.
      snapshot = normaliseUserNutrients(input.nutrients);
      quantityGrams = input.unit === 'g' && input.quantity > 0 ? input.quantity : null;
      source = HOMEMADE_MEAL_SOURCE;
      sourceType = 'user_custom';
    } else if (input.nutrients != null && input.sourceType) {
      // Beta #022A — a truthfully-attributed non-user snapshot (e.g. Lana's
      // own curated `meals` catalogue, logged via "Log this"). Frozen
      // verbatim exactly like the userProvidedNutrition path above, but
      // `user_provided_nutrition` stays false and source/sourceType reflect
      // where the numbers actually came from — never mislabelled as the
      // user's own just because the user tapped a button.
      snapshot = normaliseUserNutrients(input.nutrients);
      quantityGrams = input.unit === 'g' && input.quantity > 0 ? input.quantity : null;
      source = input.source ?? null;
      sourceType = input.sourceType;
    }

    const { data, error } = await supabase
      .from('food_log_entries')
      .insert({
        user_id: userId,
        logged_at: now.toISOString(),
        local_date: localDate,
        timezone,
        meal_slot: input.mealSlot ?? null,
        food_id: input.foodId,
        display_name: input.displayName.trim(),
        brand: input.brand ?? null,
        quantity: input.quantity,
        unit: input.unit,
        serving_label: input.unit === 'serving' ? (input.servingLabel ?? null) : null,
        quantity_grams: quantityGrams,
        capture_method: input.captureMethod,
        source,
        source_type: sourceType,
        note: input.note?.trim() || null,
        log_group_id: input.logGroupId ?? null,
        saved_meal_id: input.savedMealId ?? null,
        user_provided_nutrition: userProvidedNutrition,
        ...nutrientsToColumns(snapshot),
      })
      .select(LOG_SELECT)
      .single();
    if (error || !data) throw error ?? new Error('Failed to log food');
    return mapLogRow(data as any);
  },

  /** Corrects a logged quantity (N1 §20). Re-resolves grams and re-freezes the snapshot from the same canonical food. */
  async updateFoodLogQuantity(
    entryId: string, quantity: number, unit: LogUnit, servingLabel?: string | null,
  ): Promise<FoodLogEntry> {
    const { data: existing } = await supabase
      .from('food_log_entries').select('food_id, user_provided_nutrition').eq('id', entryId).maybeSingle();
    if (!existing) throw new Error('Entry not found');

    // A user-provided homemade/packaged row has no canonical food to re-scale
    // from — its numbers describe a specific portion the user ate. Editing
    // the amount can't reinterpret those totals, so this path won't touch it;
    // the UI deletes and re-adds instead.
    if ((existing as any).user_provided_nutrition === true) {
      throw new Error('Delete and re-add a homemade entry to change its amount.');
    }

    let quantityGrams: number | null = null;
    let snapshot: Nutrients = emptyNutrients();
    if ((existing as any).food_id) {
      const food = await this.getFood((existing as any).food_id);
      if (!food) throw new Error('Food not found');
      quantityGrams = resolveGrams(food, quantity, unit, servingLabel);
      snapshot = computeLogSnapshot(food, quantityGrams);
    }

    const { data, error } = await supabase
      .from('food_log_entries')
      .update({
        quantity, unit,
        serving_label: unit === 'serving' ? (servingLabel ?? null) : null,
        quantity_grams: quantityGrams,
        updated_at: new Date().toISOString(),
        ...nutrientsToColumns(snapshot),
      })
      .eq('id', entryId)
      .select(LOG_SELECT)
      .single();
    if (error || !data) throw error ?? new Error('Failed to update entry');
    return mapLogRow(data as any);
  },

  async deleteFoodLog(entryId: string): Promise<void> {
    const { error } = await supabase.from('food_log_entries').delete().eq('id', entryId);
    if (error) throw error;
  },

  /**
   * Nutrition N6 — deletes every entry of one logged occurrence (§42). The
   * caller shows exactly which rows will go before calling this; history is
   * never mutated silently. Owner-scoped and group-scoped; RLS also enforces
   * ownership. Deleting a saved meal never calls this — definitions and
   * evidence are independent (§28).
   */
  async deleteLogGroup(userId: string, logGroupId: string): Promise<void> {
    const { error } = await supabase
      .from('food_log_entries')
      .delete()
      .eq('user_id', userId)
      .eq('log_group_id', logGroupId);
    if (error) throw error;
  },

  /**
   * Nutrition N5 — logs several confirmed foods from one photo as INDEPENDENT
   * N1 rows (§27). Sequential (not Promise.all) so a mid-batch failure leaves
   * no ambiguity: each item gets its own `{ ok, entryId? , error? }`. There is
   * no dedup key — the caller retries only the items whose `ok` was false,
   * keyed by their own `itemId`, so a retry never duplicates a success (§28).
   */
  async logFoodBatch(
    userId: string,
    items: { itemId: string; input: FoodLogInput }[],
    now: Date = new Date(),
  ): Promise<{ itemId: string; ok: boolean; entryId?: string; error?: string }[]> {
    const out: { itemId: string; ok: boolean; entryId?: string; error?: string }[] = [];
    for (const { itemId, input } of items) {
      try {
        const entry = await this.logFood(userId, input, now);
        out.push({ itemId, ok: true, entryId: entry.id });
      } catch (e) {
        out.push({ itemId, ok: false, error: e instanceof Error ? e.message : 'Failed to log' });
      }
    }
    return out;
  },

  /**
   * A day's actual intake: the entries + deterministic totals summed from
   * their snapshots (N1 §21). Not derived from meal_plan_items or the
   * eaten/skipped toggle — food_log_entries is the source of truth for what
   * was actually eaten.
   */
  async getDailyNutrition(userId: string, localDate: string): Promise<{ summary: DailyNutritionSummary; entries: FoodLogEntry[] }> {
    const { data } = await supabase
      .from('food_log_entries')
      .select(LOG_SELECT)
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .order('logged_at', { ascending: true });
    const entries = ((data as any[]) ?? []).map(mapLogRow);
    const { macros, micros } = sumDailyNutrition(entries);
    return {
      entries,
      summary: {
        localDate,
        entryCount: entries.length,
        customEntryCount: entries.filter(e => e.foodId == null).length,
        energyKcal: macros.energyKcal,
        proteinG: macros.proteinG,
        carbohydrateG: macros.carbohydrateG,
        fatG: macros.fatG,
        fibreG: macros.fibreG,
        micros,
      },
    };
  },

  /**
   * Nutrition N2 — a bounded window of recent nutrition, in ONE query (§19).
   * Fetches every food_log_entry whose local_date is within the last `days`
   * ending at `endLocalDate` (inclusive), then derives the per-day view and
   * an entries-by-date map deterministically from the FROZEN snapshots.
   * No per-day network round trips; no nutrition_day table.
   */
  async getNutritionRange(
    userId: string,
    days: number,
    endLocalDate: string = localISODate(new Date()),
  ): Promise<{
    range: { start: string; end: string };
    days: DayNutrition[];
    entriesByDate: Record<string, FoodLogEntry[]>;
    /** flat, newest-day-first then oldest-log-first within a day — for pattern building */
    entries: FoodLogEntry[];
  }> {
    const start = addLocalDays(endLocalDate, -(Math.max(1, days) - 1));
    const { data } = await supabase
      .from('food_log_entries')
      .select(LOG_SELECT)
      .eq('user_id', userId)
      .gte('local_date', start)
      .lte('local_date', endLocalDate)
      .order('local_date', { ascending: true })
      .order('logged_at', { ascending: true });
    const entries = ((data as any[]) ?? []).map(mapLogRow);

    const entriesByDate: Record<string, FoodLogEntry[]> = {};
    for (const e of entries) (entriesByDate[e.localDate] ??= []).push(e);

    return {
      range: { start, end: endLocalDate },
      days: buildHistory(entries, Math.max(1, days), endLocalDate),
      entriesByDate,
      entries,
    };
  },
};
