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
  gym_class: {
    name: string;
    start_time: string;
    gym: {
      name: string;
      location: string;
    };
  };
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

  const loadUpcomingClasses = async () => {
    try {
      const session = await authService.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          status,
          gym_class:gym_classes (
            name,
            start_time,
            gym:gyms (
              name,
              location
            )
          )
        `)
        .eq('user_id', session.user.id)
        .gte('booking_date', new Date().toISOString())
        .order('booking_date', { ascending: true })
        .limit(5);

      if (error) {
        console.error('Error loading classes:', error);
        return;
      }

      setUpcomingClasses(data || []);
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
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={40} color="#fff" />
          </View>
          <ThemedText type="title" style={styles.name}>Guest User</ThemedText>
          <ThemedText style={styles.email}>Not signed in</ThemedText>
        </View>

        <View style={styles.guestPrompt}>
          <Ionicons name="information-circle-outline" size={24} color="#002fff" />
          <ThemedText style={styles.guestText}>
            Sign in to access your membership, bookings, and more!
          </ThemedText>
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => router.push('/login')}
          >
            <ThemedText style={styles.primaryButtonText}>Sign In</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => router.push('/signup')}
          >
            <ThemedText style={styles.secondaryButtonText}>Create Account</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header with Settings Icon */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {getInitials(user?.name)}
            </ThemedText>
          </View>
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

      {/* Credits Info */}
      <View style={styles.creditsSection}>
        <View style={styles.creditsCard}>
          <Ionicons name="wallet-outline" size={32} color="#002fff" />
          <View style={styles.creditsInfo}>
            <ThemedText style={styles.creditsLabel}>Available Credits</ThemedText>
            <ThemedText style={styles.creditsValue}>{user?.credits || 0}</ThemedText>
          </View>
        </View>
      </View>

      {/* Upcoming Classes */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Upcoming Sessions</ThemedText>
        
        {upcomingClasses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <ThemedText style={styles.emptyText}>No upcoming sessions</ThemedText>
            <TouchableOpacity style={styles.bookButton}>
              <ThemedText style={styles.bookButtonText}>Book a Class</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          upcomingClasses.map((booking) => (
            <View key={booking.id} style={styles.classCard}>
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
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
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
            </View>
          ))
        )}
      </View>
    </ScrollView>
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
  headerContainer: {
    position: 'relative',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
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
  creditsSection: {
    padding: 20,
  },
  creditsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 20,
    borderRadius: 12,
    gap: 16,
  },
  creditsInfo: {
    flex: 1,
  },
  creditsLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  creditsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
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
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    marginBottom: 20,
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
});