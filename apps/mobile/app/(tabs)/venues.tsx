import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

const fallbackImage = 'https://via.placeholder.com/400x160?text=No+Image';

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
        <ActivityIndicator size="large" color="#002fff" />
        <ThemedText style={styles.loadingText}>Loading venues...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Discover Venues</ThemedText>
        <ThemedText style={styles.subtitle}>
          Find the perfect venue for your wellness journey.
        </ThemedText>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search venues or locations..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {(searchQuery.length > 0 || activeType || activeLocation) && (
          <TouchableOpacity onPress={() => {
            setSearchQuery('');
            setActiveType(null);
            setActiveLocation(null);
          }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
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
            <Ionicons name="chevron-down" size={14} color={activeType ? "#fff" : "#666"} />
          </TouchableOpacity>

          {/* Location Filter */}
          <TouchableOpacity 
            style={[styles.filterChip, activeLocation && styles.filterChipActive]}
            onPress={() => setIsLocationModalVisible(true)}
          >
            <ThemedText style={[styles.filterText, activeLocation && styles.filterTextActive]}>
              {activeLocation || "All Locations"}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={activeLocation ? "#fff" : "#666"} />
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
              <Image
                source={{ uri: gym.image_url || fallbackImage }}
                style={styles.listImage}
              />

              <View style={styles.listInfo}>
                <View style={styles.nameRow}>
                  <ThemedText style={styles.gymName} numberOfLines={1}>{gym.name}</ThemedText>
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={12} color="#FFB800" />
                    <ThemedText style={styles.ratingText}>
                      {gym.rating ? gym.rating.toFixed(1) : 'N/A'}
                    </ThemedText>
                  </View>
                </View>
                
                {gym.type && (
                  <ThemedText style={styles.gymType}>{gym.type}</ThemedText>
                )}

                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#666" />
                  <ThemedText style={styles.gymLocation} numberOfLines={1}>{gym.location}</ThemedText>
                </View>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#CCC" />
            </TouchableOpacity>
          ))}
        </View>

        {filteredGyms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
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
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity>
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
                {(item === (activeValue || "All")) && <Ionicons name="checkmark" size={20} color="#002fff" />}
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
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
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
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  resultsText: {
    fontSize: 13,
    color: '#888',
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
    borderBottomColor: '#f0f0f0',
  },
  listImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  gymType: {
    fontSize: 13,
    color: '#002fff',
    fontWeight: '600',
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gymLocation: {
    fontSize: 13,
    color: '#666',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#002fff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 24,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333',
  },
  modalItemTextActive: {
    color: '#002fff',
    fontWeight: 'bold',
  },
});
