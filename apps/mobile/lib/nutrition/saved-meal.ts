// ACP Intelligence™ — Nutrition N6. Saved Meals: the PURE layer.
//
// A saved meal is a RECIPE FOR CREATING FOOD EVIDENCE (§2), never an opaque
// total (§7). This module models the editable draft and computes a
// DETERMINISTIC preview + the N1 log inputs — using the exact N1 pure maths
// (resolveGrams / computeLogSnapshot) and the exact N2 completeness logic
// (summariseDay). No LLM, no network, no cached totals.
//
// Every nutrient in a preview or a logged entry stays traceable to a
// canonical component food (§26). Name-only "custom" foods cannot be
// components — there is nothing to reproduce or calculate (§20).

import type {
  CanonicalFood, FoodLogEntry, FoodLogInput, LogUnit, MealSlot, NutrientKey, SavedMealProvenance,
} from './food-types.ts';
import { resolveGrams, computeLogSnapshot, PortionError } from './food-nutrition.ts';
import { summariseDay, type NutrientCompleteness } from './nutrition-history.ts';

export const SAVED_MEAL_NAME_MAX = 80;
export const SAVED_MEAL_MAX_COMPONENTS = 30; // a sane ceiling; a real meal is well under this

// ── Draft model (what the create/edit screen holds) ──────────────────────

/** One component while editing — mirrors the N1 Log-food portion fields
 *  (quantity is a string so the input can be mid-edit). */
export interface DraftComponent {
  /** stable within one edit session */
  key: string;
  food: CanonicalFood;
  quantity: string;
  unit: LogUnit;
  servingLabel: string | null;
}

export interface SavedMealDraft {
  /** present when editing an existing saved meal */
  id: string | null;
  name: string;
  description: string;
  components: DraftComponent[];
  /** N6.5 (Beta #018) — how this definition was built. An ingredient list is
   *  `user_recipe_from_components` (the default); a saved approximate meal is
   *  `user_meal_estimated`. */
  provenance: SavedMealProvenance;
}

/** A minimal spec used to pre-fill a draft from an existing log / a photo
 *  batch (§11/§24) — the screen re-fetches each canonical food to hydrate. */
export interface PrefillComponent {
  foodId: string;
  quantity: number;
  unit: LogUnit;
  servingLabel: string | null;
}

/** A persisted saved meal (service maps the DB rows + joined foods to this). */
export interface SavedMeal {
  id: string;
  name: string;
  description: string | null;
  provenance: SavedMealProvenance;
  createdAt: string;
  updatedAt: string;
  components: {
    id: string;
    food: CanonicalFood;
    quantity: number;
    unit: LogUnit;
    servingLabel: string | null;
    sortOrder: number;
  }[];
}

let __seq = 0;
export function newComponentKey(): string {
  return `smc_${Date.now().toString(36)}_${(++__seq).toString(36)}`;
}

/** Same portion defaulting rule as N1 Log-food: a named serving when the food
 *  has one, otherwise grams (its default serving grams, else 100). */
export function defaultPortionForFood(food: CanonicalFood): Pick<DraftComponent, 'quantity' | 'unit' | 'servingLabel'> {
  if (food.servings.length > 0) {
    return { quantity: '1', unit: 'serving', servingLabel: food.defaultServingLabel ?? food.servings[0].label };
  }
  return { quantity: String(food.defaultServingGrams ?? 100), unit: 'g', servingLabel: null };
}

/** Valid units for a food — g always, ml only with a real density, serving
 *  only when the food has named servings (identical to N1 Log-food). */
export function unitOptionsForFood(food: CanonicalFood): LogUnit[] {
  return [
    'g',
    ...(food.densityGPerMl != null ? ['ml' as LogUnit] : []),
    ...(food.servings.length > 0 ? ['serving' as LogUnit] : []),
  ];
}

export function emptyDraft(): SavedMealDraft {
  return { id: null, name: '', description: '', components: [], provenance: 'user_recipe_from_components' };
}

export function draftFromSavedMeal(meal: SavedMeal): SavedMealDraft {
  return {
    id: meal.id,
    name: meal.name,
    description: meal.description ?? '',
    provenance: meal.provenance,
    components: [...meal.components]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => ({
        key: newComponentKey(),
        food: c.food,
        quantity: String(c.quantity),
        unit: c.unit,
        servingLabel: c.servingLabel,
      })),
  };
}

export function componentFromFood(food: CanonicalFood): DraftComponent {
  return { key: newComponentKey(), food, ...defaultPortionForFood(food) };
}

