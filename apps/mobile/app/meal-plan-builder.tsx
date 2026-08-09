import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PlanEntry {
  tempId: string;
  day_of_week: number;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  meal_id: string;
  meal_name: string;
  calories: number | null;
  protein_g: number | null;
}

const DAYS = [
  { key: 0, label: 'Sun' }, { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' }, { key: 4, label: 'Thu' }, { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' },
] as const;

const SLOTS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { key: 'lunch', label: 'Lunch', icon: '🍲' },
  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
  { key: 'snack', label: 'Snack', icon: '🥜' },
] as const;

export default function MealPlanBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pickedMealId?: string; day?: string; slot?: string; pickId?: string }>();

  const [name, setName] = useState('');
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const lastPickIdRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!params.pickedMealId || !params.pickId || params.pickId === lastPickIdRef.current) return;
    lastPickIdRef.current = params.pickId;
    const day = Number(params.day);
    const slot = params.slot as PlanEntry['meal_slot'];

    (async () => {
      const { data } = await supabase
        .from('meals')
        .select('id, name, calories, protein_g')
        .eq('id', params.pickedMealId)
        .single();
      if (!data) return;
      setEntries(prev => [
        ...prev.filter(e => !(e.day_of_week === day && e.meal_slot === slot)),
        {
          tempId: `${Date.now()}-${Math.random()}`,
          day_of_week: day,
          meal_slot: slot,
          meal_id: data.id,
          meal_name: data.name,
          calories: data.calories,
          protein_g: data.protein_g,
        },
      ]);
    })();
  }, [params.pickedMealId, params.pickId, params.day, params.slot]));

  const dayEntries = useMemo(
    () => entries.filter(e => e.day_of_week === selectedDay),
    [entries, selectedDay],
  );

  const dayTotals = useMemo(() => {
    return dayEntries.reduce(
      (acc, e) => ({ calories: acc.calories + (e.calories ?? 0), protein: acc.protein + (e.protein_g ?? 0) }),
      { calories: 0, protein: 0 },
    );
  }, [dayEntries]);

  const addMeal = (slot: PlanEntry['meal_slot']) => {
    router.push({ pathname: '/meal-library', params: { pickForDay: String(selectedDay), pickForSlot: slot } } as any);
  };

  const removeMeal = (tempId: string) => setEntries(prev => prev.filter(e => e.tempId !== tempId));

  const canSave = name.trim().length > 0 && entries.length > 0;

  const savePlan = async () => {
    if (!canSave) {
      Alert.alert('Almost there', 'Give your plan a name and add at least one meal.');
      return;
    }
    setSaving(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setSaving(false); return; }

    const { data: plan, error: planErr } = await supabase
      .from('meal_plans')
      .insert({ user_id: session.user.id, name: name.trim() })
      .select('id')
      .single();

    if (planErr || !plan) {
      setSaving(false);
      Alert.alert('Error', planErr?.message ?? 'Failed to save plan.');
      return;
    }

    const { error: itemsErr } = await supabase.from('meal_plan_items').insert(
      entries.map((e, i) => ({
        meal_plan_id: plan.id,
        day_of_week: e.day_of_week,
        meal_slot: e.meal_slot,
        meal_id: e.meal_id,
        sort_order: i,
      })),
    );

    setSaving(false);
    if (itemsErr) { Alert.alert('Error', itemsErr.message); return; }
    router.replace('/my-meal-plans' as any);
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Build Meal Plan</ThemedText>
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
            onPress={savePlan}
            disabled={!canSave || saving}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={s.saveBtnText}>Save</ThemedText>}
          </TouchableOpacity>
        </View>
        <TextInput
          style={s.nameInput}
          placeholder="Name this plan, e.g. My Muscle Plan"
          placeholderTextColor={palette.gray300}
          value={name}
          onChangeText={setName}
          maxLength={60}
        />
      </SafeAreaView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayRail} style={s.dayScroll}>
        {DAYS.map(d => (
          <TouchableOpacity
            key={d.key}
            style={[s.dayChip, selectedDay === d.key && s.dayChipActive]}
            onPress={() => setSelectedDay(d.key)}
            activeOpacity={0.75}
          >
            <ThemedText style={[s.dayChipText, selectedDay === d.key && s.dayChipTextActive]}>{d.label}</ThemedText>
            {entries.some(e => e.day_of_week === d.key) && <View style={s.dayDot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {dayEntries.length > 0 && (
          <View style={s.totalsCard}>
            <ThemedText style={s.totalsText}>{dayTotals.calories} kcal</ThemedText>
            <View style={s.totalsDivider} />
            <ThemedText style={s.totalsText}>{dayTotals.protein}g protein</ThemedText>
          </View>
        )}

        {SLOTS.map(slot => {
          const entry = dayEntries.find(e => e.meal_slot === slot.key);
          return (
            <View key={slot.key} style={s.slotRow}>
              <ThemedText style={s.slotLabel}>{slot.icon} {slot.label}</ThemedText>
              {entry ? (
                <View style={s.mealRow}>
                  <ThemedText style={s.mealName} numberOfLines={1}>{entry.meal_name}</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {entry.calories != null && <ThemedText style={s.mealMeta}>{entry.calories} kcal</ThemedText>}
                    <TouchableOpacity onPress={() => removeMeal(entry.tempId)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={palette.gray300} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.addBtn} onPress={() => addMeal(slot.key)} activeOpacity={0.75}>
                  <Ionicons name="add" size={16} color={palette.success700} />
                  <ThemedText style={s.addBtnText}>Add Meal</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, marginBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },
  saveBtn: { backgroundColor: palette.success700, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 9, minWidth: 64, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: palette.gray300 },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  nameInput: {
    fontSize: 16, fontWeight: '700', color: palette.ink900,
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 10,
  },

  dayScroll: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  dayRail: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  dayChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
    alignItems: 'center', flexDirection: 'row', gap: 6,
  },
  dayChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  dayChipText: { fontSize: 13, fontWeight: '700', color: palette.gray450 },
  dayChipTextActive: { color: '#fff' },
  dayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: palette.success700 },

  content: { paddingHorizontal: 20, paddingTop: 18 },

  totalsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    backgroundColor: palette.success50, borderRadius: radii.xl, paddingVertical: 12, marginBottom: 18,
  },
  totalsText: { fontSize: 14, fontWeight: '800', color: palette.success700 },
  totalsDivider: { width: 1, height: 16, backgroundColor: palette.success700, opacity: 0.3 },

  slotRow: { marginBottom: 18 },
  slotLabel: { fontSize: 13, fontWeight: '700', color: palette.ink900, marginBottom: 8 },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.lg, paddingHorizontal: 14, paddingVertical: 12,
  },
  mealName: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.ink900, marginRight: 8 },
  mealMeta: { fontSize: 12, color: palette.gray450, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: palette.success700, borderStyle: 'dashed',
    borderRadius: radii.lg, paddingVertical: 12,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: palette.success700 },
});
