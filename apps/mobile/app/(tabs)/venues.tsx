import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';

interface Gym {
  id: string;
  name: string;
  location: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  type: string | null;
  rating: number | null;
  image_url: string | null;
}

export default function VenuesScreen() {
  const router = useRouter();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [filteredGyms, setFilteredGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dynamic filters
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<string | null>(null);
  
  const [isTypeModalVisible, setIsTypeModalVisible] = useState(false);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  useEffect(() => {
    loadGyms();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [gyms, searchQuery, activeType, activeLocation]);

  const loadGyms = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      setGyms(data || []);
      
      // Extract unique types and locations
      const types = Array.from(new Set(data?.map(g => g.type).filter(Boolean))) as string[];
      const locations = Array.from(new Set(data?.map(g => g.location).filter(Boolean))) as string[];
      
      setAvailableTypes(types);
      setAvailableLocations(locations);
      
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...gyms];

    if (searchQuery) {
      filtered = filtered.filter(gym =>
        gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gym.location.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (activeType) {
      filtered = filtered.filter(gym => gym.type === activeType);
    }

    if (activeLocation) {
      filtered = filtered.filter(gym => gym.location === activeLocation);
    }

    setFilteredGyms(filtered);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={palette.blue500} />
        <ThemedText style={styles.loadingText}>Loading venues...</ThemedText>
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
          <ThemedText type="title" style={styles.headerTitle}>Discover Venues</ThemedText>
        </View>
        <ThemedText style={styles.subtitle}>
          Find the perfect venue for your wellness journey.
        </ThemedText>
      </View>

      {/* Search Bar */}
      <View style={styles.searchTriggerWrap}>
        <SearchTrigger placeholder="Search venues or locations..." onPress={() => setSearchVisible(true)} />
      </View>

      {/* Filters Row */}
      <View style={styles.filtersWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filtersContent}
        >
          {/* Type Filter */}
          <TouchableOpacity 
            style={[styles.filterChip, activeType && styles.filterChipActive]}
            onPress={() => setIsTypeModalVisible(true)}
          >
            <ThemedText style={[styles.filterText, activeType && styles.filterTextActive]}>
              {activeType || "All Types"}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeType ? palette.white : palette.gray450} />
          </TouchableOpacity>

          {/* Location Filter */}
          <TouchableOpacity 
            style={[styles.filterChip, activeLocation && styles.filterChipActive]}
            onPress={() => setIsLocationModalVisible(true)}
          >
            <ThemedText style={[styles.filterText, activeLocation && styles.filterTextActive]}>
              {activeLocation || "All Locations"}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeLocation ? palette.white : palette.gray450} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Modals */}
      <FilterModal 
        visible={isTypeModalVisible} 
        title="Select Type" 
        data={availableTypes} 
        activeValue={activeType} 
        onSelect={setActiveType} 
        onClose={() => setIsTypeModalVisible(false)} 
      />
      <FilterModal
        visible={isLocationModalVisible}
        title="Select Location"
        data={availableLocations}
        activeValue={activeLocation}
        onSelect={setActiveLocation}
        onClose={() => setIsLocationModalVisible(false)}
      />

      <SearchModal
        visible={searchVisible}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => setSearchVisible(false)}
        placeholder="Search venues or locations..."
      >
        {filteredGyms.map(gym => (
          <SearchResultRow
            key={gym.id}
            image={gym.image_url}
            fallbackIcon="business"
            fallbackBg={palette.blue500}
            name={gym.name}
            subtitle={gym.location}
            onPress={() => { setSearchVisible(false); router.push({ pathname: '/gym-details', params: { gymId: gym.id } }); }}
          />
        ))}
        {searchQuery.trim().length > 0 && filteredGyms.length === 0 && <SearchEmpty query={searchQuery} />}
      </SearchModal>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Results Count */}
        <ThemedText style={styles.resultsText}>
          {filteredGyms.length} {filteredGyms.length === 1 ? 'venue' : 'venues'} available
        </ThemedText>

        {/* Venues List */}
        <View style={styles.listContainer}>
          {filteredGyms.map((gym) => (
            <TouchableOpacity
              key={gym.id}
              style={styles.listItem}
              onPress={() => router.push({
                pathname: '/gym-details',
                params: { gymId: gym.id }
              })}
            >
              {gym.image_url ? (
                <Image source={{ uri: gym.image_url }} style={styles.listImage} />
              ) : (
                <View style={[styles.listImage, styles.listImagePlaceholder]}>
                  <Ionicons name="business-outline" size={28} color={palette.blue500} />
                </View>
              )}

              <View style={styles.listInfo}>
                <View style={styles.nameRow}>
                  <ThemedText style={styles.gymName} numberOfLines={1}>{gym.name}</ThemedText>
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={11} color={palette.warning500} />
                    <ThemedText style={styles.ratingText}>
                      {gym.rating ? gym.rating.toFixed(1) : 'N/A'}
                    </ThemedText>
                  </View>
                </View>

                {gym.type && (
                  <ThemedText style={styles.gymType}>{gym.type}</ThemedText>
                )}

                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={13} color={palette.gray450} />
                  <ThemedText style={styles.gymLocation} numberOfLines={1}>{gym.location}</ThemedText>
                </View>

                {gym.description && (
                  <ThemedText style={styles.gymDescription} numberOfLines={2}>{gym.description}</ThemedText>
                )}
              </View>

              <Ionicons name="chevron-forward" size={16} color={palette.gray200} />
            </TouchableOpacity>
          ))}
        </View>

        {filteredGyms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color={palette.gray200} />
            <ThemedText style={styles.emptyText}>No venues found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Try adjusting your filters or search query
            </ThemedText>
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => {
                setSearchQuery('');
                setActiveType(null);
                setActiveLocation(null);
              }}
            >
              <ThemedText style={styles.resetButtonText}>Reset All Filters</ThemedText>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Helper Component for Modals
