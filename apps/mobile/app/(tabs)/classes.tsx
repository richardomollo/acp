import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface Session {
  id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  spots_left: number;
  image_url: string | null;
  gym_id: string;
  category: string | null;
  gyms: {
    name: string;
    location: string;
  } | null;
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCategory = params.category as string;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dynamic categories from DB
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);

  // Generate the next 7 days for filters
  const dateFilters = useMemo(() => {
    const filters = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = date.getDate();
      const dateString = date.toISOString().split('T')[0];
      
      filters.push({
        label: i === 0 ? 'Today' : `${dayName}, ${dayNum}`,
        value: dateString
      });
    }
    return filters;
  }, []);

  const [activeDate, setActiveDate] = useState(dateFilters[0].value);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory || null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    applyFilters();
  }, [sessions, searchQuery, activeDate, activeCategory]);

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Load sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(`
          *,
          gyms (
            name,
            location
          )
        `)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);

      // 2. Extract unique categories
      const categories = Array.from(new Set(sessionsData?.map(s => s.category).filter(Boolean))) as string[];
      setAvailableCategories(categories);

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...sessions];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(session =>
        session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.instructor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.gyms?.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Date filter
    if (activeDate !== 'all') {
      filtered = filtered.filter(session => session.date === activeDate);
    }

    // Category filter
    if (activeCategory) {
      filtered = filtered.filter(session => 
        session.category?.toLowerCase() === activeCategory.toLowerCase()
      );
    }

    setFilteredSessions(filtered);
  };

  const getStatusColor = (spotsLeft: number, maxCapacity: number) => {
    const percentageFull = ((maxCapacity - spotsLeft) / maxCapacity) * 100;
    
    if (spotsLeft === 0) return '#f44336';
    if (percentageFull >= 80) return '#ff9800';
    return '#4caf50';
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
        <ThemedText style={styles.loadingText}>Loading sessions...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Explore Classes</ThemedText>
        <ThemedText style={styles.subtitle}>
          {filteredSessions.length} {filteredSessions.length === 1 ? 'class' : 'classes'} available
        </ThemedText>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search classes, instructors, or gyms..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {(searchQuery.length > 0 || activeCategory || activeDate !== dateFilters[0].value) && (
          <TouchableOpacity onPress={() => {
            setSearchQuery('');
            setActiveCategory(null);
            setActiveDate(dateFilters[0].value);
          }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Section */}
      <View style={styles.filtersWrapper}>
        {/* Date Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
          style={styles.filterRow}
        >
          {dateFilters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterChip,
                activeDate === filter.value && styles.filterChipActive
              ]}
              onPress={() => setActiveDate(filter.value)}
            >
              <ThemedText style={[
                styles.filterText,
                activeDate === filter.value && styles.filterTextActive
              ]}>
                {filter.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category Dropdown Trigger */}
        <View style={styles.dropdownWrapper}>
          <TouchableOpacity 
            style={styles.dropdownTrigger}
            onPress={() => setIsCategoryModalVisible(true)}
          >
            <View style={styles.dropdownContent}>
              <Ionicons name="apps-outline" size={18} color={activeCategory ? "#002fff" : "#666"} />
              <ThemedText style={[styles.dropdownText, activeCategory && styles.dropdownTextActive]}>
                {activeCategory || "All Categories"}
              </ThemedText>
            </View>
            <Ionicons name="chevron-down" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Selection Modal */}
      <Modal
        visible={isCategoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCategoryModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsCategoryModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Category</ThemedText>
              <TouchableOpacity onPress={() => setIsCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={["All Categories", ...availableCategories]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.modalItem}
                  onPress={() => {
                    setActiveCategory(item === "All Categories" ? null : item);
                    setIsCategoryModalVisible(false);
                  }}
                >
                  <ThemedText style={[
                    styles.modalItemText,
                    ((item === "All Categories" && !activeCategory) || item === activeCategory) && styles.modalItemTextActive
                  ]}>
                    {item}
                  </ThemedText>
                  {((item === "All Categories" && !activeCategory) || item === activeCategory) && (
                    <Ionicons name="checkmark" size={20} color="#002fff" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Classes List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {filteredSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <ThemedText style={styles.emptyText}>No classes found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Try adjusting your filters or search query
            </ThemedText>
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => {
                setSearchQuery('');
                setActiveDate(dateFilters[0].value);
                setActiveCategory(null);
              }}
            >
              <ThemedText style={styles.resetButtonText}>Reset All Filters</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.sessionsList}>
            {filteredSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push({
                  pathname: '/session-details',
                  params: { 
                    sessionId: session.id,
                    gymName: session.gyms?.name || 'Gym'
                  }
                })}
              >
                {/* Session Image */}
                <View style={styles.sessionImageContainer}>
                  {session.image_url ? (
                    <Image
                      source={{ uri: session.image_url }}
                      style={styles.sessionImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.sessionImagePlaceholder}>
                      <Ionicons name="barbell-outline" size={30} color="#002fff" />
                    </View>
                  )}
                </View>

                {/* Session Info */}
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleContainer}>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>
                        {session.name}
                      </ThemedText>
                      <ThemedText style={styles.gymText} numberOfLines={1}>
                        {session.gyms?.name || 'Unknown Gym'}
                      </ThemedText>
                    </View>
                    
                    {session.credits_required > 0 && (
                      <View style={styles.creditsContainer}>
                        <Ionicons name="flash" size={12} color="#002fff" />
                        <ThemedText style={styles.creditsText}>
                          {session.credits_required}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.sessionMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={12} color="#666" />
                      <ThemedText style={styles.metaText}>
                        {session.time} • {session.duration_minutes}m
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.sessionFooter}>
                    <View style={[
                      styles.statusIndicator,
                      { backgroundColor: getStatusColor(session.spots_left, session.max_capacity) }
                    ]} />
                    <ThemedText style={styles.classSpotsLeft}>
                      {session.spots_left > 0 ? `${session.spots_left} spots left` : 'Fully booked'}
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
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
    paddingBottom: 20,
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#000000',
    opacity: 0.9,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  filtersWrapper: {
    marginTop: 16,
    gap: 12,
  },
  filterRow: {
    maxHeight: 44,
  },
  filtersContent: {
    paddingHorizontal: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  filterChipActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  dropdownWrapper: {
    paddingHorizontal: 20,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dropdownContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  dropdownTextActive: {
    color: '#002fff',
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
  content: {
    flex: 1,
    marginTop: 10,
  },
  sessionsList: {
    paddingHorizontal: 20,
  },
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sessionImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sessionImage: {
    width: '100%',
    height: '100%',
  },
  sessionImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sessionTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  gymText: {
    fontSize: 13,
    color: '#666',
  },
  creditsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef0ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creditsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#002fff',
    marginLeft: 2,
  },
  sessionMeta: {
    marginVertical: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  classSpotsLeft: {
    fontSize: 12,
    color: '#666',
    flex: 1,
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
});
