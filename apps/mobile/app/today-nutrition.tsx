import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { matchProfessionalProviders, resolveProfessionalSupportAvailability, type ProviderMatch, type ProfessionalSupportAvailability } from '@/lib/professional-support';
import { getEligiblePersonalTrainerIds } from '@/services/professional-eligibility-service';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { ProfessionalSupportUnavailableNotice } from '@/components/marketplace/marketplace-gate';
import { AdaptiveTodayMeals } from '@/components/nutrition/adaptive-today-meals';
import { isAdaptiveNutritionEnabled } from '@/lib/flags';
import { selectDailyMeals } from '@/lib/nutrition-matching';
import { getMealCandidates, type ReasonCode } from '@/lib/meal-ranking';
import { recipeService } from '@/services/recipe-service';
import { slotsForRecipeCategory, mealRowFromRecipe, classifySuggestionSource, isSuggestionEligible, type SuggestionSource } from '@/lib/nutrition/recipe-model';
import { validateGoalDirection } from '@/lib/onboarding-validation';
import { localISODate } from '@/lib/fulfilment';
import { foodLogService } from '@/services/food-log-service';
import type { FoodLogEntry, DailyNutritionSummary } from '@/lib/nutrition/food-types';
import { summariseDay, type DayNutrition } from '@/lib/nutrition/nutrition-history';
import { buildNutritionPatterns, type NutritionPatternEvidence } from '@/lib/nutrition/nutrition-patterns';
import { ObservedPanel, DayProteinStrip } from '@/components/nutrition/nutrition-observed';
// "Your nutrition references" section hidden per product decision (2026-09-04) — see render site below.
// import { NutritionReferenceSection } from '@/components/nutrition/nutrition-references';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { buildNutritionReferenceComparisons, type UserReferenceContext, type NutritionReferenceComparison } from '@/lib/nutrition/nutrition-reference-engine';
import { resolveDailyMacroTargets, macroProgressFraction, formatMacroWithTarget, type MacroTargetRange } from '@/lib/nutrition/daily-macro-targets';
import { NutritionCoachingSection } from '@/components/nutrition/nutrition-coaching-section';
import { getNutritionCoaching } from '@/lib/nutrition/nutrition-coaching';
import type { CoachingValidationResult } from '@/lib/nutrition/nutrition-coaching-safety';
import { isNutritionSavedMealsEnabled, isManualFoodLoggingEnabled, isNutritionPlanningEnabled } from '@/lib/flags';
import { nutritionPlanningService, type PlannedMealRow } from '@/services/nutrition-planning-service';
import { prefillFromEntries } from '@/lib/nutrition/saved-meal';
import { followMealKey, followMealGroupId, FOLLOWED_MEAL_CAPTURE_METHOD } from '@/lib/nutrition/followed-meal';
import { NutritionActivityContext } from '@/components/nutrition/nutrition-activity-context';
import { nutritionFitnessContextService } from '@/services/nutrition-fitness-context-service';
import type { CrossDomainNutritionObservation } from '@/lib/nutrition/nutrition-fitness-context';
import { NutritionWhatsChanged } from '@/components/nutrition/nutrition-whats-changed';
import { nutritionAdviceEffectivenessService } from '@/services/nutrition-advice-effectiveness-service';
import type { NutritionAdviceEffectiveness } from '@/lib/nutrition/nutrition-advice-effectiveness';

const SAVED_MEALS_ENABLED = isNutritionSavedMealsEnabled();

interface TodayMealItem {
  id: string;
  mealId: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'smoothie';
  name: string;
  image_url: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number | null;
  prep_time_minutes: number | null;
  /** Recipes V1 (§12/§14) — set only when this suggestion is a canonical
   *  KFCT recipe candidate; carries the real foodId so "View recipe" and
   *  the ✓ toggle route through the SAME evidence a normal food-search log
   *  would produce (§9/§22), never a second calculation. `null` for a
   *  legacy `meals`-sourced suggestion or a real meal-plan item. */
  recipeFoodId?: string | null;
  /** §20/§21/§24 — whether this suggestion resolves to a canonical, openable
   *  recipe. Only set for SUGGESTED (isSuggested) items, never a real
   *  meal-plan row (those aren't suggestions and carry no such claim
   *  either way). Drives the card's "verified recipe" badge/CTA so a
   *  fallback suggestion is never presented as equivalent to a real recipe. */
  suggestionSource?: SuggestionSource;
  /** Simple UX Redesign V1 — the deterministic reason codes behind this
   *  suggestion (already computed by getMealCandidates); used only to write
   *  one factual line under "Lana suggests" on the redesigned Today page. */
  reasons?: ReasonCode[];
}

const SLOT_ORDER: TodayMealItem['slot'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', smoothie: 'Smoothie',
};

const GRID_GAP = 14;

// Simple UX Redesign V1 — one factual, evidence-grounded line for the "Lana
// suggests" card. Fixed text per deterministic reason code (never an LLM,
// never invented) — the SAME codes getMealCandidates already computes;
// this only decides which fixed sentence to show, first-match-wins in a
// stable priority order.
const REASON_TEXT: Record<ReasonCode, string> = {
  high_protein: 'A protein-rich option for today.',
  high_fibre: 'A fibre-rich option for today.',
  balanced_meal: 'A balanced option that fits your day.',
  goal_supportive: 'Fits your current nutrition goal.',
  preferred_cuisine: 'Matches your cuisine preference.',
};
const REASON_PRIORITY: ReasonCode[] = ['high_protein', 'high_fibre', 'balanced_meal', 'goal_supportive', 'preferred_cuisine'];
function suggestionReasonText(reasons: ReasonCode[] | undefined): string {
  const hit = REASON_PRIORITY.find(r => reasons?.includes(r));
  return hit ? REASON_TEXT[hit] : 'A recipe from the verified Kenya Food Composition Tables catalogue.';
}

