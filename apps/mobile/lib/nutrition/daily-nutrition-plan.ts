// ACP Intelligence™ — Nutrition #022. The daily nutrition orchestrator.
//
// Beta Feedback #022 — the DAY is the unit of optimisation (spec §6): a
// breakfast recommendation affects what's appropriate for lunch/dinner, so
// slots are ranked in a single pass, in a fixed order, threading a running
// protein tally forward — never generated independently of each other.
//
// Evidence hierarchy this implements (spec §2), highest first:
//   HARD:      vegetarian restriction, explicit exclusions            — filtered out entirely
//   VERY STRONG: behavioural preference (meal-preference-learning.ts),
//                goal/tag fit, explicit cuisine preference
//   STRONG:    day-level protein-budget fit (what's left today)
//   (location is accepted for the input shape's sake — spec §10 — but this
//    module never reads it for cuisine/ranking; it is a structural no-op
//    here because neither `meals` nor `saved_meals` carries a
//    venue/geography field to condition on. See the module's tests.)
//
// No LLM, no network, no Math.random() — a pure function of its arguments.
// Calorie/fat/carb targets are DELIBERATELY not computed here (see the #022
// report §F): Lana has no personalised TDEE/BMR engine, and inventing one
// would cross into exactly the medically-adjacent territory
// nutrition-coaching-safety.ts already bans from coaching copy. Protein is
// the one macro with an existing, vetted, non-diagnostic personalised
// reference (N3's PROTEIN_PERFORMANCE_REFERENCE) — the orchestrator's only
// numeric "budget" concept — everything else stays a qualitative goal/tag
// fit, exactly as lib/nutrition-goal-fit.ts already does elsewhere.

import type { MealSlot } from './food-types.ts';
import { cuisineFitScore } from '../nutrition-cuisine.ts';
import { scoreMealForGoal, type GoalFitMeal } from '../nutrition-goal-fit.ts';
import { stableHash } from '../nutrition-matching.ts';
import type { MealCandidate } from './nutrition-meal-model.ts';
import { mealCandidateKey } from './nutrition-meal-model.ts';
import { normalisePreferenceScore, type MealPreferenceScore } from './meal-preference-learning.ts';

// ── Explicit, tested weights (spec §2/§9 — "make weights/constants explicit") ──
const W_PREFERENCE = 0.40;   // VERY STRONG — behavioural history (consumed/saved/swapped-away)
const W_GOAL_FIT = 0.25;     // VERY STRONG — goal/tag fit (protein/fibre/balance signals)
const W_CUISINE_FIT = 0.15;  // VERY STRONG — explicit cuisine preference
const W_PROTEIN_BUDGET = 0.20; // STRONG — day-level remaining-protein pacing

export interface ProteinBudget {
  minG: number;
  maxG: number;
}

export interface DailyNutritionPlanInput {
  date: string; // local YYYY-MM-DD
  /** meal occasions for today (spec §7) — caller resolves these from the
   *  profile if it already knows meal count/snack habits, else the MVP
   *  default of ['breakfast','lunch','dinner']. */
  slots: MealSlot[];
  /** already-fetched, not-yet-filtered candidates per slot (catalogue + saved meals) */
  candidatesBySlot: Partial<Record<MealSlot, MealCandidate[]>>;
  goal: string | null;
  /** explicit, user-declared cuisine preferences (never location-derived) */
  cuisinePreferences: string[];
  /** the one real hard dietary constraint this schema supports today (mirrors
   *  the existing lib/nutrition-matching.ts / lib/meal-ranking.ts filter) */
  requireVegetarian: boolean;
  /** candidate ids explicitly excluded by the user (spec §2 hard constraint hook) */
  excludedCandidateKeys?: string[];
  /** N3's personalised protein reference, or null when insufficient context
   *  (age/weight unknown) — never a fabricated number. */
  proteinBudget: ProteinBudget | null;
  /** today's ACTUAL logged protein so far (N1) — the sole basis for the
   *  user-facing "remaining today" figure (spec §15's own example). */
  consumedProteinSoFarG: number;
  /** behavioural scores, already computed by meal-preference-learning.ts,
   *  keyed by mealCandidateKey — pass the SAME map for every slot; this
   *  module reads only the entries relevant to each slot's candidates. */
  preferenceScores: Map<string, MealPreferenceScore>;
  /** accepted for the contract shape only (spec §10) — deliberately unread. */
  locationContext?: unknown;
  /** Beta #022A — a stable seed (e.g. `${userId}:${date}`) used ONLY to break
   *  genuine ties fairly across users/days (§1) — never to bias ranking
   *  itself. Omit for a fixed, fully deterministic tiebreak (used by tests
   *  that don't care about cross-user variety). */
  varietySeed?: string;
}

