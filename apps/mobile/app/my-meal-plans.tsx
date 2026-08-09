import {
  StyleSheet, View, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MealPlan {
  id: string;
  name: string;
  is_active: boolean;
  assigned_by: string | null;
  created_at: string;
}

export default function MyMealPlansScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }
    setUserId(session.user.id);

    const { data } = await supabase
      .from('meal_plans')
      .select('id, name, is_active, assigned_by, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setPlans((data as MealPlan[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setActive = async (plan: MealPlan) => {
    if (plan.is_active) return;
    setPlans(prev => prev.map(p => ({ ...p, is_active: p.id === plan.id })));
    await supabase.from('meal_plans').update({ is_active: false }).eq('user_id', userId);
    await supabase.from('meal_plans').update({ is_active: true }).eq('id', plan.id);
  };

  const deletePlan = (plan: MealPlan) => {
    if (plan.assigned_by) {
      Alert.alert('Can’t delete', 'This plan was assigned by your nutritionist.');
      return;
    }
    Alert.alert('Delete plan?', `"${plan.name}" will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('meal_plans').delete().eq('id', plan.id);
          setPlans(prev => prev.filter(p => p.id !== plan.id));
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>My Meal Plans</ThemedText>
          <ThemedText style={s.headerSub}>{plans.length} saved</ThemedText>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/meal-plan-builder' as any)}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {plans.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="restaurant-outline" size={44} color={palette.gray200} />
              <ThemedText style={s.emptyTitle}>No meal plans yet</ThemedText>
              <ThemedText style={s.emptySub}>Build your own weekly plan from the meal library</ThemedText>
              <TouchableOpacity style={s.emptyCta} onPress={() => router.push('/meal-plan-builder' as any)} activeOpacity={0.85}>
                <ThemedText style={s.emptyCtaText}>+ Build a Meal Plan</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            plans.map(plan => (
              <View key={plan.id} style={s.planCard}>
                <TouchableOpacity style={s.planCardMain} onPress={() => setActive(plan)} activeOpacity={0.8}>
                  <View style={[s.planIcon, plan.is_active && s.planIconActive]}>
                    <Ionicons name="restaurant-outline" size={18} color={plan.is_active ? '#fff' : palette.gray450} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.planName} numberOfLines={1}>{plan.name}</ThemedText>
                    <ThemedText style={s.planMeta}>
                      {plan.assigned_by ? 'From your nutritionist' : 'Self-built'}
                      {plan.is_active ? ' · Active' : ''}
                    </ThemedText>
                  </View>
                  {plan.is_active && (
                    <View style={s.activeBadge}>
                      <ThemedText style={s.activeBadgeText}>Active</ThemedText>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePlan(plan)} hitSlop={8} style={s.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={palette.danger600} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.success700, alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: palette.ink900, marginTop: 6 },
  emptySub: { fontSize: 13, color: palette.gray300, textAlign: 'center', maxWidth: 260 },
  emptyCta: { marginTop: 16, backgroundColor: palette.success700, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 12 },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  planCardMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    borderRadius: radii.xl, padding: 14, ...shadows.sm,
  },
  planIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  planIconActive: { backgroundColor: palette.success700 },
  planName: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  planMeta: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  activeBadge: { backgroundColor: palette.success50, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: palette.success700 },
  deleteBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
