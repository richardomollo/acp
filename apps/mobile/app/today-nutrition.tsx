import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidAssessment, sortSupportOpportunities, type AIAssessment } from '@/lib/ai-assessment';
import { matchProfessionalProviders, type ProviderMatch } from '@/lib/professional-support';

interface TodayMealItem {
  id: string;
  mealId: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'smoothie';
  name: string;
  image_url: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_time_minutes: number | null;
}

const SLOT_ORDER: TodayMealItem['slot'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'smoothie'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', smoothie: 'Smoothie',
};

const RING_SIZE = 168;
const RING_STROKE = 12;

const CONTENT_PADDING = 20;
const GRID_GAP = 14;
const CARD_WIDTH = (Dimensions.get('window').width - CONTENT_PADDING * 2 - GRID_GAP) / 2;

function CalorieRing({ progress }: { progress: number }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius}
        stroke={palette.border} strokeWidth={RING_STROKE} fill="none"
      />
      <Circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius}
        stroke={palette.ink900} strokeWidth={RING_STROKE} fill="none"
        strokeDasharray={`${circumference}, ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        rotation={-90}
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
}

function MacroBar({ label, eaten, goal, unit }: { label: string; eaten: number; goal: number; unit: string }) {
  const pct = goal > 0 ? Math.max(0, Math.min(1, eaten / goal)) : 0;
  return (
    <View style={s.macroCol}>
      <ThemedText style={s.macroValue}>{Math.round(eaten)} / {Math.round(goal)}{unit}</ThemedText>
      <View style={s.macroTrack}>
        <View style={[s.macroFill, { width: `${pct * 100}%` }]} />
      </View>
      <ThemedText style={s.macroLabel}>{label}</ThemedText>
    </View>
  );
}

export default function TodayNutritionScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<TodayMealItem[]>([]);
  const [isSuggested, setIsSuggested] = useState(false);
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMatches, setSupportMatches] = useState<ProviderMatch[] | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        if (active) { setUserId(null); setItems([]); setAssessment(null); setLoading(false); }
        return;
      }
      if (active) setUserId(session.user.id);

      // "Want extra support?" — same gating as My Plan: only shown when ACP
      // Intelligence's current assessment actually names a nutrition support
      // opportunity, never a generic always-on ad, and never coupled to
      // whether today's meals loaded successfully.
      const { data: profileData } = await supabase
        .from('fitness_profile')
        .select('ai_assessment')
        .eq('user_id', session.user.id)
        .maybeSingle();
      const validAssessment = profileData?.ai_assessment && isValidAssessment(profileData.ai_assessment)
        ? profileData.ai_assessment
        : null;
      if (active) setAssessment(validAssessment);

      const { data: planData } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let planItems: TodayMealItem[] = [];
      if (planData) {
        const todayDow = new Date().getDay();
        const { data: itemsData } = await supabase
          .from('meal_plan_items')
          .select('id, meal_slot, sort_order, meals(id, name, image_url, calories, protein_g, carbs_g, fat_g, prep_time_minutes)')
          .eq('meal_plan_id', planData.id)
          .eq('day_of_week', todayDow)
          .order('sort_order');
        planItems = ((itemsData as any[]) ?? [])
          .filter(i => i.meals)
          .map(i => ({
            id: i.id,
            mealId: i.meals.id,
            slot: i.meal_slot,
            name: i.meals.name,
            image_url: i.meals.image_url,
            calories: i.meals.calories ?? 0,
            protein_g: i.meals.protein_g ?? 0,
            carbs_g: i.meals.carbs_g ?? 0,
            fat_g: i.meals.fat_g ?? 0,
            prep_time_minutes: i.meals.prep_time_minutes,
          }));
      }

      if (planItems.length > 0) {
        if (!active) return;
        setItems(planItems);
        setIsSuggested(false);

        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: logsData } = await supabase
          .from('meal_logs')
          .select('meal_plan_item_id, status')
          .eq('user_id', session.user.id)
          .eq('log_date', todayStr)
          .in('meal_plan_item_id', planItems.map(i => i.id));
        if (active) setLoggedIds(new Set((logsData ?? []).filter(l => l.status === 'eaten').map(l => l.meal_plan_item_id)));
      } else {
        // No active plan — same suggested-meals fallback as the home page,
        // one random pick per category so there's always something to show.
        const categoryResults = await Promise.all(
          (['breakfast', 'lunch', 'dinner'] as const).map(category =>
            supabase.from('meals')
              .select('id, name, image_url, calories, protein_g, carbs_g, fat_g, prep_time_minutes, category')
              .eq('is_active', true)
              .eq('category', category)
              .limit(5),
          ),
        );
        const suggested: TodayMealItem[] = categoryResults
          .map(({ data }) => data ?? [])
          .filter(rows => rows.length > 0)
          .map(rows => rows[Math.floor(Math.random() * rows.length)])
          .map(meal => ({
            id: meal.id,
            mealId: meal.id,
            slot: meal.category,
            name: meal.name,
            image_url: meal.image_url,
            calories: meal.calories ?? 0,
            protein_g: meal.protein_g ?? 0,
            carbs_g: meal.carbs_g ?? 0,
            fat_g: meal.fat_g ?? 0,
            prep_time_minutes: meal.prep_time_minutes,
          }));
        if (!active) return;
        setItems(suggested);
        setIsSuggested(true);
        setLoggedIds(new Set());
      }

      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  const toggleMeal = async (item: TodayMealItem) => {
    if (togglingId) return;
    if (isSuggested || !userId) {
      setLoggedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        return next;
      });
      return;
    }
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

  // Same behaviour as My Plan's "Explore support" — professional matching is
  // only fetched after an explicit tap, never preloaded.
  const handleExploreSupport = async () => {
    setSupportExpanded(true);
    if (supportMatches !== null || supportLoading) return;
    setSupportLoading(true);
    try {
      const { data } = await supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, specialisations, photo_url')
        .eq('status', 'approved');
      const providers = ((data ?? []) as any[]).map(p => ({
        id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [], photoUrl: p.photo_url ?? null,
      }));
      setSupportMatches(matchProfessionalProviders(null, [], true, providers));
    } catch {
      setSupportMatches([]); // fails safe — today's meals are unaffected
    } finally {
      setSupportLoading(false);
    }
  };

  const goal = items.reduce((acc, i) => ({
    calories: acc.calories + i.calories,
    protein: acc.protein + i.protein_g,
    carbs: acc.carbs + i.carbs_g,
    fat: acc.fat + i.fat_g,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const eatenItems = items.filter(i => loggedIds.has(i.id));
  const eaten = eatenItems.reduce((acc, i) => ({
    calories: acc.calories + i.calories,
    protein: acc.protein + i.protein_g,
    carbs: acc.carbs + i.carbs_g,
    fat: acc.fat + i.fat_g,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const remaining = Math.max(0, goal.calories - eaten.calories);
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const orderedItems = SLOT_ORDER.flatMap(slot => items.filter(i => i.slot === slot));

  const supportOpportunities = sortSupportOpportunities(assessment?.support_opportunities ?? []);
  const nutritionSupport = supportOpportunities.find(o => o.type === 'nutrition');
  const showSupportCard = !!assessment && !!nutritionSupport;

  return (
    <View style={s.root}>
      {loading ? (
        <ActivityIndicator size="large" color={palette.success700} style={{ marginTop: 100 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[palette.blue100, palette.white]} style={s.header}>
            <SafeAreaView edges={['top']}>
              <View style={s.headerRow}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
                  <Ionicons name="arrow-back" size={20} color={palette.ink900} />
                </TouchableOpacity>
                <ThemedText style={s.headerTitle}>Today, {todayLabel}</ThemedText>
                <View style={{ width: 36 }} />
              </View>

              <View style={s.ringWrap}>
                <View style={s.ringSideCol}>
                  <ThemedText style={s.ringSideValue}>{Math.round(eaten.calories)}</ThemedText>
                  <ThemedText style={s.ringSideLabel}>eaten</ThemedText>
                </View>
                <View style={s.ringCircle}>
                  <CalorieRing progress={goal.calories > 0 ? eaten.calories / goal.calories : 0} />
                  <ThemedText style={s.ringCenterValue}>{Math.round(remaining)}</ThemedText>
                  <ThemedText style={s.ringCenterLabel}>kcal left</ThemedText>
                </View>
                <View style={s.ringSideCol}>
                  <ThemedText style={s.ringSideValue}>{Math.round(goal.calories)}</ThemedText>
                  <ThemedText style={s.ringSideLabel}>goal</ThemedText>
                </View>
              </View>

              <View style={s.macroRow}>
                <MacroBar label="Carbs" eaten={eaten.carbs} goal={goal.carbs} unit="g" />
                <MacroBar label="Protein" eaten={eaten.protein} goal={goal.protein} unit="g" />
                <MacroBar label="Fat" eaten={eaten.fat} goal={goal.fat} unit="g" />
              </View>
            </SafeAreaView>
          </LinearGradient>

          <View style={s.content}>
            {items.length === 0 ? (
              <ThemedText style={s.emptyText}>No meals found for today.</ThemedText>
            ) : (
              <>
                <ThemedText style={s.sourceNote}>
                  {isSuggested ? 'Suggested meals — tap to mark as eaten' : 'From your meal plan'}
                </ThemedText>
                <View style={s.mealsGrid}>
                  {orderedItems.map(item => {
                    const done = loggedIds.has(item.id);
                    return (
                      <View key={item.id} style={s.mealCard}>
                        <TouchableOpacity
                          onPress={() => router.push({ pathname: '/meal-detail', params: { mealId: item.mealId } } as any)}
                          activeOpacity={0.85}
                        >
                          {item.image_url ? (
                            <Image source={{ uri: item.image_url }} style={s.mealImage} />
                          ) : (
                            <View style={[s.mealImage, s.mealImageFallback]}>
                              <Ionicons name="restaurant-outline" size={32} color={palette.gray300} />
                            </View>
                          )}
                          <TouchableOpacity
                            style={[s.checkBtn, done && s.checkBtnDone]}
                            onPress={() => toggleMeal(item)}
                            disabled={togglingId === item.id}
                            hitSlop={8}
                          >
                            <Ionicons name="checkmark" size={16} color={done ? '#fff' : palette.gray300} />
                          </TouchableOpacity>
                          <View style={s.mealCardBody}>
                            <ThemedText style={s.mealTypeTag}>{SLOT_LABEL[item.slot]}</ThemedText>
                            <ThemedText style={[s.mealName, done && s.mealNameDone]} numberOfLines={2}>{item.name}</ThemedText>
                            <ThemedText style={s.mealMeta}>
                              {item.calories} kcal{item.prep_time_minutes ? ` · ${item.prep_time_minutes} min` : ''}
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {showSupportCard && (
              <View style={s.card}>
                <ThemedText style={s.cardEyebrow}>Want extra support?</ThemedText>
                <View style={{ marginBottom: 10 }}>
                  <ThemedText style={s.rowValue}>Nutrition support</ThemedText>
                  <ThemedText style={s.aiBody}>{nutritionSupport?.reason}</ThemedText>
                </View>

                {!supportExpanded ? (
                  <TouchableOpacity style={s.exploreSupportBtn} onPress={handleExploreSupport} activeOpacity={0.85}>
                    <ThemedText style={s.exploreSupportBtnText}>Explore support →</ThemedText>
                  </TouchableOpacity>
                ) : supportLoading ? (
                  <ActivityIndicator style={{ marginTop: 12 }} color={palette.ink700} />
                ) : supportMatches && supportMatches.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    {supportMatches.map(m => (
                      <TouchableOpacity key={m.id} style={s.providerRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                        {m.photoUrl ? (
                          <Image source={{ uri: m.photoUrl }} style={s.providerAvatar} />
                        ) : (
                          <View style={[s.providerAvatar, s.providerAvatarFallback]}>
                            <Ionicons name="person-outline" size={18} color={palette.gray300} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <ThemedText style={s.dayTitle}>{m.name}</ThemedText>
                          {m.matchReasons.length > 0 && (
                            <ThemedText style={s.dayMeta}>Good match for: {m.matchReasons.join(' · ')}</ThemedText>
                          )}
                        </View>
                        <ThemedText style={s.fulfilmentLink}>View profile →</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <ThemedText style={[s.aiBody, { marginTop: 8 }]}>
                    No matching professionals were found right now.
                  </ThemedText>
                )}
              </View>
            )}
            <View style={{ height: 60 }} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: { paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900 },

  ringWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, marginTop: 20,
  },
  ringSideCol: { alignItems: 'center', width: 64 },
  ringSideValue: { fontSize: 22, fontWeight: '800', color: palette.ink900 },
  ringSideLabel: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  ringCircle: {
    width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  ringCenterValue: { fontSize: 32, fontWeight: '800', color: palette.ink900, paddingTop: 10 },
  ringCenterLabel: { fontSize: 13, color: palette.gray450, marginTop: 2 },

  macroRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 28, paddingHorizontal: 24,
  },
  macroCol: { alignItems: 'center', gap: 6, width: 90 },
  macroValue: { fontSize: 13, fontWeight: '700', color: palette.ink900 },
  macroTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: palette.border, overflow: 'hidden' },
  macroFill: { height: '100%', backgroundColor: palette.ink900, borderRadius: 2 },
  macroLabel: { fontSize: 11.5, color: palette.gray450 },

  content: { paddingHorizontal: 20, paddingTop: 24 },
  emptyText: { fontSize: 13, color: palette.gray300, textAlign: 'center', marginTop: 40 },
  sourceNote: { fontSize: 12, color: palette.gray300, marginBottom: 16 },

  mealsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },

  mealCard: {
    width: CARD_WIDTH,
    backgroundColor: palette.white, borderRadius: radii['2xl'],
    borderWidth: 1, borderColor: palette.hairline, overflow: 'hidden',
  },
  mealImage: { width: CARD_WIDTH - 2, height: CARD_WIDTH - 2 },
  mealImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  mealCardBody: { padding: 12 },
  mealTypeTag: {
    fontSize: 10, fontWeight: '800', color: palette.blue600,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  mealName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  mealNameDone: { color: palette.gray300, textDecorationLine: 'line-through' },
  mealMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  checkBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkBtnDone: { backgroundColor: palette.success700 },

  // "Want extra support?" — same card/behaviour as My Plan's support section.
  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginTop: 4,
  },
  cardEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray300,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  rowValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
  },
  aiBody: {
    fontSize: fontSize.sm,
    color: palette.ink600,
    marginTop: 6,
    lineHeight: 20,
  },
  exploreSupportBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
  },
  exploreSupportBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  providerAvatar: { width: 40, height: 40, borderRadius: 20, flexShrink: 0 },
  providerAvatarFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  dayTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  dayMeta: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
    marginTop: 2,
  },
  fulfilmentLink: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.ink700,
  },
});
