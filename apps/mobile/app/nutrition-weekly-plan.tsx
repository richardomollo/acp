// Lana Nutrition — Monthly → Weekly → Daily Planning V1. The weekly plan
// screen (§49): highly scannable, one row per day, no inline recipe
// details — tap a recipe to open the ONE canonical Recipe Detail screen.
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { nutritionPlanningService, type NutritionWeekRow, type PlannedMealRow } from '@/services/nutrition-planning-service';

const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const DAY_LABEL = (dateIso: string) => new Date(dateIso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

export default function NutritionWeeklyPlanScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<NutritionWeekRow | null>(null);
  const [meals, setMeals] = useState<PlannedMealRow[]>([]);
  const [preparing, setPreparing] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const session = await authService.getSession();
        if (!session?.user.id) { if (active) { setWeek(null); setMeals([]); } return; }
        const plan = await nutritionPlanningService.getCurrentPlan(session.user.id);
        if (!active) return;
        if (!plan) { setWeek(null); setMeals([]); return; }
        setWeek(plan.week);
        const rows = await nutritionPlanningService.getWeekPlannedMeals(plan.week.id);
        if (active) setMeals(rows);
      } catch {
        if (active) { setWeek(null); setMeals([]); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const prepareNext = async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      const session = await authService.getSession();
      if (session?.user.id) await nutritionPlanningService.prepareNextWeek(session.user.id);
    } finally {
      setPreparing(false);
    }
  };

  const days = week ? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week.weekStartDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  }) : [];

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.title}>This week</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.blue500} /></View>
      ) : !week ? (
        <View style={s.center}>
          <ThemedText style={s.emptyText}>No weekly plan yet.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <ThemedText style={s.objective}>{week.objective}</ThemedText>

          {days.map(date => {
            const dayMeals = meals.filter(m => m.localDate === date);
            return (
              <View key={date} style={s.dayRow}>
                <ThemedText style={s.dayLabel}>{DAY_LABEL(date)}</ThemedText>
                <View style={{ flex: 1 }}>
                  {dayMeals.length === 0 ? (
                    <ThemedText style={s.mealMuted}>Nothing planned</ThemedText>
                  ) : dayMeals.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => router.push({ pathname: '/recipe-detail', params: { foodId: m.plannedFoodId, slot: m.mealSlot } } as any)}
                      style={s.mealLine}
                      accessibilityRole="button"
                      accessibilityLabel={`${SLOT_LABEL[m.mealSlot]}: ${m.plannedLabel}`}
                    >
                      <ThemedText style={s.mealSlot}>{SLOT_LABEL[m.mealSlot]}</ThemedText>
                      <ThemedText style={s.mealName} numberOfLines={1}>{m.plannedLabel}</ThemedText>
                      {m.status === 'consumed' && <Ionicons name="checkmark-circle" size={14} color={palette.success700 ?? '#15803d'} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}

          <TouchableOpacity onPress={prepareNext} disabled={preparing} style={s.prepareLink} accessibilityRole="button" accessibilityLabel="Prepare next week">
            {preparing ? <ActivityIndicator size="small" color={palette.ink900} /> : <ThemedText style={s.prepareLinkText}>Prepare next week →</ThemedText>}
          </TouchableOpacity>
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
  dayRow: { flexDirection: 'row', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  dayLabel: { width: 40, fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2 },
  mealLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  mealSlot: { fontSize: 11, color: palette.gray450, width: 60 },
  mealName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: palette.ink900 },
  mealMuted: { fontSize: 13, color: palette.gray300, paddingVertical: 3 },
  prepareLink: { paddingVertical: 16, alignItems: 'center' },
  prepareLinkText: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },
});