export interface RankedMealCandidate {
  candidate: MealCandidate;
  score: number;
}

export interface DailyMealPlanSlot {
  slot: MealSlot;
  /** the top-ranked, hard-constraint-safe candidate, or null when nothing
   *  safe exists for this slot (never a fabricated fallback). */
  recommended: MealCandidate | null;
  /** fixed, evidence-backed strings (spec §16) — a reason only ever appears
   *  when the signal that justifies it actually fired for this candidate. */
  reasons: string[];
  /** next-best safe candidates, already ranked — what "Swap" offers (spec §11). */
  alternates: MealCandidate[];
}

export interface DailyNutritionPlan {
  date: string;
  slots: DailyMealPlanSlot[];
  proteinBudget: ProteinBudget | null;
  /** sum of every slot's recommended candidate's protein — the day's planned total (spec §6) */
  proteinPlannedG: number;
  /** proteinBudget.maxG - consumedProteinSoFarG, or null when there's no budget to compare
   *  against. Deliberately based on ACTUAL consumption only (spec §15's own
   *  example) — never netted against unconsumed plan/recommendation totals. */
  proteinRemainingG: number | null;
}

function goalFitMealFromCandidate(c: MealCandidate): GoalFitMeal {
  return {
    calories: c.macros.calories ?? 0,
    protein_g: c.macros.proteinG ?? 0,
    carbs_g: c.macros.carbsG ?? 0,
    fat_g: c.macros.fatG ?? 0,
    fibre_g: c.macros.fibreG,
  };
}

/**
 * Beta #022A §1 — cold-start diversity. With NO explicit cuisine preference
 * (`cuisinePreferences.length === 0`), plain neutrality (every cuisine
 * scoring identically) is not enough on its own: a catalogue that happens to
 * be content-heavy in one region, combined with a FIXED tiebreak, would
 * silently and systematically recommend that region's dish to every cold-start
 * user regardless of where they are — never intended, never desired (spec:
 * "must not dominate merely because it exists in the catalogue or wins an
 * ID/default tiebreak"). `'global'` (an explicit, non-regional catalogue tag —
 * see the meals.cuisine taxonomy) is treated as the broadly-suitable default;
 * every REGIONAL cuisine — Kenyan, Western, Indian, or any other — scores
 * identically to every other regional cuisine, so no single region is ever
 * favoured over another by name. This ONLY applies pre-preference; the moment
 * any cuisine preference is stated, cuisineFitScore's real logic takes over
 * (§1: "explicit cuisine preference... should override the broad/default
 * behaviour").
 */
function broadSuitabilityScore(cuisine: string | null): number {
  if (!cuisine) return 0.5; // a saved/homemade meal has no catalogue cuisine tag — neutral
  return cuisine === 'global' ? 1 : 0.5;
}

function cuisineSignal(cuisine: string | null, cuisinePreferences: string[]): number {
  if (!cuisine) return 0.5;
  if (cuisinePreferences.length === 0) return broadSuitabilityScore(cuisine);
  return cuisineFitScore(cuisine, cuisinePreferences);
}

