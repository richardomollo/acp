import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  gyms: {
    name: string;
    location: string;
  } | null;
}

type FilterType = 'all' | 'today' | 'week' | 'available';

export default function ExploreScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [sessions, searchQuery, activeFilter]);

  const loadSessions = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
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

      if (error) throw error;

      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
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

    // Date/availability filters
    const today = new Date().toISOString().split('T')[0];
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    switch (activeFilter) {
      case 'today':
        filtered = filtered.filter(session => session.date === today);
        break;
      case 'week':
        filtered = filtered.filter(session => session.date >= today && session.date <= weekFromNow);
        break;
      case 'available':
        filtered = filtered.filter(session => session.spots_left > 0);
        break;
    }

    setFilteredSessions(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateString === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateString === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getStatusColor = (spotsLeft: number, maxCapacity: number) => {
    const percentageFull = ((maxCapacity - spotsLeft) / maxCapacity) * 100;
    
    if (spotsLeft === 0) return '#f44336';
    if (percentageFull >= 80) return '#ff9800';
    return '#4caf50';
  };

  const getStatusText = (spotsLeft: number) => {
    if (spotsLeft === 0) return 'Full';
    if (spotsLeft <= 3) return 'Almost Full';
    return `${spotsLeft} spots`;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
        <ThemedText style={{ marginTop: 16 }}>Loading classes...</ThemedText>
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
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
        >
          <ThemedText style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
            All Classes
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'today' && styles.filterChipActive]}
          onPress={() => setActiveFilter('today')}
        >
          <ThemedText style={[styles.filterText, activeFilter === 'today' && styles.filterTextActive]}>
            Today
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'week' && styles.filterChipActive]}
          onPress={() => setActiveFilter('week')}
        >
          <ThemedText style={[styles.filterText, activeFilter === 'week' && styles.filterTextActive]}>
            This Week
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'available' && styles.filterChipActive]}
          onPress={() => setActiveFilter('available')}
        >
          <ThemedText style={[styles.filterText, activeFilter === 'available' && styles.filterTextActive]}>
            Available
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      {/* Classes List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {filteredSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <ThemedText style={styles.emptyText}>No classes found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Try adjusting your filters or search
            </ThemedText>
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
            >
              <ThemedText style={styles.resetButtonText}>Reset Filters</ThemedText>
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
                      <Ionicons name="barbell-outline" size={40} color="#002fff" />
                    </View>
                  )}

                  {/* Credits Badge */}
                 

                  {/* Status Badge */}
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(session.spots_left, session.max_capacity) }
                  ]}>
                    <ThemedText style={styles.statusBadgeText}>
                      {getStatusText(session.spots_left)}
                    </ThemedText>
                  </View>
                </View>

                {/* Session Info */}
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleContainer}>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>
                        {session.name}
                      </ThemedText>
                      <ThemedText style={styles.classInstructorText} numberOfLines={1}>
                           {session.description}
                      </ThemedText>
                      {session.instructor && (
                        <View style={styles.instructorRow}>
                          <Ionicons name="person-outline" size={14} color="#666" />
                          <ThemedText style={styles.instructorText} numberOfLines={1}>
                            {session.instructor}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#ccc" />
                  </View>

                  <View style={styles.gymRow}>
                    <Ionicons name="location-outline" size={16} color="#666" />
                    <ThemedText style={styles.gymText} numberOfLines={1}>
                      {session.gyms?.name || 'Unknown Gym'}
                    </ThemedText>
                  </View>

                  <View style={styles.sessionMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={14} color="#666" />
                      <ThemedText style={styles.metaText}>
                        {formatDate(session.date)}
                      </ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={14} color="#666" />
                      <ThemedText style={styles.metaText}>
                        {session.time}
                      </ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="hourglass-outline" size={14} color="#666" />
                      <ThemedText style={styles.metaText}>
                        {session.duration_minutes}m
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.classSpotsLeft} numberOfLines={1}>
                      {session.credits_required} credits required to book
                  </ThemedText>
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
  classSpotsLeft: {
    fontSize: 13,
    color: '#00a63e',
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
  },
  classInstructorText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
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
    marginHorizontal: 10,
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
    padding: 16,
    fontSize: 16,
  },
  filtersContainer: {
    marginTop: 16,
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: 20,
    paddingRight: 20,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderRadius: 30,
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
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  filterTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    marginTop: 20,
  },
  sessionsList: {
    paddingHorizontal: 20,
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionImageContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
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
  creditsBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#002fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  creditsBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sessionInfo: {
    padding: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionTitleContainer: {
    flex: 1,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  instructorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instructorText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  gymText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  sessionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
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