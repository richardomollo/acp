import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { authService } from '../services/auth';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  credits: number;
  subscription_tier: string | null;
  subscription_status: string | null;
  created_at: string;
}

interface UpcomingClass {
  id: string;
  booking_date: string;
  status: string;
  session_id: string;
  gym_class: {
    name: string;
    start_time: string;
    gym: {
      name: string;
      location: string;
    };
  } | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadUpcomingClasses();
  }, []);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      
      const session = await authService.getSession();
      if (!session) {
        setIsGuest(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        Alert.alert('Error', 'Failed to load profile');
        return;
      }

      setUser(data);
      setIsGuest(false);
    } catch (error) {
      console.error('Profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Updated loadUpcomingClasses function ---
  const loadUpcomingClasses = async () => {
    try {
      const session = await authService.getSession();
      if (!session) return;

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Fetch bookings with session and gym data in one query
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          booking_time,
          status,
          sessions (
            id,
            name,
            date,
            time,
            gyms (
              name,
              location
            )
          )
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'confirmed')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true })
        .order('booking_time', { ascending: true })
        .limit(5);

      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError);
        return;
      }

      if (!bookingsData || bookingsData.length === 0) {
        setUpcomingClasses([]);
        return;
      }

      // Transform data to match the interface
      const transformedData = bookingsData.map(booking => ({
        id: booking.id,
        booking_date: booking.booking_date,
        status: booking.status,
        session_id: booking.sessions?.id || '',
        gym_class: booking.sessions ? {
          name: booking.sessions.name,
          start_time: `${booking.sessions.date}T${booking.sessions.time}`,
          gym: booking.sessions.gyms || { name: 'Unknown', location: '' }
        } : null
      }));

      setUpcomingClasses(transformedData);
    } catch (error) {
      console.error('Classes error:', error);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name || typeof name !== 'string') return 'U';
    
    return name
      .trim()
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return '#4caf50';
      case 'pending':
        return '#ff9800';
      case 'cancelled':
        return '#f44336';
      default:
        return '#999';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (isGuest) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.emptyStateSignIn}>
                      <Ionicons name="person-circle-outline" size={64} color="#ccc" />
                    
                       <View style={styles.gettingStartedCard}>
                           <ThemedText style={styles.gettingStartedTitle}>
                              You need be be signed in
                          </ThemedText>
                           <ThemedText style={styles.gettingStartedDescription}>
                              Sign in to view your account settings, manage your bookings, vedit your subscriptiond and manager your payment details. 
                          </ThemedText>
                              <TouchableOpacity 
                                style={styles.exploreButt}
                                 onPress={() => router.push('/login')}
                              >
                                <ThemedText style={styles.exploreButtText}>Sign In or Create Your Account</ThemedText>
                                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                                </TouchableOpacity>
                          </View>
                    </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header with Settings Icon */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          
          <ThemedText type="title" style={styles.name}>{user?.name}</ThemedText>
          <ThemedText style={styles.email}>{user?.email}</ThemedText>
          
          {user?.subscription_status && (
            <View style={[styles.statusBadge, { backgroundColor: '#4caf50' }]}>
              <ThemedText style={styles.statusBadgeText}>
                {user.subscription_status.toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
        
        {/* Settings Icon */}
        <TouchableOpacity 
          style={styles.settingsIcon}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Credits Card (Logged In Users) */}
            {!isGuest && user && (
              <View style={styles.creditsCard}>
                <View style={styles.creditsContent}>
                  <Ionicons name="wallet-outline" size={32} color="#666" />
                  <View style={styles.creditsInfo}>
                    <ThemedText style={styles.creditsLabel}>Available Credits</ThemedText>
                    <ThemedText style={styles.creditsValue}>{user.credits}</ThemedText>
                  </View>
                </View>
                <TouchableOpacity style={styles.creditsButton}>
                  <ThemedText style={styles.creditsButtonText}>Add Credits</ThemedText>
                </TouchableOpacity>
              </View>
            )}
      

      {/* Upcoming Classes */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Upcoming Sessions</ThemedText>
        
        {upcomingClasses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <ThemedText style={styles.emptyText}>No upcoming sessions</ThemedText>
             {/* Getting Started Card */}
                  <View style={styles.gettingStartedCard}>
                    <ThemedText style={styles.gettingStartedTitle}>
                     Let's get you moving
                    </ThemedText>
                    <ThemedText style={styles.gettingStartedDescription}>
                      Discover hundreds of activities and start your fitness journey today
                    </ThemedText>
                    <TouchableOpacity 
                      style={styles.exploreButt}
                      onPress={() => router.push('/(tabs)/classes')}
                    >
                      <ThemedText style={styles.exploreButtText}>Explore Classes</ThemedText>
                      <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
          </View>
        ) : (
          upcomingClasses.map((booking) => (
            <TouchableOpacity 
              key={booking.id} 
              style={styles.classCard}
              onPress={() => router.push(`/session-details?sessionId=${booking.session_id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.classHeader}>
                <View style={styles.classInfo}>
                  <ThemedText style={styles.className}>
                    {booking.gym_class?.name || 'Class'}
                  </ThemedText>
                  <View style={styles.classLocation}>
                    <Ionicons name="location-outline" size={16} color="#666" />
                    <ThemedText style={styles.locationText}>
                      {booking.gym_class?.gym?.name || 'Gym'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.classStatusContainer}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </View>
              </View>
              
              <View style={styles.classDetails}>
                <View style={styles.classDetailItem}>
                  <Ionicons name="calendar-outline" size={18} color="#666" />
                  <ThemedText style={styles.detailText}>
                    {formatDate(booking.booking_date)}
                  </ThemedText>
                </View>
                <View style={styles.classDetailItem}>
                  <Ionicons name="time-outline" size={18} color="#666" />
                  <ThemedText style={styles.detailText}>
                    {formatTime(booking.gym_class?.start_time || booking.booking_date)}
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// --- Styles remain unchanged ---
const styles = StyleSheet.create({ 
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    position: 'relative',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  settingsIcon: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  name: {
    marginBottom: 5,
    color: '#000',
  },
  email: {
    color: '#666',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000',
  },
  classCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  classInfo: {
    flex: 1,
  },
  classStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  className: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  classLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  classDetails: {
    flexDirection: 'row',
    gap: 20,
  },
  classDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 40,
  },
  emptyStateSignIn: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 300,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    marginBottom: 20,
  },
  gettingStartedCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  gettingStartedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  gettingStartedDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  exploreButton: {
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bookButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  guestPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    gap: 12,
  },
  guestText: {
    flex: 1,
    color: '#002fff',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#000',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: '#002fff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  exploreButt: {
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
  },
  exploreButtText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  creditsCard: {
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginBottom:20,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditsInfo: {
    gap: 4,
  },
  creditsLabel: {
    fontSize: 13,
    color: '#666',
  },
  creditsValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    
  },
  creditsButton: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  creditsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});