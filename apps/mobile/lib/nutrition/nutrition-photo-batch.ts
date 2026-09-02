// ACP Intelligence™ — Nutrition N5. Pure batch-logging preparation (§27/§28).
//
// One photo can produce several food_log_entries. Each remains an INDEPENDENT
// N1 evidence row (canonical id, provenance, confirmed quantity, frozen
// snapshot, meal slot, local date). There is no "camera meal total" — the
// batch is just N1 rows logged together.
//
// This module resolves + validates every confirmed item's portion BEFORE any
// write, using the exact N1 pure maths (resolveGrams / computeLogSnapshot),
// so an invalid portion is caught deterministically and the write is never
// attempted (§49). The actual persistence is foodLogService.logFoodBatch,
// which reports a per-item result (§28).

import type { FoodLogInput, MealSlot } from './food-types.ts';
import { resolveGrams, computeLogSnapshot, PortionError } from './food-nutrition.ts';
import { loggableItems, type PhotoConfirmationItem } from './nutrition-photo.ts';

export interface PreparedLogItem {
  itemId: string;
  input: FoodLogInput;
  /** grams + kcal preview for the confirmation UI — computed with the same pure maths the service persists */
  previewGrams: number;
  previewKcal: number | null;
}

export interface PrepareResult {
  prepared: PreparedLogItem[];
  /** items that could not be prepared (bad portion) — the batch must not proceed with these */
  errors: { itemId: string; message: string }[];
}

/**
 * Validate + build FoodLogInput for every loggable confirmation item.
 * `slot` is applied to all rows in the batch (§29). Pure; no I/O.
 */
export function prepareBatchLog(items: PhotoConfirmationItem[], slot: MealSlot | null): PrepareResult {
  const prepared: PreparedLogItem[] = [];
  const errors: { itemId: string; message: string }[] = [];

  for (const item of loggableItems(items)) {
    const food = item.food!;
    const qn = Number(item.quantity);
    try {
      const grams = resolveGrams(food, qn, item.unit, item.servingLabel);
      const snap = computeLogSnapshot(food, grams);
      prepared.push({
        itemId: item.id,
        previewGrams: grams,
        previewKcal: snap.energyKcal,
        input: {
          foodId: food.id,
          displayName: food.name,
          brand: food.brand,
          quantity: qn,
          unit: item.unit,
          servingLabel: item.unit === 'serving' ? item.servingLabel : null,
          mealSlot: slot,
          captureMethod: 'camera', // provenance: capture method = camera; nutrition source stays canonical (§33)
        },
      });
    } catch (e) {
      errors.push({ itemId: item.id, message: e instanceof PortionError ? e.message : 'Enter a valid amount.' });
    }
  }
  return { prepared, errors };
}

export interface BatchItemResult {
  itemId: string;
  ok: boolean;
  entryId?: string;
  error?: string;
}

export interface BatchLogOutcome {
  results: BatchItemResult[];
  allOk: boolean;
  loggedCount: number;
  failedCount: number;
}

/** Fold a list of per-item outcomes into a truthful summary (§28 — never a false "all done"). */
export function summariseBatch(results: BatchItemResult[]): BatchLogOutcome {
  const loggedCount = results.filter(r => r.ok).length;
  const failedCount = results.length - loggedCount;
  return { results, allOk: failedCount === 0 && results.length > 0, loggedCount, failedCount };
}