/** Hydrate pre-fill specs into draft components, given the re-fetched foods.
 *  Specs whose food could not be loaded are dropped (§11 — never fabricate). */
export function componentsFromPrefill(
  specs: PrefillComponent[],
  foodsById: Map<string, CanonicalFood>,
): DraftComponent[] {
  const out: DraftComponent[] = [];
  for (const spec of specs) {
    const food = foodsById.get(spec.foodId);
    if (!food) continue;
    out.push({
      key: newComponentKey(),
      food,
      quantity: String(spec.quantity),
      unit: spec.unit,
      servingLabel: spec.unit === 'serving' ? spec.servingLabel : null,
    });
  }
  return out;
}

/** The pre-fill spec for "Save these as a meal" — only canonical entries
 *  (foodId + a resolved portion); name-only customs are skipped (§20). */
export function prefillFromEntries(entries: Pick<FoodLogEntry,
  'foodId' | 'quantity' | 'unit' | 'servingLabel' | 'quantityGrams'>[]): PrefillComponent[] {
  const out: PrefillComponent[] = [];
  for (const e of entries) {
    if (!e.foodId || e.quantityGrams == null) continue;
    out.push({
      foodId: e.foodId,
      quantity: e.quantity,
      unit: e.unit,
      servingLabel: e.unit === 'serving' ? e.servingLabel : null,
    });
  }
  return out;
}

// ── Draft operations (pure, immutable) ───────────────────────────────────

export function renameDraft(draft: SavedMealDraft, name: string): SavedMealDraft {
  return { ...draft, name };
}
export function addComponent(draft: SavedMealDraft, food: CanonicalFood): SavedMealDraft {
  if (draft.components.length >= SAVED_MEAL_MAX_COMPONENTS) return draft;
  return { ...draft, components: [...draft.components, componentFromFood(food)] };
}
export function removeComponent(draft: SavedMealDraft, key: string): SavedMealDraft {
  return { ...draft, components: draft.components.filter(c => c.key !== key) };
}
export function setComponentFood(draft: SavedMealDraft, key: string, food: CanonicalFood): SavedMealDraft {
  return {
    ...draft,
    components: draft.components.map(c =>
      c.key === key ? { key: c.key, food, ...defaultPortionForFood(food) } : c),
  };
}
export function setComponentPortion(
  draft: SavedMealDraft, key: string, patch: Partial<Pick<DraftComponent, 'quantity' | 'unit' | 'servingLabel'>>,
): SavedMealDraft {
  return {
    ...draft,
    components: draft.components.map(c => (c.key === key ? { ...c, ...patch } : c)),
  };
}
/** Move a component to a new index (§9 reorder). Out-of-range indices are clamped. */
export function reorderComponent(draft: SavedMealDraft, from: number, to: number): SavedMealDraft {
  const list = [...draft.components];
  if (from < 0 || from >= list.length) return draft;
  const clampedTo = Math.max(0, Math.min(to, list.length - 1));
  const [moved] = list.splice(from, 1);
  list.splice(clampedTo, 0, moved);
  return { ...draft, components: list };
}

// ── Validation ───────────────────────────────────────────────────────────

export interface DraftValidation {
  ok: boolean;
  nameError: string | null;
  componentErrors: { key: string; message: string }[];
}

export function validateDraft(draft: SavedMealDraft): DraftValidation {
  const trimmed = draft.name.trim();
  let nameError: string | null = null;
  if (trimmed.length === 0) nameError = 'Give your meal a name.';
  else if (trimmed.length > SAVED_MEAL_NAME_MAX) nameError = `Keep the name under ${SAVED_MEAL_NAME_MAX} characters.`;

  const componentErrors: { key: string; message: string }[] = [];
  if (draft.components.length === 0) {
    componentErrors.push({ key: '', message: 'Add at least one food.' });
  }
  for (const c of draft.components) {
    try {
      resolveGrams(c.food, Number(c.quantity), c.unit, c.servingLabel);
    } catch (e) {
      componentErrors.push({ key: c.key, message: e instanceof PortionError ? e.message : 'Enter a valid amount.' });
    }
  }
  return { ok: nameError == null && componentErrors.length === 0, nameError, componentErrors };
}

// ── Deterministic preview (§18/§19) ──────────────────────────────────────

export interface SavedMealPreview {
  /** macros: 0 when nothing is known (matches N1/N2) */
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fibreG: number;
  /** micronutrients: `null` when no resolvable component supplied the nutrient */
  micros: Partial<Record<NutrientKey, number | null>>;
  /** per-nutrient completeness across the resolvable components (N2 semantics) */
  completeness: Record<NutrientKey, NutrientCompleteness>;
  resolved: { key: string; grams: number; energyKcal: number | null }[];
  unresolved: { key: string; message: string }[];
  /** true when at least one component could be resolved and every component was */
  complete: boolean;
}

