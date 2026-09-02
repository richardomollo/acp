// ACP Intelligence™ — Nutrition N2. Deterministic eating-pattern EVIDENCE.
//
// This is observation, not coaching (§2/§10/§13). Every output is a factual
// count / average / share over the user's own logs. There is:
//   • no LLM, no network, no randomness — pure function of the entries;
//   • no deficiency detection, no "healthy/unhealthy", no "you skip X";
//   • no inference that an unlogged meal was skipped ("no breakfast logged"
//     ≠ "skipped breakfast", §12/§15).
//
// The evidence produced here is INPUT to a later Nutrition Intelligence layer.
// N2 stops before interpretation.

import type { NutrientKey, FoodLogEntry, MealSlot } from './food-types.ts';
import { sumDailyNutrition } from './food-nutrition.ts';
import { buildHistory, isFoodEntry, type DayNutrition } from './nutrition-history.ts';

/** Evidence strength for nutrition observations (§11). Its own domain — not the fitness tiers. */
export type NutritionEvidenceTier =
  | 'daily_observation'   // 0–1 logged days: today only, no pattern language
  | 'early_observation'   // 2–3 logged days
  | 'emerging_pattern'    // 4–6 logged days
  | 'recent_pattern';     // 7+ logged days

export function nutritionEvidenceTier(loggedDayCount: number): NutritionEvidenceTier {
  if (loggedDayCount >= 7) return 'recent_pattern';
  if (loggedDayCount >= 4) return 'emerging_pattern';
  if (loggedDayCount >= 2) return 'early_observation';
  return 'daily_observation';
}

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
type SlotBucket = MealSlot | 'unassigned';

export interface NutritionPatternEvidence {
  tier: NutritionEvidenceTier;
  windowDays: number;
  /** days in the window that have ≥1 entry */
  loggedDayCount: number;
  loggingFrequency: { loggedDays: number; windowDays: number };
  /** for each slot: number of LOGGED days on which that slot had ≥1 entry */
  mealSlotDayFrequency: Record<SlotBucket, number>;
  /** fraction of KNOWN logged energy (across the window) recorded in each slot; sums to ~1 when any energy is known */
  mealSlotEnergyShare: Record<SlotBucket, number>;
  /** mean over LOGGED days of that day's known macro total */
  averagesPerLoggedDay: Record<'energyKcal' | 'proteinG' | 'carbohydrateG' | 'fatG' | 'fibreG', number>;
  /** per-nutrient coverage across ALL food entries in the window */
  nutrientCoverage: Partial<Record<NutrientKey, { knownEntryCount: number; totalEntryCount: number; coverageRatio: number }>>;
  /** human-readable, descriptive-only observation lines (empty for daily_observation) */
  observations: string[];
}

function slotOf(e: Pick<FoodLogEntry, 'mealSlot'>): SlotBucket {
  return e.mealSlot ?? 'unassigned';
}

function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }

const SLOT_LABEL: Record<SlotBucket, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', unassigned: 'Unassigned entries',
};

export interface BuildPatternsOptions {
  windowDays: number;
  /** newest local date in the window (inclusive), YYYY-MM-DD */
  endLocalDate: string;
}

/**
 * Deterministic eating-pattern evidence over a bounded window of the user's
 * own food log entries. Pure — same entries + options ⇒ same output.
 */
