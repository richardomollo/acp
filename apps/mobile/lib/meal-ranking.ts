// ACP Intelligence™ Day 7.2 — deterministic meal-candidate ranking (section
// 26/27/32-34). Pure, framework-free — no LLM, no embeddings, no
// Math.random(). Hard constraints (inactive/wrong slot/incompatible dietary
// requirement) are applied before any soft scoring; cuisine preference and
// goal fit are ranking signals only, never exclusions (section 27).
import { cuisineFitScore } from './nutrition-cuisine.ts';
import { scoreMealForGoal, type GoalFitMeal } from './nutrition-goal-fit.ts';

export interface MealRow {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  tags: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g?: number | null;
  is_active: boolean;
}

export type ReasonCode =
  | 'preferred_cuisine' | 'goal_supportive' | 'high_protein' | 'high_fibre' | 'balanced_meal';

export interface MealCandidate {
  mealId: string;
  name: string;
  cuisine: string[];
  mealTypes: string[];
  nutrition: { calories: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number };
  dietaryTags: string[];
  scoring: { cuisineFit: number; goalFit: number; overall: number };
  reasons: ReasonCode[];
}

export interface GetMealCandidatesParams {
  /** Already meal-type-filtered at the query/call site (section 26 — DB-side filtering happens before this pure function runs). */
  meals: MealRow[];
  goal?: string | null;
  cuisinePreferences?: string[];
  /** Mirrors the existing hard-filter concept in lib/nutrition-matching.ts — the only dietary signal ACP's real `tags` data actually supports today (section 18). */
  requireVegetarian?: boolean;
  limit?: number;
}

function buildReasons(meal: MealRow, cuisineFit: number, goalFit: { proteinSignal: number; fibreSignal: number; balanceSignal: number }): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (cuisineFit === 1) reasons.push('preferred_cuisine');
  if (goalFit.proteinSignal === 1) reasons.push('high_protein');
  if (goalFit.fibreSignal === 1) reasons.push('high_fibre');
  if (goalFit.balanceSignal === 1) reasons.push('balanced_meal');
  if (goalFit.proteinSignal + goalFit.fibreSignal + goalFit.balanceSignal >= 2) reasons.push('goal_supportive');
  return reasons;
}

/**
 * Deterministic — the same input array always produces the same ordering
 * (stable sort by overall score, then meal id as a fixed tiebreak — never
 * Math.random(), section 25).
 */
export function getMealCandidates(params: GetMealCandidatesParams): MealCandidate[] {
  const cuisinePreferences = params.cuisinePreferences ?? [];

  // ── Hard constraints (section 27) ──
  let pool = params.meals.filter(m => m.is_active);
  if (params.requireVegetarian) {
    pool = pool.filter(m => m.tags.includes('vegetarian') || m.tags.includes('vegan'));
  }

  // ── Soft scoring (section 27) ──
  const scored: MealCandidate[] = pool.map(m => {
    const cuisineFit = cuisineFitScore(m.cuisine, cuisinePreferences);
    const goalFitBreakdown = scoreMealForGoal(m as GoalFitMeal, params.goal ?? null);
    const overall = 0.5 * goalFitBreakdown.overall + 0.5 * cuisineFit;
    return {
      mealId: m.id,
      name: m.name,
      cuisine: [m.cuisine],
      mealTypes: [m.category],
      nutrition: { calories: m.calories, proteinGrams: m.protein_g, carbohydrateGrams: m.carbs_g, fatGrams: m.fat_g },
      dietaryTags: m.tags,
      scoring: { cuisineFit, goalFit: goalFitBreakdown.overall, overall },
      reasons: buildReasons(m, cuisineFit, goalFitBreakdown),
    };
  });

  scored.sort((a, b) => b.scoring.overall - a.scoring.overall || a.mealId.localeCompare(b.mealId));

  return params.limit != null ? scored.slice(0, params.limit) : scored;
}

// ── Simple daily variety (section 29) ────────────────────────────────────
// Avoids picking the exact same cuisine for every slot in one day when an
// equally-strong alternative exists — never a full optimizer, just a
// deterministic "don't repeat the top cuisine if you don't have to" pass
// applied slot-by-slot, in the fixed order the caller provides.
export function applyDailyVariety(picksBySlot: { slot: string; candidates: MealCandidate[] }[]): { slot: string; candidate: MealCandidate | null }[] {
  const usedCuisines = new Set<string>();
  const results: { slot: string; candidate: MealCandidate | null }[] = [];

  for (const { slot, candidates } of picksBySlot) {
    if (candidates.length === 0) { results.push({ slot, candidate: null }); continue; }
    const topScore = candidates[0].scoring.overall;
    // Only ever substitutes among candidates tied for the top score — variety
    // never overrides a genuinely better-ranked meal.
    const tiedForTop = candidates.filter(c => c.scoring.overall === topScore);
    const novel = tiedForTop.find(c => !c.cuisine.some(cu => usedCuisines.has(cu)));
    const chosen = novel ?? tiedForTop[0];
    chosen.cuisine.forEach(cu => usedCuisines.add(cu));
    results.push({ slot, candidate: chosen });
  }
  return results;
}