// Daily Macro Targets V1 — factual logged total for one macro, optionally
// compared against Lana's existing N3 reference range (see
// lib/nutrition/daily-macro-targets.ts for why only protein can ever carry
// one today). No target → the plain consumed-only form, unchanged from
// before. A target → "consumed / min–maxg" + a thin reference bar, capped
// at 100% (§16/§17 — exceeding it is not an error state, never styled red).
function MacroStat({ label, value, unit, target }: { label: string; value: number; unit: string; target?: MacroTargetRange | null }) {
  const pct = macroProgressFraction(value, target ?? null);
  return (
    <View style={s.macroCol}>
      <ThemedText style={s.macroValue}>{formatMacroWithTarget(value, target ?? null, '')}<ThemedText style={s.macroUnit}> {unit}</ThemedText></ThemedText>
      <ThemedText style={s.macroLabel}>{label}</ThemedText>
      {pct != null && (
        <View style={s.macroBarTrack}>
          <View style={[s.macroBarFill, { width: `${pct * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

/**
 * A clearer, dedicated "today's protein vs target" graph — a wider bar than
 * MacroStat's thin inline line, with tick marks at the target range's min
 * and max so the range itself is legible, not just implied by a fill
 * percentage. Shown only when a real target exists (never fabricated); the
 * consumed fill is never visually clipped even past the max tick — it just
 * keeps growing across the track, so an over-target day is still shown
 * honestly rather than looking identical to "exactly at target" (§16/§17).
 */
function TodayTargetGraph({ label, value, unit, target }: { label: string; value: number; unit: string; target: MacroTargetRange }) {
  const scale = Math.max(target.max, value) * 1.05; // small headroom so a max/over-target fill never touches the track's edge
  const fillPct = Math.min(100, (value / scale) * 100);
  const minPct = (target.min / scale) * 100;
  const maxPct = (target.max / scale) * 100;
  return (
    <View style={s.targetGraph}>
      <View style={s.targetGraphHeader}>
        <ThemedText style={s.targetGraphLabel}>{label}</ThemedText>
        <ThemedText style={s.targetGraphValue}>{formatMacroWithTarget(value, target, unit)}</ThemedText>
      </View>
      <View style={s.targetGraphTrack}>
        <View style={[s.targetGraphFill, { width: `${fillPct}%` }]} />
        <View style={[s.targetGraphTick, { left: `${minPct}%` }]} />
        <View style={[s.targetGraphTick, { left: `${maxPct}%` }]} />
      </View>
    </View>
  );
}

export default function TodayNutritionScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<TodayMealItem[]>([]);
  const [isSuggested, setIsSuggested] = useState(false);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Nutrition N1 — the actual food log (source of truth for consumed intake),
  // kept entirely separate from the planned-meal list / eaten toggle above.
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  // §29 — inline quantity edit for a logged entry. One row editable at a
  // time; the existing foodLogService.updateFoodLogQuantity does the actual
  // re-resolve + re-freeze from the canonical food (never a manual field
  // patch) — this is only the UI entry point that was missing.
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [foodTotals, setFoodTotals] = useState<DailyNutritionSummary | null>(null);
  // Nutrition N2 — today's per-nutrient completeness + recent-day evidence.
  const [todayDay, setTodayDay] = useState<DayNutrition | null>(null);
  const [recentDays, setRecentDays] = useState<DayNutrition[]>([]);
  const [patterns, setPatterns] = useState<NutritionPatternEvidence | null>(null);
  // Nutrition N3 — reference comparison (deterministic, non-coaching).
  const [refContext, setRefContext] = useState<UserReferenceContext | null>(null);
  const [refComparisons, setRefComparisons] = useState<NutritionReferenceComparison[] | null>(null);
  // Nutrition N4 — evidence-grounded coaching (deterministic cards, optional LLM rephrase).
  const [coaching, setCoaching] = useState<CoachingValidationResult | null>(null);
  // Nutrition N7 — deterministic fitness × nutrition context observations.
  const [n7Observations, setN7Observations] = useState<CrossDomainNutritionObservation[]>([]);
  // Nutrition N8 — deterministic advice-effectiveness ("What's changed").
  const [n8Observations, setN8Observations] = useState<NutritionAdviceEffectiveness[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportExpanded, setSupportExpanded] = useState(false);
  // Monthly → Weekly → Daily Planning V1 (flagged, off by default — §60).
  // Independent of everything above: today's PLANNED meals (from
  // nutrition_planned_meals), keyed by slot, merged into the existing
  // "what I ate" diary per §47's own merged-mental-model decision.
  const [plannedMealsBySlot, setPlannedMealsBySlot] = useState<Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', PlannedMealRow>>>({});
  const [weeklyObjective, setWeeklyObjective] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMatches, setSupportMatches] = useState<ProviderMatch[] | null>(null);
  // Beta Feedback #019E — WHY the list is empty (geography vs. error vs.
  // unresolved location), so the empty state never reads as a search failure.
  const [supportAvailability, setSupportAvailability] = useState<ProfessionalSupportAvailability | null>(null);
  // Beta Feedback #019D — nutrition/PT support must obey the same marketplace
  // geography as venues/classes/trainers (§019). Background resolve only —
  // matching itself stays lazy, fetched only after an explicit tap below.
  const marketLoc = useMarketplaceLocation();
  const marketLocRef = useRef(marketLoc);
  marketLocRef.current = marketLoc;
  useEffect(() => { marketLocRef.current.ensureResolved({ requestPermission: false }); }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      // LANA IOS — hard loading invariant: setLoading(false) lives in a
      // `finally` (below) rather than at each individual return point, so
      // this screen structurally cannot get stuck showing a spinner no
      // matter which awaited call returns early, throws, or is added later
      // — belt-and-braces on top of the actual fix (the shared bounded
      // Supabase fetch in lib/supabase.tsx), not a substitute for it: every
      // plain `supabase.from(...)` call here already resolves (never
      // rejects) on a timeout, since nothing in this file uses
      // `.throwOnError()` — postgrest-js's default behaviour converts a
      // timed-out request into `{ data: null, error }`, which this
      // screen's existing `?? []` / `?.` handling already tolerates as
      // "nothing found". This `finally` protects against a genuine throw
      // (e.g. a bug elsewhere in this function), not against the shared
      // fetch itself.
      try {
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (active) { setUserId(null); setItems([]); }
        return;
      }
      if (active) setUserId(session.user.id);

      const { data: profileData } = await supabase
        .from('fitness_profile')
        .select('goal, cuisine_preferences, starting_weight_kg, goal_weight_kg')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const goal = profileData?.goal ?? null;
      const cuisinePreferences = profileData?.cuisine_preferences ?? [];
      // LH-39 — the scale direction the user's own current-vs-goal weight
      // implies, using the exact LH-04 semantics (validateGoalDirection):
      // a performance/neutral goal still yields a usable direction, and a
      // contradictory directional goal was already blocked at onboarding.
      // Used ONLY to gently tilt which suggested meals are shown — never a
      // calorie target, never a hard filter. Missing/implausible weights →
      // 'unknown' → no tilt at all (graceful degradation).
      const { weightDirection } = validateGoalDirection({
        goal,
        currentWeightKg: profileData?.starting_weight_kg ?? null,
        goalWeightKg: profileData?.goal_weight_kg ?? null,
      });

      const { data: planData } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let planItems: TodayMealItem[] = [];
      if (planData) {
        const todayDow = new Date().getDay();
        const { data: itemsData } = await supabase
          .from('meal_plan_items')
          .select('id, meal_slot, sort_order, meals(id, name, image_url, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes)')
          .eq('meal_plan_id', planData.id)
          .eq('day_of_week', todayDow)
          .order('sort_order');
        planItems = ((itemsData as any[]) ?? [])
          .filter(i => i.meals)
          .map(i => ({
            id: i.id,
            mealId: i.meals.id,
            slot: i.meal_slot,
            name: i.meals.name,
            image_url: i.meals.image_url,
            calories: i.meals.calories ?? 0,
            protein_g: i.meals.protein_g ?? 0,
            carbs_g: i.meals.carbs_g ?? 0,
            fat_g: i.meals.fat_g ?? 0,
            fibre_g: i.meals.fibre_g ?? null,
            prep_time_minutes: i.meals.prep_time_minutes,
          }));
      }

      // The user's LOCAL calendar day — the single date key for everything on
      // this screen (food log, meal_logs, followed-meal ✓, the daily pick).
      // Never a UTC slice (LH-26): a meal followed on the 8th in Nairobi stays
      // on the 8th.
      const todayLocal = localISODate(new Date());
      foodLogService.getDailyNutrition(session.user.id, todayLocal)
        .then(({ summary, entries }) => {
          if (!active) return;
          setFoodTotals(summary); setFoodLog(entries);
          setTodayDay(summariseDay(todayLocal, entries)); // N2 — per-nutrient completeness
        })
        .catch(() => { if (active) { setFoodTotals(null); setFoodLog([]); setTodayDay(null); } });

      // Nutrition N2 — one bounded query for the recent window; derive the
      // 7-day strip and the deterministic "what ACP has observed" evidence.
      // Non-blocking: a failure here never hides today's log.
      foodLogService.getNutritionRange(session.user.id, 7, todayLocal)
        .then(range => {
          if (!active) return;
          setRecentDays(range.days);
          const p = buildNutritionPatterns(range.entries, { windowDays: 7, endLocalDate: todayLocal });
          setPatterns(p);
          // N3 — resolve the user's reference context and compare, once N2's
          // evidence for the window is available. Non-blocking: a failure
          // here never hides Today's log, history, or observed patterns.
          nutritionReferenceService.resolveUserReferenceContext(session.user.id)
            .then(context => {
              if (!active) return;
              setRefContext(context);
              const comparisons = buildNutritionReferenceComparisons(context, range.days, p);
              setRefComparisons(comparisons);
              // N4 — build deterministic coaching cards immediately, then fold
              // in a validated LLM rephrase if it arrives in time. Fully
              // non-blocking; a failure leaves the deterministic cards.
              getNutritionCoaching(session.access_token ?? null, comparisons, range.entries)
                .then(res => {
                  if (!active) return;
                  setCoaching(res.validated);
                  // Nutrition N8 — record an exposure for each coaching card
                  // that ACTUALLY renders (cards.length > 0), then load the
                  // "What's changed" observations. Idempotent; deterministic;
                  // no-ops when the N8 flag is off. Never blocks the screen.
                  if (res.validated.cards.length > 0) {
                    let tz: string | null = null;
                    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null; } catch { /* ignore */ }
                    const shown = res.validated.cards
                      .map(card => {
                        const opportunity = res.opportunities.find(o => o.id === card.id);
                        if (!opportunity) return null;
                        return { opportunity, comparison: comparisons.find(c => c.nutrient === opportunity.nutrient) };
                      })
                      .filter((s): s is NonNullable<typeof s> => s !== null);
                    nutritionAdviceEffectivenessService.recordExposures(session.user.id, shown, todayLocal, tz)
                      .then(() => nutritionAdviceEffectivenessService.getEffectivenessObservations(session.user.id, todayLocal))
                      .then(obs => { if (active) setN8Observations(obs); })
                      .catch(() => { if (active) setN8Observations([]); });
                  }
                })
                .catch(() => { if (active) setCoaching(null); });
            })
            .catch(() => { if (active) { setRefContext(null); setRefComparisons(null); setCoaching(null); } });
        })
        .catch(() => { if (active) { setRecentDays([]); setPatterns(null); } });

      // Nutrition N8 — also surface effectiveness for episodes whose coaching
      // card is no longer eligible today (the gap has closed): the exposure
      // rows persist, so evaluate them even when no card renders this visit.
      // getEffectivenessObservations returns the full surfaceable set, so a
      // later resolve here or in the card path simply reflects current state.
      nutritionAdviceEffectivenessService.getEffectivenessObservations(session.user.id, todayLocal)
        .then(obs => { if (active) setN8Observations(obs); })
        .catch(() => { /* leave whatever the card path set */ });

      // Nutrition N7 — fitness × nutrition context. Fully self-contained,
      // deterministic, non-blocking; no-ops entirely when the flag is off.
      // A failure just means no N7 section — never a broken screen.
      nutritionFitnessContextService.getObservations(session.user.id, todayLocal)
        .then(res => { if (active) setN7Observations(res.observations); })
        .catch(() => { if (active) setN7Observations([]); });

      if (planItems.length > 0) {
        if (!active) return;
        setItems(planItems);
        setIsSuggested(false);

        // ✓ state = "user said they ate this". Sourced from the followed-meal
        // consumption rows in food_log_entries (the record that carries macros
        // and drives Logged Today), unioned with any pre-existing meal_logs
        // adherence rows so nutritionist-plan clients keep their prior checks.
        const [{ data: logsData }, followedIds] = await Promise.all([
          supabase
            .from('meal_logs')
            .select('meal_plan_item_id, status')
            .eq('user_id', session.user.id)
            .eq('log_date', todayLocal)
            .in('meal_plan_item_id', planItems.map(i => i.id)),
          foodLogService.getFollowedMealGroupIds(session.user.id, todayLocal),
        ]);
        const checked = new Set<string>(
          (logsData ?? []).filter(l => l.status === 'eaten').map(l => l.meal_plan_item_id),
        );
        for (const it of planItems) {
          const gid = followMealGroupId(
            session.user.id,
            followMealKey({ suggested: false, mealId: it.mealId, mealPlanItemId: it.id }),
            todayLocal,
          );
          if (followedIds.has(gid)) checked.add(it.id);
        }
        if (active) setLoggedIds(checked);
      } else {
        // No active plan — suggest one meal per category. Ranking (which
        // candidates are actually good picks) is deterministic goal/cuisine
        // fit via getMealCandidates (Day 7.2 — never a hard filter, so
        // international meals are always eligible, just ranked), plus a small
        // LH-39 pool-relative lean toward the user's weight direction (a
        // gain goal leans to more substantial, protein-forward meals; a loss
        // goal to protein/fibre-forward ones) — never a calorie target;
        // which equally-good candidate is shown today is a stable per-day pick
        // via selectDailyMeals (same user + date + pool always resolves the
        // same way — never Math.random()), applied only among the top-ranked
        // ties so a stronger candidate can never lose to a weaker one.
        const categories = ['breakfast', 'lunch', 'dinner'] as const;
        // Suggested Meals V1 recipe-only policy — every user-facing
        // suggestion must be recipe_backed (fallback_no_recipe and
        // superseded are INELIGIBLE, never merely relabelled). The legacy
        // `meals` catalogue is therefore no longer queried here at all —
        // its data/table is untouched (requirement 1), it simply never
        // becomes a Suggested Meal candidate. Legacy meal-plan rows and
        // meal-detail routes elsewhere in the app are completely unaffected.
        const recipeCandidates = await recipeService.listActiveForSuggestions().catch(() => []);
        interface SuggestedMealRow {
          id: string; name: string; image_url: string | null; category: string;
          calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
          fibre_g: number | null; prep_time_minutes: number | null; cuisine: string; tags: string[] | null;
          /** Recipes V1 — set only for a canonical-recipe candidate; routes
           *  "View recipe" / the ✓ toggle through the real food_id, never a
           *  second calculation (§9/§22). */
          recipeFoodId?: string | null;
          /** Simple UX Redesign V1 — the SAME deterministic reason codes
           *  getMealCandidates already computes (lib/meal-ranking.ts), never
           *  surfaced in the UI before now. Used only to write one factual,
           *  evidence-grounded line under "Lana suggests" — never a new
           *  ranking/explanation system. */
          reasons?: ReasonCode[];
        }
        // Suggested Meals V1 recipe-only policy — eligibility is filtered
        // BEFORE ranking (requirement 5), never inside getMealCandidates
        // (the deterministic ranker itself is unchanged, requirement 4).
        // Only recipe_backed candidates are ever built here: a legacy
        // `meals` row (fallback_no_recipe) or a superseded one never enters
        // `rows`, so they can never win the ranking, never reach
        // `dailySelections`, and never render as a Suggested Meal.
        const mealsBySlot = categories.map((category) => {
          // §22 — reuse the ONE tested adapter into the live ranker
          // (lib/nutrition/recipe-model.ts's mealRowFromRecipe) rather than
          // re-deriving the same per-100g→MealRow mapping here; only the
          // screen-display-only fields (image, prep time, the real foodId
          // for routing) are added on top, never re-computed.
          const rows: SuggestedMealRow[] = recipeCandidates
            .filter(({ recipe }) => slotsForRecipeCategory(recipe.category).includes(category))
            .map(({ food, recipe }) => {
              const row = mealRowFromRecipe(food, recipe, category);
              return {
                id: row.id,
                name: row.name,
                image_url: null, // §5 — no fake food imagery when no real, licensed image exists
                category,
                calories: row.calories,
                protein_g: row.protein_g,
                carbs_g: row.carbs_g,
                fat_g: row.fat_g,
                fibre_g: row.fibre_g,
                prep_time_minutes: null,
                cuisine: row.cuisine,
                tags: row.tags,
                recipeFoodId: food.id,
              };
            })
            // requirement 5 — eligibility filtered explicitly, BEFORE
            // getMealCandidates ever runs. Every row here already has a
            // real recipeFoodId by construction (only recipe candidates are
            // mapped above), so this is a defense-in-depth assertion of the
            // recipe-only policy, not currently a no-op-vs-active
            // distinction — see isSuggestionEligible's own doc comment.
            .filter(row => isSuggestionEligible(classifySuggestionSource({ recipeFoodId: row.recipeFoodId, isActive: true })));
          const candidates = getMealCandidates({
            meals: rows.map(r => ({
              id: r.id, name: r.name, category: r.category, cuisine: r.cuisine, tags: r.tags ?? [],
              calories: r.calories ?? 0, protein_g: r.protein_g ?? 0, carbs_g: r.carbs_g ?? 0,
              fat_g: r.fat_g ?? 0, fibre_g: r.fibre_g, is_active: true,
            })),
            goal, cuisinePreferences, weightDirection,
          });
          const topScore = candidates[0]?.scoring.overall;
          const tiedTopIds = new Set(candidates.filter(c => c.scoring.overall === topScore).map(c => c.mealId));
          const reasonsById = new Map(candidates.map(c => [c.mealId, c.reasons]));
          // requirement 10 — a slot with zero eligible recipe candidates
          // produces an EMPTY `foods` array here; selectDailyMeals already
          // omits an empty slot entirely ("empty slot — omitted, never
          // substituted from another slot") rather than substituting
          // anything, so this naturally falls through to the existing
          // honest "No planned meals for today." state when nothing
          // survives across all three slots — no new empty-state UI needed.
          return {
            category,
            foods: rows.filter(r => tiedTopIds.has(r.id)).map(r => ({ ...r, reasons: reasonsById.get(r.id) })),
          };
        });
        const dailySelections = selectDailyMeals(session.user.id, todayLocal, mealsBySlot);
        const suggested: TodayMealItem[] = dailySelections.map(({ category, food: meal }) => ({
          id: meal.id,
          mealId: meal.id,
          slot: category as TodayMealItem['slot'],
          name: meal.name,
          image_url: meal.image_url,
          calories: meal.calories ?? 0,
          protein_g: meal.protein_g ?? 0,
          carbs_g: meal.carbs_g ?? 0,
          fat_g: meal.fat_g ?? 0,
          fibre_g: meal.fibre_g ?? null,
          prep_time_minutes: meal.prep_time_minutes,
          recipeFoodId: (meal as SuggestedMealRow).recipeFoodId ?? null,
          // Suggested Meals V1 recipe-only policy — `mealsBySlot` above is
          // built exclusively from recipeService.listActiveForSuggestions()
          // rows, so every item reaching `suggested` always has a real
          // recipeFoodId and classifies as 'recipe_backed'. Kept as a real
          // (not hardcoded) classification call — a defensive invariant: if
          // a future change ever reintroduces a non-recipe candidate here,
          // this immediately reports 'fallback_no_recipe'/'superseded'
          // instead of silently mislabelling it 'recipe_backed'.
          suggestionSource: classifySuggestionSource({
            recipeFoodId: (meal as SuggestedMealRow).recipeFoodId ?? null,
            isActive: true,
          }),
          reasons: (meal as SuggestedMealRow).reasons,
        }));
        if (!active) return;
        setItems(suggested);
        setIsSuggested(true);
        // Seed ✓ from today's followed-meal consumption rows so a reload keeps
        // checked suggestions checked (SUGGESTED alone is never pre-checked).
        const followedIds = await foodLogService.getFollowedMealGroupIds(session.user.id, todayLocal);
        const checkedSug = new Set<string>();
        for (const it of suggested) {
          const gid = followMealGroupId(
            session.user.id,
            followMealKey({ suggested: true, mealId: it.mealId }),
            todayLocal,
          );
          if (followedIds.has(gid)) checkedSug.add(it.id);
        }
        if (active) setLoggedIds(checkedSug);
      }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  // Refetch today + the 7-day window so every derived aggregate (Logged Today
  // totals, per-nutrient completeness, the recent strip, N2–N8 evidence) is
  // recomputed from food_log_entries. Shared by the ✓ toggle and entry delete
  // so the screen updates in place — no leave/reopen required (§3).
  const reloadNutrition = useCallback(async () => {
    if (!userId) return;
    const today = localISODate(new Date());
    const [{ summary, entries }, range] = await Promise.all([
      foodLogService.getDailyNutrition(userId, today),
      foodLogService.getNutritionRange(userId, 7, today).catch(() => null),
    ]);
    setFoodTotals(summary); setFoodLog(entries);
    setTodayDay(summariseDay(today, entries));
    if (range) {
      setRecentDays(range.days);
      const p = buildNutritionPatterns(range.entries, { windowDays: 7, endLocalDate: today });
      setPatterns(p);
      if (refContext) {
        const comparisons = buildNutritionReferenceComparisons(refContext, range.days, p);
        setRefComparisons(comparisons);
        getNutritionCoaching(null, comparisons, range.entries)
          .then(res => setCoaching(res.validated))
          .catch(() => { /* keep prior cards */ });
      }
    }
  }, [userId, refContext]);

  // Monthly → Weekly → Daily Planning V1 (flagged, §60) — Today's execution
  // surface. Establishes the user's first cycle/week on first load
  // (§51 — no forced onboarding, reuses existing profile evidence only),
  // then reads today's already-generated planned meals. Never creates
  // nutrition evidence itself (§23) — purely a read + the one-time
  // idempotent generation nutritionPlanningService already guards.
  const reloadPlannedMeals = useCallback(async () => {
    if (!userId || !isNutritionPlanningEnabled()) return;
    try {
      const plan = await nutritionPlanningService.ensureFirstCycle(userId);
      setWeeklyObjective(plan.week.objective);
      const today = localISODate(new Date());
      const rows = await nutritionPlanningService.getTodayPlannedMeals(userId, today);
      const bySlot: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', PlannedMealRow>> = {};
      for (const r of rows) bySlot[r.mealSlot as 'breakfast' | 'lunch' | 'dinner' | 'snack'] = r;
      setPlannedMealsBySlot(bySlot);
    } catch {
      // Fails safe — Today's actual food log/diary is completely unaffected
      // either way (§14/§34 — a planning failure never breaks Nutrition).
      setWeeklyObjective(null);
      setPlannedMealsBySlot({});
    }
  }, [userId]);

  useEffect(() => { reloadPlannedMeals(); }, [reloadPlannedMeals]);

  // Tapping ✓ on a SUGGESTED or PLANNED meal = "I actually ate this" → a real
  // consumption record (food_log_entries, the meal's own curated macros frozen
  // verbatim). SUGGESTED alone never counts. Reversible, idempotent, local-date
  // safe. Nothing here deletes a meal or a meal-plan item.
  const toggleMeal = async (item: TodayMealItem) => {
    if (togglingId) return;
    // Signed-out preview: local-only, nothing to persist.
    if (!userId) {
      setLoggedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      });
      return;
    }
    setTogglingId(item.id);
    const now = new Date();
    const localDate = localISODate(now);
    const wasChecked = loggedIds.has(item.id);
    const followKey = followMealKey({
      suggested: isSuggested,
      mealId: item.mealId,
      mealPlanItemId: isSuggested ? null : item.id,
    });
    // optimistic ✓ flip
    setLoggedIds(prev => {
      const next = new Set(prev);
      if (wasChecked) next.delete(item.id); else next.add(item.id);
      return next;
    });
    try {
      if (wasChecked) {
        await foodLogService.unmarkMealFollowed(userId, followKey, localDate);
        if (!isSuggested) {
          await supabase.from('meal_logs').delete()
            .eq('user_id', userId).eq('meal_plan_item_id', item.id).eq('log_date', localDate);
        }
      } else if (item.recipeFoodId) {
        // Recipes V1 §9/§22 — the ✓ toggle for a canonical-recipe suggestion
        // logs through the REAL foodId (100g — the reference portion shown
        // on the card), the exact same deterministic path Recipe Detail's
        // "Add to today" and normal food search use. Never the macro-copy
        // path below, which would be an independent calculation.
        const logGroupId = followMealGroupId(userId, followKey, localDate);
        const { data: existing } = await supabase
          .from('food_log_entries').select('id').eq('user_id', userId).eq('log_group_id', logGroupId).limit(1);
        if (!(existing as any[])?.length) {
          await foodLogService.logFood(userId, {
            foodId: item.recipeFoodId,
            displayName: item.name,
            quantity: 100,
            unit: 'g',
            mealSlot: item.slot === 'breakfast' || item.slot === 'lunch' || item.slot === 'dinner' || item.slot === 'snack' ? item.slot : null,
            captureMethod: FOLLOWED_MEAL_CAPTURE_METHOD,
            logGroupId,
          }, now);
        }
      } else {
        await foodLogService.markMealFollowed(userId, {
          followKey,
          mealName: item.name,
          slot: item.slot,
          macros: {
            calories: item.calories || null,
            proteinG: item.protein_g,
            carbsG: item.carbs_g,
            fatG: item.fat_g,
            fibreG: item.fibre_g,
          },
        }, now);
        if (!isSuggested) {
          await supabase.from('meal_logs').upsert(
            { user_id: userId, meal_plan_item_id: item.id, log_date: localDate, status: 'eaten' },
            { onConflict: 'user_id,meal_plan_item_id,log_date' },
          );
        }
      }
      await reloadNutrition();
    } catch {
      // revert the optimistic flip on failure — never a false ✓
      setLoggedIds(prev => {
        const next = new Set(prev);
        if (wasChecked) next.add(item.id); else next.delete(item.id);
        return next;
      });
      Alert.alert('Could not update', 'Please try again.');
    } finally {
      setTogglingId(null);
    }
  };

  // Same behaviour as My Plan's "Explore support" — professional matching is
  // only fetched after an explicit tap, never preloaded.
  const handleExploreSupport = async () => {
    setSupportExpanded(true);
    if (supportMatches !== null || supportLoading) return;
    setSupportLoading(true);
    try {
      // Beta Feedback #019D — never recommend an in-person nutritionist Lana
      // has no reach to from here. Eligible = explicit active online offering
      // OR reachable within the current marketplace scope (same rule as
      // trainers/classes/discover — see mergeEligiblePtIds).
      const eligibility = await getEligiblePersonalTrainerIds(marketLocRef.current.venueScopeIds);
      // Beta Feedback #019E — a query failure must read as a genuine error,
      // never as "Lana isn't here yet" or "show everybody".
      if (!eligibility.ok) {
        setSupportAvailability('error');
        setSupportMatches([]);
        setSupportLoading(false);
        return;
      }
      const eligibleIds = eligibility.ids;
      // §7/§8 — location known iff the marketplace resolver has a real
      // verdict that isn't 'location_unknown'; never guessed from anything
      // location-adjacent here.
      const locationKnown = marketLocRef.current.availability != null
        && marketLocRef.current.availability.status !== 'location_unknown';

      if (eligibleIds !== null && eligibleIds.length === 0) {
        setSupportAvailability(resolveProfessionalSupportAvailability({ locationKnown, queryFailed: false, matchCount: 0 }));
        setSupportMatches([]);
        setSupportLoading(false);
        return;
      }

      let ptQ = supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, specialisations, photo_url')
        .eq('status', 'approved');
      if (eligibleIds !== null) ptQ = ptQ.in('id', eligibleIds);
      const { data } = await ptQ;
      const providers = ((data ?? []) as any[]).map(p => ({
        id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [], photoUrl: p.photo_url ?? null,
      }));
      const matches = matchProfessionalProviders(null, [], true, providers);
      setSupportAvailability(resolveProfessionalSupportAvailability({ locationKnown, queryFailed: false, matchCount: matches.length }));
      setSupportMatches(matches);
    } catch {
      setSupportAvailability('error'); // §5 — a real failure, not a coverage gap
      setSupportMatches([]); // fails safe — today's meals are unaffected
    } finally {
      setSupportLoading(false);
    }
  };

  // "Logged" = what the user actually ate, from food_log_entries (Nutrition
  // N1). This now includes suggested/planned meals the user explicitly
  // ✓-followed (a real consumption row with the meal's frozen macros) — never
  // a suggestion that was merely shown.
  const logged = {
    calories: foodTotals?.energyKcal ?? 0,
    protein: foodTotals?.proteinG ?? 0,
    carbs: foodTotals?.carbohydrateG ?? 0,
    fat: foodTotals?.fatG ?? 0,
  };

  // Followed-meal rows are shown by the checked ✓ meal card (with its kcal),
  // not as separate deletable log lines — excluded here, still counted above.
  // capture_method='plan' alone is the signal (matches
  // foodLogService.getFollowedMealGroupIds — Recipes V1 widened this the
  // same way): a followed LEGACY meal has foodId null + sourceType
  // 'acp_curated', but a followed CANONICAL RECIPE logs via its real
  // foodId, so sourceType is truthfully the food's own (e.g.
  // 'trusted_food_database' for KFCT) — checking sourceType here would
  // have let a followed recipe appear twice (as its ✓ card AND as a
  // "logged today" line).
  const manualFoodLog = foodLog.filter(e => e.captureMethod !== FOLLOWED_MEAL_CAPTURE_METHOD);

  // Simple UX Redesign V1 (§9/§10) — the meal diary. The 4 canonical slots
  // ALWAYS render (even with 0 entries — an empty slot is still an
  // actionable "+ Add {slot}" row, never hidden); "other" (a log with no
  // slot) only renders when it actually has entries, since it isn't a real
  // slot a user can "add to".
  const CANONICAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
  const foodLogBySlot: { slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'; entries: FoodLogEntry[] }[] = [
    ...CANONICAL_SLOTS.map(slot => ({ slot, entries: manualFoodLog.filter(e => e.mealSlot === slot) })),
    { slot: 'other' as const, entries: manualFoodLog.filter(e => !e.mealSlot) },
  ].filter(g => g.slot !== 'other' || g.entries.length > 0);

  const deleteEntry = async (id: string) => {
    setFoodLog(prev => prev.filter(e => e.id !== id));
    try {
      await foodLogService.deleteFoodLog(id);
    } finally {
      // Refetch today + the recent window so no derived aggregate (totals,
      // completeness, strip, observations) is left stale (N2 §21).
      await reloadNutrition();
    }
  };

  const startEditEntry = (e: FoodLogEntry) => {
    setEditingLogId(e.id);
    setEditQuantityValue(String(e.quantity));
  };

  // §29 — quantity change recalculates the ENTIRE frozen snapshot from the
  // canonical food (foodLogService.updateFoodLogQuantity), never a manual
  // patch of individual nutrient fields. A homemade/user-provided entry has
  // no canonical food to re-scale from; the service itself refuses that case
  // (throws), surfaced here as an honest error rather than a silent no-op.
  const saveEditEntry = async (e: FoodLogEntry) => {
    const q = Number(editQuantityValue);
    if (!Number.isFinite(q) || q <= 0) {
      Alert.alert('Enter a valid amount', 'Amount must be a number greater than 0.');
      return;
    }
    setSavingEdit(true);
    try {
      await foodLogService.updateFoodLogQuantity(e.id, q, e.unit, e.servingLabel);
      setEditingLogId(null);
      await reloadNutrition(); // §17 — Today reflects the new snapshot immediately, no reload/navigation needed
    } catch (err) {
      Alert.alert('Could not update this entry', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };
  // Monthly → Weekly → Daily Planning V1 — "Log this": logs the planned
  // recipe at its planned grams through the SAME canonical logFood path
  // (nutritionPlanningService.logPlannedMeal -> foodLogService.logFood).
  // Idempotent (a repeated tap on an already-consumed slot is a no-op).
  const [loggingPlannedSlot, setLoggingPlannedSlot] = useState<string | null>(null);
  const logPlanned = async (planned: PlannedMealRow) => {
    if (!userId || loggingPlannedSlot) return;
    setLoggingPlannedSlot(planned.id);
    try {
      await nutritionPlanningService.logPlannedMeal(userId, planned);
      await Promise.all([reloadNutrition(), reloadPlannedMeals()]);
    } catch {
      Alert.alert('Could not log this meal', 'Please try again.');
    } finally {
      setLoggingPlannedSlot(null);
    }
  };

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  // Daily Macro Targets V1 — derive-on-read from the SAME refContext already
  // resolved once per load for N3 (no new fetch, §31). §19 — this recomputes
  // on every render from current profile state, so a weight/DOB change is
  // reflected the next time Today loads; nothing here is persisted or cached
  // stale. See lib/nutrition/daily-macro-targets.ts for why only protein can
  // ever carry a target today.
  const dailyMacroTargets = refContext ? resolveDailyMacroTargets(refContext) : null;

  const orderedItems = SLOT_ORDER.flatMap(slot => items.filter(i => i.slot === slot));

  return (
    <View style={s.root}>
      {loading ? (
        <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 100 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[palette.blue100, palette.white]} style={s.header}>
            <SafeAreaView edges={['top']}>
              {/* Simple UX Redesign V1 (§6) — "Nutrition" (the screen) is
                  separate from "Today" (the date control). No day-back/
                  forward pager here: today-nutrition.tsx has only ever shown
                  today; a real ‹ › pager would be new date-fetching state,
                  out of this task's "redesign presentation, not architecture"
                  scope (§30/§38) — historical days stay reachable via the
                  existing "Last 7 days →" link and /nutrition-history below,
                  unchanged. */}
              <View style={s.headerRow}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
                  <Ionicons name="arrow-back" size={20} color={palette.ink900} />
                </TouchableOpacity>
                <ThemedText style={s.headerTitle}>Nutrition</ThemedText>
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => router.push('/recipes' as any)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Browse recipes"
                >
                  <Ionicons name="restaurant" size={18} color={palette.ink900} />
                </TouchableOpacity>
              </View>
              <ThemedText style={s.heroEyebrow}>{todayLabel}</ThemedText>

              {/* §7/§8 — "how am I doing today?" Calories primary, three
                  macros secondary. Energy has categorically no Lana target
                  (no BMR/TDEE engine — N3's own deliberate decision), so it
                  always stays consumed-only, never "X / Y kcal" (§7). Protein
                  compares against Lana's existing personalised reference
                  range when the profile supports it (daily-macro-targets.ts);
                  carbs/fat stay consumed-only — no reference exists for them
                  either. No calories-as-health framing. Fibre and every
                  other micronutrient live behind "Nutrition details →" (§20/§24). */}
              <ThemedText style={s.heroValue}>
                {Math.round(logged.calories)}<ThemedText style={s.heroUnit}> kcal</ThemedText>
              </ThemedText>

              <View style={s.macroRow}>
                <MacroStat label="Protein" value={logged.protein} unit="g" target={dailyMacroTargets?.proteinTargetG} />
                <MacroStat label="Carbs" value={logged.carbs} unit="g" />
                <MacroStat label="Fat" value={logged.fat} unit="g" />
              </View>
              {/* Daily Macro Targets V1 — a clearer, dedicated graph (tick
                  marks at min/max, so the range itself is legible) below the
                  compact row's thin inline line. Only ever shown when a real
                  target exists — never fabricated. */}
              {dailyMacroTargets?.proteinTargetG && (
                <>
                  <TodayTargetGraph label="Protein" value={logged.protein} unit="g" target={dailyMacroTargets.proteinTargetG} />
                  <ThemedText style={s.targetsCaption}>Targets suggested by Lana</ThemedText>
                </>
              )}
              {foodLog.length === 0 && (
                <ThemedText style={s.heroEmpty}>No food recorded for today.</ThemedText>
              )}
            </SafeAreaView>
          </LinearGradient>

          <View style={s.content}>
            {/* §20 — micronutrients are NOT on Today; one secondary link into
                the existing detailed-nutrient screen (app/nutrition-day-
                detail.tsx), reused as-is rather than duplicating NutrientList
                inline here. Positioned right above "+ Log food" per user
                request. */}
            {todayDay && todayDay.hasLogs && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/nutrition-day-detail', params: { date: localISODate(new Date()) } } as any)}
                style={s.secondaryLink}
                accessibilityRole="button"
                accessibilityLabel="Nutrition details"
              >
                <ThemedText style={s.secondaryLinkText}>Nutrition details →</ThemedText>
              </TouchableOpacity>
            )}

            {/* Nutrition N2 — recent nutrition entry point + evidence. */}
            {recentDays.length > 0 && (
              <View style={s.section}>
                <TouchableOpacity
                  style={s.recentHeader}
                  onPress={() => router.push('/nutrition-history' as any)}
                  activeOpacity={0.8}
                >
                  <ThemedText style={s.sectionTitle}>Recent nutrition</ThemedText>
                  <ThemedText style={s.link}>Last 7 days →</ThemedText>
                </TouchableOpacity>
                <DayProteinStrip days={recentDays} target={dailyMacroTargets?.proteinTargetG} />
              </View>
            )}

            {/* Simple UX Redesign V1 (§11) — one obvious primary action, the
                shared Lana Button component (primary = filled ink900 pill),
                never a second competing CTA of equal weight. Manual "Log
                food" stays behind its existing flag — see
                isManualFoodLoggingEnabled's own doc comment. */}
            {isManualFoodLoggingEnabled() && (
              <Button
                variant="primary"
                size="lg"
                block
                label="+ Log food"
                onPress={() => router.push('/log-food' as any)}
                accessibilityLabel="Log food"
                style={{ marginBottom: 14 }}
              />
            )}

            {/* §9/§10/§31 — the meal diary: what was actually logged
                (food_log_entries via manualFoodLog), the core of the page.
                All 4 canonical slots always render — an empty slot is a
                lightweight "Nothing logged yet" + add action, never hidden
                and never a large empty-state illustration (§10). Simple
                grouped rows, not a card-in-a-card per slot (§24). */}
            <View style={s.loggedWrap}>
              {foodLogBySlot.map(({ slot, entries }) => (
                <View key={slot} style={{ marginBottom: 18 }}>
                  <ThemedText style={s.loggedSlotLabel}>
                    {slot === 'other' ? 'Other' : SLOT_LABEL[slot]}
                  </ThemedText>
                  {/* Monthly → Weekly → Daily Planning V1 (§22/§47, flagged) —
                      PLANNED merges into the same slot as CONSUMED (one
                      mental model per slot, not two stacked sections). Only
                      shown while genuinely still pending — once logged or
                      replaced, the row below already shows it, so this
                      would just duplicate information (§29). Planning
                      itself contributes ZERO nutrition evidence (§23) —
                      "Log this" is the one action that does, via the exact
                      same canonical logFood path as everywhere else. */}
                  {isNutritionPlanningEnabled() && slot !== 'other' && plannedMealsBySlot[slot] && (plannedMealsBySlot[slot]!.status === 'recommended' || plannedMealsBySlot[slot]!.status === 'planned') && (
                    <View style={s.plannedRow}>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => router.push({ pathname: '/recipe-detail', params: { foodId: plannedMealsBySlot[slot]!.plannedFoodId, slot } } as any)}
                        accessibilityRole="button"
                        accessibilityLabel={`View planned ${slot}: ${plannedMealsBySlot[slot]!.plannedLabel}`}
                      >
                        <ThemedText style={s.plannedLabel}>Planned</ThemedText>
                        <ThemedText style={s.plannedName} numberOfLines={1}>
                          {plannedMealsBySlot[slot]!.plannedLabel} · {plannedMealsBySlot[slot]!.plannedGrams}g
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => logPlanned(plannedMealsBySlot[slot]!)}
                        disabled={loggingPlannedSlot === plannedMealsBySlot[slot]!.id}
                        style={s.logThisBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Log this ${slot}`}
                      >
                        {loggingPlannedSlot === plannedMealsBySlot[slot]!.id
                          ? <ActivityIndicator size="small" color={palette.ink900} />
                          : <ThemedText style={s.logThisBtnText}>Log this</ThemedText>}
                      </TouchableOpacity>
                    </View>
                  )}
                  {entries.length === 0 ? (
                    <View style={s.diaryEmptyRow}>
                      <ThemedText style={s.diaryEmptyText}>Nothing logged yet</ThemedText>
                      {isManualFoodLoggingEnabled() && (
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/log-food', params: { slot } } as any)}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${slot}`}
                        >
                          <Ionicons name="add-circle-outline" size={22} color={palette.ink900} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <>
                      {entries.map(e => (
                        <View key={e.id} style={s.loggedRow}>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={s.loggedName} numberOfLines={1}>{e.displayName}</ThemedText>
                            {editingLogId === e.id ? (
                              <View style={s.editRow}>
                                <TextInput
                                  style={s.editInput}
                                  value={editQuantityValue}
                                  onChangeText={setEditQuantityValue}
                                  keyboardType="decimal-pad"
                                  autoFocus
                                  selectTextOnFocus
                                  accessibilityLabel={`Edit amount for ${e.displayName}`}
                                />
                                <ThemedText style={s.editUnit}>{e.unit === 'serving' ? (e.servingLabel ?? 'serving') : e.unit}</ThemedText>
                              </View>
                            ) : (
                              <ThemedText style={s.loggedMeta}>
                                {e.unit === 'serving' ? (e.servingLabel ?? `${e.quantity} serving`) : `${e.quantity} ${e.unit}`}
                                {e.nutrients.energyKcal != null ? ` · ${Math.round(e.nutrients.energyKcal)} kcal` : ''}
                                {e.nutrients.proteinG != null ? ` · ${Math.round(e.nutrients.proteinG)}g protein` : ''}
                              </ThemedText>
                            )}
                          </View>
                          {editingLogId === e.id ? (
                            <>
                              <TouchableOpacity onPress={() => saveEditEntry(e)} disabled={savingEdit} hitSlop={10} accessibilityLabel="Save amount" accessibilityRole="button">
                                {savingEdit ? <ActivityIndicator size="small" color={palette.success700} /> : <Ionicons name="checkmark-circle" size={20} color={palette.success700} />}
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setEditingLogId(null)} hitSlop={10} accessibilityLabel="Cancel edit" accessibilityRole="button" style={{ marginLeft: 8 }}>
                                <Ionicons name="close-circle-outline" size={20} color={palette.gray300} />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              {/* §29 — only offered when there's a canonical food to
                                  re-scale from; a homemade/user-provided entry's
                                  numbers describe a specific eaten portion and can't
                                  be reinterpreted by quantity (the service itself
                                  refuses that case). */}
                              {e.foodId != null && (
                                <TouchableOpacity onPress={() => startEditEntry(e)} hitSlop={10} accessibilityLabel={`Edit amount for ${e.displayName}`} accessibilityRole="button" style={{ marginRight: 12 }}>
                                  <Ionicons name="pencil-outline" size={16} color={palette.gray300} />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity onPress={() => deleteEntry(e.id)} hitSlop={10} accessibilityLabel={`Delete ${e.displayName}`} accessibilityRole="button">
                                <Ionicons name="trash-outline" size={16} color={palette.gray300} />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      ))}
                      {isManualFoodLoggingEnabled() && slot !== 'other' && (
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/log-food', params: { slot } } as any)}
                          style={s.diaryAddMore}
                          accessibilityRole="button"
                          accessibilityLabel={`Add another ${slot} item`}
                        >
                          <ThemedText style={s.diaryAddMoreText}>+ Add {slot}</ThemedText>
                        </TouchableOpacity>
                      )}
                      {SAVED_MEALS_ENABLED && prefillFromEntries(entries).length >= 2 && (
                        <TouchableOpacity
                          style={s.saveAsMealBtn}
                          onPress={() => router.push({
                            pathname: '/saved-meal-edit' as any,
                            params: { prefill: JSON.stringify(prefillFromEntries(entries)) },
                          })}
                        >
                          <Ionicons name="bookmark-outline" size={13} color={palette.success700} />
                          <ThemedText style={s.saveAsMealText}>Save these as a meal</ThemedText>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              ))}
            </View>

            {isNutritionPlanningEnabled() && weeklyObjective && (
              <TouchableOpacity
                onPress={() => router.push('/nutrition-weekly-plan' as any)}
                style={s.secondaryLink}
                accessibilityRole="button"
                accessibilityLabel="View weekly plan"
              >
                <ThemedText style={s.secondaryLinkText}>View weekly plan →</ThemedText>
              </TouchableOpacity>
            )}

            {isSuggested && isAdaptiveNutritionEnabled() && userId ? (
              // Beta Feedback #022 — adaptive daily plan. Only ever replaces
              // the "no active meal plan → suggested meals" branch (isSuggested);
              // a real nutritionist-assigned meal_plans row always renders via
              // the unchanged branch below, flag on or off.
              <AdaptiveTodayMeals userId={userId} date={localISODate(new Date())} todayFoodLog={foodLog} />
            ) : isSuggested && isNutritionPlanningEnabled() && weeklyObjective ? (
              // §19 — WITH an active nutrition plan, the planned next meal is
              // primary; Lana Suggests must never show an unrelated recipe
              // recommendation competing with it. This surfaces a
              // plan-related observation instead — the next not-yet-resolved
              // planned meal today, or an honest "plan followed" note —
              // built entirely from data already on this page
              // (plannedMealsBySlot), never a new recommendation/ranking.
              (() => {
                const next = (['breakfast', 'lunch', 'dinner', 'snack'] as const)
                  .map(slot => plannedMealsBySlot[slot])
                  .find(m => m && (m.status === 'recommended' || m.status === 'planned'));
                return (
                  <View style={s.suggestCard}>
                    <ThemedText style={s.suggestEyebrow}>Your plan</ThemedText>
                    {next ? (
                      <>
                        <ThemedText style={s.suggestName}>{next.plannedLabel}</ThemedText>
                        <ThemedText style={s.suggestReason}>{weeklyObjective}</ThemedText>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/recipe-detail', params: { foodId: next.plannedFoodId, slot: next.mealSlot } } as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`View recipe for ${next.plannedLabel}`}
                        >
                          <ThemedText style={s.suggestCta}>View recipe →</ThemedText>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <ThemedText style={s.suggestReason}>You&apos;ve followed your plan for today.</ThemedText>
                    )}
                  </View>
                );
              })()
            ) : isSuggested ? (
              // §18/§19/§31 — WITHOUT an active plan, "Lana suggests" never
              // competes with the food diary above: at most ONE card, placed
              // below it, one factual evidence-grounded line, "View recipe"
              // only (no inline ✓ — logging a suggestion goes through the
              // SAME Recipe Detail → Add to today path as any other recipe,
              // §16). The underlying capability (recipe-backed,
              // deterministically ranked suggestions, still fully loggable)
              // is unchanged — only the presentation collapses from "up to 3
              // rows with checkmarks" to one card. `orderedItems[0]` is the
              // same slot-ordered pick already computed above (SLOT_ORDER),
              // not a new ranking.
              orderedItems.length > 0 && (
                <View style={s.suggestCard}>
                  <ThemedText style={s.suggestEyebrow}>Lana suggests</ThemedText>
                  <ThemedText style={s.suggestName}>{orderedItems[0].name}</ThemedText>
                  <ThemedText style={s.suggestReason}>{suggestionReasonText(orderedItems[0].reasons)}</ThemedText>
                  <TouchableOpacity
                    onPress={() => router.push(
                      orderedItems[0].recipeFoodId
                        ? { pathname: '/recipe-detail', params: { foodId: orderedItems[0].recipeFoodId, slot: orderedItems[0].slot } } as any
                        : { pathname: '/meal-detail', params: { mealId: orderedItems[0].mealId } } as any,
                    )}
                    accessibilityRole="button"
                    accessibilityLabel={`View recipe for ${orderedItems[0].name}`}
                  >
                    <ThemedText style={s.suggestCta}>View recipe →</ThemedText>
                  </TouchableOpacity>
                </View>
              )
            ) : items.length === 0 ? (
              <ThemedText style={s.emptyText}>No planned meals for today.</ThemedText>
            ) : (
              // A real, nutritionist-assigned meal plan (isSuggested=false) —
              // distinct, pre-existing functionality untouched by the
              // Suggested Meals redesign above.
              <>
                <ThemedText style={s.sourceNote}>From your meal plan</ThemedText>
                <View style={s.mealsList}>
                  {orderedItems.map(item => {
                    const done = loggedIds.has(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={s.mealRow}
                        onPress={() => router.push({ pathname: '/meal-detail', params: { mealId: item.mealId } } as any)}
                        activeOpacity={0.85}
                      >
                        <View style={s.mealRowBody}>
                          <ThemedText style={s.mealTypeTag}>{SLOT_LABEL[item.slot]}</ThemedText>
                          <ThemedText style={[s.mealName, done && s.mealNameDone]} numberOfLines={2}>{item.name}</ThemedText>
                          <ThemedText style={s.mealMeta}>{item.calories} kcal</ThemedText>
                        </View>
                        <TouchableOpacity
                          style={[s.checkBtn, done && s.checkBtnDone]}
                          onPress={() => toggleMeal(item)}
                          disabled={togglingId === item.id}
                          hitSlop={8}
                        >
                          <Ionicons name="checkmark" size={16} color={done ? '#fff' : palette.gray300} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Nutritionist Support Extension — §4/§9.A/§18: this is
                DISCOVERY (the user voluntarily taps in), not a Lana
                RECOMMENDATION — always visible where the underlying
                marketplace exists, never gated on an assessment/inference
                claiming the user needs it (§10/§11/Q5). Static, neutral
                copy; no medical/clinical claim. Reuses the EXISTING
                provider/matching architecture end to end: same
                `personal_trainers` table, same lib/professional-support.ts
                deterministic "specialisations includes Nutrition" filter
                (no LLM, no commission ranking — see that file's own header),
                same handleExploreSupport query, same ProviderMatch →
                navigationTarget booking-flow routing, same
                ProfessionalSupportUnavailableNotice honest no-supply state.
                Secondary visual treatment (palette.surfaceMuted card, white
                pill CTA) — never the primary filled-ink900 button (§5/§6). */}
            <View style={s.card}>
              <ThemedText style={s.cardEyebrow}>Need more support?</ThemedText>
              <ThemedText style={s.aiBody}>Get personalised nutrition guidance from a professional.</ThemedText>

              {!supportExpanded ? (
                <TouchableOpacity style={s.exploreSupportBtn} onPress={handleExploreSupport} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Find a nutrition professional">
                  <ThemedText style={s.exploreSupportBtnText}>Find a nutrition professional →</ThemedText>
                </TouchableOpacity>
              ) : supportLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} color={palette.ink700} />
              ) : supportMatches && supportMatches.length > 0 ? (
                <View style={{ marginTop: 12 }}>
                  {supportMatches.map(m => (
                    <TouchableOpacity key={m.id} style={s.providerRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                      {m.photoUrl ? (
                        <Image source={{ uri: m.photoUrl }} style={s.providerAvatar} />
                      ) : (
                        <View style={[s.providerAvatar, s.providerAvatarFallback]}>
                          <Ionicons name="person-outline" size={18} color={palette.gray300} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.dayTitle}>{m.name}</ThemedText>
                        {m.matchReasons.length > 0 && (
                          <ThemedText style={s.dayMeta}>Good match for: {m.matchReasons.join(' · ')}</ThemedText>
                        )}
                      </View>
                      <ThemedText style={s.fulfilmentLink}>View profile →</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                // Beta Feedback #019E — WHY there's nothing to show:
                // geography, an unresolved location, or a genuine failure —
                // never one generic "no matching professionals" message.
                // §14 — Nutrition itself keeps working regardless; this is
                // the ONLY thing that changes when supply is zero.
                <View style={{ marginTop: 12 }}>
                  <ProfessionalSupportUnavailableNotice
                    availability={supportAvailability && supportAvailability !== 'available' ? supportAvailability : 'no_local_or_online_support'}
                    professionalNoun="nutrition professionals"
                    continueWithNoun="Lana's nutrition guidance and meal tracking"
                  />
                </View>
              )}
            </View>

            {/* Everything below is secondary intelligence/history (§18). */}

            {patterns && (
              <View style={s.section}>
                <ObservedPanel patterns={patterns} />
              </View>
            )}

            {/* Nutrition N3 — "Your nutrition references" — hidden per product
                decision (2026-09-04). The data still loads (refContext /
                refComparisons) for any future use; only the section render is
                removed. Re-enable by restoring the <NutritionReferenceSection>
                block below.
            {refContext && refComparisons && (
              <View style={s.section}>
                <NutritionReferenceSection context={refContext} comparisons={refComparisons} />
              </View>
            )} */}

            {/* Nutrition N4 — coaching. Deterministic cards always; LLM only
                rephrases. Renders nothing when there are no eligible
                opportunities or the feature flag is off. */}
            {coaching && coaching.cards.length > 0 && (
              <View style={s.section}>
                <NutritionCoachingSection result={coaching} />
              </View>
            )}

            {/* Nutrition N7 — fitness × nutrition context. Deterministic
                observations only; no LLM. Renders nothing without qualifying
                cross-domain evidence or when the flag is off. */}
            {n7Observations.length > 0 && (
              <View style={s.section}>
                <NutritionActivityContext observations={n7Observations} />
              </View>
            )}

            {/* Nutrition N8 — advice effectiveness. Deterministic before/after
                observation only; no LLM, no causal claim. Renders nothing
                until an exposed coaching episode has enough subsequent logged
                days, or when the flag is off. */}
            {n8Observations.length > 0 && (
              <View style={s.section}>
                <NutritionWhatsChanged observations={n8Observations} />
              </View>
            )}

            <View style={{ height: 60 }} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: { paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900 },

  // Nutrition N2 hero — factual logged totals, no goal ring.
  heroEyebrow: {
    fontSize: 11, fontWeight: '800', color: palette.gray450,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 22, textAlign: 'center',
  },
  // lineHeight must clear the 800-weight 40px glyph — without it Android
  // vertically clips the digits (the "0" renders as a "U").
  heroValue: { fontSize: 40, lineHeight: 48, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginTop: 4 },
  heroUnit: { fontSize: 16, fontWeight: '600', color: palette.gray450 },
  heroEmpty: { fontSize: 12.5, color: palette.gray450, textAlign: 'center', marginTop: 12 },

  macroRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 22, paddingHorizontal: 16,
  },
  macroCol: { alignItems: 'center', gap: 4, minWidth: 68 },
  macroValue: { fontSize: 16, fontWeight: '800', color: palette.ink900 },
  macroUnit: { fontSize: 11, fontWeight: '600', color: palette.gray450 },
  macroLabel: { fontSize: 11.5, color: palette.gray450 },
  // Daily Macro Targets V1 — thin reference bar, monochrome brand-accent
  // fill only (§30 — no macro-specific colors), capped visually at 100%
  // even when the text shows an over-target value (§17).
  macroBarTrack: {
    width: '100%', height: 3, borderRadius: 2, backgroundColor: palette.surfaceMuted,
    overflow: 'hidden', marginTop: 2,
  },
  macroBarFill: { height: '100%', backgroundColor: palette.blue500, borderRadius: 2 },
  targetsCaption: { fontSize: 11, color: palette.gray300, textAlign: 'center', marginTop: 8 },
  targetGraph: { marginTop: 16, paddingHorizontal: 4 },
  targetGraphHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  targetGraphLabel: { fontSize: 12, fontWeight: '700', color: palette.ink700 },
  targetGraphValue: { fontSize: 12, fontWeight: '700', color: palette.ink900 },
  targetGraphTrack: {
    height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted,
    overflow: 'visible', position: 'relative', justifyContent: 'center',
  },
  targetGraphFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: palette.ink900,
  },
  // Tick marks at the target range's min/max — monochrome brand accent,
  // taller than the track so the range boundary reads clearly against the
  // consumed fill underneath it (§30 — no macro-specific colors).
  targetGraphTick: {
    position: 'absolute', top: -3, bottom: -3, width: 2, backgroundColor: palette.blue500, borderRadius: 1,
  },

  content: { paddingHorizontal: 20, paddingTop: 24 },
  emptyText: { fontSize: 13, color: palette.gray300, textAlign: 'center', marginTop: 40 },
  sourceNote: { fontSize: 12, color: palette.gray300, marginBottom: 16 },

  // §18/§19/§31 — "Lana suggests", a single card, positioned below the food
  // diary. Uses Card-equivalent surface/border tokens (palette.white /
  // palette.hairline — the same pair components/ui/Card.tsx uses) rather
  // than a colored panel (§25 — brand color marks action/verified/progress,
  // not a whole tinted section).
  suggestCard: {
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline, padding: 16, marginBottom: 20,
  },
  suggestEyebrow: {
    fontSize: 11, fontWeight: '800', color: palette.blue600,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  suggestName: { fontSize: 16, fontWeight: '800', color: palette.ink900, marginBottom: 4 },
  suggestReason: { fontSize: 13, color: palette.gray450, lineHeight: 18, marginBottom: 10 },
  suggestCta: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 12.5, fontWeight: '700', color: palette.blue600 },

  // Simple UX Redesign V1 — a plain text link, never a bordered/filled
  // button, so Recipes/Nutrition-details never visually compete with the
  // one primary "+ Log food" button (§11/§22/§25).
  secondaryLink: { paddingVertical: 10, marginBottom: 4 },
  secondaryLinkText: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },
  diaryEmptyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  diaryEmptyText: { fontSize: 13.5, color: palette.gray300 },
  // Monthly → Weekly → Daily Planning V1 — the PLANNED row within a slot.
  // Reuses the same border/spacing language as loggedRow (no new card).
  plannedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline,
    backgroundColor: palette.blue25 ?? palette.surfaceMuted,
  },
  plannedLabel: { fontSize: 10, fontWeight: '800', color: palette.blue600, textTransform: 'uppercase', letterSpacing: 0.5 },
  plannedName: { fontSize: 13.5, fontWeight: '700', color: palette.ink900, marginTop: 2 },
  logThisBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline },
  logThisBtnText: { fontSize: 12, fontWeight: '700', color: palette.ink900 },
  diaryAddMore: { paddingVertical: 8 },
  diaryAddMoreText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },

  // Nutrition N1 — food log
  loggedWrap: { marginBottom: 8 },
  loggedSlotLabel: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4,
  },
  loggedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  loggedName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  loggedMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  editInput: {
    width: 64, height: 32, borderRadius: radii.md, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 8, fontSize: 13, fontWeight: '700', color: palette.ink900,
  },
  editUnit: { fontSize: 12, color: palette.gray450 },
  saveAsMealBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 2 },
  saveAsMealText: { fontSize: 12, fontWeight: '700', color: palette.success700 },

  mealsList: { gap: GRID_GAP, marginBottom: 20 },

  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderRadius: radii['2xl'],
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14,
  },
  mealRowBody: { flex: 1 },
  mealTypeTag: {
    fontSize: 10, fontWeight: '800', color: palette.blue600,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  mealName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  mealNameDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  mealMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  checkBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkBtnDone: { backgroundColor: palette.success700 },

  // "Want extra support?" — same card/behaviour as My Plan's support section.
  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginTop: 4,
  },
  cardEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray300,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  aiBody: {
    fontSize: fontSize.sm,
    color: palette.ink600,
    marginTop: 6,
    lineHeight: 20,
  },
  exploreSupportBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
  },
  exploreSupportBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  providerAvatar: { width: 75, height: 74, borderRadius: radii.lg, flexShrink: 0 },
  providerAvatarFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  dayTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  dayMeta: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
    marginTop: 2,
  },
  fulfilmentLink: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.ink700,
  },
});