/**
 * The nutrient preview for a draft: resolve each component to grams with N1's
 * resolveGrams, freeze a per-component snapshot with computeLogSnapshot, then
 * reuse N2's summariseDay for NULL-aware totals + completeness. Components
 * with an invalid portion are reported in `unresolved` and excluded from the
 * totals — the preview never invents a number for them.
 */
export function computeSavedMealPreview(components: DraftComponent[]): SavedMealPreview {
  const resolved: SavedMealPreview['resolved'] = [];
  const unresolved: SavedMealPreview['unresolved'] = [];
  // Minimal shapes summariseDay actually reads: quantityGrams + nutrients.
  const synthetic: Pick<FoodLogEntry, 'quantityGrams' | 'nutrients'>[] = [];

  for (const c of components) {
    try {
      const grams = resolveGrams(c.food, Number(c.quantity), c.unit, c.servingLabel);
      const snap = computeLogSnapshot(c.food, grams);
      synthetic.push({ quantityGrams: grams, nutrients: snap });
      resolved.push({ key: c.key, grams, energyKcal: snap.energyKcal });
    } catch (e) {
      unresolved.push({ key: c.key, message: e instanceof PortionError ? e.message : 'Enter a valid amount.' });
    }
  }

  const day = summariseDay('preview', synthetic as FoodLogEntry[]);
  return {
    energyKcal: day.energyKcal,
    proteinG: day.proteinG,
    carbohydrateG: day.carbohydrateG,
    fatG: day.fatG,
    fibreG: day.fibreG,
    micros: day.micros,
    completeness: day.completeness,
    resolved,
    unresolved,
    complete: resolved.length > 0 && unresolved.length === 0,
  };
}

// ── Persistence mapping ──────────────────────────────────────────────────

export interface SavedMealItemRow {
  food_id: string;
  quantity: number;
  unit: LogUnit;
  serving_label: string | null;
  sort_order: number;
}

/** Draft components → `saved_meal_items` insert rows (order preserved). */
export function draftToItemRows(draft: SavedMealDraft): SavedMealItemRow[] {
  return draft.components.map((c, i) => ({
    food_id: c.food.id,
    quantity: Number(c.quantity),
    unit: c.unit,
    serving_label: c.unit === 'serving' ? c.servingLabel : null,
    sort_order: i,
  }));
}

// ── Logging a saved meal → N1 food evidence (§5/§14/§54) ─────────────────

export interface PreparedSavedMealItem {
  key: string;
  input: FoodLogInput;
  previewGrams: number;
  previewKcal: number | null;
}
export interface PrepareSavedMealLog {
  prepared: PreparedSavedMealItem[];
  errors: { key: string; message: string }[];
}

/**
 * Build the N1 FoodLogInputs for logging a saved meal (§14). Each component
 * becomes an INDEPENDENT food_log_entries row: its own resolved grams, its
 * own frozen snapshot, canonical provenance intact. Every row carries the
 * same `logGroupId` (this occurrence) + `savedMealId` (which definition), and
 * `captureMethod: 'saved_meal'`. Pure; the service does the writes.
 */
export function prepareSavedMealLog(
  components: DraftComponent[],
  opts: { slot: MealSlot | null; savedMealId: string | null; logGroupId: string },
): PrepareSavedMealLog {
  const prepared: PreparedSavedMealItem[] = [];
  const errors: { key: string; message: string }[] = [];

  for (const c of components) {
    try {
      const grams = resolveGrams(c.food, Number(c.quantity), c.unit, c.servingLabel);
      const snap = computeLogSnapshot(c.food, grams);
      prepared.push({
        key: c.key,
        previewGrams: grams,
        previewKcal: snap.energyKcal,
        input: {
          foodId: c.food.id,
          displayName: c.food.name,
          brand: c.food.brand,
          quantity: Number(c.quantity),
          unit: c.unit,
          servingLabel: c.unit === 'serving' ? c.servingLabel : null,
          mealSlot: opts.slot,
          captureMethod: 'saved_meal',
          logGroupId: opts.logGroupId,
          savedMealId: opts.savedMealId,
        },
      });
    } catch (e) {
      errors.push({ key: c.key, message: e instanceof PortionError ? e.message : 'Enter a valid amount.' });
    }
  }
  return { prepared, errors };
}