function FilterModal({ visible, title, data, activeValue, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>{title}</ThemedText>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={palette.ink900} /></TouchableOpacity>
          </View>
          <FlatList
            data={["All", ...data]}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.modalItem}
                onPress={() => {
                  onSelect(item === "All" ? null : item);
                  onClose();
                }}
              >
                <ThemedText style={[styles.modalItemText, (item === (activeValue || "All")) && styles.modalItemTextActive]}>
                  {item}
                </ThemedText>
                {(item === (activeValue || "All")) && <Ionicons name="checkmark" size={20} color={palette.blue500} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: fontSize.lg,
    color: palette.gray450,
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: 'bold',
    color: palette.ink900,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    color: palette.gray450,
  },
  searchTriggerWrap: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  filtersWrapper: {
    marginBottom: 16,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.borderFaint,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: palette.ink900,
    borderColor: palette.ink900,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray450,
  },
  filterTextActive: {
    color: palette.white,
  },
  content: {
    flex: 1,
  },
  resultsText: {
    fontSize: fontSize.sm,
    color: palette.gray300,
    paddingHorizontal: 20,
    marginBottom: 12,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  listImage: {
    width: 80,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: palette.hairline,
  },
  listImagePlaceholder: {
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  gymName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink900,
    flex: 1,
    marginRight: 8,
  },
  gymType: {
    fontSize: fontSize.sm,
    color: palette.blue500,
    fontWeight: '600',
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gymLocation: {
    fontSize: fontSize.xs,
    color: palette.gray450,
  },
  gymDescription: {
    fontSize: fontSize.xs,
    color: palette.gray300,
    marginTop: 5,
    lineHeight: 17,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#92400e',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.gray300,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: fontSize.base,
    color: palette.gray300,
    marginTop: 8,
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: palette.blue500,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 24,
  },
  resetButtonText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceMuted,
  },
  modalItemText: {
    fontSize: fontSize.lg,
    color: palette.ink600,
  },
  modalItemTextActive: {
    color: palette.blue500,
    fontWeight: 'bold',
  },
});
