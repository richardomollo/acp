import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';

interface NutritionProfile {
  goals: string[];
  cuisine_preference: string | null;
}

interface PlanItem {
  id: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  sort_order: number;
  meals: { name: string; calories: number | null } | null;
}

interface ActivePlan {
  id: string;
  name: string;
  assigned_by: string | null;
}

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose Weight', build_muscle: 'Build Muscle', general_fitness: 'General Fitness',
  improve_mobility: 'Mobility', maintain_weight: 'Maintain Weight', eat_healthier: 'Eat Healthier',
};

const SLOT_ORDER: PlanItem['meal_slot'][] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABEL: Record<string, string> = { breakfast: '🍳 Breakfast', lunch: '🍲 Lunch', dinner: '🍽️ Dinner', snack: '🥜 Snack' };

export default function NutritionHubScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null);
  const [todayItems, setTodayItems] = useState<PlanItem[]>([]);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [hasNutritionist, setHasNutritionist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (active) { setUserId(null); setLoading(false); }
        return;
      }
      if (active) setUserId(session.user.id);

      const { data: profileData } = await supabase
        .from('fitness_profile')
        .select('goals, cuisine_preference')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (active) setProfile(profileData ? { goals: profileData.goals ?? [], cuisine_preference: profileData.cuisine_preference } : null);

      const { data: rosterData } = await supabase
        .from('pt_clients')
        .select('status, personal_trainers(specialisations)')
        .eq('client_user_id', session.user.id)
        .eq('status', 'active');
      const nutritionistConnected = (rosterData ?? []).some(
        r => (r.personal_trainers as any)?.specialisations?.includes('Nutrition'),
      );
      if (active) setHasNutritionist(nutritionistConnected);

      const { data: planData } = await supabase
        .from('meal_plans')
        .select('id, name, assigned_by')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!planData) {
        if (active) { setActivePlan(null); setTodayItems([]); setLoggedIds(new Set()); setLoading(false); }
        return;
      }
      if (active) setActivePlan(planData as ActivePlan);

      const todayDow = new Date().getDay();
      const { data: itemsData } = await supabase
        .from('meal_plan_items')
        .select('id, meal_slot, sort_order, meals(name, calories)')
        .eq('meal_plan_id', planData.id)
        .eq('day_of_week', todayDow)
        .order('sort_order');

      const items = (itemsData as unknown as PlanItem[]) ?? [];
      if (active) setTodayItems(items);

      if (items.length > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: logsData } = await supabase
          .from('meal_logs')
          .select('meal_plan_item_id, status')
          .eq('user_id', session.user.id)
          .eq('log_date', todayStr)
          .in('meal_plan_item_id', items.map(i => i.id));
        if (active) setLoggedIds(new Set((logsData ?? []).filter(l => l.status === 'eaten').map(l => l.meal_plan_item_id)));
      }

      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  const toggleMeal = async (item: PlanItem) => {
    if (!userId || togglingId) return;
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

  const hasGoal = !!profile?.goals?.length;

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={20} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Nutrition Hub</ThemedText>
            <ThemedText style={s.headerSub}>Eat better, Kenyan-style</ThemedText>
          </View>
          {userId && (
            <TouchableOpacity
              style={s.journeyBtn}
              onPress={() => router.push('/fitness-journey' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="stats-chart-outline" size={16} color={palette.success700} />
              <ThemedText style={s.journeyBtnText}>Journey</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {userId && !hasGoal && (
            <TouchableOpacity
              style={s.setupCta}
              onPress={() => router.push('/fitness-goals' as any)}
              activeOpacity={0.85}
            >
              <View style={s.setupCtaIcon}>
                <Ionicons name="flag-outline" size={22} color={palette.success700} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.createCtaTitle}>Set your nutrition goal</ThemedText>
                <ThemedText style={s.createCtaSub}>Tell us what you're eating for &amp; your cuisine preference</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
            </TouchableOpacity>
          )}

          {userId && hasGoal && (
            <View style={s.goalBadgeRow}>
              <View style={s.goalBadgeWrap}>
                {profile!.goals.map(g => (
                  <View key={g} style={s.goalBadge}>
                    <ThemedText style={s.goalBadgeText}>{GOAL_LABELS[g] ?? g}</ThemedText>
                  </View>
                ))}
              </View>
              <TouchableOpacity onPress={() => router.push('/fitness-goals' as any)}>
                <ThemedText style={s.editGoalText}>Edit</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Find a Nutritionist (only if not already connected to one) ── */}
          {userId && !hasNutritionist && (
            <TouchableOpacity
              style={s.setupCta}
              onPress={() => router.push({ pathname: '/(tabs)/trainers', params: { filter: 'Nutrition' } } as any)}
              activeOpacity={0.85}
            >
              <View style={s.setupCtaIcon}>
                <Ionicons name="people-outline" size={22} color={palette.success700} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.createCtaTitle}>Find a Nutritionist</ThemedText>
                <ThemedText style={s.createCtaSub}>Browse nutrition professionals for personalised coaching</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
            </TouchableOpacity>
          )}

          {/* ── Today's Plan ── */}
          {userId && activePlan && (
            <>
              <View style={s.bodyPartHeader}>
                <ThemedText style={s.bodyPartEyebrow}>{activePlan.assigned_by ? 'FROM YOUR NUTRITIONIST' : 'TODAY'}</ThemedText>
                <ThemedText style={s.bodyPartTitle}>{activePlan.name}</ThemedText>
              </View>
              {todayItems.length === 0 ? (
                <ThemedText style={s.emptyText}>Nothing planned for today.</ThemedText>
              ) : (
                <View style={s.planList}>
                  {SLOT_ORDER.filter(slot => todayItems.some(i => i.meal_slot === slot)).map(slot => (
                    <View key={slot}>
                      {todayItems.filter(i => i.meal_slot === slot).map(item => {
                        const done = loggedIds.has(item.id);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={s.planRow}
                            onPress={() => toggleMeal(item)}
                            disabled={togglingId === item.id}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={done ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20} color={done ? palette.success700 : palette.gray300}
                            />
                            <View style={{ flex: 1 }}>
                              <ThemedText style={[s.planRowTitle, done && s.planRowTitleDone]} numberOfLines={1}>
                                {item.meals?.name ?? 'Meal'}
                              </ThemedText>
                              <ThemedText style={s.planRowMeta}>
                                {SLOT_LABEL[slot]}{item.meals?.calories ? ` · ${item.meals.calories} kcal` : ''}
                              </ThemedText>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* ── Meal Library ── */}
          <View style={s.bodyPartHeader}>
            <ThemedText style={s.bodyPartEyebrow}>DISCOVER</ThemedText>
            <ThemedText style={s.bodyPartTitle}>Meal Library</ThemedText>
          </View>
          <TouchableOpacity style={s.browseCta} onPress={() => router.push('/meal-library' as any)} activeOpacity={0.85}>
            <View style={s.browseCtaIcon}>
              <Ionicons name="restaurant-outline" size={22} color={palette.success700} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.createCtaTitle}>Browse Kenyan Meals</ThemedText>
              <ThemedText style={s.createCtaSub}>Breakfast, lunch, dinner, snacks &amp; smoothies with full macros</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>

          {userId && (
            <>
              <View style={s.bodyPartHeader}>
                <ThemedText style={s.bodyPartEyebrow}>PLANNER</ThemedText>
                <ThemedText style={s.bodyPartTitle}>Meal Plans</ThemedText>
              </View>
              <TouchableOpacity style={s.browseCta} onPress={() => router.push('/my-meal-plans' as any)} activeOpacity={0.85}>
                <View style={s.browseCtaIcon}>
                  <Ionicons name="calendar-outline" size={22} color={palette.success700} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.createCtaTitle}>My Meal Plans</ThemedText>
                  <ThemedText style={s.createCtaSub}>Build your own weekly plan or view what's assigned</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
              </TouchableOpacity>

              <TouchableOpacity
                style={s.journeyCta}
                onPress={() => router.push('/fitness-journey' as any)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[palette.success700, '#0d9d4e']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.journeyCtaGrad}
                >
                  <View>
                    <ThemedText style={s.journeyCtaTitle}>My Nutrition Journey</ThemedText>
                    <ThemedText style={s.journeyCtaSub}>Streaks, meals logged &amp; progress</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  journeyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: palette.success50, borderRadius: radii.pill,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  journeyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.success700 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  setupCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    backgroundColor: palette.white, padding: 14, marginBottom: 24, ...shadows.sm,
  },
  setupCtaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.success50, alignItems: 'center', justifyContent: 'center' },

  goalBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8 },
  goalBadgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  goalBadge: { backgroundColor: palette.success50, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  goalBadgeText: { fontSize: 12.5, fontWeight: '700', color: palette.success700 },
  editGoalText: { fontSize: 12.5, fontWeight: '600', color: palette.blue500 },

  bodyPartHeader: { marginBottom: 14 },
  bodyPartEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.16 * 11, color: palette.gray300, textTransform: 'uppercase', marginBottom: 4 },
  bodyPartTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },

  emptyText: { fontSize: 13, color: palette.gray300, marginBottom: 24 },

  planList: { gap: 12, marginBottom: 28 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline,
  },
  planRowTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  planRowTitleDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  planRowMeta: { fontSize: 11.5, color: palette.gray300, marginTop: 2 },

  browseCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    backgroundColor: palette.white, padding: 14, marginBottom: 24, ...shadows.sm,
  },
  browseCtaIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.success50, alignItems: 'center', justifyContent: 'center' },
  createCtaTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  createCtaSub: { fontSize: 12, color: palette.gray300, marginTop: 2 },

  journeyCta: { borderRadius: radii.xl, overflow: 'hidden', marginTop: 8 },
  journeyCtaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  journeyCtaTitle: { fontSize: fontSize.base, fontWeight: '800', color: '#fff' },
  journeyCtaSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
