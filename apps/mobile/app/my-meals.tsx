import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isNutritionSavedMealsEnabled } from '@/lib/flags';
import { savedMealService } from '@/services/saved-meal-service';
import { computeSavedMealPreview, type SavedMeal } from '@/lib/nutrition/saved-meal';

// Nutrition N6 — "My meals". A saved meal is a reusable RECIPE of canonical
// foods + portions. The kcal shown here is a DETERMINISTIC preview recomputed
// from the components every time (§7/§39), never a stored total.

function previewKcal(meal: SavedMeal): { kcal: number; complete: boolean } {
  const p = computeSavedMealPreview(meal.components.map(c => ({
    key: c.id, food: c.food, quantity: String(c.quantity), unit: c.unit, servingLabel: c.servingLabel,
  })));
  return { kcal: Math.round(p.energyKcal), complete: p.complete && p.completeness.energyKcal.level === 'complete' };
}

export default function MyMealsScreen() {
  const router = useRouter();
  const [meals, setMeals] = useState<SavedMeal[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!isNutritionSavedMealsEnabled()) { router.replace('/log-food'); return; }
    let active = true;
    setError(false);
    savedMealService.list()
      .then(m => { if (active) setMeals(m); })
      .catch(() => { if (active) { setMeals([]); setError(true); } });
    return () => { active = false; };
  }, [router]));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>My meals</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {meals == null ? (
          <View style={s.centre}><ActivityIndicator size="large" color={palette.blue500} /></View>
        ) : (
          <ScrollView contentContainerStyle={s.pad}>
            {error && (
              <ThemedText style={s.errorText}>Couldn’t load your meals. Pull back and try again.</ThemedText>
            )}

            {meals.length === 0 && !error && (
              <View style={s.emptyWrap}>
                <Ionicons name="albums-outline" size={30} color={palette.gray300} />
                <ThemedText style={s.emptyTitle}>No saved meals yet</ThemedText>
                <ThemedText style={s.emptyBody}>
                  Save combinations you eat regularly so they’re quicker to log next time.
                </ThemedText>
              </View>
            )}

            {meals.map(meal => {
              const { kcal, complete } = previewKcal(meal);
              return (
                <TouchableOpacity
                  key={meal.id}
                  style={s.mealRow}
                  activeOpacity={0.75}
                  onPress={() => router.push({ pathname: '/saved-meal-log', params: { id: meal.id } })}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.mealName}>{meal.name}</ThemedText>
                    <ThemedText style={s.mealMeta}>
                      {meal.components.length} food{meal.components.length === 1 ? '' : 's'}
                      {meal.components.length > 0 ? ` · ${complete ? '~' : '≥ ~'}${kcal} kcal` : ''}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    hitSlop={10}
                    onPress={() => router.push({ pathname: '/saved-meal-edit', params: { id: meal.id } })}
                  >
                    <Ionicons name="create-outline" size={18} color={palette.gray450} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={s.createBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/saved-meal-edit')}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <ThemedText style={s.createBtnText}>Create meal</ThemedText>
            </TouchableOpacity>

            <ThemedText style={s.footnote}>
              Logging a saved meal creates the same per-food records as logging each food by hand — the
              calories above are just a preview from the components.
            </ThemedText>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },

  errorText: { fontSize: 13, color: palette.danger500, marginBottom: 14 },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: palette.ink900, marginTop: 4 },
  emptyBody: { fontSize: 13, color: palette.gray450, textAlign: 'center', lineHeight: 19, paddingHorizontal: 24 },

  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  mealName: { fontSize: 15.5, fontWeight: '800', color: palette.ink900 },
  mealMeta: { fontSize: 12.5, color: palette.gray450, marginTop: 3 },

  createBtn: {
    marginTop: 22, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  createBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  footnote: { fontSize: 11.5, color: palette.gray450, lineHeight: 17, marginTop: 18 },
});
