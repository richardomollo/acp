import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  FlatList,
  ScrollView,  // ← Added this
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Session {
  id: string;
  name: string;
  instructor: string | null;
  category: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  is_active: boolean;
  gym_id: string;
  gym_name: string;
  bookings_count: number;
}

export default function SessionsOverviewScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'today' | 'past'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    applyFilters();
  }, [sessions, searchQuery, selectedVenue]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get current partner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      // Get partner's gyms
      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id, gyms(id, name)')
        .eq('partner_id', partner.id);

      const gymsList = partnerGyms?.map(pg => ({
        id: (pg.gyms as any).id,
        name: (pg.gyms as any).name
      })) || [];

      setVenues(gymsList);

      const gymIds = gymsList.map(g => g.id);

      if (gymIds.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Load sessions based on filter
      let query = supabase
        .from('sessions')
        .select('*, gyms(name)')
        .in('gym_id', gymIds)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      const today = new Date().toISOString().split('T')[0];

      if (filter === 'upcoming') {
        query = query.gte('date', today);
      } else if (filter === 'today') {
        query = query.eq('date', today);
      } else if (filter === 'past') {
        query = query.lt('date', today);
      }

      const { data: sessionsData, error } = await query;

      if (error) throw error;

      // Get bookings count for each session
      const sessionsWithBookings = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const { count } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id);

          return {
            ...session,
            gym_name: (session.gyms as any)?.name || 'Unknown',
            bookings_count: count || 0,
          };
        })
      );

      setSessions(sessionsWithBookings);

    } catch (error: any) {
      console.error('Load sessions error:', error);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...sessions];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(session =>
        session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.instructor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.gym_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Venue filter
    if (selectedVenue !== 'all') {
      filtered = filtered.filter(session => session.gym_id === selectedVenue);
    }

    setFilteredSessions(filtered);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleActive = async (sessionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_active: !currentStatus })
        .eq('id', sessionId);

      if (error) throw error;

      loadData();
      Alert.alert('Success', `Session ${!currentStatus ? 'activated' : 'deactivated'}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update session');
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sessions')
                .delete()
                .eq('id', sessionId);

              if (error) throw error;
              loadData();
              Alert.alert('Success', 'Session deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const renderSession = ({ item }: { item: Session }) => {
    const fillPercentage = (item.bookings_count / item.max_capacity) * 100;

    return (
      <TouchableOpacity
        style={[styles.sessionCard, !item.is_active && styles.sessionCardInactive]}
        onPress={() => router.push(`/partner/session-details/${item.id}`)}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionTitleRow}>
            <ThemedText style={styles.sessionName}>{item.name}</ThemedText>
            {!item.is_active && (
              <View style={styles.inactiveBadge}>
                <ThemedText style={styles.inactiveBadgeText}>Inactive</ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.sessionVenue}>{item.gym_name}</ThemedText>
        </View>

        <View style={styles.sessionDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <ThemedText style={styles.detailText}>{formatDate(item.date)}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <ThemedText style={styles.detailText}>
              {formatTime(item.time)} ({item.duration_minutes} min)
            </ThemedText>
          </View>
          {item.instructor && (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={16} color="#666" />
              <ThemedText style={styles.detailText}>{item.instructor}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.sessionFooter}>
          <View style={styles.capacityInfo}>
            <ThemedText style={styles.capacityText}>
              {item.bookings_count} / {item.max_capacity}
            </ThemedText>
            <View style={styles.capacityBar}>
              <View 
                style={[
                  styles.capacityFill, 
                  { 
                    width: `${fillPercentage}%`,
                    backgroundColor: fillPercentage >= 100 ? '#ff3b30' : fillPercentage >= 80 ? '#ff9500' : '#00c853'
                  }
                ]} 
              />
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleToggleActive(item.id, item.is_active);
              }}
            >
              <Ionicons 
                name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} 
                size={24} 
                color="#002fff" 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteSession(item.id);
              }}
            >
              <Ionicons name="trash-outline" size={24} color="#ff3b30" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Sessions</ThemedText>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/partner/create-session-select-venue')}
        >
          <Ionicons name="add-circle" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search sessions..."
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
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
            onPress={() => setFilter('all')}
          >
            <ThemedText style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              All
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'today' && styles.filterChipActive]}
            onPress={() => setFilter('today')}
          >
            <ThemedText style={[styles.filterText, filter === 'today' && styles.filterTextActive]}>
              Today
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'upcoming' && styles.filterChipActive]}
            onPress={() => setFilter('upcoming')}
          >
            <ThemedText style={[styles.filterText, filter === 'upcoming' && styles.filterTextActive]}>
              Upcoming
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === 'past' && styles.filterChipActive]}
            onPress={() => setFilter('past')}
          >
            <ThemedText style={[styles.filterText, filter === 'past' && styles.filterTextActive]}>
              Past
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Venue Filter */}
      {venues.length > 1 && (
        <View style={styles.venueFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueScroll}>
            <TouchableOpacity
              style={[styles.venueChip, selectedVenue === 'all' && styles.venueChipActive]}
              onPress={() => setSelectedVenue('all')}
            >
              <ThemedText style={[styles.venueText, selectedVenue === 'all' && styles.venueTextActive]}>
                All Venues
              </ThemedText>
            </TouchableOpacity>
            {venues.map(venue => (
              <TouchableOpacity
                key={venue.id}
                style={[styles.venueChip, selectedVenue === venue.id && styles.venueChipActive]}
                onPress={() => setSelectedVenue(venue.id)}
              >
                <ThemedText style={[styles.venueText, selectedVenue === venue.id && styles.venueTextActive]}>
                  {venue.name}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Sessions List */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#002fff" />
        </View>
      ) : (
        <FlatList
          data={filteredSessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={80} color="#e0e0e0" />
              <ThemedText style={styles.emptyTitle}>
                {searchQuery ? 'No sessions found' : 'No sessions yet'}
              </ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                {searchQuery ? 'Try a different search' : 'Create your first session to get started'}
              </ThemedText>
              {!searchQuery && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/partner/create-session-select-venue')}
                >
                  <ThemedText style={styles.emptyButtonText}>Create Session</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  addButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
     marginBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  filtersContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
  },
  filterChipActive: {
    backgroundColor: '#000',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  venueFilterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  venueScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  venueChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  venueChipActive: {
    backgroundColor: '#f0f5ff',
    borderColor: '#000',
  },
  venueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  venueTextActive: {
    color: '#000',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sessionCardInactive: {
    opacity: 0.6,
  },
  sessionHeader: {
    marginBottom: 12,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  sessionVenue: {
    fontSize: 14,
    color: '#666',
  },
  inactiveBadge: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  sessionDetails: {
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  capacityInfo: {
    flex: 1,
    marginRight: 16,
  },
  capacityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  capacityBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});