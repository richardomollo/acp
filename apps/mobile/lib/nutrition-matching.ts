// Day 5 — deterministic nutrition food matching (Part 26/27/32).
//
// ACP Intelligence™ decides the nutrition INTENT (nutrition_focus.type,
// via the weekly-adaptation AI call). This module then finds real ACP
// foods whose actual, structured data supports that purpose — no LLM, no
// embeddings, exactly the same discipline as lib/fulfilment.ts's
// deterministic marketplace matching. Nutrient values and match reasons
// here always come from real `meals` rows or a fixed, non-invented label
// ("Good source of protein") — never from the model.
//
// Inspection finding (see the Day 5 report): ACP's real nutrition data is
// the `meals` table — curated dishes with macro fields (calories/protein_g/
// carbs_g/fat_g/fibre_g) and a curated `tags` array, NOT a separate
// ingredient-level "foods" table and NOT any micronutrient (iron/calcium/
// vitamin) numeric fields. The tags ARE the only reliable, existing
// "nutrition purpose" signal (e.g. 'high_protein', 'high_fibre',
// 'pre_workout', 'post_workout'), so the matcher keys off them directly
// rather than inventing macro thresholds. `cuisine` is a single free-text
// column — every real row today is 'Kenyan' (no international meals exist
// yet in the live data), so cuisine ranking below is structurally correct
// but currently a no-op in practice; see the report for how this was
// verified against the live database.
import type { NutritionFocusType } from './ai-assessment';

export interface FoodCandidate {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  tags: string[];
}

export interface FoodSuggestion {
  id: string;
  name: string;
  /** Deterministic, fixed label — never AI-generated (Part 32). */
  reason: string;
}

// Only the types the real, curated meal tags can actually fulfil (see the
// module header) — 'meal_consistency'/'vegetable_variety'/'hydration' from
// the original spec sketch were considered and dropped for lack of any
// backing tag/data (Part 19's "do not create categories that cannot be
// fulfilled with existing data").
const FOCUS_TAGS: Record<NutritionFocusType, string[]> = {
  protein_consistency: ['high_protein', 'muscle_building'],
  fibre: ['high_fibre', 'gut_health'],
  pre_training_energy: ['pre_workout', 'energy'],
  post_training_recovery: ['post_workout', 'muscle_building'],
};

const FOCUS_REASON: Record<NutritionFocusType, string> = {
  protein_consistency: 'Good source of protein',
  fibre: 'Good source of fibre',
  pre_training_energy: 'Suited to pre-training energy',
  post_training_recovery: 'Suited to post-training recovery',
};

const MAX_SUGGESTIONS = 5;

/**
 * Dietary restrictions (Part 25): the only reliable, existing restriction
 * signal in ACP today is fitness_profile.cuisine_preference === 'vegetarian'
 * (no allergy/vegan/religious/intolerance fields exist anywhere in the
 * schema — see the Day 5 report). Applied as a HARD filter before ranking,
 * never a soft preference, so a vegetarian user is never shown a
 * non-vegetarian food regardless of how well it otherwise fits the focus.
 */
export function findFoodsForNutritionFocus(
  focusType: NutritionFocusType,
  cuisinePreference: string | null,
  foods: FoodCandidate[],
  maxResults: number = MAX_SUGGESTIONS,
): FoodSuggestion[] {
  const requiredTags = FOCUS_TAGS[focusType];

  const restricted = cuisinePreference === 'vegetarian'
    ? foods.filter(f => f.tags.includes('vegetarian') || f.tags.includes('vegan'))
    : foods;

  const matches = restricted.filter(f => requiredTags.some(t => f.tags.includes(t)));

  // Cuisine is a ranking signal, not an exclusive filter (Part 24) — a
  // matching food of the preferred cuisine sorts first; nothing is dropped
  // just for being a different cuisine.
  const ranked = [...matches].sort((a, b) => {
    const aPreferred = cuisinePreference && cuisinePreference !== 'mixed' && a.cuisine.toLowerCase() === cuisinePreference ? 1 : 0;
    const bPreferred = cuisinePreference && cuisinePreference !== 'mixed' && b.cuisine.toLowerCase() === cuisinePreference ? 1 : 0;
    return bPreferred - aPreferred;
  });

  return ranked.slice(0, maxResults).map(f => ({ id: f.id, name: f.name, reason: FOCUS_REASON[focusType] }));
}

