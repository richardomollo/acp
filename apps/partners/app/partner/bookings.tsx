import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  FlatList,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Booking {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  session_id: string;
  session_name: string;
  session_date: string;
  session_time: string;
  gym_id: string;
  gym_name: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled';
  booking_date: string;
  created_at: string;
  credits_used: number;
}

interface Stats {
  total: number;
  pending: number;
  confirmed: number;
  checked_in: number;
  cancelled: number;
  today: number;
  upcoming: number;
}

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('upcoming');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'checked_in' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    confirmed: 0,
    checked_in: 0,
    cancelled: 0,
    today: 0,
    upcoming: 0,
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  useEffect(() => {
    applyFilters();
  }, [bookings, searchQuery, selectedVenue, statusFilter]);

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
        setBookings([]);
        setLoading(false);
        return;
      }

      // Load bookings based on filter
      let query = supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          session_id,
          status,
          booking_date,
          created_at,
          credits_used,
          users(name, email),
          sessions(
            id,
            name,
            date,
            time,
            gym_id,
            gyms(name)
          )
        `)
        .in('gym_id', gymIds)
        .order('booking_date', { ascending: false });

      const today = new Date().toISOString().split('T')[0];

      if (filter === 'today') {
        query = query.eq('booking_date', today);
      } else if (filter === 'upcoming') {
        query = query.gte('booking_date', today);
      } else if (filter === 'past') {
        query = query.lt('booking_date', today);
      }

      const { data: bookingsData, error } = await query;

      if (error) throw error;

      const formattedBookings = (bookingsData || []).map(b => ({
        id: b.id,
        user_id: b.user_id,
        user_name: (b.users as any)?.name || 'Unknown',
        user_email: (b.users as any)?.email || '',
        session_id: b.session_id,
        session_name: (b.sessions as any)?.name || 'Unknown Session',
        session_date: (b.sessions as any)?.date || '',
        session_time: (b.sessions as any)?.time || '',
        gym_id: (b.sessions as any)?.gym_id || '',
        gym_name: ((b.sessions as any)?.gyms as any)?.name || 'Unknown Gym',
        status: b.status as any,
        booking_date: b.booking_date,
        created_at: b.created_at,
        credits_used: b.credits_used || 1,
      }));

      setBookings(formattedBookings);

      // Calculate stats
      const newStats = {
        total: formattedBookings.length,
        pending: formattedBookings.filter(b => b.status === 'pending').length,
        confirmed: formattedBookings.filter(b => b.status === 'confirmed').length,
        checked_in: formattedBookings.filter(b => b.status === 'checked_in').length,
        cancelled: formattedBookings.filter(b => b.status === 'cancelled').length,
        today: formattedBookings.filter(b => b.booking_date === today).length,
        upcoming: formattedBookings.filter(b => b.booking_date >= today && b.status !== 'cancelled').length,
      };

      setStats(newStats);

    } catch (error: any) {
      console.error('Load bookings error:', error);
      Alert.alert('Error', 'Failed to load bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...bookings];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(booking =>
        booking.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        booking.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        booking.session_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        booking.gym_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Venue filter
    if (selectedVenue !== 'all') {
      filtered = filtered.filter(booking => booking.gym_id === selectedVenue);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => booking.status === statusFilter);
    }

    setFilteredBookings(filtered);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleConfirmBooking = async (bookingId: string, userName: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId);

      if (error) throw error;

      Alert.alert('Success', `${userName}'s booking confirmed`);
      loadData();

    } catch (error) {
      Alert.alert('Error', 'Failed to confirm booking');
    }
  };

  const handleCancelBooking = async (bookingId: string, userName: string) => {
    Alert.alert(
      'Cancel Booking',
      `Cancel ${userName}'s booking?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', bookingId);

              if (error) throw error;

              Alert.alert('Success', 'Booking cancelled');
              loadData();

            } catch (error) {
              Alert.alert('Error', 'Failed to cancel booking');
            }
          }
        }
      ]
    );
  };

  const handleCheckIn = async (bookingId: string, userName: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'checked_in' })
        .eq('id', bookingId);

      if (error) throw error;

      Alert.alert('Success', `${userName} checked in`);
      loadData();

    } catch (error) {
      Alert.alert('Error', 'Failed to check in');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked_in': return '#00c853';
      case 'confirmed': return '#002fff';
      case 'pending': return '#ff9500';
      case 'cancelled': return '#999';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return 'checkmark-circle';
      case 'confirmed': return 'checkmark';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const renderBooking = ({ item }: { item: Booking }) => {
  // Check if session is in the past
  const sessionDateTime = new Date(`${item.session_date}T${item.session_time}`);
  const isPast = sessionDateTime < new Date();

  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingHeader}>
        <View style={[
          styles.statusIcon,
          { backgroundColor: `${getStatusColor(item.status)}20` }
        ]}>
          <Ionicons 
            name={getStatusIcon(item.status) as any}
            size={24} 
            color={getStatusColor(item.status)} 
          />
        </View>

        <View style={styles.bookingInfo}>
          <ThemedText style={styles.userName}>{item.user_name}</ThemedText>
          <ThemedText style={styles.userEmail}>{item.user_email}</ThemedText>
        </View>

        <View style={[
          styles.statusBadge,
          { backgroundColor: getStatusColor(item.status) }
        ]}>
          <ThemedText style={styles.statusBadgeText}>
            {item.status}
          </ThemedText>
        </View>
      </View>

      <View style={styles.bookingDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="barbell-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>{item.session_name}</ThemedText>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="business-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>{item.gym_name}</ThemedText>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>
            {formatDate(item.session_date)} • {formatTime(item.session_time)}
          </ThemedText>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="card-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>
            {item.credits_used} credit{item.credits_used !== 1 ? 's' : ''}
          </ThemedText>
        </View>
      </View>

      {/* Actions - Only show for future sessions */}
      {!isPast && (
        <>
          {item.status === 'pending' && (
            <View style={styles.bookingActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={() => handleConfirmBooking(item.id, item.user_name)}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Confirm</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => handleCancelBooking(item.id, item.user_name)}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {item.status === 'confirmed' && (
            <View style={styles.bookingActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.checkInButton]}
                onPress={() => handleCheckIn(item.id, item.user_name)}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Check In</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => handleCancelBooking(item.id, item.user_name)}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Status Labels - Always show for completed/cancelled, or for past sessions */}
      {(item.status === 'checked_in' || (isPast && item.status === 'confirmed')) && (
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#00c853" />
          <ThemedText style={styles.completedText}>
            {item.status === 'checked_in' ? 'Checked In' : 'Completed'}
          </ThemedText>
        </View>
      )}

      {item.status === 'cancelled' && (
        <View style={styles.completedBadge}>
          <Ionicons name="close-circle" size={16} color="#999" />
          <ThemedText style={[styles.completedText, { color: '#999' }]}>Cancelled</ThemedText>
        </View>
      )}

      {/* No-show status for past sessions that were confirmed but not checked in */}
      {isPast && item.status === 'pending' && (
        <View style={styles.completedBadge}>
          <Ionicons name="alert-circle" size={16} color="#ff9500" />
          <ThemedText style={[styles.completedText, { color: '#ff9500' }]}>No Show</ThemedText>
        </View>
      )}
    </View>
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
        <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats.total}</ThemedText>
            <ThemedText style={styles.statLabel}>Total</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={[styles.statValue, { color: '#000000' }]}>{stats.pending}</ThemedText>
            <ThemedText style={styles.statLabel}>Pending</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={[styles.statValue, { color: '#000000' }]}>{stats.confirmed}</ThemedText>
            <ThemedText style={styles.statLabel}>Confirmed</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={[styles.statValue, { color: '#000000' }]}>{stats.checked_in}</ThemedText>
            <ThemedText style={styles.statLabel}>Checked In</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{stats.today}</ThemedText>
            <ThemedText style={styles.statLabel}>Today</ThemedText>
          </View>
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, or session..."
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

      {/* Date Filters */}
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

      {/* Status Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
            onPress={() => setStatusFilter('all')}
          >
            <ThemedText style={[styles.filterText, statusFilter === 'all' && styles.filterTextActive]}>
              All Status
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
            onPress={() => setStatusFilter('pending')}
          >
            <ThemedText style={[styles.filterText, statusFilter === 'pending' && styles.filterTextActive]}>
              Pending
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'confirmed' && styles.filterChipActive]}
            onPress={() => setStatusFilter('confirmed')}
          >
            <ThemedText style={[styles.filterText, statusFilter === 'confirmed' && styles.filterTextActive]}>
              Confirmed
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === 'checked_in' && styles.filterChipActive]}
            onPress={() => setStatusFilter('checked_in')}
          >
            <ThemedText style={[styles.filterText, statusFilter === 'checked_in' && styles.filterTextActive]}>
              Checked In
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

      {/* Bookings List */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#002fff" />
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          renderItem={renderBooking}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={80} color="#e0e0e0" />
              <ThemedText style={styles.emptyTitle}>
                {searchQuery ? 'No bookings found' : 'No bookings yet'}
              </ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                {searchQuery ? 'Try a different search' : 'Bookings will appear here as customers book sessions'}
              </ThemedText>
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
    backgroundColor: '#f5f5f5',
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
  placeholder: {
    width: 40,
  },
  statsContainer: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statsScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  statCard: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
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
    marginTop: 8,
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
    backgroundColor: '#000000',
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
    marginTop: 8,
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
    borderColor: '#002fff',
  },
  venueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  venueTextActive: {
    color: '#002fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  bookingCard: {
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
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bookingInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'capitalize',
  },
  bookingDetails: {
    gap: 6,
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
  bookingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  confirmButton: {
    backgroundColor: '#002fff',
  },
  checkInButton: {
    backgroundColor: '#00c853',
  },
  cancelButton: {
    backgroundColor: '#ff3b30',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00c853',
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
    paddingHorizontal: 40,
  },
});