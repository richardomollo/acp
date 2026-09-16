// Lana Nutrition — Monthly → Weekly → Daily Planning V1. The one service
// boundary for cycle/week/planned-meal state. UI calls only this; never
// Supabase directly for any of this feature's own tables.
//
// Reuses, never duplicates:
//   - lib/nutrition/daily-nutrition-plan.ts's buildDailyNutritionPlan/
//     swapSlotCandidate — the SAME deterministic ranker Beta #022 already
//     uses, just fed canonical-recipe candidates instead of legacy `meals`.
//   - lib/nutrition/nutrition-meal-model.ts's mealCandidateFromFoodRecipe —
//     built for exactly this purpose, previously unwired (see this
//     feature's plan/audit).
//   - services/recipe-service.ts's listActiveForSuggestions() — the SAME
//     recipe-only, active-foods-only candidate pool Suggested Meals uses.
//   - services/food-log-service.ts's logFood — the ONE canonical logging
//     path. Logging a planned meal NEVER writes a second evidence table.
//   - lib/nutrition/daily-macro-targets.ts's resolveDailyMacroTargets — the
//     ONE place a protein target is ever computed.
//
// Three tables (migration 20260925000001), all additive, all RLS-owned by
// the user: nutrition_planning_cycles, nutrition_weekly_plans,
// nutrition_planned_meals. The dormant Beta #022 nutrition_recommendation_
// events / `meals` pipeline is completely untouched by this file.

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { localISODate } from '@/lib/fulfilment';
import { foodLogService } from './food-log-service';
import { recipeService } from './recipe-service';
import { nutritionReferenceService } from './nutrition-reference-service';
import { resolveDailyMacroTargets } from '@/lib/nutrition/daily-macro-targets';
import { slotsForRecipeCategory } from '@/lib/nutrition/recipe-model';
import { mealCandidateFromFoodRecipe, mealCandidateKey, type MealCandidate } from '@/lib/nutrition/nutrition-meal-model';
import {
  buildDailyNutritionPlan, swapSlotCandidate, DEFAULT_RANKING_WEIGHTS,
  type ProteinBudget, type RankingWeights,
} from '@/lib/nutrition/daily-nutrition-plan';
import {
  buildMonthlyStrategy, objectiveForWeek, resolveNextWeekObjective,
  type MonthlyStrategy, type WeekObjectiveTheme,
} from '@/lib/nutrition/monthly-nutrition-strategy';
import { evaluateWeeklyAdaptation, buildWeeklyAdaptationInput } from '@/lib/nutrition/weekly-nutrition-adaptation';
import { computeMealPreferenceScores, type MealPreferenceEvent } from '@/lib/nutrition/meal-preference-learning';
import type { MealSlot } from '@/lib/nutrition/food-types';

const CYCLE_DAYS = 28;
const CANONICAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DEFAULT_PLANNED_GRAMS = 100; // §20/§21 — the same fixed reference portion Suggested Meals/Recipe Detail already use; never "one bowl"
// Mirrors the dormant #022 system's own PREFERENCE_HISTORY_DAYS exactly —
// same window, same rationale (recent enough to matter, long enough to
// smooth out single-day noise).
const PREFERENCE_HISTORY_DAYS = 30;

// Closing the loop §14 — a week whose objective is "protein consistency"
// leans the EXISTING deterministic ranker toward its EXISTING protein-
// budget-fit dimension (never a new engine, never a new signal). An
// explicit, named, reviewable weight set — not a runtime computation —
// exactly like DEFAULT_RANKING_WEIGHTS itself.
const PROTEIN_FOCUS_WEIGHTS: RankingWeights = { preference: 0.30, goalFit: 0.20, cuisineFit: 0.10, proteinBudget: 0.40 };

function weightsForTheme(theme: WeekObjectiveTheme | null | undefined): RankingWeights {
  return theme === 'protein_consistency' ? PROTEIN_FOCUS_WEIGHTS : DEFAULT_RANKING_WEIGHTS;
}

function addDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function mondayOnOrBefore(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(localDate, -back);
}

// ── Row shapes ───────────────────────────────────────────────────────────

