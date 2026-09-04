import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import { resolveGrams, computeLogSnapshot, PortionError } from '@/lib/nutrition/food-nutrition';
import { foodProvenanceDisclosure, foodProvenanceTag } from '@/lib/nutrition/food-provenance';
import { isNutritionCameraEnabled, isNutritionSavedMealsEnabled } from '@/lib/flags';
import type {
  CanonicalFood, FoodSearchResult, LogUnit, MealSlot,
} from '@/lib/nutrition/food-types';

const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snack' },
];

const CAMERA_ENABLED = isNutritionCameraEnabled();
const SAVED_MEALS_ENABLED = isNutritionSavedMealsEnabled();

export default function LogFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string }>();
  const [userId, setUserId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [recent, setRecent] = useState<{ foodId: string; displayName: string; brand: string | null }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [food, setFood] = useState<CanonicalFood | null>(null); // portion step when set
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState<LogUnit>('g');
  const [servingLabel, setServingLabel] = useState<string | null>(null);
  const [slot, setSlot] = useState<MealSlot | null>(
    (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(params.slot as MealSlot) ? (params.slot as MealSlot) : null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authService.getSession().then(s => {
      const uid = s?.user.id ?? null;
      setUserId(uid);
      if (uid) foodLogService.getRecentFoods(uid).then(setRecent).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); setSearchError(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        setResults(await foodLogService.searchFoods(q));
        setSearchError(false);
      } catch {
        setResults([]);
        setSearchError(true); // N1 §32 — clear retry state, never invented results
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const pickFood = useCallback(async (id: string) => {
    setSearching(true);
    try {
      const f = await foodLogService.getFood(id);
      if (!f) { Alert.alert('Not available', 'That food could not be loaded.'); return; }
      setFood(f);
      if (f.servings.length > 0) {
        setUnit('serving');
        setServingLabel(f.defaultServingLabel ?? f.servings[0].label);
        setQuantity('1');
      } else {
        setUnit('g');
        setServingLabel(null);
        setQuantity(String(f.defaultServingGrams ?? 100));
      }
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSearching(false);
    }
  }, []);

  // Live preview of the portion the user is about to log — same pure maths the service persists.
  let preview: { grams: number; kcal: number | null } | null = null;
  let portionError: string | null = null;
  if (food) {
    const qn = Number(quantity);
    try {
      const grams = resolveGrams(food, qn, unit, servingLabel);
      const snap = computeLogSnapshot(food, grams);
      preview = { grams, kcal: snap.energyKcal };
    } catch (e) {
      portionError = e instanceof PortionError ? e.message : 'Enter a valid amount.';
    }
  }

  const addFood = async () => {
    if (!userId || !food || !preview || saving) return;
    setSaving(true);
    try {
      await foodLogService.logFood(userId, {
        foodId: food.id,
        displayName: food.name,
        brand: food.brand,
        quantity: Number(quantity),
        unit,
        servingLabel: unit === 'serving' ? servingLabel : null,
        mealSlot: slot,
        captureMethod: 'search',
      });
      router.back();
    } catch {
      setSaving(false);
      Alert.alert('Could not log food', 'Please try again.'); // N1 §32 — no false success
    }
  };

  const unitOptions: LogUnit[] = food
    ? ['g', ...(food.densityGPerMl != null ? ['ml' as LogUnit] : []), ...(food.servings.length > 0 ? ['serving' as LogUnit] : [])]
    : ['g'];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => (food ? setFood(null) : router.back())}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>{food ? 'How much?' : 'Log food'}</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        {!food ? (
          <>
            <View style={s.searchWrap}>
              <Ionicons name="search" size={16} color={palette.gray300} />
              <TextInput
                style={s.searchInput}
                placeholder="Search a food — e.g. Greek yoghurt"
                placeholderTextColor={palette.gray300}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={16} color={palette.gray300} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.listPad}>
              {CAMERA_ENABLED && query.trim().length < 2 && (
                <View style={s.cameraRow}>
                  <TouchableOpacity
                    style={s.cameraBtn}
                    activeOpacity={0.8}
                    onPress={() => router.push({
                      pathname: '/photo-meal',
                      params: { source: 'camera', ...(slot ? { slot } : {}) },
                    })}
                  >
                    <Ionicons name="camera" size={16} color={palette.ink900} />
                    <ThemedText style={s.cameraBtnText}>Take a photo</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.cameraBtn}
                    activeOpacity={0.8}
                    onPress={() => router.push({
                      pathname: '/photo-meal',
                      params: { source: 'library', ...(slot ? { slot } : {}) },
                    })}
                  >
                    <Ionicons name="images-outline" size={16} color={palette.ink900} />
                    <ThemedText style={s.cameraBtnText}>Choose photo</ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {SAVED_MEALS_ENABLED && query.trim().length < 2 && (
                <TouchableOpacity
                  style={s.myMealsBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push('/my-meals')}
                >
                  <Ionicons name="albums-outline" size={16} color={palette.ink900} />
                  <ThemedText style={s.cameraBtnText}>My meals</ThemedText>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                </TouchableOpacity>
              )}

              {query.trim().length < 2 && (
                <TouchableOpacity
                  style={s.myMealsBtn}
                  activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/homemade-meal',
                    params: { ...(slot ? { slot } : {}) },
                  })}
                >
                  <Ionicons name="restaurant-outline" size={16} color={palette.ink900} />
                  <ThemedText style={s.cameraBtnText}>Log a homemade meal</ThemedText>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                </TouchableOpacity>
              )}

              {query.trim().length < 2 && recent.length > 0 && (
                <>
                  <ThemedText style={s.sectionLabel}>Recent</ThemedText>
                  {recent.map(r => (
                    <TouchableOpacity key={r.foodId} style={s.row} onPress={() => pickFood(r.foodId)} activeOpacity={0.7}>
                      <ThemedText style={s.rowName}>{r.displayName}</ThemedText>
                      <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {searching && <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue500} />}

              {!searching && searchError && (
                <View style={s.notice}>
                  <ThemedText style={s.noticeText}>Couldn&apos;t search right now.</ThemedText>
                  <TouchableOpacity onPress={() => setQuery(q => q + ' ')}>
                    <ThemedText style={s.noticeRetry}>Retry</ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
                <View style={s.noMatchCard}>
                  <ThemedText style={s.noMatchTitle}>No exact match for “{query.trim()}”.</ThemedText>
                  <ThemedText style={s.noMatchBody}>
                    If you cooked it yourself, log it as a homemade meal — build it from its
                    ingredients, or enter the numbers off a label.
                  </ThemedText>
                  <TouchableOpacity
                    style={s.noMatchBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push({
                      pathname: '/homemade-meal',
                      params: { name: query.trim(), ...(slot ? { slot } : {}) },
                    })}
                  >
                    <Ionicons name="restaurant-outline" size={16} color="#fff" />
                    <ThemedText style={s.noMatchBtnText}>Log a homemade meal</ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {!searching && results.map(r => (
                <TouchableOpacity key={r.id} style={s.row} onPress={() => pickFood(r.id)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.rowName}>{r.name}</ThemedText>
                    <ThemedText style={s.rowMeta}>
                      {r.brand ? `${r.brand} · ` : r.isGeneric ? 'Generic · ' : ''}
                      {r.energyKcalPer100g != null ? `${Math.round(r.energyKcalPer100g)} kcal / 100 g` : 'nutrition varies'}
                      {foodProvenanceTag(r.compositionMethod) ? ` · ${foodProvenanceTag(r.compositionMethod)}` : ''}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={s.portionPad} keyboardShouldPersistTaps="handled">
            <ThemedText style={s.foodName}>{food.name}</ThemedText>
            <ThemedText style={s.provenance}>
              {food.brand ? `${food.brand} · ` : ''}Source: {food.source}
            </ThemedText>
            {foodProvenanceDisclosure(food.compositionMethod, food.recipeSource) && (
              <ThemedText style={s.provenanceNote}>
                {foodProvenanceDisclosure(food.compositionMethod, food.recipeSource)}
              </ThemedText>
            )}

            <ThemedText style={s.fieldLabel}>Amount</ThemedText>
            <View style={s.amountRow}>
              <TextInput
                style={s.amountInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <View style={s.unitChips}>
                {unitOptions.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[s.unitChip, unit === u && s.unitChipOn]}
                    onPress={() => { setUnit(u); if (u === 'serving' && !servingLabel) setServingLabel(food.servings[0]?.label ?? null); }}
                  >
                    <ThemedText style={[s.unitChipText, unit === u && s.unitChipTextOn]}>{u}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {unit === 'serving' && food.servings.length > 0 && (
              <View style={s.servingWrap}>
                {food.servings.map(sv => (
                  <TouchableOpacity
                    key={sv.label}
                    style={[s.servingChip, servingLabel === sv.label && s.servingChipOn]}
                    onPress={() => setServingLabel(sv.label)}
                  >
                    <ThemedText style={[s.servingChipText, servingLabel === sv.label && s.servingChipTextOn]}>{sv.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ThemedText style={s.fieldLabel}>Meal</ThemedText>
            <View style={s.slotRow}>
              {SLOTS.map(sl => (
                <TouchableOpacity
                  key={sl.key}
                  style={[s.slotChip, slot === sl.key && s.slotChipOn]}
                  onPress={() => setSlot(sl.key === slot ? null : sl.key)}
                >
                  <ThemedText style={[s.slotChipText, slot === sl.key && s.slotChipTextOn]}>{sl.label}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.previewCard}>
              {portionError ? (
                <ThemedText style={s.previewError}>{portionError}</ThemedText>
              ) : preview ? (
                <ThemedText style={s.previewText}>
                  ≈ {Math.round(preview.grams)} g · {preview.kcal != null ? `${Math.round(preview.kcal)} kcal` : 'kcal unknown'}
                </ThemedText>
              ) : null}
            </View>

            <TouchableOpacity
              style={[s.addBtn, (!preview || saving) && s.addBtnDisabled]}
              onPress={addFood}
              disabled={!preview || saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={s.addBtnText}>Add food</ThemedText>}
            </TouchableOpacity>
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
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 14, marginBottom: 4,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: palette.ink900 },

  listPad: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  cameraRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  cameraBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 44, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
  },
  cameraBtnText: { fontSize: 13, fontWeight: '700', color: palette.ink900 },
  myMealsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 44, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 14, marginTop: 10, marginBottom: 4,
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  rowName: { fontSize: 14.5, fontWeight: '700', color: palette.ink900 },
  rowMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  emptyText: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', marginTop: 40 },
  noMatchCard: {
    marginTop: 32, padding: 16, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.surfaceMuted,
  },
  noMatchTitle: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  noMatchBody: { fontSize: 12.5, color: palette.gray450, lineHeight: 18, marginTop: 6 },
  noMatchBtn: {
    marginTop: 14, height: 46, borderRadius: radii.lg, backgroundColor: palette.ink900,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  noMatchBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  notice: { alignItems: 'center', marginTop: 40, gap: 8 },
  noticeText: { fontSize: 13.5, color: palette.gray450 },
  noticeRetry: { fontSize: 13.5, fontWeight: '700', color: palette.blue600 },

  portionPad: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },
  foodName: { fontSize: 20, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },
  provenance: { fontSize: 12, color: palette.gray450, marginTop: 4, marginBottom: 20 },
  provenanceNote: { fontSize: 11.5, color: palette.gray450, marginTop: -12, marginBottom: 20, lineHeight: 16, fontStyle: 'italic' },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountInput: {
    width: 90, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: 12, fontSize: 17, fontWeight: '700', color: palette.ink900,
  },
  unitChips: { flexDirection: 'row', gap: 6 },
  unitChip: { paddingHorizontal: 14, height: 46, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  unitChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  unitChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  unitChipTextOn: { color: '#fff' },
  servingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  servingChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  servingChipOn: { backgroundColor: palette.blue50, borderColor: palette.blue500 },
  servingChipText: { fontSize: 12.5, fontWeight: '600', color: palette.ink700 },
  servingChipTextOn: { color: palette.blue600 },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.hairline },
  slotChipOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  slotChipText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
  slotChipTextOn: { color: '#fff' },
  previewCard: { marginTop: 22, padding: 14, borderRadius: radii.lg, backgroundColor: palette.surfaceMuted, alignItems: 'center' },
  previewText: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  previewError: { fontSize: 13, color: palette.danger500 },
  addBtn: { marginTop: 20, height: 52, borderRadius: radii.xl, backgroundColor: palette.ink900, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
