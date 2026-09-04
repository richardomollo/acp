// ACP Intelligence™ — Nutrition N6. The one service boundary for saved meals
// ("My meals"). UI screens call only this; never Supabase directly.
//
// A saved meal is a user-owned RECIPE: canonical-food components + confirmed
// portions (§2/§7). This service does owner-scoped CRUD on saved_meals /
// saved_meal_items (RLS also enforces ownership), and LOGS a saved meal by
// delegating to N1 — each component becomes an independent food_log_entries
// row with its own frozen snapshot (§5/§54). No LLM, no RAG, no cached
// totals: the preview is always recomputed by the pure layer.

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { foodLogService } from '@/services/food-log-service';
import { FOOD_SELECT, mapDbFoodRow } from '@/services/providers/food-provider';
import type { LogUnit, MealSlot } from '@/lib/nutrition/food-types';
import {
  draftToItemRows, prepareSavedMealLog,
  type SavedMeal, type SavedMealDraft, type DraftComponent,
} from '@/lib/nutrition/saved-meal';

const MEAL_SELECT = `
  id, name, description, provenance, created_at, updated_at,
  saved_meal_items (
    id, quantity, unit, serving_label, sort_order,
    foods ( ${FOOD_SELECT}, food_servings ( label, grams, sort_order ) )
  )
`;

function mapMealRow(row: any): SavedMeal {
  const items = ((row.saved_meal_items as any[]) ?? [])
    .filter(it => it.foods) // a component whose canonical food vanished is dropped, never faked
    .map(it => ({
      id: String(it.id),
      food: mapDbFoodRow(it.foods, ((it.foods.food_servings as any[]) ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))),
      quantity: Number(it.quantity),
      unit: it.unit as LogUnit,
      servingLabel: it.serving_label ?? null,
      sortOrder: Number(it.sort_order ?? 0),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ?? null,
    provenance: row.provenance === 'user_meal_estimated' ? 'user_meal_estimated' : 'user_recipe_from_components',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    components: items,
  };
}

export const savedMealService = {
  /** The user's saved meals, most-recently-updated first. Components are
   *  included so "My meals" can show a deterministic preview + count (§39)
   *  from ONE query — no N+1 (§43). */
  async list(): Promise<SavedMeal[]> {
    const { data, error } = await supabase
      .from('saved_meals')
      .select(MEAL_SELECT)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ((data as any[]) ?? []).map(mapMealRow);
  },

  async get(id: string): Promise<SavedMeal | null> {
    const { data, error } = await supabase
      .from('saved_meals')
      .select(MEAL_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapMealRow(data) : null;
  },

  /** Create a saved meal from a validated draft. Two writes (meal, then its
   *  items); if the items write fails the empty meal is cleaned up so the
   *  list never shows a foodless meal. */
  async create(userId: string, draft: SavedMealDraft): Promise<string> {
    const { data: meal, error: mealErr } = await supabase
      .from('saved_meals')
      .insert({
        user_id: userId,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        provenance: draft.provenance,
      })
      .select('id')
      .single();
    if (mealErr || !meal) throw mealErr ?? new Error('Could not create meal');

    const rows = draftToItemRows(draft).map(r => ({ ...r, saved_meal_id: meal.id }));
    const { error: itemsErr } = await supabase.from('saved_meal_items').insert(rows);
    if (itemsErr) {
      await supabase.from('saved_meals').delete().eq('id', meal.id);
      throw itemsErr;
    }
    return String(meal.id);
  },

  /** Replace a saved meal's name/description and its full component list.
   *  Historical food_log_entries created from earlier versions are untouched
   *  — they are frozen, independent rows (§9/§55). */
  async update(id: string, draft: SavedMealDraft): Promise<void> {
    const { error: mealErr } = await supabase
      .from('saved_meals')
      .update({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        provenance: draft.provenance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (mealErr) throw mealErr;

    const { error: delErr } = await supabase.from('saved_meal_items').delete().eq('saved_meal_id', id);
    if (delErr) throw delErr;

    const rows = draftToItemRows(draft).map(r => ({ ...r, saved_meal_id: id }));
    const { error: insErr } = await supabase.from('saved_meal_items').insert(rows);
    if (insErr) throw insErr;
  },

  /** Delete the reusable definition (cascade removes its items). Historical
   *  food logs created from it REMAIN — the FK is ON DELETE SET NULL (§28). */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('saved_meals').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Log a saved meal (§14). `components` is the reviewed list from the log
   * screen (amounts may have been adjusted). Every resulting food_log_entry
   * shares one freshly generated `logGroupId` (this occurrence) and carries
   * `savedMealId`. Returns per-component results (retry-safe by component
   * key, exactly like N5's batch) plus the group id.
   */
  async log(
    userId: string,
    savedMealId: string | null,
    components: DraftComponent[],
    slot: MealSlot | null,
    now: Date = new Date(),
  ): Promise<{
    logGroupId: string;
    prepareErrors: { key: string; message: string }[];
    results: { itemId: string; ok: boolean; entryId?: string; error?: string }[];
  }> {
    const logGroupId = Crypto.randomUUID();
    const { prepared, errors } = prepareSavedMealLog(components, { slot, savedMealId, logGroupId });
    if (errors.length > 0) return { logGroupId, prepareErrors: errors, results: [] };

    const results = await foodLogService.logFoodBatch(
      userId,
      prepared.map(p => ({ itemId: p.key, input: p.input })),
      now,
    );
    return { logGroupId, prepareErrors: [], results };
  },
};