export interface NutritionCycleRow {
  id: string; userId: string; startDate: string; endDate: string; goal: string | null; status: 'active' | 'completed';
}
export interface NutritionWeekRow {
  id: string; cycleId: string; userId: string; weekStartDate: string; weekEndDate: string;
  objective: string; objectiveReason: string | null; objectiveTheme: WeekObjectiveTheme | null;
  status: 'scheduled' | 'current' | 'completed';
}
export interface PlannedMealRow {
  id: string; weeklyPlanId: string; localDate: string; mealSlot: MealSlot;
  recommendedRecipeId: string | null; recommendedFoodId: string | null; recommendedLabel: string;
  recommendedGrams: number | null; recommendationReason: string | null;
  plannedRecipeId: string | null; plannedFoodId: string | null; plannedLabel: string; plannedGrams: number; swapped: boolean;
  consumedLogGroupId: string | null; consumedAt: string | null;
  status: 'recommended' | 'planned' | 'consumed' | 'replaced' | 'skipped';
}

function mapCycle(r: any): NutritionCycleRow {
  return { id: r.id, userId: r.user_id, startDate: r.start_date, endDate: r.end_date, goal: r.goal ?? null, status: r.status };
}
function mapWeek(r: any): NutritionWeekRow {
  return {
    id: r.id, cycleId: r.cycle_id, userId: r.user_id, weekStartDate: r.week_start_date, weekEndDate: r.week_end_date,
    objective: r.objective, objectiveReason: r.objective_reason ?? null, objectiveTheme: r.objective_theme ?? null, status: r.status,
  };
}
function mapPlannedMeal(r: any): PlannedMealRow {
  return {
    id: r.id, weeklyPlanId: r.weekly_plan_id, localDate: r.local_date, mealSlot: r.meal_slot,
    recommendedRecipeId: r.recommended_recipe_id ?? null, recommendedFoodId: r.recommended_food_id ?? null,
    recommendedLabel: r.recommended_label, recommendedGrams: r.recommended_grams == null ? null : Number(r.recommended_grams),
    recommendationReason: r.recommendation_reason ?? null,
    plannedRecipeId: r.planned_recipe_id ?? null, plannedFoodId: r.planned_food_id ?? null,
    plannedLabel: r.planned_label, plannedGrams: Number(r.planned_grams), swapped: r.swapped,
    consumedLogGroupId: r.consumed_log_group_id ?? null, consumedAt: r.consumed_at ?? null, status: r.status,
  };
}

// ── Candidate fetching (§12/§13/§18/§59 — one query, reused across every
//    day/slot in a week generation pass, never N+1). Candidates are drawn
//    EXCLUSIVELY from recipeService.listActiveForSuggestions() (canonical
//    food_recipes + active foods) — never legacy `meals`, never
//    `saved_meals` (§18 audit: mealCandidateFromSavedMeal is never called
//    anywhere in this file; a user's saved meals stay reachable elsewhere
//    in Nutrition, just never an AUTOMATIC Lana-planning candidate). ─────

async function fetchWeeklyRankingContext(userId: string) {
  const [{ data: profile }, recipeCandidates, macroTargets] = await Promise.all([
    supabase.from('fitness_profile').select('goal, cuisine_preferences, cuisine_preference, preferred_training_days').eq('user_id', userId).maybeSingle(),
    recipeService.listActiveForSuggestions(),
    nutritionReferenceService.resolveUserReferenceContext(userId).then(resolveDailyMacroTargets).catch(() => null),
  ]);
  const proteinBudget: ProteinBudget | null = macroTargets?.proteinTargetG
    ? { minG: macroTargets.proteinTargetG.min, maxG: macroTargets.proteinTargetG.max }
    : null;

  const candidatesBySlot: Partial<Record<MealSlot, MealCandidate[]>> = {};
  for (const slot of CANONICAL_SLOTS) candidatesBySlot[slot] = [];
  for (const { food, recipe } of recipeCandidates) {
    for (const slot of slotsForRecipeCategory(recipe.category)) {
      const candidate = mealCandidateFromFoodRecipe(food, recipe.id, slot);
      candidatesBySlot[slot]!.push(candidate);
    }
  }

  return {
    goal: profile?.goal ?? null,
    cuisinePreferences: profile?.cuisine_preferences ?? [],
    requireVegetarian: profile?.cuisine_preference === 'vegetarian',
    hasTrainingDaysOnFile: !!(profile?.preferred_training_days && profile.preferred_training_days.length > 0),
    proteinBudget,
    candidatesBySlot,
    proteinTargetAvailable: macroTargets?.proteinTargetG != null,
  };
}