export function buildNutritionPatterns(
  entries: FoodLogEntry[],
  opts: BuildPatternsOptions,
): NutritionPatternEvidence {
  const windowDays = opts.windowDays;
  const days: DayNutrition[] = buildHistory(entries, windowDays, opts.endLocalDate);
  const loggedDays = days.filter(d => d.hasLogs);
  const loggedDayCount = loggedDays.length;
  const tier = nutritionEvidenceTier(loggedDayCount);

  // Only entries that fall inside the window (buildHistory already bucketed them by date).
  const windowDates = new Set(days.map(d => d.localDate));
  const windowEntries = entries.filter(e => windowDates.has(e.localDate));
  const windowFoodEntries = windowEntries.filter(isFoodEntry);

  // ── meal-slot day frequency (how many logged days each slot appeared on) ──
  const mealSlotDayFrequency = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unassigned: 0 } as Record<SlotBucket, number>;
  const entriesByDate = new Map<string, FoodLogEntry[]>();
  for (const e of windowEntries) {
    const l = entriesByDate.get(e.localDate); if (l) l.push(e); else entriesByDate.set(e.localDate, [e]);
  }
  for (const d of loggedDays) {
    const slots = new Set((entriesByDate.get(d.localDate) ?? []).map(slotOf));
    for (const sl of slots) mealSlotDayFrequency[sl] += 1;
  }

  // ── meal-slot energy share (fraction of KNOWN logged energy per slot) ──
  const energyBySlot = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unassigned: 0 } as Record<SlotBucket, number>;
  for (const e of windowFoodEntries) {
    const kcal = e.nutrients.energyKcal;
    if (kcal != null) energyBySlot[slotOf(e)] += kcal;
  }
  const totalKnownEnergy = (Object.values(energyBySlot) as number[]).reduce((a, b) => a + b, 0);
  const mealSlotEnergyShare = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, unassigned: 0 } as Record<SlotBucket, number>;
  if (totalKnownEnergy > 0) {
    for (const sl of Object.keys(energyBySlot) as SlotBucket[]) {
      mealSlotEnergyShare[sl] = round2(energyBySlot[sl] / totalKnownEnergy);
    }
  }

  // ── per-logged-day macro averages (mean of each day's known total) ──
  const macroKeys = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fibreG'] as const;
  const averagesPerLoggedDay = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fibreG: 0 };
  if (loggedDayCount > 0) {
    for (const k of macroKeys) {
      const sum = loggedDays.reduce((acc, d) => acc + d[k], 0);
      averagesPerLoggedDay[k] = round1(sum / loggedDayCount);
    }
  }

  // ── nutrient coverage over all window food entries ──
  const nutrientCoverage: NutritionPatternEvidence['nutrientCoverage'] = {};
  const total = windowFoodEntries.length;
  if (total > 0) {
    const keys = Object.keys(windowFoodEntries[0].nutrients) as NutrientKey[];
    for (const k of keys) {
      const known = windowFoodEntries.filter(e => e.nutrients[k] != null).length;
      nutrientCoverage[k] = { knownEntryCount: known, totalEntryCount: total, coverageRatio: round2(known / total) };
    }
  }

  // ── descriptive observations (never for a single logged day) ──
  const observations: string[] = [];
  if (tier !== 'daily_observation') {
    observations.push(`You logged food on ${loggedDayCount} of the last ${windowDays} days.`);

    const bf = mealSlotDayFrequency.breakfast;
    if (bf > 0) observations.push(`Breakfast was logged on ${bf} of ${loggedDayCount} logged days.`);
    else observations.push(`No breakfast was logged in this window.`);

    if (averagesPerLoggedDay.proteinG > 0) {
      observations.push(`Average logged protein was ${averagesPerLoggedDay.proteinG} g/day across ${loggedDayCount} logged days.`);
    }
    if (averagesPerLoggedDay.fibreG > 0) {
      observations.push(`Average logged fibre was ${averagesPerLoggedDay.fibreG} g/day.`);
    }

    if (totalKnownEnergy > 0) {
      let topSlot: SlotBucket = 'breakfast';
      for (const sl of Object.keys(mealSlotEnergyShare) as SlotBucket[]) {
        if (mealSlotEnergyShare[sl] > mealSlotEnergyShare[topSlot]) topSlot = sl;
      }
      const pct = Math.round(mealSlotEnergyShare[topSlot] * 100);
      if (pct > 0) {
        observations.push(`${SLOT_LABEL[topSlot]} accounted for the largest share of your logged energy (${pct}%).`);
      }
    }

    // Coverage note — macros vs micros, in plain language, no judgement.
    if (total > 0) {
      const macroKnownAll = (['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'] as NutrientKey[])
        .every(k => (nutrientCoverage[k]?.coverageRatio ?? 0) >= 0.95);
      const someMicroPartial = (Object.keys(nutrientCoverage) as NutrientKey[])
        .some(k => !['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fibreG'].includes(k)
          && (nutrientCoverage[k]?.coverageRatio ?? 0) < 1 && (nutrientCoverage[k]?.coverageRatio ?? 0) > 0);
      if (macroKnownAll && someMicroPartial) {
        observations.push(`Nutrition data was complete for calories and macros, and partial for some micronutrients.`);
      } else if (!macroKnownAll) {
        observations.push(`Some logged foods did not include full calorie or macro data.`);
      }
    }
  }

  return {
    tier,
    windowDays,
    loggedDayCount,
    loggingFrequency: { loggedDays: loggedDayCount, windowDays },
    mealSlotDayFrequency,
    mealSlotEnergyShare,
    averagesPerLoggedDay,
    nutrientCoverage,
    observations,
  };
}

export { SLOT_LABEL, sumDailyNutrition };
