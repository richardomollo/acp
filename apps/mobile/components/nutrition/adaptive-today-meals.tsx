// Beta Feedback #022 — adaptive Today's Meals. Upgrades the existing
// "no active meal plan → suggested meals" branch of Today Nutrition (the
// nutritionist-assigned meal_plans path is completely untouched, on or off).
//
// Keeps the UI lightweight (spec §17): one card per occasion, each with
// Log this / Swap / Portion, plus a single "Having something else?" escape
// hatch that routes into the EXISTING universal log-food flow — never a
// second logging system.
import { useState, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';
import type { FoodLogEntry, MealSlot } from '@/lib/nutrition/food-types';
import { PORTION_MULTIPLIERS, DEFAULT_PORTION_MULTIPLIER } from '@/lib/nutrition/nutrition-meal-model';
import {
  nutritionRecommendationService, NUTRITION_PLAN_SLOTS,
  type TodayNutritionPlanResult, type TodayNutritionPlanSlot,
} from '@/services/nutrition-recommendation-service';

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export function AdaptiveTodayMeals({ userId, date, todayFoodLog }: { userId: string; date: string; todayFoodLog: FoodLogEntry[] }) {
  const router = useRouter();
  const [plan, setPlan] = useState<TodayNutritionPlanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<MealSlot | null>(null);
  const [portionPickerSlot, setPortionPickerSlot] = useState<MealSlot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await nutritionRecommendationService.getTodayPlan(userId, date);
      // §14 reconciliation — a slot still 'recommended'/'planned' whose
      // occasion already has a real food_log_entries row (logged via
      // "Having something else?", not through Log this) is marked
      // 'replaced': recommended ≠ consumed is preserved, never silently
      // overwritten, and never a second log is created here.
      const unresolvedWithRealLog = result.slots.filter(s =>
        (s.status === 'recommended' || s.status === 'planned') &&
        todayFoodLog.some(e => e.mealSlot === s.slot),
      );
      if (unresolvedWithRealLog.length > 0) {
        await Promise.all(unresolvedWithRealLog.map(s => {
          const match = todayFoodLog.find(e => e.mealSlot === s.slot);
          return nutritionRecommendationService.markReplaced(userId, date, s.slot, match?.logGroupId ?? match?.id ?? null);
        }));
        setPlan(await nutritionRecommendationService.getTodayPlan(userId, date));
      } else {
        setPlan(result);
      }
    } catch {
      setPlan(null); // fails safe — "Having something else?" still works from the fallback UI below
    } finally {
      setLoading(false);
    }
  }, [userId, date, todayFoodLog]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLogThis = async (slot: MealSlot) => {
    if (busySlot) return; // §13 — prevent duplicate logging from repeated taps
    setBusySlot(slot);
    try {
      await nutritionRecommendationService.logPlanned(userId, date, slot);
      await load();
    } finally {
      setBusySlot(null);
    }
  };

  const handleSwap = async (slot: MealSlot) => {
    if (busySlot) return;
    setBusySlot(slot);
    try {
      await nutritionRecommendationService.swap(userId, date, slot);
      await load();
    } finally {
      setBusySlot(null);
    }
  };

  const handlePortion = async (slot: MealSlot, multiplier: number) => {
    setPortionPickerSlot(null);
    await nutritionRecommendationService.setPortion(userId, date, slot, multiplier);
    await load();
  };

  if (loading && !plan) {
    return <View style={s.centre}><ActivityIndicator color={palette.blue500} /></View>;
  }

  const slots: TodayNutritionPlanSlot[] = plan?.slots ?? NUTRITION_PLAN_SLOTS.map(slot => ({
    slot, eventId: null, status: 'recommended', planned: null, portionMultiplier: 1, reasons: [], alternates: [], swapped: false,
  }));

  return (
    <View>
      {plan?.proteinRemainingG != null && (
        <ThemedText style={s.context}>
          About {Math.max(0, Math.round(plan.proteinRemainingG))}g protein remaining today.
        </ThemedText>
      )}

      {slots.map(slotPlan => {
        const { slot, planned, status, reasons, portionMultiplier } = slotPlan;
        const resolved = status === 'consumed' || status === 'replaced';
        return (
          <View key={slot} style={s.card}>
            <ThemedText style={s.slotLabel}>{SLOT_LABEL[slot]}</ThemedText>
            {planned ? (
              <>
                <ThemedText style={s.mealName}>{planned.name}</ThemedText>
                <ThemedText style={s.mealMeta}>
                  {planned.macros.calories != null ? `${Math.round(planned.macros.calories)} kcal` : ''}
                  {planned.macros.proteinG != null ? ` · ${Math.round(planned.macros.proteinG)}g protein` : ''}
                  {portionMultiplier !== 1 ? ` · ${portionMultiplier}×` : ''}
                </ThemedText>
                {reasons.length > 0 && !resolved && (
                  <ThemedText style={s.reason}>{reasons[0]}</ThemedText>
                )}
                {resolved ? (
                  <ThemedText style={s.doneTag}>{status === 'consumed' ? '✓ Logged' : '✓ Logged something else'}</ThemedText>
                ) : (
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={s.actionBtn} activeOpacity={0.8}
                      onPress={() => handleLogThis(slot)}
                      disabled={busySlot === slot}
                    >
                      {busySlot === slot ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={s.actionBtnText}>Log this</ThemedText>}
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtnGhost} activeOpacity={0.8} onPress={() => handleSwap(slot)} disabled={busySlot === slot}>
                      <ThemedText style={s.actionBtnGhostText}>Swap</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtnGhost} activeOpacity={0.8} onPress={() => setPortionPickerSlot(portionPickerSlot === slot ? null : slot)}>
                      <ThemedText style={s.actionBtnGhostText}>Portion</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
                {portionPickerSlot === slot && (
                  <View style={s.portionRow}>
                    {PORTION_MULTIPLIERS.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[s.portionChip, m === portionMultiplier && s.portionChipActive]}
                        onPress={() => handlePortion(slot, m)}
                      >
                        <ThemedText style={[s.portionChipText, m === portionMultiplier && s.portionChipTextActive]}>{m}×</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <ThemedText style={s.mealMeta}>Nothing suggested for this meal yet.</ThemedText>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={s.somethingElseRow}
        activeOpacity={0.7}
        onPress={() => router.push('/log-food' as any)}
      >
        <ThemedText style={s.somethingElseText}>Having something else? Log a meal →</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  centre: { paddingVertical: 24, alignItems: 'center' },
  context: { fontSize: fontSize.sm, color: palette.gray450, marginBottom: 12 },
  card: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    padding: 14, marginBottom: 10,
  },
  slotLabel: { fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  mealName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  mealMeta: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },
  reason: { fontSize: fontSize.xs, color: palette.blue600, marginTop: 4 },
  doneTag: { fontSize: fontSize.sm, fontWeight: '700', color: palette.success700, marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, backgroundColor: palette.ink900, borderRadius: radii.md, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  actionBtnGhost: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1, borderColor: palette.hairline },
  actionBtnGhostText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  portionRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  portionChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.md, borderWidth: 1, borderColor: palette.hairline },
  portionChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  portionChipText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  portionChipTextActive: { color: '#fff' },
  somethingElseRow: { paddingVertical: 12, alignItems: 'center' },
  somethingElseText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue600 },
});