// ── §16/§17/§30 — real preference history, the SAME semantics the dormant
//    #022 system already proved (fetchPreferenceEvents there), just reading
//    nutrition_planned_meals instead of nutrition_recommendation_events.
//    "displayed" (every generated row) < "swapped_away" (recommended, when
//    swapped) < "consumed" (explicit, §7/§8) — computeMealPreferenceScores
//    itself is completely unmodified, reused verbatim. ────────────────────

async function fetchPreferenceEvents(userId: string, beforeDate: string): Promise<MealPreferenceEvent[]> {
  const since = addDays(beforeDate, -PREFERENCE_HISTORY_DAYS);
  const { data } = await supabase.from('nutrition_planned_meals')
    .select('local_date, meal_slot, recommended_food_id, planned_food_id, swapped, status')
    .eq('user_id', userId).gte('local_date', since).lt('local_date', beforeDate); // never let the week being generated bias its own ranking

  const events: MealPreferenceEvent[] = [];
  for (const row of (data ?? []) as any[]) {
    const recommendedKey = row.recommended_food_id ? mealCandidateKey('canonical_recipe', row.recommended_food_id) : null;
    const plannedKey = row.planned_food_id ? mealCandidateKey('canonical_recipe', row.planned_food_id) : null;
    if (recommendedKey) events.push({ mealKey: recommendedKey, slot: row.meal_slot, type: 'displayed', localDate: row.local_date });
    if (row.swapped && recommendedKey) events.push({ mealKey: recommendedKey, slot: row.meal_slot, type: 'swapped_away', localDate: row.local_date });
    if (row.status === 'consumed' && plannedKey) events.push({ mealKey: plannedKey, slot: row.meal_slot, type: 'consumed', localDate: row.local_date });
  }
  return events;
}

// ── Cycle ────────────────────────────────────────────────────────────────

/**
 * The user's current active cycle, or null if none exists or the active
 * one's end_date has passed (in which case it's flipped to 'completed' as
 * a read-triggered side effect — status only, never destructive — and null
 * is returned so the caller can show the §40 "plan complete" state rather
 * than silently starting a new one, §19/§40).
 */
