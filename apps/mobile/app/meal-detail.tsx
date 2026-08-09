import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Meal {
  id: string;
  name: string;
  category: string;
  description: string | null;
  image_url: string | null;
  ingredients: string[];
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  prep_time_minutes: number | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  tags: string[];
  cuisine: string;
}

const CATEGORY_ICON: Record<string, string> = {
  breakfast: '🍳', lunch: '🍲', dinner: '🍽️', snack: '🥜', smoothie: '🥤',
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: palette.success50, text: palette.success700 },
  intermediate: { bg: palette.warning50, text: palette.warning800 },
  advanced: { bg: palette.danger50, text: palette.danger600 },
};

export default function MealDetailScreen() {
  const router = useRouter();
  const { mealId } = useLocalSearchParams<{ mealId: string }>();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!mealId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('meals')
        .select('id, name, category, description, image_url, ingredients, calories, protein_g, carbs_g, fat_g, fibre_g, prep_time_minutes, difficulty, tags, cuisine')
        .eq('id', mealId)
        .single();
      if (active) { setMeal((data as Meal) ?? null); setLoading(false); }
    })();
    return () => { active = false; };
  }, [mealId]));

  if (loading || !meal) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  const diff = meal.difficulty ? DIFFICULTY_COLORS[meal.difficulty] : null;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.headerSafe}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>
        {meal.image_url ? (
          <Image source={{ uri: meal.image_url }} style={s.heroImage} resizeMode="cover" />
        ) : (
          <View style={[s.heroImage, s.heroFallback]}>
            <ThemedText style={{ fontSize: 56 }}>{CATEGORY_ICON[meal.category] ?? '🍽️'}</ThemedText>
          </View>
        )}

        <View style={s.content}>
          <ThemedText style={s.title}>{meal.name}</ThemedText>
          <View style={s.badgeRow}>
            <View style={s.cuisineBadge}>
              <ThemedText style={s.cuisineBadgeText}>{meal.cuisine}</ThemedText>
            </View>
            {diff && (
              <View style={[s.diffBadge, { backgroundColor: diff.bg }]}>
                <ThemedText style={[s.diffText, { color: diff.text }]}>
                  {meal.difficulty!.charAt(0).toUpperCase() + meal.difficulty!.slice(1)}
                </ThemedText>
              </View>
            )}
            {meal.prep_time_minutes != null && (
              <View style={s.prepBadge}>
                <Ionicons name="time-outline" size={12} color={palette.gray450} />
                <ThemedText style={s.prepBadgeText}>{meal.prep_time_minutes} min</ThemedText>
              </View>
            )}
          </View>

          {meal.description && <ThemedText style={s.description}>{meal.description}</ThemedText>}

          {/* Macros */}
          <View style={s.macroCard}>
            <View style={s.macroItem}>
              <ThemedText style={s.macroVal}>{meal.calories ?? '—'}</ThemedText>
              <ThemedText style={s.macroLabel}>kcal</ThemedText>
            </View>
            <View style={s.macroDivider} />
            <View style={s.macroItem}>
              <ThemedText style={s.macroVal}>{meal.protein_g ?? '—'}g</ThemedText>
              <ThemedText style={s.macroLabel}>Protein</ThemedText>
            </View>
            <View style={s.macroDivider} />
            <View style={s.macroItem}>
              <ThemedText style={s.macroVal}>{meal.carbs_g ?? '—'}g</ThemedText>
              <ThemedText style={s.macroLabel}>Carbs</ThemedText>
            </View>
            <View style={s.macroDivider} />
            <View style={s.macroItem}>
              <ThemedText style={s.macroVal}>{meal.fat_g ?? '—'}g</ThemedText>
              <ThemedText style={s.macroLabel}>Fat</ThemedText>
            </View>
            {meal.fibre_g != null && (
              <>
                <View style={s.macroDivider} />
                <View style={s.macroItem}>
                  <ThemedText style={s.macroVal}>{meal.fibre_g}g</ThemedText>
                  <ThemedText style={s.macroLabel}>Fibre</ThemedText>
                </View>
              </>
            )}
          </View>

          {meal.ingredients.length > 0 && (
            <>
              <ThemedText style={s.sectionTitle}>Ingredients</ThemedText>
              <View style={s.ingredientsWrap}>
                {meal.ingredients.map((ing, i) => (
                  <View key={i} style={s.ingredientRow}>
                    <View style={s.ingredientDot} />
                    <ThemedText style={s.ingredientText}>{ing}</ThemedText>
                  </View>
                ))}
              </View>
            </>
          )}

          {meal.tags.length > 0 && (
            <>
              <ThemedText style={s.sectionTitle}>Good For</ThemedText>
              <View style={s.tagsRow}>
                {meal.tags.map(tag => (
                  <View key={tag} style={s.tagChip}>
                    <ThemedText style={s.tagChipText}>{tag.replace(/_/g, ' ')}</ThemedText>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerSafe: { position: 'absolute', top: 0, left: 0, zIndex: 10, paddingHorizontal: 16, paddingTop: 8 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center',
  },

  heroImage: { width: '100%', height: 260 },
  heroFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900, marginBottom: 10 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  cuisineBadge: { backgroundColor: palette.blue25, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  cuisineBadgeText: { fontSize: 11.5, fontWeight: '700', color: palette.blue500 },
  diffBadge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  diffText: { fontSize: 11.5, fontWeight: '700' },
  prepBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  prepBadgeText: { fontSize: 11.5, fontWeight: '600', color: palette.gray450 },

  description: { fontSize: 14, color: palette.gray450, lineHeight: 20, marginBottom: 20 },

  macroCard: {
    flexDirection: 'row', backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    paddingVertical: 16, marginBottom: 24,
  },
  macroItem: { flex: 1, alignItems: 'center' },
  macroVal: { fontSize: 16, fontWeight: '800', color: palette.ink900 },
  macroLabel: { fontSize: 11, color: palette.gray300, marginTop: 2 },
  macroDivider: { width: 1, backgroundColor: palette.hairline },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  ingredientsWrap: { marginBottom: 24, gap: 10 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ingredientDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.blue500 },
  ingredientText: { fontSize: 14, color: palette.ink700 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  tagChip: { backgroundColor: palette.success50, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  tagChipText: { fontSize: 12, fontWeight: '600', color: palette.success700, textTransform: 'capitalize' },
});
