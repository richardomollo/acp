import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface DashboardStats {
  totalVenues: number;
  totalSessions: number;
  upcomingSessions: number;
  todayBookings: number;
  thisWeekBookings: number;
  activeMembers: number;
}

interface UpcomingSession {
  id: string;
  name: string;
  date: string;
  time: string;
  gym_name: string;
  bookings_count: number;
  max_capacity: number;
}

export default function PartnerDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalVenues: 0,
    totalSessions: 0,
    upcomingSessions: 0,
    todayBookings: 0,
    thisWeekBookings: 0,
    activeMembers: 0,
  });
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [partnerName, setPartnerName] = useState('Partner');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get current partner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/partner-login');
        return;
      }

      const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name, email')
        .eq('user_id', user.id)
        .single();

      if (!partner) {
        router.replace('/partner-login');
        return;
      }

      setPartnerName(partner.business_name || partner.email?.split('@')[0] || 'Partner');

      // Get partner's gyms
      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id, gyms(id, name)')
        .eq('partner_id', partner.id);

      const gymIds = partnerGyms?.map(pg => pg.gym_id) || [];

      // Get stats
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Total sessions
      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .in('gym_id', gymIds);

      // Upcoming sessions
      const { count: upcomingSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .in('gym_id', gymIds)
        .gte('date', today)
        .eq('is_active', true);

      // Get upcoming sessions details
      const { data: upcomingSessionsList } = await supabase
        .from('sessions')
        .select(`
          id,
          name,
          date,
          time,
          max_capacity,
          gyms(name)
        `)
        .in('gym_id', gymIds)
        .gte('date', today)
        .eq('is_active', true)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(5);

      // Get bookings count for each session
      const sessionsWithBookings = await Promise.all(
        (upcomingSessionsList || []).map(async (session) => {
          const { count } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id);

          return {
            id: session.id,
            name: session.name,
            date: session.date,
            time: session.time,
            gym_name: (session.gyms as any)?.name || 'Unknown',
            bookings_count: count || 0,
            max_capacity: session.max_capacity,
          };
        })
      );

      setUpcomingSessions(sessionsWithBookings);

      // Today's bookings
      const { count: todayBookings } = await supabase
        .from('bookings')
        .select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
        .in('sessions.gym_id', gymIds)
        .gte('booking_date', today)
        .lt('booking_date', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      // This week's bookings
      const { count: weekBookings } = await supabase
        .from('bookings')
        .select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
        .in('sessions.gym_id', gymIds)
        .gte('booking_date', today)
        .lte('booking_date', weekFromNow);

      // Update stats
      setStats({
        totalVenues: gymIds.length,
        totalSessions: totalSessions || 0,
        upcomingSessions: upcomingSessions || 0,
        todayBookings: todayBookings || 0,
        thisWeekBookings: weekBookings || 0,
        activeMembers: 0, // Would need a members table
      });

    } catch (error: any) {
      console.error('Dashboard load error:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.greeting}>Welcome back,</ThemedText>
          <ThemedText style={styles.partnerName}>{partnerName}</ThemedText>
        </View>
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
        >
          <Ionicons name="person-circle-outline" size={32} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.quickActionsGrid}>
            {/* Session Management */}
            <TouchableOpacity
              style={[styles.quickActionCard, styles.quickActionPrimary]}
              onPress={() => router.push('/partner/sessionsoverview')}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="calendar" size={28} color="#fff" />
              </View>
              <ThemedText style={styles.quickActionTitle} >Sessions</ThemedText>
              <ThemedText style={styles.quickActionSubtitle}>Manage & Create</ThemedText>
            </TouchableOpacity>

            {/* Check-In */}
            <TouchableOpacity
              style={[styles.quickActionCard, styles.quickActionSecondary]}
              onPress={() => router.push('/checkin')}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="qr-code" size={28} color="#fff" />
              </View>
              <ThemedText style={styles.quickActionTitle}>Check-In</ThemedText>
              <ThemedText style={styles.quickActionSubtitle}>Scan QR Codes</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Overview */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Overview</ThemedText>
          
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="business-outline" size={24} color="#000" />
              <ThemedText style={styles.statValue}>{stats.totalVenues}</ThemedText>
              <ThemedText style={styles.statLabel}>Venues</ThemedText>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="calendar-outline" size={24} color="#000" />
              <ThemedText style={styles.statValue}>{stats.upcomingSessions}</ThemedText>
              <ThemedText style={styles.statLabel}>Upcoming</ThemedText>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="today-outline" size={24} color="#000" />
              <ThemedText style={styles.statValue}>{stats.todayBookings}</ThemedText>
              <ThemedText style={styles.statLabel}>Today</ThemedText>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="trending-up-outline" size={24} color="#000" />
              <ThemedText style={styles.statValue}>{stats.thisWeekBookings}</ThemedText>
              <ThemedText style={styles.statLabel}>This Week</ThemedText>
            </View>
          </View>
        </View>

        {/* Upcoming Sessions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Upcoming Sessions</ThemedText>
            <TouchableOpacity onPress={() => router.push('/partner/sessionsoverview')}>
              <ThemedText style={styles.seeAllLink}>See All</ThemedText>
            </TouchableOpacity>
          </View>

          {upcomingSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={60} color="#e0e0e0" />
              <ThemedText style={styles.emptyTitle}>No Upcoming Sessions</ThemedText>
              <ThemedText style={styles.emptySubtitle}>Create your first session to get started</ThemedText>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/partner/sessionsoverview')}
              >
                <ThemedText style={styles.createButtonText}>Create Session</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            upcomingSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push(`/partner/session-details/${session.id}`)}
              >
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionInfo}>
                    <ThemedText style={styles.sessionName}>{session.name}</ThemedText>
                    <ThemedText style={styles.sessionVenue}>{session.gym_name}</ThemedText>
                  </View>
                  <View style={styles.sessionCapacity}>
                    <ThemedText style={styles.capacityText}>
                      {session.bookings_count}/{session.max_capacity}
                    </ThemedText>
                    <ThemedText style={styles.capacityLabel}>Spots</ThemedText>
                  </View>
                </View>

                <View style={styles.sessionFooter}>
                  <View style={styles.sessionTime}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <ThemedText style={styles.sessionTimeText}>
                      {formatDate(session.date)}
                    </ThemedText>
                  </View>
                  <View style={styles.sessionTime}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <ThemedText style={styles.sessionTimeText}>
                      {formatTime(session.time)}
                    </ThemedText>
                  </View>
                  <View style={[
                    styles.fillBadge,
                    session.bookings_count / session.max_capacity >= 0.8 && styles.fillBadgeHigh,
                    session.bookings_count === session.max_capacity && styles.fillBadgeFull
                  ]}>
                    <ThemedText style={styles.fillBadgeText}>
                      {Math.round((session.bookings_count / session.max_capacity) * 100)}% Full
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Quick Links</ThemedText>
           <TouchableOpacity
            style={styles.linkCard}
            onPress={() => router.push('/partner/payout-information')}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="card-outline" size={22} color="#000" />
            </View>
            <View style={styles.linkContent}>
              <ThemedText style={styles.linkTitle}>Payout Information</ThemedText>
              <ThemedText style={styles.linkSubtitle}>
               Manage bank details and payouts
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => router.push('/partner/venues')}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="business" size={24} color="#000" />
            </View>
            <View style={styles.linkContent}>
              <ThemedText style={styles.linkTitle}>My Venues</ThemedText>
              <ThemedText style={styles.linkSubtitle}>
                {stats.totalVenues} venue{stats.totalVenues !== 1 ? 's' : ''}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {/* <TouchableOpacity
            style={styles.linkCard}
            onPress={() => router.push('/partner/analytics')}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="stats-chart" size={24} color="#00c853" />
            </View>
            <View style={styles.linkContent}>
              <ThemedText style={styles.linkTitle}>Analytics</ThemedText>
              <ThemedText style={styles.linkSubtitle}>View performance</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity> */}

          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => router.push('/partner/bookings')}
          >
            <View style={styles.linkIcon}>
              <Ionicons name="receipt" size={24} color="#000" />
            </View>
            <View style={styles.linkContent}>
              <ThemedText style={styles.linkTitle}>Bookings</ThemedText>
              <ThemedText style={styles.linkSubtitle}>
                {stats.thisWeekBookings} this week
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  greeting: {
    fontSize: 14,
    color: '#666',
  },
  partnerName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginTop: 4,
  },
  profileButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  seeAllLink: {
    fontSize: 15,
    fontWeight: '600',
    color: '#002fff',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  quickActionPrimary: {
    backgroundColor: '#002fff',
    
  },
  quickActionSecondary: {
    backgroundColor: '#000',
  },
  quickActionIcon: {
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
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
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  sessionVenue: {
    fontSize: 14,
    color: '#666',
  },
  sessionCapacity: {
    alignItems: 'flex-end',
  },
  capacityText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#002fff',
  },
  capacityLabel: {
    fontSize: 12,
    color: '#666',
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  sessionTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionTimeText: {
    fontSize: 13,
    color: '#666',
  },
  fillBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e8f5e9',
  },
  fillBadgeHigh: {
    backgroundColor: '#fff3e0',
  },
  fillBadgeFull: {
    backgroundColor: '#ffebee',
  },
  fillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00c853',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  linkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  linkSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});