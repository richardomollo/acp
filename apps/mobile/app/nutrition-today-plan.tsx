// Lana Nutrition — Monthly → Weekly → Daily Planning V1. Today's plan
// screen: every planned meal for today in one place (whichever of the 4
// canonical slots — breakfast/lunch/dinner/snack — have a recommendation),
// each loggable inline via the SAME nutritionPlanningService.logPlannedMeal
// path Today's page itself uses. Read + the one already-idempotent
// generation call only — never a new recommendation/ranking (§23).
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { localISODate } from '@/lib/fulfilment';
import { nutritionPlanningService, type NutritionWeekRow, type PlannedMealRow } from '@/services/nutrition-planning-service';

const CANONICAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export default function NutritionTodayPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [week, setWeek] = useState<NutritionWeekRow | null>(null);
  const [meals, setMeals] = useState<PlannedMealRow[]>([]);
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (!uid) { setWeek(null); setMeals([]); return; }
      const plan = await nutritionPlanningService.ensureFirstCycle(uid);
      setWeek(plan.week);
      const rows = await nutritionPlanningService.getTodayPlannedMeals(uid, localISODate(new Date()));
      setMeals(rows);
    } catch {
      setWeek(null);
      setMeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logMeal = async (m: PlannedMealRow) => {
    if (!userId || loggingId) return;
    setLoggingId(m.id);
    try {
      await nutritionPlanningService.logPlannedMeal(userId, m);
      await load();
    } finally {
      setLoggingId(null);
    }
  };

  const mealsBySlot = new Map(meals.map(m => [m.mealSlot, m]));

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.title}>Today&apos;s plan</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.blue500} /></View>
      ) : !week || meals.length === 0 ? (
        <View style={s.center}>
          <ThemedText style={s.emptyText}>No meals planned for today.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <ThemedText style={s.objective}>{week.objective}</ThemedText>

          {CANONICAL_SLOTS.map(slot => {
            const m = mealsBySlot.get(slot);
            if (!m) return null;
            const isConsumed = m.status === 'consumed' || m.status === 'replaced';
            return (
              <View key={slot} style={s.mealCard}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.mealSlotLabel}>{SLOT_LABEL[slot]}</ThemedText>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/recipe-detail', params: { foodId: m.plannedFoodId, slot: m.mealSlot } } as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`View recipe for ${m.plannedLabel}`}
                  >
                    <ThemedText style={s.mealName}>{m.plannedLabel}</ThemedText>
                    <ThemedText style={s.mealGrams}>{m.plannedGrams}g</ThemedText>
                  </TouchableOpacity>
                </View>
                {isConsumed ? (
                  <Ionicons name="checkmark-circle" size={22} color={palette.success700 ?? '#15803d'} />
                ) : (
                  <TouchableOpacity
                    style={s.logBtn}
                    onPress={() => logMeal(m)}
                    disabled={loggingId === m.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${m.plannedLabel} as eaten`}
                  >
                    {loggingId === m.id
                      ? <ActivityIndicator size="small" color={palette.white} />
                      : <ThemedText style={s.logBtnText}>Log this</ThemedText>}
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 48 },
  objective: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 18 },
  mealCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline, padding: 14, marginBottom: 12,
  },
  mealSlotLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  mealName: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  mealGrams: { fontSize: 12.5, color: palette.gray450, marginTop: 2 },
  logBtn: { backgroundColor: palette.ink900, borderRadius: radii.lg, paddingHorizontal: 14, paddingVertical: 9 },
  logBtnText: { fontSize: 12.5, fontWeight: '700', color: palette.white },
});