async function getCurrentCycle(userId: string, today: string): Promise<NutritionCycleRow | null> {
  const { data } = await supabase.from('nutrition_planning_cycles')
    .select('*').eq('user_id', userId).eq('status', 'active').order('start_date', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const cycle = mapCycle(data);
  if (today > cycle.endDate) {
    await supabase.from('nutrition_planning_cycles').update({ status: 'completed' }).eq('id', cycle.id);
    return null;
  }
  return cycle;
}

/** §40 — an explicit action (either the user's first-ever cycle, or a
 *  confirmed "Prepare next plan"). Idempotent via UNIQUE(user_id, start_date). */
async function startNewCycle(userId: string, startDate: string): Promise<NutritionCycleRow> {
  const endDate = addDays(startDate, CYCLE_DAYS - 1);
  const { data: profile } = await supabase.from('fitness_profile').select('goal').eq('user_id', userId).maybeSingle();
  const { data, error } = await supabase.from('nutrition_planning_cycles')
    .upsert({ user_id: userId, start_date: startDate, end_date: endDate, goal: profile?.goal ?? null, status: 'active' }, { onConflict: 'user_id,start_date' })
    .select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create cycle');
  return mapCycle(data);
}

// ── Week ─────────────────────────────────────────────────────────────────

function weekNumberInCycle(cycle: NutritionCycleRow, weekStartDate: string): 1 | 2 | 3 | 4 {
  const diffDays = Math.round((Date.parse(weekStartDate) - Date.parse(cycle.startDate)) / 86400000);
  const n = Math.min(4, Math.max(1, Math.floor(diffDays / 7) + 1));
  return n as 1 | 2 | 3 | 4;
}

/** Generates every (day, slot) planned-meal row for one week in one pass —
 *  the "weekly recipe plan" itself. Idempotent: only inserts rows missing
 *  for (user, date, slot); never touches an existing row (§32/§33).
 *  `weights` (§14) leans the SAME existing ranker toward the week's own
 *  objective when that objective maps to a real ranking dimension — omit
 *  for the tested defaults. */
async function generateWeekPlannedMeals(userId: string, week: NutritionWeekRow, weights?: RankingWeights): Promise<void> {
  const [ctx, preferenceEvents] = await Promise.all([
    fetchWeeklyRankingContext(userId),
    fetchPreferenceEvents(userId, week.weekStartDate),
  ]);
  // §16/§17 — real behavioural history, computed ONCE and reused for every
  // day/slot this week (never per-day refetch, §59); a single logged event
  // nudges the score (EVENT_WEIGHT), it never dominates it outright —
  // computeMealPreferenceScores' own existing weighting already guards §30.
  const preferenceScores = computeMealPreferenceScores(preferenceEvents, week.weekStartDate);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week.weekStartDate, i));

  const { data: existingRows } = await supabase.from('nutrition_planned_meals')
    .select('local_date, meal_slot').eq('user_id', userId).in('local_date', dates);
  const existingKeys = new Set(((existingRows ?? []) as any[]).map(r => `${r.local_date}:${r.meal_slot}`));

  // Pre-QA hardening §1/§5/§6 — insert PER DAY, not one batch at the very
  // end. If ranking or the network throws partway through the week (e.g.
  // Thursday), Monday-Wednesday's already-inserted rows survive; a retry
  // (generateWeekPlannedMeals is idempotent — re-reads existingKeys) only
  // ever fills the remaining gap, never touches or duplicates what's
  // already there. A day with nothing to insert (every slot already
  // existed or genuinely had no eligible candidate) is simply skipped.
  for (const date of dates) {
    const plan = buildDailyNutritionPlan({
      date, slots: [...CANONICAL_SLOTS], candidatesBySlot: ctx.candidatesBySlot,
      goal: ctx.goal, cuisinePreferences: ctx.cuisinePreferences, requireVegetarian: ctx.requireVegetarian,
      proteinBudget: ctx.proteinBudget, consumedProteinSoFarG: 0, preferenceScores,
      varietySeed: `${userId}:${date}`, weights,
    });
    const dayInsert: Record<string, unknown>[] = [];
    for (const slot of plan.slots) {
      if (existingKeys.has(`${date}:${slot.slot}`) || !slot.recommended) continue;
      const c = slot.recommended as MealCandidate & { foodId: string; recipeId: string };
      dayInsert.push({
        weekly_plan_id: week.id, user_id: userId, local_date: date, meal_slot: slot.slot,
        recommended_recipe_id: c.recipeId, recommended_food_id: c.foodId, recommended_label: c.name,
        recommended_grams: DEFAULT_PLANNED_GRAMS, recommendation_reason: slot.reasons[0] ?? null,
        planned_recipe_id: c.recipeId, planned_food_id: c.foodId, planned_label: c.name,
        planned_grams: DEFAULT_PLANNED_GRAMS, status: 'recommended',
      });
    }
    if (dayInsert.length === 0) continue;
    const { error } = await supabase.from('nutrition_planned_meals').insert(dayInsert);
    if (error) {
      // §7 — 23505 = unique_violation: a CONCURRENT retry (or an earlier,
      // not-yet-visible-to-this-read call) already inserted one or more of
      // this day's rows first. The UNIQUE(user_id, local_date, meal_slot)
      // constraint has already done its job (no duplicate can land); this
      // day is left to whichever caller actually won, and the NEXT
      // ensureWeekGenerated/resume pass (idempotent, re-reads existingKeys)
      // reconciles anything genuinely still missing. Never thrown as a
      // fatal error — a race here is expected and self-healing, not a bug.
      if ((error as any).code === '23505') continue;
      throw error;
    }
  }
}

// Pre-QA hardening §2/§3/§4 — the smallest deterministic resumability rule.
// A week can NEVER have more than 7 days × the 4 canonical slots = 28
// planned-meal rows; reaching that count is definitive proof generation is
// complete (every slot, every day, had SOME eligible recommendation), so
// the fast path skips re-ranking/re-fetching preferences entirely — no
// reranking, no recipe replacement, no adaptation/preference rerun (§4).
// Below 28, this does NOT assume failure — a slot can legitimately have no
// eligible candidate some day (§2) — it simply re-invokes the ALREADY
// idempotent generator, which fills real gaps and leaves both existing
// rows and legitimately-empty slots untouched either way.
const MAX_PLANNED_MEALS_PER_WEEK = 7 * CANONICAL_SLOTS.length;

