// Lana Nutrition — "followed a suggested / planned meal = consumed".
//
// Product model: Lana SUGGESTS meals; when the user taps ✓ on a meal they
// actually ate, that becomes a real consumption record. SUGGESTED ≠ CONSUMED;
// only the explicit ✓ counts toward "Logged Today".
//
// This module is the deterministic, pure core of that action. The actual
// persistence reuses the EXISTING N1 consumption infrastructure
// (food_log_entries via foodLogService.logFood, Beta #022A's truthfully-
// attributed catalogue-snapshot path) — never a second nutrition-consumption
// system, and never mislabelled as the user's own numbers.
//
// Nothing here touches the meals catalogue or meal_plan_items. Undo simply
// removes the one food_log_entries occurrence this created.

import type { FoodLogInput, MealSlot, Nutrients } from './food-types.ts';

/** Only the four canonical log slots are valid on food_log_entries.meal_slot;
 *  anything else (e.g. a 'smoothie' suggestion slot) logs with no slot. */
export function normaliseFollowedSlot(slot: string | null | undefined): MealSlot | null {
  return slot === 'breakfast' || slot === 'lunch' || slot === 'dinner' || slot === 'snack'
    ? slot
    : null;
}

/** Stable identity for one followable meal on the Today screen.
 *  • suggested meal  → keyed by the catalogue meal id
 *  • plan meal       → keyed by the meal_plan_items row id (a meal can appear
 *    in more than one slot of a plan, so the item id — not the meal id — is
 *    the unit the user checks). */
export function followMealKey(opts: {
  suggested: boolean;
  mealId: string;
  mealPlanItemId?: string | null;
}): string {
  return opts.suggested || !opts.mealPlanItemId
    ? `sug:${opts.mealId}`
    : `plan:${opts.mealPlanItemId}`;
}

// cyrb128 — a small, well-distributed 128-bit string hash (public domain).
// Used only to derive a STABLE, collision-safe-within-one-user-day id; not a
// security primitive.
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k: number; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');

/**
 * A DETERMINISTIC uuid-format id for the food_log_entries occurrence that
 * records "user followed this meal on this local date". Same inputs always
 * produce the same id, so:
 *   • a repeated ✓ tap can be detected and no-op'd (no duplicate log), and
 *   • an un-✓ deletes exactly the row it created,
 * without needing any new column or unique constraint on food_log_entries.
 *
 * `localDate` is the user's LOCAL calendar day (YYYY-MM-DD) — never a UTC
 * slice — so a meal followed on the 8th in Nairobi stays on the 8th.
 */
export function followMealGroupId(userId: string, followKey: string, localDate: string): string {
  const [a, b, c, d] = cyrb128(`lana:followed-meal:${userId}:${followKey}:${localDate}`);
  const s = hex8(a) + hex8(b) + hex8(c) + hex8(d); // 32 hex chars
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/**
 * The FoodLogInput for "followed a Lana meal". The meal's own curated macros
 * are frozen verbatim (Beta #022A): `foodId` null, `userProvidedNutrition`
 * false, source attributed truthfully to the catalogue. `quantity/unit` are a
 * display-only basis — this row stores its own frozen totals and is never
 * re-scaled (identical to how logPlanned logs a catalogue meal).
 */
export function buildFollowedMealLogInput(opts: {
  mealName: string;
  slot: string | null | undefined;
  macros: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fibreG: number | null };
  logGroupId: string;
}): FoodLogInput {
  const nutrients: Partial<Nutrients> = {
    energyKcal: opts.macros.calories,
    proteinG: opts.macros.proteinG,
    carbohydrateG: opts.macros.carbsG,
    fatG: opts.macros.fatG,
    fibreG: opts.macros.fibreG,
  };
  return {
    foodId: null,
    displayName: opts.mealName.trim(),
    quantity: 100,
    unit: 'g',
    mealSlot: normaliseFollowedSlot(opts.slot),
    captureMethod: 'plan',
    userProvidedNutrition: false,
    source: 'Lana meal suggestions',
    sourceType: 'acp_curated',
    logGroupId: opts.logGroupId,
    nutrients,
  };
}

/** How a followed-meal row is recognised in food_log_entries (for reads that
 *  need to tell it apart from a manually logged food). */
export const FOLLOWED_MEAL_CAPTURE_METHOD = 'plan' as const;
export const FOLLOWED_MEAL_SOURCE_TYPE = 'acp_curated' as const;