/** §6 day-level pacing: how well a candidate's protein fits what's left of
 *  today's budget, given how many slots (including this one) remain. 0.5 is
 *  "on pace"; higher when the candidate is at/above the fair share still
 *  needed, lower when it falls well short — never a hard exclusion, always a
 *  soft ranking nudge (spec §2's STRONG tier, not HARD). */
function proteinBudgetFit(candidateProteinG: number, remainingBudgetG: number | null, remainingSlotsCount: number): number {
  if (remainingBudgetG == null || remainingSlotsCount <= 0) return 0.5; // no budget context — neutral, never penalised
  const fairShare = remainingBudgetG / remainingSlotsCount;
  if (fairShare <= 0) return 0.5; // budget already met/exceeded — neutral, never punitive (spec §15)
  const diff = candidateProteinG - fairShare;
  return Math.max(0, Math.min(1, 0.5 + diff / (2 * fairShare)));
}

function buildReasons(
  candidate: MealCandidate,
  goal: string | null,
  cuisineFit: number,
  hasCuisinePreference: boolean,
  goalFit: ReturnType<typeof scoreMealForGoal>,
  preference: MealPreferenceScore | undefined,
  budgetFit: number,
): string[] {
  const reasons: string[] = [];
  // Priority order, at most 2, so the copy stays brief (spec §16) — each line
  // corresponds to a real, checkable signal, never fabricated.
  if (preference && preference.consumedCount >= 2) {
    reasons.push(`You often choose ${candidate.name} for this meal.`);
  }
  if (goalFit.proteinSignal === 1 && goal) {
    reasons.push('High-protein pick for your goal.');
  } else if (goalFit.balanceSignal === 1 && reasons.length === 0) {
    reasons.push('A balanced option for your goal.');
  }
  if (budgetFit >= 0.75 && reasons.length < 2) {
    reasons.push('Fits what you have remaining today.');
  }
  // Only ever attributed to a REAL stated preference (§1) — a 'global'
  // catalogue tag scoring well pre-preference via broadSuitabilityScore is
  // never described as "a cuisine you prefer".
  if (hasCuisinePreference && cuisineFit === 1 && reasons.length < 2) {
    reasons.push('Matches a cuisine you prefer.');
  }
  return reasons.slice(0, 2);
}

function rankSlotCandidates(
  candidates: MealCandidate[],
  input: DailyNutritionPlanInput,
  remainingBudgetG: number | null,
  remainingSlotsCount: number,
): RankedMealCandidate[] {
  const excluded = new Set(input.excludedCandidateKeys ?? []);

  // ── HARD constraints (spec §2) — applied before any scoring ──
  let pool = candidates.filter(c => !excluded.has(mealCandidateKey(c.source, c.id)));
  if (input.requireVegetarian) {
    pool = pool.filter(c => c.tags.includes('vegetarian') || c.tags.includes('vegan'));
  }

  const scored = pool.map(candidate => {
    const key = mealCandidateKey(candidate.source, candidate.id);
    const preference = input.preferenceScores.get(key);
    const preferenceFit = normalisePreferenceScore(preference?.netScore ?? 0);
    const cuisineFit = cuisineSignal(candidate.cuisine, input.cuisinePreferences);
    const goalFit = scoreMealForGoal(goalFitMealFromCandidate(candidate), input.goal);
    const budgetFit = proteinBudgetFit(candidate.macros.proteinG ?? 0, remainingBudgetG, remainingSlotsCount);

    const score =
      W_PREFERENCE * preferenceFit +
      W_GOAL_FIT * goalFit.overall +
      W_CUISINE_FIT * cuisineFit +
      W_PROTEIN_BUDGET * budgetFit;

    return { candidate, score, cuisineFit, goalFit, preference, budgetFit };
  });

  // §1 — ties (routine at cold start: identical preference/goal/cuisine/budget
  // signals) are broken by a seeded hash, never a fixed id sort — so the same
  // single candidate doesn't systematically win for every user/day merely
  // because of how the catalogue happens to be seeded/ordered.
  const seed = input.varietySeed ?? '';
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ha = stableHash(`${seed}:${a.candidate.source}:${a.candidate.id}`);
    const hb = stableHash(`${seed}:${b.candidate.source}:${b.candidate.id}`);
    if (ha !== hb) return ha - hb;
    return a.candidate.id.localeCompare(b.candidate.id); // final, absolute-determinism fallback
  });
  return scored.map(s => ({ candidate: s.candidate, score: s.score }));
}

