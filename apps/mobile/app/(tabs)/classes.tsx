import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';
import { DateRail, buildDateRange } from '@/components/date-rail';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { MarketplaceGate, ExploringBanner } from '@/components/marketplace/marketplace-gate';

const NEIGHBOURHOODS = [
  { label: 'Kilimani / Kileleshwa / Lavington',     keywords: ['kilimani', 'kileleshwa', 'lavington'] },
  { label: 'Upper Hill / CBD / Hurlingham',          keywords: ['upper hill', 'cbd', 'hurlingham', 'central business'] },
  { label: 'Westlands / Parklands / Riverside',      keywords: ['westlands', 'parklands', 'riverside'] },
  { label: "Karen / Lang'ata",                        keywords: ['karen', "lang'ata", 'langata'] },
  { label: 'South B / South C / Nairobi West',       keywords: ['south b', 'south c', 'nairobi west'] },
  { label: 'Mbagathi / Madaraka',                    keywords: ['mbagathi', 'madaraka'] },
  { label: 'Roysambu / Githurai / Zimmerman',        keywords: ['roysambu', 'githurai', 'zimmerman'] },
  { label: 'Kasarani / Mwiki / Ruai',               keywords: ['kasarani', 'mwiki', 'ruai'] },
  { label: 'Eastleigh / Pangani / Ngara',            keywords: ['eastleigh', 'pangani', 'ngara'] },
  { label: 'Buruburu / Umoja / Donholm',             keywords: ['buruburu', 'umoja', 'donholm'] },
  { label: 'Ruaka / Ridgeways / Muthaiga',           keywords: ['ruaka', 'ridgeways', 'muthaiga'] },
];

interface PTResult {
  ptId: string; offeringId: string; trainerName: string;
  image_url: string | null; trainerPhotoUrl: string | null;
  offeringTitle: string; type: string; duration_minutes: number;
  price_kes: number | null;
}

interface Session {
  id: string; name: string; description: string | null;
  instructor: string | null; date: string; time: string;
  duration_minutes: number;
  drop_in_price?: number | null; max_capacity: number; spots_left: number;
  image_url: string | null; gym_id: string; category: string | null;
  gyms: { name: string; location: string; deposit_pct?: number | null } | null;
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCategory = params.category as string;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [allPtOfferings, setAllPtOfferings] = useState<PTResult[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory || null);
  const [isNeighbourhoodModalVisible, setIsNeighbourhoodModalVisible] = useState(false);
  const [activeNeighbourhood, setActiveNeighbourhood] = useState<string | null>(null);

  // Date strip state
  const today = new Date();
  const [calSelected, setCalSelected] = useState(today.toISOString().split('T')[0]);
  const next21Days = useMemo(() => buildDateRange(21), []);

  // Beta #019 — classes & PT offerings are marketplace supply; scope to venues
  // within the supported radius. `venueScopeIds`: string[] → scope; null →
  // kill switch off, fetch as pre-#019.
  const ml = useMarketplaceLocation();
  const scopeIds = ml.venueScopeIds;
  const scopeKey = scopeIds === null ? 'all' : scopeIds.join(',');