async function ensureWeekGenerated(userId: string, week: NutritionWeekRow, weights?: RankingWeights): Promise<void> {
  const { count } = await supabase.from('nutrition_planned_meals')
    .select('id', { count: 'exact', head: true }).eq('weekly_plan_id', week.id);
  if ((count ?? 0) >= MAX_PLANNED_MEALS_PER_WEEK) return; // provably complete — genuinely a no-op
  await generateWeekPlannedMeals(userId, week, weights);
}

// ── Closing the loop: ACTUAL evidence → structured weekly evidence ───────
//
// §3/§6/§7/§8 — PLAN is intention, the FOOD LOG is evidence. This function
// is the ONLY place real food_log_entries/nutrition_day evidence and the
// planned-meal lifecycle are turned into weekly-nutrition-adaptation.ts's
// input shape. It never fabricates a signal:
//   - slot adherence counts ONLY explicit status='consumed' rows (§7) — the
//     one path with a real consumed_log_group_id link, set exclusively by
//     logPlannedMeal's own explicit "Log this" action. A slot the user ate
//     something else for is 'replaced' (§8), never silently counted.
//   - protein adherence only ever looks at days N2 itself reports
//     hasLogs=true (§6) — a day with nothing logged contributes NO
//     observation, never a 0g reading.
//   - the protein signal exists at all ONLY when resolveDailyMacroTargets
//     actually resolves a target (§5) — never fabricated for a user with no
//     target.
async function aggregateWeeklyEvidence(userId: string, week: NutritionWeekRow, plannedMeals: PlannedMealRow[]) {
  const [range, macroTargets] = await Promise.all([
    foodLogService.getNutritionRange(userId, 7, week.weekEndDate),
    nutritionReferenceService.resolveUserReferenceContext(userId).then(resolveDailyMacroTargets).catch(() => null),
  ]);
  // The actual §3-§8 evidence mapping is a pure function
  // (lib/nutrition/weekly-nutrition-adaptation.ts's buildWeeklyAdaptationInput)
  // — this is just the thin DB-fetching wrapper around it.
  const adaptationInput = buildWeeklyAdaptationInput(
    range.days.map(d => ({ hasLogs: d.hasLogs, proteinG: d.proteinG })),
    plannedMeals.map(m => ({ mealSlot: m.mealSlot, status: m.status })),
    macroTargets?.proteinTargetG ?? null,
  );
  return { observationDays: range.days.filter(d => d.hasLogs).length, adaptationInput };
}

/**
 * The user's current week — promoting a 'scheduled' week to 'current' (and
 * the prior 'current' to 'completed') the first time a request lands on or
 * after its week_start_date (mirrors fitness_plans' scheduled->active
 * promotion, §31/§33/§34). Creates week 1 of a cycle immediately if no week
 * exists yet. Generates the week's planned meals as part of creation/
 * promotion — never lazily per-day.
 */
