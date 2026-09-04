import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidAssessment, sortSupportOpportunities, type AIAssessment } from '@/lib/ai-assessment';
import { matchProfessionalProviders, type ProviderMatch } from '@/lib/professional-support';
import { selectDailyMeals } from '@/lib/nutrition-matching';
import { getMealCandidates } from '@/lib/meal-ranking';
import { localISODate } from '@/lib/fulfilment';
import { foodLogService } from '@/services/food-log-service';
import type { FoodLogEntry, DailyNutritionSummary } from '@/lib/nutrition/food-types';
import { summariseDay, type DayNutrition } from '@/lib/nutrition/nutrition-history';
import { buildNutritionPatterns, type NutritionPatternEvidence } from '@/lib/nutrition/nutrition-patterns';
import { KEY_NUTRIENTS } from '@/lib/nutrition/nutrient-display';
import { NutrientList } from '@/components/nutrition/nutrient-list';
import { ObservedPanel, DayEnergyStrip } from '@/components/nutrition/nutrition-observed';
// "Your nutrition references" section hidden per product decision (2026-09-04) — see render site below.
// import { NutritionReferenceSection } from '@/components/nutrition/nutrition-references';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { buildNutritionReferenceComparisons, type UserReferenceContext, type NutritionReferenceComparison } from '@/lib/nutrition/nutrition-reference-engine';
import { NutritionCoachingSection } from '@/components/nutrition/nutrition-coaching-section';
import { getNutritionCoaching } from '@/lib/nutrition/nutrition-coaching';
import type { CoachingValidationResult } from '@/lib/nutrition/nutrition-coaching-safety';
import { isNutritionSavedMealsEnabled } from '@/lib/flags';
import { prefillFromEntries } from '@/lib/nutrition/saved-meal';
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
  prep_time_minutes: number | null;
}

const SLOT_ORDER: TodayMealItem['slot'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', smoothie: 'Smoothie',
};

const GRID_GAP = 14;

