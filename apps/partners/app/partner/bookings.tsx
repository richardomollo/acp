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
  session_category: string | null;
  session_duration: number | null;
  session_instructor: string | null;
  gym_id: string;
  gym_name: string;
  status: 'pending_payment' | 'confirmed' | 'checked_in' | 'cancelled' | 'cancelled_by_customer' | 'cancelled_by_partner' | 'rescheduled' | 'deposit_paid' | 'no_show';
  booking_date: string;
  created_at: string;
  confirmation_code: string | null;
  deposit_amount?: number;
  remainder_amount?: number;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_payment' | 'confirmed' | 'checked_in' | 'cancelled'>('all');
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
          confirmation_code,
          deposit_amount,
          remainder_amount,
          users(name, email),
          sessions(
            id,
            name,
            date,
            time,
            category,
            duration_minutes,
            instructor,
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
        session_category: (b.sessions as any)?.category || null,
        session_duration: (b.sessions as any)?.duration_minutes || null,
        session_instructor: (b.sessions as any)?.instructor || null,
        gym_id: (b.sessions as any)?.gym_id || '',
        gym_name: ((b.sessions as any)?.gyms as any)?.name || 'Unknown Gym',
        status: b.status as any,
        booking_date: b.booking_date,
        created_at: b.created_at,
        confirmation_code: (b as any).confirmation_code || null,
        deposit_amount: (b as any).deposit_amount,
        remainder_amount: (b as any).remainder_amount,
      }));

      setBookings(formattedBookings);

      // Calculate stats
      const newStats = {
        total: formattedBookings.length,
        pending: formattedBookings.filter(b => b.status === 'pending_payment').length,
        confirmed: formattedBookings.filter(b => b.status === 'confirmed').length,
        checked_in: formattedBookings.filter(b => b.status === 'checked_in').length,
        cancelled: formattedBookings.filter(b => ['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'rescheduled'].includes(b.status)).length,
        today: formattedBookings.filter(b => b.booking_date === today).length,
        upcoming: formattedBookings.filter(b => b.booking_date >= today && !['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'rescheduled'].includes(b.status)).length,
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

  const handleCancelBooking = async (booking: Booking) => {
    Alert.alert(
      'Cancel Booking',
      `Cancel ${booking.user_name}'s booking? They will receive a full refund.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const now = new Date().toISOString();
              const { error } = await supabase
                .from('bookings')
                .update({
                  status: 'cancelled_by_partner',
                  cancelled_by: 'partner',
                  cancelled_at: now,
                  refund_status: 'pending',
                  refund_amount: booking.deposit_amount ?? 0,
                })
                .eq('id', booking.id);

              if (error) throw error;

              if (booking.deposit_amount && booking.deposit_amount > 0) {
                await supabase.from('refund_transactions').insert({
                  booking_id: booking.id,
                  amount: booking.deposit_amount,
                  status: 'pending',
                  initiated_by: 'partner',
                  created_at: now,
                });
              }

              Alert.alert('Booking Cancelled', `${booking.user_name}'s booking has been cancelled. A refund will be processed.`);
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
      case 'confirmed':
      case 'deposit_paid': return '#002fff';
      case 'pending_payment': return '#ff9500';
      case 'cancelled':
      case 'cancelled_by_customer':
      case 'cancelled_by_partner': return '#999';
      case 'rescheduled': return '#8b5cf6';
      case 'no_show': return '#ef4444';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return 'checkmark-circle';
      case 'confirmed':
      case 'deposit_paid': return 'checkmark';
      case 'pending_payment': return 'time';
      case 'cancelled':
      case 'cancelled_by_customer':
      case 'cancelled_by_partner': return 'close-circle';
      case 'rescheduled': return 'repeat';
      case 'no_show': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'checked_in': return 'Checked In';
      case 'confirmed': return 'Confirmed';
      case 'deposit_paid': return 'Deposit Paid';
      case 'pending_payment': return 'Awaiting Payment';
      case 'cancelled': return 'Cancelled';
      case 'cancelled_by_customer': return 'Cancelled by Customer';
      case 'cancelled_by_partner': return 'Cancelled by You';
      case 'rescheduled': return 'Rescheduled';
      case 'no_show': return 'No Show';
      default: return status;
    }
  };

  const renderBooking = ({ item }: { item: Booking }) => {
  const sessionDateTime = new Date(`${item.session_date}T${item.session_time}`);
  const isPast = sessionDateTime < new Date();
  const statusColor = getStatusColor(item.status);

  const bookedAgo = (() => {
    const ms = Date.now() - new Date(item.created_at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <View style={styles.bookingCard}>
      {/* ── Header row: status icon + name/email + status badge ── */}
      <View style={styles.bookingHeader}>
        <View style={[styles.statusIcon, { backgroundColor: `${statusColor}18` }]}>
          <Ionicons name={getStatusIcon(item.status) as any} size={22} color={statusColor} />
        </View>

        <View style={styles.bookingInfo}>
          <ThemedText style={styles.userName}>{item.user_name}</ThemedText>
          <ThemedText style={styles.userEmail}>{item.user_email}</ThemedText>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <ThemedText style={styles.statusBadgeText}>{getStatusLabel(item.status)}</ThemedText>
        </View>
      </View>

      {/* ── Session info ── */}
      <View style={styles.sessionBlock}>
        <View style={styles.sessionTitleRow}>
          <ThemedText style={styles.sessionName} numberOfLines={1}>{item.session_name}</ThemedText>
          {item.session_category ? (
            <View style={styles.categoryChip}>
              <ThemedText style={styles.categoryText}>{item.session_category}</ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="business-outline" size={14} color="#888" />
          <ThemedText style={styles.detailText}>{item.gym_name}</ThemedText>
        </View>

        {item.session_instructor ? (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={14} color="#888" />
            <ThemedText style={styles.detailText}>{item.session_instructor}</ThemedText>
          </View>
        ) : null}
      </View>

      {/* ── Date / time / duration row ── */}
      <View style={styles.datetimeBlock}>
        <View style={styles.datetimeMain}>
          <Ionicons name="calendar-outline" size={15} color="#002fff" />
          <ThemedText style={styles.datetimeDate}>{formatDate(item.session_date)}</ThemedText>
        </View>
        <View style={styles.datetimePills}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={12} color="#555" />
            <ThemedText style={styles.timePillText}>{formatTime(item.session_time)}</ThemedText>
          </View>
          {item.session_duration ? (
            <View style={styles.timePill}>
              <Ionicons name="hourglass-outline" size={12} color="#555" />
              <ThemedText style={styles.timePillText}>{item.session_duration} min</ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Financial + confirmation row ── */}
      <View style={styles.metaRow}>
        {item.deposit_amount != null && item.deposit_amount > 0 ? (
          <View style={styles.metaItem}>
            <ThemedText style={styles.metaLabel}>Deposit paid</ThemedText>
            <ThemedText style={styles.metaValue}>KES {item.deposit_amount.toLocaleString()}</ThemedText>
          </View>
        ) : null}
        {item.remainder_amount != null && item.remainder_amount > 0 ? (
          <View style={styles.metaItem}>
            <ThemedText style={styles.metaLabel}>Remainder due</ThemedText>
            <ThemedText style={[styles.metaValue, { color: '#d97706' }]}>KES {item.remainder_amount.toLocaleString()}</ThemedText>
          </View>
        ) : null}
        {item.confirmation_code ? (
          <View style={styles.metaItem}>
            <ThemedText style={styles.metaLabel}>Ref</ThemedText>
            <ThemedText style={[styles.metaValue, { fontFamily: 'monospace', letterSpacing: 0.5 }]}>{item.confirmation_code}</ThemedText>
          </View>
        ) : null}
        <View style={[styles.metaItem, { marginLeft: 'auto' }]}>
          <ThemedText style={[styles.metaLabel, { textAlign: 'right' }]}>Booked</ThemedText>
          <ThemedText style={[styles.metaValue, { textAlign: 'right' }]}>{bookedAgo}</ThemedText>
        </View>
      </View>

      {/* ── Actions ── */}
      {!isPast && (
        <>
          {item.status === 'pending_payment' && (
            <View style={styles.bookingActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => handleCancelBooking(item)}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {(item.status === 'confirmed' || item.status === 'deposit_paid') && (
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
                onPress={() => handleCancelBooking(item)}
              >
                <Ionicons name="close" size={18} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ── Terminal state labels ── */}
      {(item.status === 'checked_in' || (isPast && item.status === 'confirmed')) && (
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#00c853" />
          <ThemedText style={styles.completedText}>
            {item.status === 'checked_in' ? 'Checked In' : 'Completed'}
          </ThemedText>
        </View>
      )}

      {['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'rescheduled', 'no_show'].includes(item.status) && (
        <View style={styles.completedBadge}>
          <Ionicons
            name={item.status === 'rescheduled' ? 'repeat' : 'close-circle'}
            size={16}
            color={statusColor}
          />
          <ThemedText style={[styles.completedText, { color: statusColor }]}>
            {getStatusLabel(item.status)}
          </ThemedText>
        </View>
      )}

      {isPast && item.status === 'pending_payment' && (
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
            style={[styles.filterChip, statusFilter === 'pending_payment' && styles.filterChipActive]}
            onPress={() => setStatusFilter('pending_payment')}
          >
            <ThemedText style={[styles.filterText, statusFilter === 'pending_payment' && styles.filterTextActive]}>
              Awaiting Payment
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
  // Session block
  sessionBlock: {
    gap: 4,
    marginBottom: 10,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    flexShrink: 1,
  },
  categoryChip: {
    backgroundColor: '#f0f4ff',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#002fff',
    textTransform: 'capitalize',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },

  // Date / time block
  datetimeBlock: {
    backgroundColor: '#f8f9ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  datetimeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  datetimeDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#002fff',
  },
  datetimePills: {
    flexDirection: 'row',
    gap: 8,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#e8eaff',
  },
  timePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },

  // Meta row (deposit, remainder, ref, booked)
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 10,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  metaItem: {
    gap: 1,
  },
  metaLabel: {
    fontSize: 10,
    color: '#aaa',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },

  // Legacy (kept for bookingDetails spacing)
  bookingDetails: {
    gap: 4,
    marginBottom: 8,
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