async function getOrCreateCurrentWeek(userId: string, cycle: NutritionCycleRow, today: string): Promise<NutritionWeekRow> {
  const { data: currentRow } = await supabase.from('nutrition_weekly_plans')
    .select('*').eq('user_id', userId).eq('status', 'current').maybeSingle();
  const current = currentRow ? mapWeek(currentRow) : null;

  const { data: scheduledRow } = await supabase.from('nutrition_weekly_plans')
    .select('*').eq('user_id', userId).eq('status', 'scheduled').lte('week_start_date', today)
    .order('week_start_date', { ascending: true }).limit(1).maybeSingle();
  const dueToPromote = scheduledRow ? mapWeek(scheduledRow) : null;

  if (dueToPromote) {
    if (current) await supabase.from('nutrition_weekly_plans').update({ status: 'completed' }).eq('id', current.id);
    const { data: promoted } = await supabase.from('nutrition_weekly_plans')
      .update({ status: 'current' }).eq('id', dueToPromote.id).eq('status', 'scheduled').select('*').single();
    // Re-read to confirm the promotion actually landed (guards a concurrent
    // duplicate promotion the same way fitness_plans' scheduled->active
    // update-by-id-gated-on-status does) — if it didn't, fall through to
    // read whatever is now 'current'.
    if (promoted) {
      const week = mapWeek(promoted);
      // Pre-QA hardening §1-§4 — a scheduled week promoted to 'current' may
      // itself be the incomplete/zero-meal week the recovery scenario
      // describes (it was generated by a PRIOR prepareNextWeek call that
      // could have failed partway). Resume-only: never rebuilds strategy/
      // objective, just tops up any missing planned-meal rows.
      await ensureWeekGenerated(userId, week, weightsForTheme(week.objectiveTheme));
      return week;
    }
  }

  if (current && today >= current.weekStartDate && today <= current.weekEndDate) {
    // §4 — an already-complete week returns immediately with no reranking;
    // an incomplete one (failed generation earlier) resumes here instead of
    // being returned empty/partial forever.
    await ensureWeekGenerated(userId, current, weightsForTheme(current.objectiveTheme));
    return current;
  }
  if (current && today < current.weekStartDate) return current; // shouldn't happen (today never precedes the current week), but never silently replace it

  // No current week at all yet (first-ever call for this cycle) — create
  // and generate week 1 immediately, as 'current'. Week 1 has no PRIOR week
  // in this cycle to adapt from (§10 only applies week-to-week within a
  // cycle), so it always uses the monthly strategy's own default pick.
  const weekStart = mondayOnOrBefore(today);
  const weekEnd = addDays(weekStart, 6);
  const ctxForStrategy = await fetchWeeklyRankingContext(userId);
  const strategy = buildMonthlyStrategy({
    goal: cycle.goal,
    proteinTargetAvailable: ctxForStrategy.proteinTargetAvailable,
    hasTrainingDaysOnFile: ctxForStrategy.hasTrainingDaysOnFile,
  });
  const objective = objectiveForWeek(strategy, weekNumberInCycle(cycle, weekStart));
  const { data: created, error } = await supabase.from('nutrition_weekly_plans')
    .upsert({
      cycle_id: cycle.id, user_id: userId, week_start_date: weekStart, week_end_date: weekEnd,
      objective: objective.objective, objective_reason: objective.reason, objective_theme: objective.theme, status: 'current',
    }, { onConflict: 'user_id,week_start_date' })
    .select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create weekly plan');
  const week = mapWeek(created);
  await generateWeekPlannedMeals(userId, week, weightsForTheme(week.objectiveTheme));
  return week;
}

// ── Public API ───────────────────────────────────────────────────────────

