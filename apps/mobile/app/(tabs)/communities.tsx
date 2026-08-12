import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';

interface CommunityRow {
  id: string; slug: string | null; name: string; category: string; location: string | null;
  logo_url: string | null; member_count: number;
}

const CATEGORIES = [
  { key: 'all',            label: 'All' },
  { key: 'running',        label: 'Running' },
  { key: 'walking',        label: 'Walking' },
  { key: 'cycling',        label: 'Cycling' },
  { key: 'strength',       label: 'Strength' },
  { key: 'boxing',         label: 'Boxing' },
  { key: 'yoga',           label: 'Yoga' },
  { key: 'pilates',        label: 'Pilates' },
  { key: 'hiking',         label: 'Hiking' },
  { key: 'dance',          label: 'Dance' },
  { key: 'outdoor_fitness', label: 'Outdoor Fitness' },
  { key: 'football',       label: 'Football' },
  { key: 'other',          label: 'Other' },
] as const;

export default function CommunitiesScreen() {
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CommunityRow[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    let q = supabase
      .from('communities')
      .select('id, slug, name, category, location, logo_url, member_count')
      .eq('review_status', 'approved').eq('is_active', true)
      .order('member_count', { ascending: false });
    if (cat !== 'all') q = q.eq('category', cat);
    const { data } = await q;
    setCommunities((data as CommunityRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(category); }, [category, load]);

  const runSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('communities')
      .select('id, slug, name, category, location, logo_url, member_count')
      .eq('review_status', 'approved').eq('is_active', true)
      .ilike('name', `%${q.trim()}%`)
      .limit(20);
    setSearchResults((data as CommunityRow[]) ?? []);
    setSearching(false);
  };

  const closeSearch = () => { setSearchVisible(false); setQuery(''); setSearchResults([]); };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/(tabs)/discover' as any)} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Communities</ThemedText>
          <ThemedText style={s.headerSub}>Find your people</ThemedText>
        </View>
      </SafeAreaView>

      <View style={s.searchWrap}>
        <SearchTrigger placeholder="Search communities..." onPress={() => setSearchVisible(true)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow} style={{ flexGrow: 0 }}>
        {CATEGORIES.map(c => (
          <TouchableOpacity
            key={c.key}
            style={[s.chip, category === c.key && s.chipActive]}
            onPress={() => setCategory(c.key)}
            activeOpacity={0.8}
          >
            <ThemedText style={[s.chipText, category === c.key && s.chipTextActive]}>{c.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {communities.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={32} color={palette.gray300} />
              <ThemedText style={s.emptyText}>No communities yet</ThemedText>
              <ThemedText style={s.emptySub}>Check back soon, or be the first to start one from the partner app.</ThemedText>
            </View>
          ) : (
            communities.map(c => (
              <TouchableOpacity
                key={c.id}
                style={s.card}
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.slug ?? c.id } } as any)}
              >
                {c.logo_url ? (
                  <Image source={{ uri: c.logo_url }} style={s.logo} />
                ) : (
                  <View style={s.logoFallback}><ThemedText style={s.logoFallbackText}>{c.name[0]}</ThemedText></View>
                )}
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.cardName} numberOfLines={1}>{c.name}</ThemedText>
                  <ThemedText style={s.cardMeta}>
                    {c.member_count} member{c.member_count === 1 ? '' : 's'}{c.location ? ` · ${c.location}` : ''}
                  </ThemedText>
                  <View style={s.categoryPill}>
                    <ThemedText style={s.categoryPillText}>{CATEGORIES.find(x => x.key === c.category)?.label ?? c.category}</ThemedText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <SearchModal visible={searchVisible} query={query} onQueryChange={(q) => { setQuery(q); runSearch(q); }} onClose={closeSearch} placeholder="Search communities...">
        {searching && <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue500} />}
        {!searching && query.trim().length >= 2 && searchResults.length === 0 && <SearchEmpty query={query} />}
        {searchResults.map(c => (
          <SearchResultRow
            key={c.id}
            image={c.logo_url}
            fallbackIcon="people"
            fallbackBg={palette.navy}
            name={c.name}
            subtitle={`${c.member_count} members${c.location ? ` · ${c.location}` : ''}`}
            rounded
            onPress={() => { closeSearch(); router.push({ pathname: '/community/[id]', params: { id: c.slug ?? c.id } } as any); }}
          />
        ))}
      </SearchModal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  searchWrap: { paddingHorizontal: 20, marginBottom: 12 },
  chipsRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 14 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
  },
  chipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  chipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingTop: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14, marginBottom: 12, ...shadows.sm,
  },
  logo: { width: 52, height: 52, borderRadius: 26 },
  logoFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 20, fontWeight: '800', color: palette.blue500 },
  cardName: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  cardMeta: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  categoryPill: { alignSelf: 'flex-start', backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  categoryPillText: { fontSize: 11, fontWeight: '600', color: palette.gray450 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  emptySub: { fontSize: 13, color: palette.gray300, textAlign: 'center' },
});