  useEffect(() => { ml.ensureResolved({ requestPermission: true }); }, [ml]);
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);
  useEffect(() => { if (initialCategory) setActiveCategory(initialCategory); }, [initialCategory]);


  const loadData = async () => {
    if (scopeIds !== null && scopeIds.length === 0) {
      setSessions([]);
      setAllPtOfferings([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const localPtIds = scopeIds !== null
        ? Array.from(new Set(
            (((await supabase.from('pt_venue_links').select('pt_id').in('gym_id', scopeIds)).data as any[]) ?? [])
              .map(l => l.pt_id),
          )).filter(Boolean)
        : [];

      let sessionsQ = supabase
        .from('sessions')
        .select('*, gyms(name, location, deposit_pct)')
        .eq('is_active', true)
        .gte('date', new Date().toISOString().split('T')[0]);
      if (scopeIds !== null) sessionsQ = sessionsQ.in('gym_id', scopeIds);

      let offeringsQ = supabase
        .from('pt_offerings')
        .select('id, title, type, duration_minutes, price_kes, image_url, gym_id, personal_trainers!inner(id, full_name, professional_name, photo_url, status)')
        .eq('personal_trainers.status', 'approved')
        .eq('is_active', true).eq('is_draft', false);
      if (scopeIds !== null) {
        // in-person offerings at a nearby venue, OR the trainer works a nearby
        // venue, OR the offering is online (location-independent).
        offeringsQ = offeringsQ.or(
          `type.eq.online,gym_id.in.(${scopeIds.join(',')})` +
          (localPtIds.length > 0 ? `,pt_id.in.(${localPtIds.join(',')})` : ''),
        );
      }

      const [{ data, error }, { data: ptData }] = await Promise.all([
        sessionsQ.order('date', { ascending: true }).order('time', { ascending: true }),
        offeringsQ.order('created_at', { ascending: false }),
      ]);
      if (error) throw error;
      setSessions(data || []);
      setAvailableCategories(Array.from(new Set(data?.map((s: any) => s.category).filter(Boolean))) as string[]);
      if (ptData) {
        setAllPtOfferings(ptData.map((o: any) => ({
          ptId: o.personal_trainers.id,
          offeringId: o.id,
          trainerName: o.personal_trainers.professional_name ?? o.personal_trainers.full_name,
          image_url: o.image_url ?? null,
          trainerPhotoUrl: o.personal_trainers.photo_url ?? null,
          offeringTitle: o.title,
          type: o.type,
          duration_minutes: o.duration_minutes,
          price_kes: o.price_kes,
        })));
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const sessionDates = useMemo(() => new Set(sessions.map(s => s.date)), [sessions]);

  const sessionsMatchingFilters = useMemo(() => {
    let list = sessions;
    if (searchQuery) list = list.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.instructor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.gyms?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (activeCategory) list = list.filter(s => s.category?.toLowerCase() === activeCategory.toLowerCase());
    if (activeNeighbourhood) {
      const nb = NEIGHBOURHOODS.find(n => n.label === activeNeighbourhood);
      if (nb) list = list.filter(s => {
        const loc = (s.gyms?.location ?? '').toLowerCase();
        return nb.keywords.some(k => loc.includes(k));
      });
    }
    return list;
  }, [sessions, searchQuery, activeCategory, activeNeighbourhood]);

  const exactDaySessions = useMemo(
    () => sessionsMatchingFilters.filter(s => s.date === calSelected),
    [sessionsMatchingFilters, calSelected],
  );

  // Sessions are pre-sorted by date, so the first match after calSelected is the soonest;
  // fall back to the very first matching session if none fall after the selected day.
  const nextAvailableSessionDate = useMemo(() => {
    if (exactDaySessions.length > 0) return null;
    return sessionsMatchingFilters.find(s => s.date > calSelected)?.date ?? sessionsMatchingFilters[0]?.date ?? null;
  }, [sessionsMatchingFilters, exactDaySessions, calSelected]);

  const filteredSessions = useMemo(() => {
    if (exactDaySessions.length > 0) return exactDaySessions;
    if (nextAvailableSessionDate) return sessionsMatchingFilters.filter(s => s.date === nextAvailableSessionDate);
    return [];
  }, [exactDaySessions, nextAvailableSessionDate, sessionsMatchingFilters]);

  const searchResults = useMemo(() => {
    let list = sessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.instructor?.toLowerCase().includes(q) ||
        s.gyms?.name.toLowerCase().includes(q)
      );
    }
    if (activeCategory) list = list.filter(s => s.category?.toLowerCase() === activeCategory.toLowerCase());
    if (activeNeighbourhood) {
      const nb = NEIGHBOURHOODS.find(n => n.label === activeNeighbourhood);
      if (nb) list = list.filter(s => {
        const loc = (s.gyms?.location ?? '').toLowerCase();
        return nb.keywords.some(k => loc.includes(k));
      });
    }
    return list;
  }, [sessions, searchQuery, activeCategory, activeNeighbourhood]);

  const filteredPtOfferings = useMemo(() => {
    if (!searchQuery.trim()) return allPtOfferings;
    const q = searchQuery.toLowerCase();
    return allPtOfferings.filter(pt =>
      pt.offeringTitle.toLowerCase().includes(q) ||
      pt.trainerName.toLowerCase().includes(q) ||
      pt.type.toLowerCase().includes(q)
    );
  }, [allPtOfferings, searchQuery]);

  const getStatusColor = (left: number, max: number) => {
    if (left === 0) return palette.danger500;
    if ((max - left) / max >= 0.8) return '#ff9800';
    return palette.success700;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={palette.blue500} />
        <ThemedText style={styles.loadingText}>Loading sessions...</ThemedText>
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
          <ThemedText type="title" style={styles.headerTitle}>Explore Classes</ThemedText>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchTriggerWrap}>
        <SearchTrigger placeholder="Search classes, instructors, or gyms..." onPress={() => setSearchVisible(true)} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><ExploringBanner /></View>
        <MarketplaceGate supplyNoun="bookable classes or trainers">
        {/* Date strip: next 21 days */}
        <DateRail
          days={next21Days}
          selected={calSelected}
          sessionDates={sessionDates}
          onSelect={setCalSelected}
        />

        <View style={styles.calDivider} />

        {/* Filters row */}
        <View style={styles.filtersRow}>
          <TouchableOpacity style={[styles.filterChip, activeCategory && styles.filterChipActive]} onPress={() => setIsCategoryModalVisible(true)}>
            <Ionicons name="apps-outline" size={15} color={activeCategory ? palette.white : palette.gray450} />
            <ThemedText style={[styles.filterChipText, activeCategory && styles.filterChipTextActive]} numberOfLines={1}>
              {activeCategory || 'Category'}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeCategory ? palette.white : palette.gray300} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.filterChip, activeNeighbourhood && styles.filterChipActive]} onPress={() => setIsNeighbourhoodModalVisible(true)}>
            <Ionicons name="location-outline" size={15} color={activeNeighbourhood ? palette.white : palette.gray450} />
            <ThemedText style={[styles.filterChipText, activeNeighbourhood && styles.filterChipTextActive]} numberOfLines={1}>
              {activeNeighbourhood ? activeNeighbourhood.split('/')[0].trim() : 'Neighbourhood'}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeNeighbourhood ? palette.white : palette.gray300} />
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.resultsCount}>
          {nextAvailableSessionDate
            ? `No classes on this day — next available on ${nextAvailableSessionDate}`
            : `${filteredSessions.length} ${filteredSessions.length === 1 ? 'class' : 'classes'} on ${calSelected}`}
        </ThemedText>

        {/* Sessions list */}
        {filteredSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={palette.gray200} />
            <ThemedText style={styles.emptyText}>No upcoming classes</ThemedText>
            <ThemedText style={styles.emptySubtext}>Try a different category or check back soon</ThemedText>
          </View>
        ) : (
          <View style={styles.sessionsList}>
            {filteredSessions.map(session => (
              <TouchableOpacity
                key={session.id} style={styles.sessionCard}
                onPress={() => router.push({ pathname: '/session-details', params: { sessionId: session.id, gymName: session.gyms?.name || 'Gym' } })}
              >
                <View style={styles.sessionImageContainer}>
                  {session.image_url ? (
                    <Image source={{ uri: session.image_url }} style={styles.sessionImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.sessionImagePlaceholder}>
                      <Ionicons name="barbell-outline" size={28} color={palette.blue500} />
                    </View>
                  )}
                </View>
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleContainer}>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>{session.name}</ThemedText>
                      <ThemedText style={styles.gymText} numberOfLines={1}>{session.gyms?.name || 'Unknown Gym'}</ThemedText>
                    </View>
                    {(() => {
                      const total = Number(session.drop_in_price) || 0;
                      if (!total) {
                        return (
                          <View style={styles.creditsContainer}>
                            <ThemedText style={styles.creditsText}>Book for Free!</ThemedText>
                          </View>
                        );
                      }
                      const deposit = Math.round(total * (session.gyms?.deposit_pct ?? 30) / 100);
                      const remainder = total - deposit;
                      return (
                        <View style={styles.creditsContainer}>
                          <View style={styles.depositRow}>
                            <ThemedText style={styles.creditsText}>KES {deposit.toLocaleString()}</ThemedText>
                            <ThemedText style={styles.depositLabel}> dep.</ThemedText>
                          </View>
                          {remainder > 0 && <ThemedText style={styles.remainderText}>+{remainder.toLocaleString()} at venue</ThemedText>}
                        </View>
                      );
                    })()}
                  </View>
                  <View style={styles.sessionMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={palette.gray450} />
                      <ThemedText style={styles.metaText}>{session.time} • {session.duration_minutes}m</ThemedText>
                    </View>
                  </View>
                  <View style={styles.sessionFooter}>
                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(session.spots_left, session.max_capacity) }]} />
                    <ThemedText style={styles.classSpotsLeft}>
                      {session.spots_left > 0 ? `${session.spots_left} spots left` : 'Fully booked'}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* PT offerings */}
        {filteredPtOfferings.length > 0 && (
          <View style={styles.ptSection}>
            {filteredPtOfferings.map((pt: PTResult) => (
              <TouchableOpacity
                key={pt.offeringId} style={styles.sessionCard}
                onPress={() => router.push({ pathname: '/pt-session-details', params: { offeringId: pt.offeringId, ptId: pt.ptId } })}
              >
                <View style={styles.sessionImageContainer}>
                  {pt.image_url || pt.trainerPhotoUrl ? (
                    <Image source={{ uri: pt.image_url ?? pt.trainerPhotoUrl! }} style={styles.sessionImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.sessionImagePlaceholder}>
                      <Ionicons name="body-outline" size={28} color={palette.blue500} />
                    </View>
                  )}
                </View>
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleContainer}>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>{pt.offeringTitle}</ThemedText>
                      <ThemedText style={styles.gymText} numberOfLines={1}>With {pt.trainerName}</ThemedText>
                    </View>
                    <View style={styles.creditsContainer}>
                      <ThemedText style={styles.creditsText}>
                        {pt.price_kes ? `KES ${pt.price_kes.toLocaleString()}` : 'Book for Free!'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.sessionMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={palette.gray450} />
                      <ThemedText style={styles.metaText}>{pt.duration_minutes} min</ThemedText>
                    </View>
                  </View>
                  <View style={styles.sessionFooter}>
                    <ThemedText style={styles.classSpotsLeft}>{pt.type.split(',')[0].replace(/-/g, ' ')}</ThemedText>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.ptSeeAll} onPress={() => router.push('/(tabs)/trainers' as any)}>
              <ThemedText style={styles.ptSeeAllText}>See all personal trainers →</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        </MarketplaceGate>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Category Modal */}
      <Modal visible={isCategoryModalVisible} transparent animationType="fade" onRequestClose={() => setIsCategoryModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsCategoryModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Category</ThemedText>
              <TouchableOpacity onPress={() => setIsCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={palette.ink900} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={['All Categories', ...availableCategories]}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isActive = item === 'All Categories' ? !activeCategory : item === activeCategory;
                return (
                  <TouchableOpacity style={styles.modalItem} onPress={() => { setActiveCategory(item === 'All Categories' ? null : item); setIsCategoryModalVisible(false); }}>
                    <ThemedText style={[styles.modalItemText, isActive && styles.modalItemTextActive]}>{item}</ThemedText>
                    {isActive && <Ionicons name="checkmark" size={20} color={palette.blue500} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Neighbourhood Modal */}
      <Modal visible={isNeighbourhoodModalVisible} transparent animationType="fade" onRequestClose={() => setIsNeighbourhoodModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsNeighbourhoodModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Neighbourhood</ThemedText>
              <TouchableOpacity onPress={() => setIsNeighbourhoodModalVisible(false)}>
                <Ionicons name="close" size={24} color={palette.ink900} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={['All Neighbourhoods', ...NEIGHBOURHOODS.map(n => n.label)]}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isActive = item === 'All Neighbourhoods' ? !activeNeighbourhood : item === activeNeighbourhood;
                return (
                  <TouchableOpacity style={styles.modalItem} onPress={() => { setActiveNeighbourhood(item === 'All Neighbourhoods' ? null : item); setIsNeighbourhoodModalVisible(false); }}>
                    <ThemedText style={[styles.modalItemText, isActive && styles.modalItemTextActive]}>{item}</ThemedText>
                    {isActive && <Ionicons name="checkmark" size={20} color={palette.blue500} />}
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
        placeholder="Search classes, instructors, or gyms..."
      >
        {searchResults.length > 0 && (
          <ThemedText style={styles.searchSectionLabel}>Classes</ThemedText>
        )}
        {searchResults.map(session => (
          <SearchResultRow
            key={session.id}
            image={session.image_url}
            fallbackIcon="barbell"
            fallbackBg={palette.blue500}
            name={session.name}
            subtitle={session.gyms?.name ?? 'Unknown Gym'}
            onPress={() => { setSearchVisible(false); router.push({ pathname: '/session-details', params: { sessionId: session.id, gymName: session.gyms?.name || 'Gym' } }); }}
          />
        ))}
        {filteredPtOfferings.length > 0 && (
          <ThemedText style={styles.searchSectionLabel}>Personal Training</ThemedText>
        )}
        {filteredPtOfferings.map(pt => (
          <SearchResultRow
            key={pt.offeringId}
            image={pt.image_url}
            fallbackIcon="body"
            fallbackBg={palette.blue500}
            rounded
            name={pt.offeringTitle}
            subtitle={`With ${pt.trainerName}`}
            onPress={() => { setSearchVisible(false); router.push({ pathname: '/pt-session-details', params: { offeringId: pt.offeringId, ptId: pt.ptId } }); }}
          />
        ))}
        {searchQuery.trim().length > 0 && searchResults.length === 0 && filteredPtOfferings.length === 0 && (
          <SearchEmpty query={searchQuery} />
        )}
      </SearchModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: fontSize.lg, color: palette.gray450, fontWeight: '500' },

  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  backBtn: { position: 'absolute', left: 0, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerTitle: { fontSize: fontSize['3xl'], fontWeight: 'bold', color: palette.ink900, textAlign: 'center' },

  searchTriggerWrap: {
    marginHorizontal: 20,
    marginBottom: 4,
  },
  searchSectionLabel: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
  },

  calDivider: { height: 1, backgroundColor: palette.hairline, marginVertical: 16 },

  filtersRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  filterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: palette.surfaceMuted, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.borderFaint,
  },
  filterChipActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  filterChipText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  filterChipTextActive: { color: palette.white },

  resultsCount: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', paddingHorizontal: 20, marginBottom: 8 },

  sessionsList: { paddingHorizontal: 20 },
  sessionCard: { flexDirection: 'row', backgroundColor: palette.white, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  sessionImageContainer: { width: 80, height: 80, borderRadius: radii.md, overflow: 'hidden' },
  sessionImage: { width: '100%', height: '100%' },
  sessionImagePlaceholder: { width: '100%', height: '100%', backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center' },
  sessionInfo: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sessionTitleContainer: { flex: 1, marginRight: 8 },
  sessionName: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 2 },
  gymText: { fontSize: fontSize.sm, color: palette.gray450 },
  creditsContainer: { flexDirection: 'column', alignItems: 'flex-end' },
  creditsText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.ink700 },
  depositRow: { flexDirection: 'row', alignItems: 'baseline' },
  depositLabel: { fontSize: 10, color: palette.gray300, fontWeight: '500' },
  remainderText: { fontSize: 10, color: palette.gray300, marginTop: 1 },
  sessionMeta: { marginVertical: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: fontSize.xs, color: palette.gray450 },
  sessionFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  classSpotsLeft: { fontSize: fontSize.xs, color: palette.gray450, flex: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '600', color: palette.gray300, marginTop: 16 },
  emptySubtext: { fontSize: fontSize.base, color: palette.gray300, marginTop: 8, textAlign: 'center' },

  ptSection: { paddingHorizontal: 20, paddingTop: 8, marginTop: 8 },
  ptSeeAll: { paddingVertical: 12, alignItems: 'center' },
  ptSeeAllText: { fontSize: fontSize.sm, color: palette.blue500, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: palette.white, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], paddingBottom: 40, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  modalTitle: { fontSize: fontSize.lg, fontWeight: 'bold' },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: palette.surfaceMuted },
  modalItemText: { fontSize: fontSize.lg, color: palette.ink600 },
  modalItemTextActive: { color: palette.blue500, fontWeight: 'bold' },
});
