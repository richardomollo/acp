import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';

type PT = {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  bio: string | null;
  specialisations: string[];
  training_locations: string[];
  session_types: string[];
  service_areas: string[];
  years_of_experience: number | null;
  is_certified_verified: boolean;
  avg_rating: number | null;
  review_count: number;
  sessions_completed: number;
  min_price?: number | null;
};

const SPECIALISATION_FILTERS = [
  'All', 'Weight Loss', 'Strength Training', 'HIIT', 'Yoga', 'Pilates',
  'Boxing', 'CrossFit', 'Rehabilitation', 'Nutrition', 'Running', 'Functional Training',
];

export default function TrainersScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [trainers, setTrainers] = useState<PT[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState(
    filter && SPECIALISATION_FILTERS.includes(filter) ? filter : 'All',
  );

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: pts } = await supabase
      .from('personal_trainers')
      .select('id, full_name, professional_name, photo_url, bio, specialisations, training_locations, session_types, service_areas, years_of_experience, is_certified_verified')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (!pts) { setLoading(false); return; }

    // Fetch min price per PT from offerings
    const ptIds = pts.map(p => p.id);
    const { data: offerings } = await supabase
      .from('pt_offerings')
      .select('pt_id, price_kes')
      .in('pt_id', ptIds)
      .eq('is_active', true)
      .eq('is_draft', false);

    // Fetch ratings
    const { data: reviews } = await supabase
      .from('pt_reviews')
      .select('pt_id, rating')
      .in('pt_id', ptIds);

    const enriched: PT[] = pts.map(pt => {
      const ptOfferings = offerings?.filter(o => o.pt_id === pt.id) || [];
      const ptReviews = reviews?.filter(r => r.pt_id === pt.id) || [];
      const prices = ptOfferings.map(o => o.price_kes).filter(Boolean) as number[];
      const avgRating = ptReviews.length
        ? ptReviews.reduce((s, r) => s + r.rating, 0) / ptReviews.length
        : null;
      return {
        ...pt,
        min_price: prices.length ? Math.min(...prices) : null,
        avg_rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        review_count: ptReviews.length,
        sessions_completed: 0,
      };
    });

    setTrainers(enriched);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = trainers;
    if (activeFilter !== 'All') {
      list = list.filter(pt => pt.specialisations.includes(activeFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(pt =>
        (pt.professional_name ?? pt.full_name).toLowerCase().includes(q) ||
        pt.specialisations.some(s => s.toLowerCase().includes(q)) ||
        pt.service_areas.some(a => a.toLowerCase().includes(q))
      );
    }
    return list;
  }, [trainers, activeFilter, search]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(tabs)/discover' as any)} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Personal Trainers</ThemedText>
        </View>
        <ThemedText style={styles.headerSub}>
          {loading ? '…' : `${filtered.length} trainer${filtered.length !== 1 ? 's' : ''} available`}
        </ThemedText>
      </View>

      {/* Search */}
      <View style={styles.searchTriggerWrap}>
        <SearchTrigger placeholder="Search by name, speciality, area…" onPress={() => setSearchVisible(true)} />
      </View>

      {/* Specialisation filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersRow}
      >
        {SPECIALISATION_FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <ThemedText style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
              {f}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={palette.blue500} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="body-outline" size={56} color={palette.borderFaint} />
          <ThemedText style={styles.emptyText}>No trainers found</ThemedText>
          <ThemedText style={styles.emptySubText}>Try a different filter or search</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.map(pt => (
            <TouchableOpacity
              key={pt.id}
              style={styles.card}
              onPress={() => router.push({ pathname: '/trainer-profile', params: { id: pt.id } })}
              activeOpacity={0.85}
            >
              {/* Main row */}
              <View style={styles.cardRow}>
                {pt.photo_url ? (
                  <Image source={{ uri: pt.photo_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <ThemedText style={styles.avatarInitial}>
                      {(pt.professional_name ?? pt.full_name)[0].toUpperCase()}
                    </ThemedText>
                  </View>
                )}

                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <ThemedText style={styles.trainerName} numberOfLines={1}>
                      {pt.professional_name ?? pt.full_name}
                    </ThemedText>
                    {pt.is_certified_verified && (
                      <Ionicons name="checkmark-circle" size={15} color={palette.blue500} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  {pt.professional_name && (
                    <ThemedText style={styles.trainerSubName}>{pt.full_name}</ThemedText>
                  )}
                  <View style={styles.metaRow}>
                    {pt.avg_rating ? (
                      <View style={styles.ratingPill}>
                        <Ionicons name="star" size={11} color={palette.warning500} />
                        <ThemedText style={styles.ratingText}>
                          {pt.avg_rating} ({pt.review_count})
                        </ThemedText>
                      </View>
                    ) : null}
                    {pt.years_of_experience ? (
                      <ThemedText style={styles.metaText}>{pt.years_of_experience} yrs exp</ThemedText>
                    ) : null}
                  </View>
                  {pt.training_locations.length > 0 && (
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={13} color={palette.gray450} />
                      <ThemedText style={styles.metaText} numberOfLines={1}>
                        {pt.training_locations.slice(0, 3).join(' · ')}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {pt.min_price ? (
                  <View style={styles.priceCol}>
                    <ThemedText style={styles.kesValue}>
                      KES {pt.min_price.toLocaleString()}
                    </ThemedText>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
              </View>

              {/* Specialisation tags */}
              {pt.specialisations.length > 0 && (
                <View style={styles.tagsRow}>
                  {pt.specialisations.slice(0, 4).map(s => (
                    <View key={s} style={[styles.tag, activeFilter === s && styles.tagActive]}>
                      <ThemedText style={[styles.tagText, activeFilter === s && styles.tagTextActive]}>
                        {s}
                      </ThemedText>
                    </View>
                  ))}
                  {pt.specialisations.length > 4 && (
                    <ThemedText style={styles.tagMore}>+{pt.specialisations.length - 4}</ThemedText>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <SearchModal
        visible={searchVisible}
        query={search}
        onQueryChange={setSearch}
        onClose={() => setSearchVisible(false)}
        placeholder="Search by name, speciality, area…"
      >
        {filtered.map(pt => (
          <SearchResultRow
            key={pt.id}
            image={pt.photo_url}
            fallbackIcon="body"
            fallbackBg={palette.blue500}
            rounded
            name={pt.professional_name ?? pt.full_name}
            subtitle={pt.specialisations.slice(0, 2).join(' · ') || 'Personal Trainer'}
            onPress={() => { setSearchVisible(false); router.push({ pathname: '/trainer-profile', params: { id: pt.id } }); }}
          />
        ))}
        {search.trim().length > 0 && filtered.length === 0 && <SearchEmpty query={search} />}
      </SearchModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  backBtn: { position: 'absolute', left: 0, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerTitle: { fontSize: fontSize['3xl'], fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  headerSub: { fontSize: fontSize.base, color: palette.gray450, marginTop: 2 },
  searchTriggerWrap: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  filtersRow: { maxHeight: 44, marginBottom: 8 },
  filtersContent: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.borderFaint,
  },
  filterChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  filterText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  filterTextActive: { color: palette.white },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '600', color: palette.gray300 },
  emptySubText: { fontSize: fontSize.sm, color: palette.gray200, textAlign: 'center' },
  list: { paddingHorizontal: 20 },
  card: {
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  avatar: { width: 80, height: 80, borderRadius: radii.md },
  avatarFallback: {
    width: 80, height: 80, borderRadius: radii.md,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '800', color: palette.blue500 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  trainerName: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, flex: 1 },
  trainerSubName: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fffbeb', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  ratingText: { fontSize: fontSize.xs, fontWeight: '700', color: '#92400e' },
  metaText: { fontSize: fontSize.xs, color: palette.gray450 },
  priceCol: { alignItems: 'flex-end', minWidth: 70 },
  kesValue: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.md,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
  },
  tagActive: { backgroundColor: palette.blue50, borderColor: palette.blue100 },
  tagText: { fontSize: fontSize.xs, color: palette.gray450, fontWeight: '500' },
  tagTextActive: { color: palette.blue600 },
  tagMore: { fontSize: fontSize.xs, color: palette.gray300, alignSelf: 'center' },
});
