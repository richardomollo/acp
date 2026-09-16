// Lana Nutrition — Recipes V1. Browse + search, sourced ONLY from the
// canonical food_recipes/foods catalogue (§3/§6) — never legacy `meals`.
import {
  StyleSheet, View, ScrollView, FlatList, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { recipeService, type RecipeSummary } from '@/services/recipe-service';
import { formatNutrientAmount } from '@/lib/nutrition/nutrient-display';

type CuisineFilter = 'all' | 'kenyan';

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Deep-linked from meal-detail.tsx's "verified recipes available" card
  // when more than one KFCT variant matches — pre-fills, never auto-picks.
  const [search, setSearch] = useState(params.search ? String(params.search) : '');
  const [cuisine, setCuisine] = useState<CuisineFilter>('all');

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true); setError(false);
      try {
        const rows = await recipeService.listRecipes();
        if (active) setRecipes(rows);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  // §6 — deterministic, client-side over the already-loaded eligible set
  // (mirrors meal-library.tsx's own filter pattern); the service call
  // itself already excludes inactive/superseded/incomplete recipes.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter(r =>
      (cuisine === 'all' || (cuisine === 'kenyan' && r.cuisineBadge === 'Kenyan')) &&
      (!q || r.name.toLowerCase().includes(q)),
    );
  }, [recipes, search, cuisine]);

  const openRecipe = (r: RecipeSummary) => {
    router.push({ pathname: '/recipe-detail', params: { foodId: r.foodId } } as any);
  };

  return (
    <View style={s.root}>
      {/* Same soft blue top wash as Today/meal-detail — one nutrition product, not a separate look. */}
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={s.topFadeBg}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.title}>Recipes</ThemedText>
      </SafeAreaView>

      <View style={s.searchBar}>
        <Ionicons name="search" size={16} color={palette.gray300} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search recipes"
          placeholderTextColor={palette.gray300}
          accessibilityLabel="Search recipes"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {(['all', 'kenyan'] as CuisineFilter[]).map(c => (
          <TouchableOpacity key={c} style={[s.filterChip, cuisine === c && s.filterChipOn]} onPress={() => setCuisine(c)}>
            <ThemedText style={[s.filterChipText, cuisine === c && s.filterChipTextOn]}>
              {c === 'all' ? 'All' : 'Kenyan'}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={palette.blue500} /></View>
      ) : error ? (
        <View style={s.center}><ThemedText style={s.emptyText}>Couldn&apos;t load recipes. Pull to refresh.</ThemedText></View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <ThemedText style={s.emptyText}>
            {search.trim() ? `No recipes match "${search.trim()}".` : 'No recipes available yet.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={r => r.recipeId}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => openRecipe(item)} activeOpacity={0.85}>
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <ThemedText style={s.cardName} numberOfLines={2}>{item.name}</ThemedText>
                  {item.cuisineBadge && (
                    <View style={s.badge}><ThemedText style={s.badgeText}>{item.cuisineBadge}</ThemedText></View>
                  )}
                </View>
                <ThemedText style={s.cardMeta}>
                  {item.energyKcalPer100g != null ? `${formatNutrientAmount(item.energyKcalPer100g, 'kcal')} kcal` : 'kcal n/a'}
                  {' · '}
                  {item.proteinGPer100g != null ? `${formatNutrientAmount(item.proteinGPer100g, 'g')}g protein` : 'protein n/a'}
                  {' · per 100g'}
                </ThemedText>
                <View style={s.verifiedRow}>
                  <Ionicons name="checkmark-circle" size={13} color={palette.success700 ?? '#15803d'} />
                  <ThemedText style={s.verifiedText}>Verified source</ThemedText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, backgroundColor: 'transparent',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '700', color: palette.ink900 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: palette.ink900 },
  filterRow: { marginTop: 12, flexGrow: 0 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: palette.hairline },
  filterChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  filterChipText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.ink700 },
  filterChipTextOn: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.lg, padding: 14, marginBottom: 10,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardName: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, textTransform: 'capitalize' },
  badge: { backgroundColor: palette.blue50, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700', color: palette.blue600 ?? palette.blue500 },
  cardMeta: { fontSize: fontSize.xs, color: palette.gray450, marginTop: 4 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  verifiedText: { fontSize: 10, color: palette.gray450, fontWeight: '600' },
});
