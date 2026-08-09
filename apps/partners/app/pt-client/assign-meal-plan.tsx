// Nutritionist meal-plan builder — mirrors apps/mobile/app/meal-plan-builder.tsx's
// weekly-grid/day-tab UX, but targets a specific client (assigned_by: pt.id) and
// includes its own inline meal picker modal since there's no standalone
// /meal-library route in this app (this monorepo duplicates rather than shares
// code across apps, per established convention).
import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Modal, Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const palette = {
  ink900: '#000000', gray450: '#6b7280', gray300: '#9ca3af',
  white: '#ffffff', hairline: '#f0f0f0', border: '#e5e7eb', surfaceMuted: '#f9fafb',
  success700: '#15803d', success50: '#f0fdf4',
};
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 100 };

interface Meal {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
}

interface PlanEntry {
  tempId: string;
  day_of_week: number;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  meal_id: string;
  meal_name: string;
  calories: number | null;
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

const CATEGORY_TABS = ['all', 'breakfast', 'lunch', 'dinner', 'snack', 'smoothie'] as const;

function MealPickerModal({
  visible, onClose, onPick,
}: { visible: boolean; onClose: () => void; onPick: (m: Meal) => void }) {
  const [category, setCategory] = useState<string>('all');
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from('meals').select('id, name, category, image_url, calories, protein_g').order('name');
    const { data } = category === 'all' ? await query : await query.eq('category', category);
    setMeals((data as Meal[]) ?? []);
    setLoading(false);
  }, [category]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={ps.root}>
        <SafeAreaView edges={['top']} style={ps.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={ps.closeBtn}>
            <Ionicons name="close" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={ps.headerTitle}>Pick a Meal</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ps.tabRail} style={ps.tabScroll}>
          {CATEGORY_TABS.map(c => (
            <TouchableOpacity
              key={c}
              style={[ps.tabChip, category === c && ps.tabChipActive]}
              onPress={() => setCategory(c)}
              activeOpacity={0.75}
            >
              <ThemedText style={[ps.tabChipText, category === c && ps.tabChipTextActive]}>{c}</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={ps.list}>
            {meals.map(m => (
              <TouchableOpacity key={m.id} style={ps.mealRow} onPress={() => onPick(m)} activeOpacity={0.75}>
                {m.image_url ? (
                  <Image source={{ uri: m.image_url }} style={ps.mealThumb} />
                ) : (
                  <View style={[ps.mealThumb, ps.mealThumbFallback]}>
                    <Ionicons name="restaurant-outline" size={18} color={palette.gray450} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <ThemedText style={ps.mealName} numberOfLines={1}>{m.name}</ThemedText>
                  <ThemedText style={ps.mealMeta}>
                    {m.calories != null ? `${m.calories} kcal` : ''}{m.protein_g != null ? ` · ${m.protein_g}g protein` : ''}
                  </ThemedText>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={palette.success700} />
              </TouchableOpacity>
            ))}
            {meals.length === 0 && <ThemedText style={ps.emptyText}>No meals in this category yet.</ThemedText>}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function AssignMealPlanScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [name, setName] = useState('');
  const [selectedDay, setSelectedDay] = useState(1);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickingSlot, setPickingSlot] = useState<PlanEntry['meal_slot'] | null>(null);
  const [saving, setSaving] = useState(false);

  const dayEntries = entries.filter(e => e.day_of_week === selectedDay);

  const openPicker = (slot: PlanEntry['meal_slot']) => {
    setPickingSlot(slot);
    setPickerOpen(true);
  };

  const handlePick = (meal: Meal) => {
    if (!pickingSlot) return;
    setEntries(prev => [
      ...prev.filter(e => !(e.day_of_week === selectedDay && e.meal_slot === pickingSlot)),
      {
        tempId: `${Date.now()}-${Math.random()}`,
        day_of_week: selectedDay,
        meal_slot: pickingSlot,
        meal_id: meal.id,
        meal_name: meal.name,
        calories: meal.calories,
      },
    ]);
    setPickerOpen(false);
    setPickingSlot(null);
  };

  const removeMeal = (tempId: string) => setEntries(prev => prev.filter(e => e.tempId !== tempId));

  const canSave = name.trim().length > 0 && entries.length > 0;

  const handleSave = async () => {
    if (!canSave || !clientId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Sign in required'); setSaving(false); return; }
      const { data: pt } = await supabase.from('personal_trainers').select('id').eq('user_id', user.id).single();
      if (!pt) { Alert.alert('Error', 'Trainer profile not found.'); setSaving(false); return; }

      const { data: plan, error: planErr } = await supabase
        .from('meal_plans')
        .insert({ user_id: clientId, assigned_by: pt.id, name: name.trim() })
        .select('id')
        .single();

      if (planErr || !plan) { Alert.alert('Error', planErr?.message ?? 'Failed to assign plan.'); setSaving(false); return; }

      const { error: itemsErr } = await supabase.from('meal_plan_items').insert(
        entries.map((e, i) => ({
          meal_plan_id: plan.id, day_of_week: e.day_of_week, meal_slot: e.meal_slot, meal_id: e.meal_id, sort_order: i,
        })),
      );
      if (itemsErr) { Alert.alert('Error', itemsErr.message); setSaving(false); return; }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MealPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePick} />

      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={palette.ink900} />
            </TouchableOpacity>
            <ThemedText style={s.headerTitle}>Assign Meal Plan</ThemedText>
            <TouchableOpacity
              style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave || saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={s.saveBtnText}>Save</ThemedText>}
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.nameInput}
            placeholder="Name this plan, e.g. Weight Loss Week 1"
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
                  <TouchableOpacity style={s.addBtn} onPress={() => openPicker(slot.key)} activeOpacity={0.75}>
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
    </>
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

const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white, paddingTop: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  closeBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },

  tabScroll: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  tabRail: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tabChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.white,
  },
  tabChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  tabChipText: { fontSize: 13, fontWeight: '700', color: palette.gray450, textTransform: 'capitalize' },
  tabChipTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  mealThumb: { width: 44, height: 44, borderRadius: 12 },
  mealThumbFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  mealName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  mealMeta: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  emptyText: { fontSize: 13, color: palette.gray300, textAlign: 'center', marginTop: 40 },
});
