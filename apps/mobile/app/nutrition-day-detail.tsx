// ACP Intelligence™ — Nutrition N2. A single past (or current) day's logged
// food (§9). Foods grouped by meal slot, with portions, per-item energy and
// the day's deterministic totals + nutrient completeness.
//
// Everything here comes from that day's FROZEN nutrient snapshots — it is
// never recomputed from today's canonical food values.

import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import type { FoodLogEntry, MealSlot } from '@/lib/nutrition/food-types';
import { summariseDay, type DayNutrition } from '@/lib/nutrition/nutrition-history';
import { KEY_NUTRIENTS, MACRO_DISPLAY_ORDER, NUTRIENT_LABEL, NUTRIENT_UNIT, formatNutrientAmount } from '@/lib/nutrition/nutrient-display';
import { NutrientList } from '@/components/nutrition/nutrient-list';

const SLOT_ORDER: (MealSlot | 'other')[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', other: 'Other',
};

function fullDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function NutritionDayDetailScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const localDate = typeof date === 'string' ? date : '';
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [day, setDay] = useState<DayNutrition | null>(null);
  const [showAll, setShowAll] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const session = await authService.getSession();
        if (!session?.user.id || !localDate) { if (active) { setEntries([]); setDay(null); } return; }
        const { entries: es } = await foodLogService.getDailyNutrition(session.user.id, localDate);
        if (!active) return;
        setEntries(es);
        setDay(summariseDay(localDate, es));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [localDate]));

  const bySlot = useMemo(() => SLOT_ORDER
    .map(slot => ({
      slot,
      entries: entries.filter(e => (e.mealSlot ?? 'other') === slot),
    }))
    .filter(g => g.entries.length > 0), [entries]);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[palette.blue100, palette.white]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={20} color={palette.ink900} />
            </TouchableOpacity>
            <ThemedText style={s.headerTitle} numberOfLines={1}>
              {localDate ? fullDate(localDate) : 'Day'}
            </ThemedText>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={palette.ink700} style={{ marginTop: 80 }} />
      ) : !day || !day.hasLogs ? (
        <View style={s.content}><ThemedText style={s.emptyText}>No food was logged on this day.</ThemedText></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Day totals — factual, no targets */}
          <View style={s.totals}>
            <ThemedText style={s.totalsEyebrow}>Logged this day</ThemedText>
            <View style={s.macroGrid}>
              {MACRO_DISPLAY_ORDER.map(k => {
                const v = k === 'energyKcal' ? day.energyKcal
                  : k === 'proteinG' ? day.proteinG
                  : k === 'carbohydrateG' ? day.carbohydrateG
                  : k === 'fatG' ? day.fatG : day.fibreG;
                return (
                  <View key={k} style={s.macroCell}>
                    <ThemedText style={s.macroValue}>
                      {formatNutrientAmount(v, NUTRIENT_UNIT[k])}
                      <ThemedText style={s.macroUnit}> {NUTRIENT_UNIT[k]}</ThemedText>
                    </ThemedText>
                    <ThemedText style={s.macroLabel}>{NUTRIENT_LABEL[k]}</ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          {bySlot.map(({ slot, entries: es }) => (
            <View key={slot} style={{ marginTop: 18 }}>
              <ThemedText style={s.slotLabel}>{SLOT_LABEL[slot]}</ThemedText>
              {es.map(e => (
                <View key={e.id} style={s.foodRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.foodName} numberOfLines={1}>{e.displayName}</ThemedText>
                    <ThemedText style={s.foodMeta}>
                      {e.unit === 'serving' ? (e.servingLabel ?? `${e.quantity} serving`) : `${e.quantity} ${e.unit}`}
                      {e.quantityGrams != null && e.unit !== 'g' ? ` (${Math.round(e.quantityGrams)} g)` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText style={s.foodKcal}>
                    {e.nutrients.energyKcal != null ? `${Math.round(e.nutrients.energyKcal)} kcal` : '—'}
                  </ThemedText>
                </View>
              ))}
            </View>
          ))}

          {/* Nutrients for the day */}
          <View style={{ marginTop: 24 }}>
            <ThemedText style={s.slotLabel}>Nutrients</ThemedText>
            <NutrientList
              keys={showAll ? [...KEY_NUTRIENTS] : KEY_NUTRIENTS.slice(0, 6)}
              micros={day.micros}
              completeness={day.completeness}
            />
            <TouchableOpacity onPress={() => setShowAll(v => !v)} style={{ paddingVertical: 10 }}>
              <ThemedText style={s.link}>{showAll ? 'Show fewer' : 'View all key nutrients'}</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: { paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900, flex: 1, textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 18 },
  emptyText: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', marginTop: 40 },

  totals: { backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'], padding: 16 },
  totalsEyebrow: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  macroCell: { minWidth: 84 },
  macroValue: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  macroUnit: { fontSize: 12, fontWeight: '600', color: palette.gray450 },
  macroLabel: { fontSize: 11.5, color: palette.gray450, marginTop: 2 },

  slotLabel: {
    fontSize: 11, fontWeight: '800', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  foodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  foodName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  foodMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  foodKcal: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  link: { fontSize: 13, fontWeight: '700', color: palette.blue600 },
});