// Nutrition N2 — factual logged total for one macro. NOT "X / Y": ACP has no
// validated personalised nutrition target engine (N2 §6), so nothing is shown
// as a goal/denominator.
function MacroStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View style={s.macroCol}>
      <ThemedText style={s.macroValue}>{Math.round(value)}<ThemedText style={s.macroUnit}> {unit}</ThemedText></ThemedText>
      <ThemedText style={s.macroLabel}>{label}</ThemedText>
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
  const [foodTotals, setFoodTotals] = useState<DailyNutritionSummary | null>(null);
  // Nutrition N2 — today's per-nutrient completeness + recent-day evidence.
  const [todayDay, setTodayDay] = useState<DayNutrition | null>(null);
  const [recentDays, setRecentDays] = useState<DayNutrition[]>([]);
  const [patterns, setPatterns] = useState<NutritionPatternEvidence | null>(null);
  const [showAllNutrients, setShowAllNutrients] = useState(false);
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
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMatches, setSupportMatches] = useState<ProviderMatch[] | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (active) { setUserId(null); setItems([]); setAssessment(null); setLoading(false); }
        return;
      }
      if (active) setUserId(session.user.id);

      // "Want extra support?" — same gating as My Plan: only shown when ACP
      // Intelligence's current assessment actually names a nutrition support
      // opportunity, never a generic always-on ad, and never coupled to
      // whether today's meals loaded successfully.
      const { data: profileData } = await supabase
        .from('fitness_profile')
        .select('ai_assessment, goal, cuisine_preferences')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const validAssessment = profileData?.ai_assessment && isValidAssessment(profileData.ai_assessment)
        ? profileData.ai_assessment
        : null;
      if (active) setAssessment(validAssessment);
      const goal = profileData?.goal ?? null;
      const cuisinePreferences = profileData?.cuisine_preferences ?? [];

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
          .select('id, meal_slot, sort_order, meals(id, name, image_url, calories, protein_g, carbs_g, fat_g, prep_time_minutes)')
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
            prep_time_minutes: i.meals.prep_time_minutes,
          }));
      }

      const todayStr = new Date().toISOString().slice(0, 10);

      // Nutrition N1 — the user's actual food log for today (local date).
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

        const { data: logsData } = await supabase
          .from('meal_logs')
          .select('meal_plan_item_id, status')
          .eq('user_id', session.user.id)
          .eq('log_date', todayStr)
          .in('meal_plan_item_id', planItems.map(i => i.id));
        if (active) setLoggedIds(new Set((logsData ?? []).filter(l => l.status === 'eaten').map(l => l.meal_plan_item_id)));
      } else {
        // No active plan — suggest one meal per category. Ranking (which
        // candidates are actually good picks) is deterministic goal/cuisine
        // fit via getMealCandidates (Day 7.2 — never a hard filter, so
        // international meals are always eligible, just ranked); which
        // equally-good candidate is shown today is a stable per-day pick via
        // selectDailyMeals (same user + date + pool always resolves the same
        // way — never Math.random()), applied only among the top-ranked ties
        // so a stronger candidate can never lose to a weaker one.
        const categories = ['breakfast', 'lunch', 'dinner'] as const;
        const categoryResults = await Promise.all(
          categories.map(category =>
            supabase.from('meals')
              .select('id, name, image_url, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes, category, cuisine, tags')
              .eq('is_active', true)
              .eq('category', category)
              .limit(20),
          ),
        );
        interface SuggestedMealRow {
          id: string; name: string; image_url: string | null; category: string;
          calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
          fibre_g: number | null; prep_time_minutes: number | null; cuisine: string; tags: string[] | null;
        }
        const mealsBySlot = categories.map((category, i) => {
          const rows = (categoryResults[i].data ?? []) as SuggestedMealRow[];
          const candidates = getMealCandidates({
            meals: rows.map(r => ({
              id: r.id, name: r.name, category: r.category, cuisine: r.cuisine, tags: r.tags ?? [],
              calories: r.calories ?? 0, protein_g: r.protein_g ?? 0, carbs_g: r.carbs_g ?? 0,
              fat_g: r.fat_g ?? 0, fibre_g: r.fibre_g, is_active: true,
            })),
            goal, cuisinePreferences,
          });
          const topScore = candidates[0]?.scoring.overall;
          const tiedTopIds = new Set(candidates.filter(c => c.scoring.overall === topScore).map(c => c.mealId));
          return { category, foods: rows.filter(r => tiedTopIds.has(r.id)) };
        });
        const dailySelections = selectDailyMeals(session.user.id, todayStr, mealsBySlot);
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
          prep_time_minutes: meal.prep_time_minutes,
        }));
        if (!active) return;
        setItems(suggested);
        setIsSuggested(true);
        setLoggedIds(new Set());
      }

      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  const toggleMeal = async (item: TodayMealItem) => {
    if (togglingId) return;
    if (isSuggested || !userId) {
      setLoggedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      });
      return;
    }
    setTogglingId(item.id);
    const todayStr = new Date().toISOString().slice(0, 10);
    const isEaten = loggedIds.has(item.id);
    if (isEaten) {
      setLoggedIds(prev => { const next = new Set(prev); next.delete(item.id); return next; });
      await supabase.from('meal_logs').delete()
        .eq('user_id', userId).eq('meal_plan_item_id', item.id).eq('log_date', todayStr);
    } else {
      setLoggedIds(prev => new Set(prev).add(item.id));
      await supabase.from('meal_logs').upsert(
        { user_id: userId, meal_plan_item_id: item.id, log_date: todayStr, status: 'eaten' },
        { onConflict: 'user_id,meal_plan_item_id,log_date' },
      );
    }
    setTogglingId(null);
  };

  // Same behaviour as My Plan's "Explore support" — professional matching is
  // only fetched after an explicit tap, never preloaded.
  const handleExploreSupport = async () => {
    setSupportExpanded(true);
    if (supportMatches !== null || supportLoading) return;
    setSupportLoading(true);
    try {
      const { data } = await supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, specialisations, photo_url')
        .eq('status', 'approved');
      const providers = ((data ?? []) as any[]).map(p => ({
        id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [], photoUrl: p.photo_url ?? null,
      }));
      setSupportMatches(matchProfessionalProviders(null, [], true, providers));
    } catch {
      setSupportMatches([]); // fails safe — today's meals are unaffected
    } finally {
      setSupportLoading(false);
    }
  };

  // "Planned" = the sum of today's plan/suggested meals. Nutrition N0 found
  // this was mislabelled "goal" — it is NOT a nutrition target (no TDEE/macro
  // engine exists). It stays a reference only.
  const planned = items.reduce((acc, i) => ({
    calories: acc.calories + i.calories,
    protein: acc.protein + i.protein_g,
    carbs: acc.carbs + i.carbs_g,
    fat: acc.fat + i.fat_g,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // "Logged" = what the user actually ate, from food_log_entries only
  // (Nutrition N1). Never derived from the eaten/skipped toggle.
  const logged = {
    calories: foodTotals?.energyKcal ?? 0,
    protein: foodTotals?.proteinG ?? 0,
    carbs: foodTotals?.carbohydrateG ?? 0,
    fat: foodTotals?.fatG ?? 0,
  };

  const foodLogBySlot: { slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'; entries: FoodLogEntry[] }[] = [
    ...(['breakfast', 'lunch', 'dinner', 'snack'] as const)
      .map(slot => ({ slot, entries: foodLog.filter(e => e.mealSlot === slot) })),
    { slot: 'other' as const, entries: foodLog.filter(e => !e.mealSlot) },
  ].filter(g => g.entries.length > 0);

  const deleteEntry = async (id: string) => {
    setFoodLog(prev => prev.filter(e => e.id !== id));
    try {
      await foodLogService.deleteFoodLog(id);
    } finally {
      if (userId) {
        // Refetch today AND the recent window so no derived aggregate (totals,
        // completeness, strip, observations) is left stale (N2 §21).
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
            // N4 — recompute deterministic coaching from the new evidence so a
            // deleted entry never leaves a stale card (§21). Deterministic
            // only here (no LLM re-call on a delete); the next focus refresh
            // will re-fetch the rephrase.
            getNutritionCoaching(null, comparisons, range.entries)
              .then(res => setCoaching(res.validated))
              .catch(() => { /* keep prior cards */ });
          }
        }
      }
    }
  };
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const orderedItems = SLOT_ORDER.flatMap(slot => items.filter(i => i.slot === slot));

  const supportOpportunities = sortSupportOpportunities(assessment?.support_opportunities ?? []);
  const nutritionSupport = supportOpportunities.find(o => o.type === 'nutrition');
  const showSupportCard = !!assessment && !!nutritionSupport;

  return (
    <View style={s.root}>
      {loading ? (
        <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 100 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[palette.blue100, palette.white]} style={s.header}>
            <SafeAreaView edges={['top']}>
              <View style={s.headerRow}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
                  <Ionicons name="arrow-back" size={20} color={palette.ink900} />
                </TouchableOpacity>
                <ThemedText style={s.headerTitle}>Today, {todayLabel}</ThemedText>
                <View style={{ width: 36 }} />
              </View>

              {/* Nutrition N2 — the canonical answer to "what have I eaten today?".
                  Factual logged totals only; no target/goal denominator (§5/§6). */}
              <ThemedText style={s.heroEyebrow}>Logged today</ThemedText>
              <ThemedText style={s.heroValue}>
                {Math.round(logged.calories)}<ThemedText style={s.heroUnit}> kcal</ThemedText>
              </ThemedText>

              <View style={s.macroRow}>
                <MacroStat label="Protein" value={logged.protein} unit="g" />
                <MacroStat label="Carbs" value={logged.carbs} unit="g" />
                <MacroStat label="Fat" value={logged.fat} unit="g" />
                <MacroStat label="Fibre" value={foodTotals?.fibreG ?? 0} unit="g" />
              </View>
              {foodLog.length === 0 && (
                <ThemedText style={s.heroEmpty}>Nothing logged yet today.</ThemedText>
              )}
            </SafeAreaView>
          </LinearGradient>

          <View style={s.content}>
            {/* Nutrition N1 — the actual food log. Separate from the planned
                meals below; this is the record of what was really eaten. */}
            <TouchableOpacity
              style={s.logFoodCta}
              onPress={() => router.push('/log-food' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={20} color={palette.success700} />
              <ThemedText style={s.logFoodCtaText}>Log food</ThemedText>
              <ThemedText style={s.logFoodCtaSub}>What did you eat?</ThemedText>
            </TouchableOpacity>

            {foodLog.length > 0 && (
              <View style={s.loggedWrap}>
                <ThemedText style={s.sourceNote}>Logged today</ThemedText>
                {foodLogBySlot.map(({ slot, entries }) => (
                  <View key={slot} style={{ marginBottom: 6 }}>
                    <ThemedText style={s.loggedSlotLabel}>
                      {slot === 'other' ? 'Other' : SLOT_LABEL[slot]}
                    </ThemedText>
                    {entries.map(e => (
                      <View key={e.id} style={s.loggedRow}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={s.loggedName} numberOfLines={1}>{e.displayName}</ThemedText>
                          <ThemedText style={s.loggedMeta}>
                            {e.unit === 'serving' ? (e.servingLabel ?? `${e.quantity} serving`) : `${e.quantity} ${e.unit}`}
                            {e.nutrients.energyKcal != null ? ` · ${Math.round(e.nutrients.energyKcal)} kcal` : ''}
                          </ThemedText>
                        </View>
                        <TouchableOpacity onPress={() => deleteEntry(e.id)} hitSlop={10}>
                          <Ionicons name="trash-outline" size={16} color={palette.gray300} />
                        </TouchableOpacity>
                      </View>
                    ))}
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
                  </View>
                ))}
              </View>
            )}

            {/* Nutrition N2 — nutrients for what was logged today, with data
                completeness. Progressive disclosure (§16); quiet by default. */}
            {todayDay && todayDay.hasLogs && (
              <View style={s.section}>
                <ThemedText style={s.sectionTitle}>Nutrients</ThemedText>
                <NutrientList
                  keys={showAllNutrients ? [...KEY_NUTRIENTS] : KEY_NUTRIENTS.slice(0, 6)}
                  micros={todayDay.micros}
                  completeness={todayDay.completeness}
                />
                <TouchableOpacity onPress={() => setShowAllNutrients(v => !v)} style={{ paddingVertical: 8 }}>
                  <ThemedText style={s.link}>
                    {showAllNutrients ? 'Show fewer' : 'View more nutrients'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
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
                <DayEnergyStrip days={recentDays} />
              </View>
            )}

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

            {items.length === 0 ? (
              <ThemedText style={s.emptyText}>No planned meals for today.</ThemedText>
            ) : (
              <>
                <ThemedText style={s.sourceNote}>
                  {isSuggested ? 'Suggested meals (not a log — tap ✓ if you followed one)' : 'From your meal plan'}
                  {planned.calories > 0 ? `  ·  planned ≈ ${Math.round(planned.calories)} kcal (reference, not a target)` : ''}
                </ThemedText>
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
                          <ThemedText style={s.mealMeta}>
                            {item.calories} kcal{item.prep_time_minutes ? ` · ${item.prep_time_minutes} min` : ''}
                          </ThemedText>
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

            {showSupportCard && (
              <View style={s.card}>
                <ThemedText style={s.cardEyebrow}>Want extra support?</ThemedText>
                <View style={{ marginBottom: 10 }}>
                  <ThemedText style={s.rowValue}>Nutrition support</ThemedText>
                  <ThemedText style={s.aiBody}>{nutritionSupport?.reason}</ThemedText>
                </View>

                {!supportExpanded ? (
                  <TouchableOpacity style={s.exploreSupportBtn} onPress={handleExploreSupport} activeOpacity={0.85}>
                    <ThemedText style={s.exploreSupportBtnText}>Explore support →</ThemedText>
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
                  <ThemedText style={[s.aiBody, { marginTop: 8 }]}>
                    No matching professionals were found right now.
                  </ThemedText>
                )}
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

  content: { paddingHorizontal: 20, paddingTop: 24 },
  emptyText: { fontSize: 13, color: palette.gray300, textAlign: 'center', marginTop: 40 },
  sourceNote: { fontSize: 12, color: palette.gray300, marginBottom: 16 },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 12.5, fontWeight: '700', color: palette.blue600 },

  // Nutrition N1 — food log
  logFoodCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.success50, borderRadius: radii.xl,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 18,
  },
  logFoodCtaText: { fontSize: 15, fontWeight: '800', color: palette.success700 },
  logFoodCtaSub: { fontSize: 12.5, color: palette.gray450, marginLeft: 'auto' },
  loggedWrap: { marginBottom: 22 },
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
  rowValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
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
