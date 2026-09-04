import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';
import { DateRail, buildDateRange } from '@/components/date-rail';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { MarketplaceGate, ExploringBanner } from '@/components/marketplace/marketplace-gate';

interface Experience {
  id: string; name: string; tagline: string | null;
  date: string; start_time: string; end_time: string | null;
  price_kes: number; discount_kes: number; spots_left: number; max_capacity: number;
  image_url: string | null; category: string | null;
  gyms: { name: string; location?: string } | null;
}

export default function ExperiencesScreen() {
  const router = useRouter();

  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [calSelected, setCalSelected] = useState(new Date().toISOString().split('T')[0]);
  const next21Days = useMemo(() => buildDateRange(21), []);

  // Beta #019 — experiences are marketplace supply; scope to nearby venues.
  // `venueScopeIds`: string[] → scope; null → kill switch off, fetch as before.
  const ml = useMarketplaceLocation();
  const scopeIds = ml.venueScopeIds;
  const scopeKey = scopeIds === null ? 'all' : scopeIds.join(',');

  useEffect(() => { ml.ensureResolved({ requestPermission: true }); }, [ml]);
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const loadData = async () => {
    if (scopeIds !== null && scopeIds.length === 0) {
      setExperiences([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('experiences')
      .select('id, name, tagline, date, start_time, end_time, price_kes, discount_kes, spots_left, max_capacity, image_url, category, gyms(name, location)')
      .eq('is_active', true)
      .gte('date', new Date().toISOString().split('T')[0]);
    if (scopeIds !== null) q = q.in('gym_id', scopeIds);
    const { data } = await q.order('date').order('start_time');
    if (data) {
      setExperiences(data as any);
      setCategories(Array.from(new Set(data.map((e: any) => e.category).filter(Boolean))));
    }
    setLoading(false);
  };

  const experienceDates = useMemo(() => new Set(experiences.map(e => e.date)), [experiences]);

  const experiencesMatchingFilters = useMemo(() => {
    let list = experiences;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.tagline?.toLowerCase().includes(q) ||
        e.gyms?.name.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      );
    }
    if (activeCategory) list = list.filter(e => e.category === activeCategory);
    return list;
  }, [experiences, searchQuery, activeCategory]);

  const exactDayExperiences = useMemo(
    () => experiencesMatchingFilters.filter(e => e.date === calSelected),
    [experiencesMatchingFilters, calSelected],
  );

  // Experiences are pre-sorted by date, so the first match after calSelected is the soonest;
  // fall back to the very first matching experience if none fall after the selected day.
  const nextAvailableExperienceDate = useMemo(() => {
    if (exactDayExperiences.length > 0) return null;
    return experiencesMatchingFilters.find(e => e.date > calSelected)?.date ?? experiencesMatchingFilters[0]?.date ?? null;
  }, [experiencesMatchingFilters, exactDayExperiences, calSelected]);

  const filtered = useMemo(() => {
    if (exactDayExperiences.length > 0) return exactDayExperiences;
    if (nextAvailableExperienceDate) return experiencesMatchingFilters.filter(e => e.date === nextAvailableExperienceDate);
    return [];
  }, [exactDayExperiences, nextAvailableExperienceDate, experiencesMatchingFilters]);

  const spotsColor = (left: number, max: number) => {
    if (left === 0) return '#f44336';
    if ((max - left) / max >= 0.8) return '#ff9800';
    return '#4caf50';
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={palette.blue500} />
        <ThemedText style={styles.loadingText}>Loading experiences...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(tabs)/discover' as any)} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Experiences</ThemedText>
        </View>
        <ThemedText style={styles.headerSub}>Retreats, hikes & wellness days</ThemedText>
      </View>

      {/* Search */}
      <View style={styles.searchTriggerWrap}>
        <SearchTrigger placeholder="Search experiences..." onPress={() => setSearchVisible(true)} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><ExploringBanner /></View>
        <MarketplaceGate supplyNoun="bookable experiences">
        {/* Date strip: next 21 days */}
        <DateRail
          days={next21Days}
          selected={calSelected}
          sessionDates={experienceDates}
          onSelect={setCalSelected}
        />

        {/* Filters */}
        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.filterChip, activeCategory && styles.filterChipActive]}
            onPress={() => setCategoryModalVisible(true)}
          >
            <Ionicons name="apps-outline" size={15} color={activeCategory ? palette.white : palette.gray450} />
            <ThemedText style={[styles.filterChipText, activeCategory && styles.filterChipTextActive]} numberOfLines={1}>
              {activeCategory || 'Category'}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeCategory ? palette.white : palette.gray300} />
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.resultsCount}>
          {nextAvailableExperienceDate
            ? `No experiences on this day — next available on ${nextAvailableExperienceDate}`
            : `${filtered.length} ${filtered.length === 1 ? 'experience' : 'experiences'} on ${calSelected}`}
        </ThemedText>

        {/* List */}
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles-outline" size={64} color={palette.gray200} />
            <ThemedText style={styles.emptyText}>No upcoming experiences</ThemedText>
            <ThemedText style={styles.emptySubtext}>Check back soon for new events</ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map(exp => (
              <TouchableOpacity
                key={exp.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/experience-details', params: { id: exp.id } } as any)}
              >
                <View style={styles.imageContainer}>
                  {exp.image_url ? (
                    <Image source={{ uri: exp.image_url }} style={styles.image} resizeMode="cover" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="sparkles-outline" size={28} color={palette.blue500} />
                    </View>
                  )}
                  {exp.spots_left <= 5 && exp.spots_left > 0 && (
                    <View style={styles.urgencyBadge}>
                      <ThemedText style={styles.urgencyText}>Only {exp.spots_left} left</ThemedText>
                    </View>
                  )}
                  {exp.spots_left === 0 && (
                    <View style={[styles.urgencyBadge, { backgroundColor: palette.danger500 }]}>
                      <ThemedText style={styles.urgencyText}>Sold out</ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.info}>
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <ThemedText style={styles.name} numberOfLines={1}>{exp.name}</ThemedText>
                      {exp.gyms?.name && (
                        <ThemedText style={styles.venue} numberOfLines={1}>{exp.gyms.name}</ThemedText>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {exp.discount_kes > 0 && (
                        <View style={styles.saveBadge}>
                          <ThemedText style={styles.saveBadgeText}>Save {exp.discount_kes.toLocaleString()}</ThemedText>
                        </View>
                      )}
                      {exp.discount_kes > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <ThemedText style={styles.priceStrike}>{exp.price_kes.toLocaleString()}</ThemedText>
                          <ThemedText style={styles.price}>KES {(exp.price_kes - exp.discount_kes).toLocaleString()}</ThemedText>
                        </View>
                      ) : (
                        <ThemedText style={styles.price}>KES {exp.price_kes.toLocaleString()}</ThemedText>
                      )}
                      <ThemedText style={styles.priceLabel}>per person</ThemedText>
                    </View>
                  </View>

                  {exp.tagline && (
                    <ThemedText style={styles.tagline} numberOfLines={2}>{exp.tagline}</ThemedText>
                  )}

                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={13} color={palette.gray450} />
                    <ThemedText style={styles.meta}>
                      {new Date(exp.date).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {'  '}·{'  '}{exp.start_time.slice(0, 5)}{exp.end_time ? `–${exp.end_time.slice(0, 5)}` : ''}
                    </ThemedText>
                  </View>

                  <View style={styles.footer}>
                    <View style={[styles.dot, { backgroundColor: spotsColor(exp.spots_left, exp.max_capacity) }]} />
                    <ThemedText style={styles.spots}>
                      {exp.spots_left > 0 ? `${exp.spots_left} spot${exp.spots_left !== 1 ? 's' : ''} left` : 'Fully booked'}
                    </ThemedText>
                    {exp.category && (
                      <View style={styles.catBadge}>
                        <ThemedText style={styles.catText}>{exp.category}</ThemedText>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        </MarketplaceGate>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Category picker modal */}
      <Modal visible={categoryModalVisible} transparent animationType="slide" onRequestClose={() => setCategoryModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Category</ThemedText>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Ionicons name="close" size={22} color={palette.ink900} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={['All', ...categories]}
              keyExtractor={i => i}
              renderItem={({ item }) => {
                const isActive = item === 'All' ? !activeCategory : item === activeCategory;
                return (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => { setActiveCategory(item === 'All' ? null : item); setCategoryModalVisible(false); }}
                  >
                    <ThemedText style={[styles.modalItemText, isActive && styles.modalItemActive]}>{item}</ThemedText>
                    {isActive && <Ionicons name="checkmark" size={18} color={palette.blue500} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <SearchModal
        visible={searchVisible}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => setSearchVisible(false)}
        placeholder="Search experiences..."
      >
        {experiencesMatchingFilters.map(exp => (
          <SearchResultRow
            key={exp.id}
            image={exp.image_url}
            fallbackIcon="sparkles"
            fallbackBg={palette.blue500}
            name={exp.name}
            subtitle={exp.gyms?.name ?? exp.category ?? 'Experience'}
            onPress={() => { setSearchVisible(false); router.push({ pathname: '/experience-details', params: { id: exp.id } } as any); }}
          />
        ))}
        {searchQuery.trim().length > 0 && experiencesMatchingFilters.length === 0 && <SearchEmpty query={searchQuery} />}
      </SearchModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  loadingText: { marginTop: 12, fontSize: fontSize.base, color: palette.gray300 },

  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  backBtn: { position: 'absolute', left: 0, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  headerSub: { fontSize: fontSize.base, color: palette.gray300, marginTop: 2 },

  searchTriggerWrap: {
    marginHorizontal: 20,
    marginBottom: 14,
  },

  filtersRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.borderFaint,
  },
  filterChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  filterChipText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  filterChipTextActive: { color: palette.white },

  resultsCount: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', marginBottom: 12, paddingHorizontal: 20 },

  list: { paddingHorizontal: 20 },

  card: {
    flexDirection: 'row', paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  imageContainer: { position: 'relative' },
  image: { width: 80, height: 80, borderRadius: radii.md },
  imagePlaceholder: {
    width: 80, height: 80, borderRadius: radii.md,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
  },
  urgencyBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: '#ff9800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.sm,
  },
  urgencyText: { fontSize: 10, fontWeight: '700', color: palette.white },

  info: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },
  venue: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },
  price: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },
  priceStrike: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300, textDecorationLine: 'line-through' },
  priceLabel: { fontSize: 10, color: palette.gray300 },
  saveBadge: { backgroundColor: palette.success700, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 2 },
  saveBadgeText: { fontSize: 9, fontWeight: '700', color: palette.white },

  tagline: { fontSize: fontSize.xs, color: palette.gray450, fontStyle: 'italic', marginTop: 4, lineHeight: 17 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  meta: { fontSize: fontSize.xs, color: palette.gray450 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  spots: { fontSize: fontSize.xs, color: palette.gray450, flex: 1 },
  catBadge: { backgroundColor: '#faf5ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.sm },
  catText: { fontSize: 10, fontWeight: '600', color: '#7c3aed' },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '600', color: palette.gray300, marginTop: 16 },
  emptySubtext: { fontSize: fontSize.sm, color: palette.gray200, marginTop: 6, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: palette.white, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], paddingBottom: 40, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: palette.borderFaint, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.surfaceMuted },
  modalItemText: { fontSize: fontSize.base, color: palette.ink600 },
  modalItemActive: { color: palette.blue500, fontWeight: '700' },
});