export const nutritionPlanningService = {
  /** §40 — explicit "Prepare next plan" / first-ever-use entry point. */
  async startNewCycle(userId: string): Promise<NutritionCycleRow> {
    return startNewCycle(userId, localISODate(new Date()));
  },

  /** The active cycle + its current week (creating/promoting as needed) —
   *  the read path for both Today and the Monthly/Weekly plan screens. */
  async getCurrentPlan(userId: string): Promise<{ cycle: NutritionCycleRow; week: NutritionWeekRow } | null> {
    const today = localISODate(new Date());
    let cycle = await getCurrentCycle(userId, today);
    if (!cycle) return null; // §40 — never auto-start a new cycle from a read; the caller shows "plan complete"
    const week = await getOrCreateCurrentWeek(userId, cycle, today);
    return { cycle, week };
  },

  /** §51 — for a brand-new user with no cycle at all yet. Safe to call
   *  repeatedly (idempotent via startNewCycle's own upsert). */
  async ensureFirstCycle(userId: string): Promise<{ cycle: NutritionCycleRow; week: NutritionWeekRow }> {
    const today = localISODate(new Date());
    let cycle = await getCurrentCycle(userId, today);
    if (!cycle) cycle = await startNewCycle(userId, today);
    const week = await getOrCreateCurrentWeek(userId, cycle, today);
    return { cycle, week };
  },

  /**
   * §20/§31 — Sunday preview AND the main adaptation boundary: prepares
   * next week (scheduled, not current) without touching the current week.
   * Sequence: load active cycle/current
   * week (1-2) → aggregate ACTUAL evidence for the current week (3) →
   * resolve the protein target (4, already inside aggregateWeeklyEvidence)
   * → run the pure deterministic adaptation (5) → resolve next week's
   * objective from strategy + adaptation (6) → real preference history (7,
   * inside generateWeekPlannedMeals) → canonical recipe pool (8, inside
   * fetchWeeklyRankingContext) → deterministic generation (9) → persist
   * 'scheduled' (10) → the current week is never read-modified here (11).
   * Idempotent (§32/§33): a second call returns the already-scheduled week
   * untouched, never regenerates, never re-ranks.
   */
  async prepareNextWeek(userId: string): Promise<NutritionWeekRow | null> {
    const plan = await this.getCurrentPlan(userId);
    if (!plan) return null;
    const nextStart = addDays(plan.week.weekEndDate, 1);
    if (nextStart > plan.cycle.endDate) return null; // next week falls outside this cycle — a new cycle is a separate, explicit action (§40)

    // Idempotent via an explicit check-then-insert (never relies on upsert's
    // ignoreDuplicates+select semantics, which don't reliably hand back the
    // pre-existing row across PostgREST versions) — a second "prepare next
    // week" tap just returns the already-scheduled week untouched (§32/§33),
    // BEFORE any evidence aggregation/adaptation runs at all.
    const { data: existing } = await supabase.from('nutrition_weekly_plans')
      .select('*').eq('user_id', userId).eq('week_start_date', nextStart).maybeSingle();
    if (existing) {
      const week = mapWeek(existing);
      // Pre-QA hardening §1-§4 — the week row already exists, so strategy/
      // evidence-aggregation/adaptation/objective resolution MUST NOT run
      // again (the objective is already decided and must never change on
      // retry, §4/§10). The only thing that may have failed and needs
      // resuming is recipe generation itself — resume-only, count-gated.
      await ensureWeekGenerated(userId, week, weightsForTheme(week.objectiveTheme));
      return week;
    }

    const [ctxForStrategy, currentWeekMeals] = await Promise.all([
      fetchWeeklyRankingContext(userId),
      this.getWeekPlannedMeals(plan.week.id),
    ]);
    const strategy = buildMonthlyStrategy({
      goal: plan.cycle.goal,
      proteinTargetAvailable: ctxForStrategy.proteinTargetAvailable,
      hasTrainingDaysOnFile: ctxForStrategy.hasTrainingDaysOnFile,
    });

    // §3-§9 — ACTUAL evidence for the week that's ending, then the pure
    // deterministic KEEP/ADJUST/WATCH reasoner. A failure here is caught by
    // the caller-level try/catch (§21) — this function itself lets it
    // propagate rather than silently swallowing it, so the caller can
    // decide (and so it never gets mistaken for "insufficient evidence").
    const { adaptationInput } = await aggregateWeeklyEvidence(userId, plan.week, currentWeekMeals);
    const adaptationCalls = evaluateWeeklyAdaptation(adaptationInput);

    const objective = resolveNextWeekObjective(
      strategy, weekNumberInCycle(plan.cycle, nextStart), plan.week.objectiveTheme, adaptationCalls,
    );

    const { data: created, error } = await supabase.from('nutrition_weekly_plans')
      .insert({
        cycle_id: plan.cycle.id, user_id: userId, week_start_date: nextStart, week_end_date: addDays(nextStart, 6),
        objective: objective.objective, objective_reason: objective.reason, objective_theme: objective.theme, status: 'scheduled',
      })
      .select('*').single();
    if (error) {
      // 23505 = unique_violation — a concurrent duplicate tap lost the race;
      // the winner's row is what matters, never throw the loser into a
      // broken UI (§32 duplicate-tap protection).
      if ((error as any).code === '23505') {
        const { data: winner } = await supabase.from('nutrition_weekly_plans')
          .select('*').eq('user_id', userId).eq('week_start_date', nextStart).single();
        if (winner) return mapWeek(winner);
      }
      throw error;
    }
    if (!created) throw new Error('Failed to schedule next week');
    const week = mapWeek(created);
    // §21 — recipe generation failing leaves the 'scheduled' week row in
    // place (an empty week, not a partial/corrupt one) rather than ever
    // deleting it; the caller can retry generation against the same
    // idempotent row without duplicating it (§32).
    await generateWeekPlannedMeals(userId, week, weightsForTheme(week.objectiveTheme));
    return week;
  },

  /** Every planned meal for one week (Weekly Plan screen, §49). */
  async getWeekPlannedMeals(weeklyPlanId: string): Promise<PlannedMealRow[]> {
    const { data, error } = await supabase.from('nutrition_planned_meals')
      .select('*').eq('weekly_plan_id', weeklyPlanId).order('local_date').order('meal_slot');
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapPlannedMeal);
  },

  /** Today's planned meals only (Today screen execution surface, §22). */
  async getTodayPlannedMeals(userId: string, date: string): Promise<PlannedMealRow[]> {
    const { data, error } = await supabase.from('nutrition_planned_meals')
      .select('*').eq('user_id', userId).eq('local_date', date).order('meal_slot');
    if (error) throw error;
    return ((data ?? []) as any[]).map(mapPlannedMeal);
  },

  /** §29 — Swap: only planned_* changes; recommended_* stays historical. */
  async swapPlannedMeal(userId: string, plannedMeal: PlannedMealRow): Promise<void> {
    const [ctx, preferenceEvents] = await Promise.all([
      fetchWeeklyRankingContext(userId),
      fetchPreferenceEvents(userId, plannedMeal.localDate),
    ]);
    const preferenceScores = computeMealPreferenceScores(preferenceEvents, plannedMeal.localDate);
    const currentKey = plannedMeal.plannedFoodId ? mealCandidateKey('canonical_recipe', plannedMeal.plannedFoodId) : '';
    const replacement = swapSlotCandidate(
      {
        date: plannedMeal.localDate, slots: [...CANONICAL_SLOTS], candidatesBySlot: ctx.candidatesBySlot,
        goal: ctx.goal, cuisinePreferences: ctx.cuisinePreferences, requireVegetarian: ctx.requireVegetarian,
        proteinBudget: ctx.proteinBudget, consumedProteinSoFarG: 0, preferenceScores,
        varietySeed: `${userId}:${plannedMeal.localDate}`,
      },
      plannedMeal.mealSlot, currentKey, null, 1,
    ) as (MealCandidate & { foodId: string; recipeId: string }) | null;
    if (!replacement) return; // nothing else safe to offer — leave the current plan as-is (§28/§29)

    const { error } = await supabase.from('nutrition_planned_meals').update({
      planned_recipe_id: replacement.recipeId, planned_food_id: replacement.foodId,
      planned_label: replacement.name, planned_grams: DEFAULT_PLANNED_GRAMS, swapped: true, status: 'planned',
    }).eq('id', plannedMeal.id).in('status', ['recommended', 'planned']); // never rewrite an already-consumed/replaced/skipped slot
    if (error) throw error;
  },

  /**
   * §24/§57 — "View recipe → Add to today", but pre-filled from the plan.
   * Logs through the EXACT SAME foodLogService.logFood path as Food
   * Search/Recipe Detail/Suggested Meals — never a second nutrition
   * calculation, never a special meal-plan evidence table (§0/§23). The
   * caller may pass `actualGrams` different from the plan's own
   * planned_grams (§25 — plan stays 250g, evidence records what was
   * actually eaten); defaults to planned_grams when omitted.
   */
  async logPlannedMeal(userId: string, plannedMeal: PlannedMealRow, actualGrams?: number, now: Date = new Date()): Promise<{ ok: boolean }> {
    if (plannedMeal.status === 'consumed' || plannedMeal.status === 'replaced') return { ok: false }; // idempotent — a repeated tap never double-logs
    if (!plannedMeal.plannedFoodId) return { ok: false };
    const grams = actualGrams ?? plannedMeal.plannedGrams;
    const logGroupId = Crypto.randomUUID();
    await foodLogService.logFood(userId, {
      foodId: plannedMeal.plannedFoodId, displayName: plannedMeal.plannedLabel,
      quantity: grams, unit: 'g', mealSlot: plannedMeal.mealSlot, captureMethod: 'plan', logGroupId,
    }, now);
    const { error } = await supabase.from('nutrition_planned_meals').update({
      status: 'consumed', consumed_log_group_id: logGroupId, consumed_at: now.toISOString(),
    }).eq('id', plannedMeal.id);
    if (error) throw error;
    return { ok: true };
  },

  /** §14 — "Having something else?": the caller logs through the existing
   *  universal logging flow (search/saved meal/homemade/recipe — unchanged);
   *  this only marks the slot 'replaced' so recommended/planned ≠ consumed
   *  stays visible as real evidence, never silently overwritten. */
  async markPlannedMealReplaced(plannedMealId: string, consumedLogGroupId: string | null, now: Date = new Date()): Promise<void> {
    const { error } = await supabase.from('nutrition_planned_meals').update({
      status: 'replaced', consumed_log_group_id: consumedLogGroupId, consumed_at: now.toISOString(),
    }).eq('id', plannedMealId).in('status', ['recommended', 'planned']);
    if (error) throw error;
  },

  /** §28 — Skip: the user explicitly says this slot isn't happening today. */
  async skipPlannedMeal(plannedMealId: string): Promise<void> {
    const { error } = await supabase.from('nutrition_planned_meals').update({ status: 'skipped' })
      .eq('id', plannedMealId).in('status', ['recommended', 'planned']);
    if (error) throw error;
  },
};
