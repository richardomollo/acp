import {
  StyleSheet, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';
import { foodLogService } from '@/services/food-log-service';
import { foodProvenanceTag } from '@/lib/nutrition/food-provenance';
import type { FoodSearchResult } from '@/lib/nutrition/food-types';

/**
 * Nutrition N6 — a full-screen canonical-food search overlay. The SAME
 * deterministic search N1 Log-food uses (debounced ilike name match, generic
 * first). No invented results: a search failure shows a retry, never a fake
 * match. Used to add / change a saved-meal component.
 */
export function FoodSearchPicker({
  title = 'Choose a food', initialQuery = '', onClose, onPick,
}: {
  title?: string;
  initialQuery?: string;
  onClose: () => void;
  onPick: (foodId: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); setError(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        setResults(await foodLogService.searchFoods(q));
        setError(false);
      } catch {
        setResults([]);
        setError(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>{title}</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

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
        {searching && <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue500} />}
        {!searching && error && (
          <ThemedText style={s.notice}>Couldn&apos;t search right now. Adjust the text to retry.</ThemedText>
        )}
        {!searching && !error && query.trim().length >= 2 && results.length === 0 && (
          <ThemedText style={s.empty}>No foods matched “{query.trim()}”.</ThemedText>
        )}
        {!searching && results.map(r => (
          <TouchableOpacity key={r.id} style={s.row} onPress={() => onPick(r.id)} activeOpacity={0.7}>
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.white },
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
  notice: { fontSize: 13, color: palette.gray450, textAlign: 'center', marginTop: 32 },
  empty: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  rowName: { fontSize: 14.5, fontWeight: '700', color: palette.ink900 },
  rowMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
});