/**
 * Builds one deterministic plan for the whole day. Slots are processed in
 * the order given (breakfast → lunch → dinner → snack when present) so each
 * later slot's protein-budget fit reflects everything already recommended
 * earlier in THIS pass (spec §6/§22) — never independently generated.
 */
export function buildDailyNutritionPlan(input: DailyNutritionPlanInput): DailyNutritionPlan {
  const slots: DailyMealPlanSlot[] = [];
  let runningPlannedProteinG = 0; // consumed-so-far + everything recommended earlier in this pass

  for (let i = 0; i < input.slots.length; i++) {
    const slot = input.slots[i];
    const candidates = input.candidatesBySlot[slot] ?? [];
    const remainingSlotsCount = input.slots.length - i;
    const remainingBudgetG = input.proteinBudget
      ? input.proteinBudget.maxG - input.consumedProteinSoFarG - runningPlannedProteinG
      : null;

    const ranked = rankSlotCandidates(candidates, input, remainingBudgetG, remainingSlotsCount);
    const top = ranked[0]?.candidate ?? null;

    if (top) {
      runningPlannedProteinG += top.macros.proteinG ?? 0;
      const key = mealCandidateKey(top.source, top.id);
      const preference = input.preferenceScores.get(key);
      const cuisineFit = cuisineSignal(top.cuisine, input.cuisinePreferences);
      const goalFit = scoreMealForGoal(goalFitMealFromCandidate(top), input.goal);
      const budgetFit = proteinBudgetFit(top.macros.proteinG ?? 0, remainingBudgetG, remainingSlotsCount);
      slots.push({
        slot,
        recommended: top,
        reasons: buildReasons(top, input.goal, cuisineFit, input.cuisinePreferences.length > 0, goalFit, preference, budgetFit),
        alternates: ranked.slice(1, 4).map(r => r.candidate),
      });
    } else {
      slots.push({ slot, recommended: null, reasons: [], alternates: [] });
    }
  }

  const proteinPlannedG = slots.reduce((sum, s) => sum + (s.recommended?.macros.proteinG ?? 0), 0);
  const proteinRemainingG = input.proteinBudget
    ? Math.round((input.proteinBudget.maxG - input.consumedProteinSoFarG) * 10) / 10
    : null;

  return { date: input.date, slots, proteinBudget: input.proteinBudget, proteinPlannedG, proteinRemainingG };
}

/** §11 — Swap: re-rank the SAME slot excluding the candidate being swapped
 *  away, so the replacement is still slot/budget-appropriate — never a
 *  random pick. The original recommendation is left untouched by the caller
 *  (this is a pure function; persistence of "recommended stays historical"
 *  is the service's job — see the #022 report §E). */
export function swapSlotCandidate(
  input: DailyNutritionPlanInput,
  slot: MealSlot,
  awayFromCandidateKey: string,
  remainingBudgetG: number | null,
  remainingSlotsCount: number,
): MealCandidate | null {
  const candidates = input.candidatesBySlot[slot] ?? [];
  const excluded = new Set([...(input.excludedCandidateKeys ?? []), awayFromCandidateKey]);
  const ranked = rankSlotCandidates(candidates, { ...input, excludedCandidateKeys: Array.from(excluded) }, remainingBudgetG, remainingSlotsCount);
  return ranked[0]?.candidate ?? null;
}