// ── Home slot-aware selection (Home Nutrition Integration) ──────────────────
// Home needs one meal PER meal-type slot (breakfast/lunch/dinner) rather
// than a flat top-N list — nutrition relevance should operate WITH meal
// type, not replace the existing breakfast/lunch/dinner variety. This reuses
// the exact same FOCUS_TAGS/FOCUS_REASON canonical mapping above (and the
// same vegetarian hard-filter) rather than a second, competing definition —
// Home and My Plan/Nutrition Hub must never disagree about which tags
// correspond to which focus.
export interface SlotMealCandidates {
  category: string;
  foods: FoodCandidate[];
}

export interface SlotMealSelection {
  category: string;
  food: FoodCandidate;
  /** Whether this pick actually carries one of the focus's tags — false means no compliant option in this slot matched the focus, so a safe, generic meal for the slot was used instead rather than dropping the slot. */
  matchesFocus: boolean;
}

export function selectMealsForNutritionFocus(
  focusType: NutritionFocusType,
  cuisinePreference: string | null,
  mealsBySlot: SlotMealCandidates[],
): SlotMealSelection[] {
  const requiredTags = FOCUS_TAGS[focusType];
  const results: SlotMealSelection[] = [];

  for (const { category, foods } of mealsBySlot) {
    // Dietary restriction is a hard filter even in the no-match fallback —
    // never shown just because nothing else was available for this slot.
    const restricted = cuisinePreference === 'vegetarian'
      ? foods.filter(f => f.tags.includes('vegetarian') || f.tags.includes('vegan'))
      : foods;
    if (restricted.length === 0) continue; // nothing safe to suggest for this slot at all — omit it

    const focusMatches = restricted.filter(f => requiredTags.some(t => f.tags.includes(t)));
    const pool = focusMatches.length > 0 ? focusMatches : restricted;

    const ranked = [...pool].sort((a, b) => {
      const aPreferred = cuisinePreference && cuisinePreference !== 'mixed' && a.cuisine.toLowerCase() === cuisinePreference ? 1 : 0;
      const bPreferred = cuisinePreference && cuisinePreference !== 'mixed' && b.cuisine.toLowerCase() === cuisinePreference ? 1 : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      return a.id.localeCompare(b.id); // stable, deterministic tiebreaker — never random
    });

    results.push({ category, food: ranked[0], matchesFocus: focusMatches.length > 0 });
  }

  return results;
}

/** The same fixed, deterministic label used everywhere else — never AI-generated. Only meaningful when `matchesFocus` is true. */
export function nutritionFocusTagLabel(focusType: NutritionFocusType): string {
  return FOCUS_REASON[focusType];
}

// ── Stable daily general suggestions (Home Nutrition Hardening, Problem B) ──
// This is the fallback path ONLY — no active meal plan AND no current
// nutrition focus (or the focus-ranking override didn't apply). It replaces
// Math.random() with a small, dependency-free deterministic hash so the
// same user sees the same suggestion all day, and it can only change on a
// genuinely new calendar date — never on every Home refresh.
export interface GeneralMealCandidate {
  id: string;
  name: string;
  image_url: string | null;
  calories: number | null;
}

export interface DailyMealCandidates {
  category: string;
  foods: GeneralMealCandidate[];
}

export interface DailyMealSelection {
  category: string;
  food: GeneralMealCandidate;
}

/**
 * Tiny deterministic string hash (DJB2-style) — no dependency, no
 * cryptographic guarantees needed, just a stable, well-distributed integer
 * for a given string. Never uses Math.random().
 */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0; // unsigned 32-bit, deterministic
  }
  return hash;
}

/**
 * Same user + same calendar date + same meal slot always resolves to the
 * same candidate — reproducible from its inputs alone, nothing stored,
 * nothing random. `date` must be a plain YYYY-MM-DD calendar date (not a
 * timestamp), matching this app's existing "today" convention, so the
 * selection only changes once per day rather than on every reload.
 */
export function selectDailyMeals(
  userId: string | null,
  date: string,
  mealsBySlot: DailyMealCandidates[],
): DailyMealSelection[] {
  const results: DailyMealSelection[] = [];
  for (const { category, foods } of mealsBySlot) {
    if (foods.length === 0) continue; // empty slot — omitted, never substituted from another slot
    const seed = `${userId ?? 'anon'}:${date}:${category}`;
    const index = stableHash(seed) % foods.length;
    results.push({ category, food: foods[index] });
  }
  return results;
}
