import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const palette = {
  ink900: '#000000', gray450: '#6b7280', gray300: '#9ca3af',
  white: '#ffffff', hairline: '#f0f0f0', border: '#e5e7eb', surfaceMuted: '#f9fafb',
  success700: '#15803d', success50: '#f0fdf4', danger600: '#dc2626', danger50: '#fee2e2',
};
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 100 };

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

interface PlanItem {
  id: string;
  day_of_week: number;
  meal_slot: string;
  meals: { name: string } | null;
}

interface DayRow {
  date: string;
  label: string;
  items: { item: PlanItem; status: 'eaten' | 'skipped' | 'pending' }[];
}

function last7Dates(): { date: string; dow: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), dow: d.getDay() };
  });
}

export default function NutritionAdherenceScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [planName, setPlanName] = useState<string | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [compliancePct, setCompliancePct] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!clientId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: plan } = await supabase
        .from('meal_plans')
        .select('id, name')
        .eq('user_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan) {
        if (active) { setPlanName(null); setDays([]); setCompliancePct(0); setLoading(false); }
        return;
      }
      if (active) setPlanName(plan.name);

      const { data: itemsData } = await supabase
        .from('meal_plan_items')
        .select('id, day_of_week, meal_slot, meals(name)')
        .eq('meal_plan_id', plan.id);
      const items = (itemsData as unknown as PlanItem[]) ?? [];

      const range = last7Dates();
      const { data: logsData } = await supabase
        .from('meal_logs')
        .select('meal_plan_item_id, log_date, status')
        .eq('user_id', clientId)
        .in('log_date', range.map(r => r.date));
      const logs = logsData ?? [];

      let totalExpected = 0;
      let totalEaten = 0;
      const dayRows: DayRow[] = range.map(({ date, dow }) => {
        const dayItems = items
          .filter(it => it.day_of_week === dow)
          .sort((a, b) => SLOT_ORDER.indexOf(a.meal_slot as any) - SLOT_ORDER.indexOf(b.meal_slot as any));
        const entries = dayItems.map(item => {
          const log = logs.find(l => l.meal_plan_item_id === item.id && l.log_date === date);
          const status: 'eaten' | 'skipped' | 'pending' = log ? (log.status as any) : 'pending';
          totalExpected++;
          if (status === 'eaten') totalEaten++;
          return { item, status };
        });
        return {
          date,
          label: new Date(date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' }),
          items: entries,
        };
      });

      if (active) {
        setDays(dayRows);
        setCompliancePct(totalExpected > 0 ? Math.round((totalEaten / totalExpected) * 100) : 0);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clientId]));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Nutrition Adherence</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 60 }} />
        ) : !planName ? (
          <View style={s.empty}>
            <Ionicons name="restaurant-outline" size={44} color={palette.gray300} />
            <ThemedText style={s.emptyTitle}>No active meal plan</ThemedText>
            <ThemedText style={s.emptySub}>Assign a meal plan to start tracking adherence.</ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={s.planLabel}>{planName}</ThemedText>

            <View style={s.complianceCard}>
              <ThemedText style={s.complianceLabel}>7-Day Compliance</ThemedText>
              <ThemedText style={s.compliancePct}>{compliancePct}%</ThemedText>
              <View style={s.complianceTrack}>
                <View style={[s.complianceFill, { width: `${compliancePct}%` }]} />
              </View>
            </View>

            {days.map(day => (
              <View key={day.date} style={s.dayCard}>
                <ThemedText style={s.dayLabel}>{day.label}</ThemedText>
                {day.items.length === 0 ? (
                  <ThemedText style={s.noItemsText}>Nothing planned</ThemedText>
                ) : (
                  day.items.map(({ item, status }) => (
                    <View key={item.id} style={s.itemRow}>
                      {status === 'eaten' ? (
                        <Ionicons name="checkmark-circle" size={18} color={palette.success700} />
                      ) : status === 'skipped' ? (
                        <Ionicons name="close-circle" size={18} color={palette.danger600} />
                      ) : (
                        <Ionicons name="time-outline" size={18} color={palette.gray300} />
                      )}
                      <ThemedText style={s.itemText}>
                        {SLOT_LABEL[item.meal_slot] ?? item.meal_slot} · {item.meals?.name ?? 'Meal'}
                      </ThemedText>
                    </View>
                  ))
                )}
              </View>
            ))}
            <View style={{ height: 40 }} />
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
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },

  content: { paddingHorizontal: 20, paddingTop: 20 },
  planLabel: { fontSize: 18, fontWeight: '800', color: palette.ink900, marginBottom: 16 },

  complianceCard: {
    backgroundColor: palette.success50, borderRadius: radii.xl, padding: 18, marginBottom: 24, alignItems: 'center',
  },
  complianceLabel: { fontSize: 12, fontWeight: '700', color: palette.success700, textTransform: 'uppercase', letterSpacing: 0.5 },
  compliancePct: { fontSize: 34, fontWeight: '900', color: palette.success700, marginTop: 4, marginBottom: 12 },
  complianceTrack: { height: 6, width: '100%', backgroundColor: '#d1f5df', borderRadius: 3, overflow: 'hidden' },
  complianceFill: { height: 6, backgroundColor: palette.success700, borderRadius: 3 },

  dayCard: {
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.lg, padding: 14, marginBottom: 12,
  },
  dayLabel: { fontSize: 13, fontWeight: '800', color: palette.ink900, marginBottom: 8 },
  noItemsText: { fontSize: 12, color: palette.gray300 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  itemText: { fontSize: 13, color: palette.gray450, fontWeight: '500' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  emptySub: { fontSize: 13, color: palette.gray300, textAlign: 'center' },
});
