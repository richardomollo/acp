// ACP Intelligence™ — Nutrition N2. Deterministic daily + multi-day nutrition
// evidence, derived only from food_log_entries' FROZEN nutrient snapshots.
//
// Nothing here recalculates historical nutrition from today's canonical foods
// (§9): a DayNutrition is a pure function of the entries handed to it, whose
// `nutrients` were frozen at log time.
//
// Missing ≠ zero (§7): a nutrient that no logged food supplied stays `null`
// ("unknown"), never 0. Every day also carries per-nutrient COMPLETENESS so
// the UI can say "data available for 3 of 4 logged foods" instead of silently
// summing an unknown as zero.
//
// "No food logged" ≠ "0 kcal consumed" (§8): a day with no entries has
// `hasLogs: false`; a day where the user logged only name-only custom entries
// has `hasLogs: true` and 0 macros.

import { NUTRIENT_KEYS, MACRO_KEYS, type NutrientKey, type FoodLogEntry, type MealSlot } from './food-types.ts';
import { sumDailyNutrition } from './food-nutrition.ts';

export type CompletenessLevel = 'none' | 'limited' | 'partial' | 'complete';

export interface NutrientCompleteness {
  /** food entries (quantityGrams != null) that carried a value for this nutrient */
  knownEntryCount: number;
  /** food entries that COULD have carried a value (name-only customs excluded) */
  totalEntryCount: number;
  /** knownEntryCount / totalEntryCount, or 0 when totalEntryCount is 0 */
  coverageRatio: number;
  level: CompletenessLevel;
}

export interface DayNutrition {
  localDate: string;               // YYYY-MM-DD (user's local calendar day)
  /** false = nothing logged this day. Distinct from a day of 0-kcal custom entries. */
  hasLogs: boolean;
  entryCount: number;
  /** food entries only (name-only customs excluded) */
  foodEntryCount: number;
  /** macros: 0 when nothing is known (matches N1's sumDailyNutrition) */
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fibreG: number;
  /** micronutrients: `null` when NO logged food supplied the nutrient */
  micros: Partial<Record<NutrientKey, number | null>>;
  /** per-nutrient data completeness across this day's food entries */
  completeness: Record<NutrientKey, NutrientCompleteness>;
}

function levelFor(knownEntryCount: number, totalEntryCount: number): CompletenessLevel {
  if (totalEntryCount === 0 || knownEntryCount === 0) return 'none';
  const ratio = knownEntryCount / totalEntryCount;
  if (ratio >= 1) return 'complete';
  if (ratio >= 0.5) return 'partial';
  return 'limited';
}

/** True for an entry that carries a nutrient snapshot (i.e. a real food, not a name-only custom). */
function isFoodEntry(e: Pick<FoodLogEntry, 'quantityGrams'>): boolean {
  return e.quantityGrams != null;
}

/**
 * One day's nutrition from its entries. `localDate` is passed in (not derived
 * from `loggedAt`) — the caller groups by the client-authored local date,
 * preserving N1's timezone semantics (§20).
 */
export function summariseDay(localDate: string, entries: FoodLogEntry[]): DayNutrition {
  const foodEntries = entries.filter(isFoodEntry);
  const { macros, micros } = sumDailyNutrition(entries);

  const completeness = {} as Record<NutrientKey, NutrientCompleteness>;
  for (const k of NUTRIENT_KEYS) {
    const knownEntryCount = foodEntries.filter(e => e.nutrients[k] != null).length;
    const totalEntryCount = foodEntries.length;
    completeness[k] = {
      knownEntryCount,
      totalEntryCount,
      coverageRatio: totalEntryCount === 0 ? 0 : knownEntryCount / totalEntryCount,
      level: levelFor(knownEntryCount, totalEntryCount),
    };
  }

  return {
    localDate,
    hasLogs: entries.length > 0,
    entryCount: entries.length,
    foodEntryCount: foodEntries.length,
    energyKcal: macros.energyKcal,
    proteinG: macros.proteinG,
    carbohydrateG: macros.carbohydrateG,
    fatG: macros.fatG,
    fibreG: macros.fibreG,
    micros,
    completeness,
  };
}

/** Adds `n` days to a YYYY-MM-DD string, staying in the calendar-date domain (no tz maths). */
export function addLocalDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * A contiguous window of DayNutrition, newest first, `days` long, ending on
 * `endLocalDate` (inclusive). Days with no entries are still present, with
 * `hasLogs: false` — the caller renders "No food logged", never "0 kcal".
 * Entries are bucketed strictly by their `localDate` string (§9/§20).
 */
export function buildHistory(entries: FoodLogEntry[], days: number, endLocalDate: string): DayNutrition[] {
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.localDate);
    if (list) list.push(e); else byDate.set(e.localDate, [e]);
  }
  const out: DayNutrition[] = [];
  for (let i = 0; i < days; i++) {
    const date = addLocalDays(endLocalDate, -i);
    out.push(summariseDay(date, byDate.get(date) ?? []));
  }
  return out; // newest (endLocalDate) first
}

/** Total logged energy for a set of entries (known values only). */
export function knownEnergy(entries: Pick<FoodLogEntry, 'nutrients'>[]): number {
  return sumDailyNutrition(entries).macros.energyKcal;
}

/**
 * Nutrition N3 — multi-day average of a MICRONUTRIENT, NULL-aware (§34/§35).
 * Unlike the macro averages (which the day-level view coerces to 0 when
 * unknown), a micronutrient day total is `null` when no logged food that day
 * supplied it — such days are excluded from BOTH the sum and the divisor, so
 * "no data" never drags the average toward zero. Only days with `hasLogs`
 * are considered (a no-log day is not "0 days" of data, it's simply not in
 * the sample — see buildHistory).
 */
export function averageKnownNutrientPerLoggedDay(
  days: DayNutrition[], key: NutrientKey,
): { average: number | null; knownDayCount: number; loggedDayCount: number } {
  const logged = days.filter(d => d.hasLogs);
  const known = logged.map(d => d.micros[key]).filter((v): v is number => v != null);
  return {
    average: known.length > 0 ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) / 100 : null,
    knownDayCount: known.length,
    loggedDayCount: logged.length,
  };
}

export { MACRO_KEYS, isFoodEntry };
export type { MealSlot };
