import {
  StyleSheet, View, ScrollView, FlatList, TouchableOpacity, TextInput, Image,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Meal {
  id: string;
  name: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'smoothie';
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  tags: string[];
}

const CATEGORY_TABS = [
  { key: 'all', label: 'All', icon: '🍽️' },
  { key: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { key: 'lunch', label: 'Lunch', icon: '🍲' },
  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
  { key: 'snack', label: 'Snacks', icon: '🥜' },
  { key: 'smoothie', label: 'Smoothies', icon: '🥤' },
] as const;

// Distinct tint per category so cards without a photo (i.e. all of them
// today) don't render as a wall of identical flat-grey tiles.
const CATEGORY_TINT: Record<string, string> = {
  breakfast: '#fff7ed', lunch: '#f0fdf4', dinner: '#eff6ff',
  snack: '#fef3c7', smoothie: '#fce7f3',
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: palette.success50, text: palette.success700 },
  intermediate: { bg: palette.warning50, text: palette.warning800 },
  advanced: { bg: palette.danger50, text: palette.danger600 },
};

function MealCard({ meal, onPress }: { meal: Meal; onPress: () => void }) {
  const diff = meal.difficulty ? DIFFICULTY_COLORS[meal.difficulty] : null;
  const tint = CATEGORY_TINT[meal.category] ?? palette.surfaceMuted;
  return (
    <TouchableOpacity style={s.cardShadowWrap} onPress={onPress} activeOpacity={0.88}>
      <View style={s.card}>
        {meal.image_url ? (
          <Image source={{ uri: meal.image_url }} style={s.cardImage} resizeMode="cover" />
        ) : (
          <View style={[s.cardImage, s.cardImageFallback, { backgroundColor: tint }]}>
            <ThemedText style={{ fontSize: 32 }}>
              {CATEGORY_TABS.find(c => c.key === meal.category)?.icon ?? '🍽️'}
            </ThemedText>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardTitleWrap}>
            <ThemedText style={s.cardTitle} numberOfLines={2}>{meal.name}</ThemedText>
          </View>
          <View style={s.cardMetaRow}>
            {meal.calories != null && <ThemedText style={s.cardMetaText}>{meal.calories} kcal</ThemedText>}
            {meal.protein_g != null && <ThemedText style={s.cardMetaText}>· {meal.protein_g}g protein</ThemedText>}
          </View>
          <View style={s.cardFooterRow}>
            {diff ? (
              <View style={[s.diffBadge, { backgroundColor: diff.bg }]}>
                <ThemedText style={[s.diffText, { color: diff.text }]}>
                  {meal.difficulty!.charAt(0).toUpperCase() + meal.difficulty!.slice(1)}
                </ThemedText>
              </View>
            ) : <View />}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MealLibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pickForSlot?: string; pickForDay?: string; returnTo?: string }>();
  const isPicking = !!params.pickForSlot;

  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('meals')
        .select('id, name, category, image_url, calories, protein_g, difficulty, tags')
        .order('name');
      if (active) { setMeals((data as Meal[]) ?? []); setLoading(false); }
    })();
    return () => { active = false; };
  }, []));

  const filtered = useMemo(() => {
    return meals.filter(m =>
      (category === 'all' || m.category === category) &&
      (!search.trim() || m.name.toLowerCase().includes(search.toLowerCase()) || m.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    );
  }, [meals, category, search]);

  const openMeal = (meal: Meal) => {
    if (isPicking) {
      router.replace({
        pathname: '/meal-plan-builder',
        params: { pickedMealId: meal.id, day: params.pickForDay, slot: params.pickForSlot, pickId: String(Date.now()) },
      } as any);
    } else {
      router.push({ pathname: '/meal-detail', params: { mealId: meal.id } } as any);
    }
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>{isPicking ? `Add ${params.pickForSlot}` : 'Meal Library'}</ThemedText>
            <ThemedText style={s.headerSub}>Kenyan-inspired meals</ThemedText>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.gray300} />
          <TextInput
            style={s.searchInput}
            placeholder="Search meals or tags…"
            placeholderTextColor={palette.gray300}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </SafeAreaView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRail} style={s.tabScroll}>
        {CATEGORY_TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tabChip, category === t.key && s.tabChipActive]}
            onPress={() => setCategory(t.key)}
            activeOpacity={0.75}
          >
            <ThemedText style={[s.tabChipText, category === t.key && s.tabChipTextActive]}>
              {t.icon} {t.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={meal => meal.id}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.gridRow}
          renderItem={({ item }) => (
            <View style={s.gridItem}>
              <MealCard meal={item} onPress={() => openMeal(item)} />
            </View>
          )}
          ListEmptyComponent={<ThemedText style={s.emptyText}>No meals match your search.</ThemedText>}
          ListFooterComponent={<View style={{ height: 40 }} />}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900, textTransform: 'capitalize' },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.pill,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink900 },

  tabScroll: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  tabRail: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border, height:35,
  },
  tabChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  tabChipText: { fontSize: 13, fontWeight: '600', color: palette.gray450 },
  tabChipTextActive: { color: '#fff' },

  grid: { paddingHorizontal: 14, paddingTop: 16, flexGrow: 1 },
  gridRow: { justifyContent: 'space-between' },
  gridItem: { width: '48%', marginBottom: 16 },
  emptyText: { fontSize: 14, color: palette.gray300, textAlign: 'center', width: '100%', marginTop: 40 },

  cardShadowWrap: {
    borderRadius: radii.xl, backgroundColor: palette.white, ...shadows.sm,
  },
  card: {
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    backgroundColor: palette.white, overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 110 },
  cardImageFallback: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 10, gap: 4 },
  // Fixed-height wrap so 1-line and 2-line titles take up the same vertical
  // space — otherwise cards in the same grid row visibly jump around.
  cardTitleWrap: { height: 34, justifyContent: 'flex-start' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: palette.ink900, lineHeight: 17 },
  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, minHeight: 15 },
  cardMetaText: { fontSize: 11, color: palette.gray450, fontWeight: '500' },
  cardFooterRow: { minHeight: 22, justifyContent: 'center' },
  diffBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  diffText: { fontSize: 10, fontWeight: '700' },
});
