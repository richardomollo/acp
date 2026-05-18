import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  confirmation_code: string | null;
  checked_in: boolean;
  check_in_time: string | null;
  sessions: {
    name: string;
    date: string;
    time: string;
    gyms: {
      name: string;
      location: string;
    } | null;
  } | null;
}

interface UserProfile {
  name: string;
  email: string;
}

type TabType = 'upcoming' | 'past';

// ─── Component ───────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const authSession = await authService.getSession();
      
      if (!authSession || !authSession.user) {
        setIsGuest(true);
        setLoading(false);
        return;
      }

      setIsGuest(false);

      // 1. Load user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', authSession.user.id)
        .maybeSingle();

      if (userData) {
        setUser(userData);
      } else {
        setUser({
          name: authSession.user.user_metadata?.full_name || 'User',
          email: authSession.user.email || ''
        });
      }

      // 2. Load bookings
      const today = new Date().toISOString().split('T')[0];

      // Upcoming bookings
      const { data: upcomingData, error: upcomingError } = await supabase
        .from('bookings')
        .select(`
          *,
          sessions (
            name,
            date,
            time,
            gyms (
              name,
              location
            )
          )
        `)
        .eq('user_id', authSession.user.id)
        .eq('status', 'confirmed')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true });

      if (upcomingData) setUpcomingBookings(upcomingData as Booking[]);

      // Past bookings
      const { data: pastData, error: pastError } = await supabase
        .from('bookings')
        .select(`
          *,
          sessions (
            name,
            date,
            time,
            gyms (
              name,
              location
            )
          )
        `)
        .eq('user_id', authSession.user.id)
        .lt('booking_date', today)
        .order('booking_date', { ascending: false })
        .limit(10);

      if (pastData) setPastBookings(pastData as Booking[]);

    } catch (error) {
      console.error('Error loading bookings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateConfirmationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCheckInPress = async (booking: Booking) => {
    if (!booking.confirmation_code) {
      const code = generateConfirmationCode();
      
      const { error } = await supabase
        .from('bookings')
        .update({ confirmation_code: code })
        .eq('id', booking.id);

      if (!error) {
        booking.confirmation_code = code;
      }
    }

    setSelectedBooking(booking);
    setCheckInModalVisible(true);
  };

  const handleCheckIn = async () => {
    if (!selectedBooking) return;

    setCheckingIn(true);

    try {
      if (confirmationCode !== selectedBooking.confirmation_code) {
        Alert.alert('Error', 'Invalid confirmation code');
        setCheckingIn(false);
        return;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          checked_in: true,
          check_in_time: new Date().toISOString(),
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      Alert.alert('Success', 'You have successfully checked in!');
      setCheckInModalVisible(false);
      setConfirmationCode('');
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to check in');
    } finally {
      setCheckingIn(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    try {
      const parts = timeString.split(':');
      const hour = parseInt(parts[0], 10);
      const minutes = parts[1];
      return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
    } catch { return timeString; }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  if (isGuest) {
    return (
      <ScrollView style={styles.LoggedOutContainer}>
          <View style={styles.emptyState}>
              <Ionicons name="qr-code-outline" size={64} color="#ccc" />
               <View style={styles.gettingStartedCard}>
                   <ThemedText style={styles.gettingStartedTitle}>
                      Let's get checked in
                  </ThemedText>
                   <ThemedText style={styles.gettingStartedDescription}>
                      Sign in to view your bookings and check in to classes to continue your wellness journey today
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.name}>{user?.name}</ThemedText>
        <ThemedText style={styles.email}>{user?.email}</ThemedText>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            Upcoming ({upcomingBookings.length})
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            Past ({pastBookings.length})
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Bookings List */}
      <ScrollView style={styles.content}>
        {activeTab === 'upcoming' ? (
          upcomingBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#ccc" />
              <ThemedText style={styles.emptyText}>No upcoming bookings</ThemedText>
            
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
            upcomingBookings.map((booking) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <View style={styles.bookingInfo}>
                    <ThemedText style={styles.bookingName}>
                      {booking.sessions?.name || 'Class'}
                    </ThemedText>
                    <View style={styles.bookingMeta}>
                      <Ionicons name="location-outline" size={14} color="#666" />
                      <ThemedText style={styles.bookingMetaText}>
                        {booking.sessions?.gyms?.name || 'Gym'}
                      </ThemedText>
                    </View>
                  </View>
                  {booking.checked_in ? (
                    <View style={styles.checkedInBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
                      <ThemedText style={styles.checkedInText}>Checked In</ThemedText>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.checkInButton}
                      onPress={() => handleCheckInPress(booking)}
                    >
                      <ThemedText style={styles.checkInButtonText}>Check In</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                
                <View style={styles.bookingDetails}>
                  <View style={styles.bookingDetailItem}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <ThemedText style={styles.bookingDetailText}>
                      {formatDate(booking.sessions?.date || booking.booking_date)} • {formatTime(booking.sessions?.time || booking.booking_time)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ))
          )
        ) : (
          pastBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={64} color="#ccc" />
              <ThemedText style={styles.emptyText}>No past bookings</ThemedText>
            </View>
          ) : (
            pastBookings.map((booking) => (
              <View key={booking.id} style={[styles.bookingCard, styles.pastBookingCard]}>
                <View style={styles.bookingHeader}>
                  <View style={styles.bookingInfo}>
                    <ThemedText style={[styles.bookingName, styles.pastBookingText]}>
                      {booking.sessions?.name || 'Class'}
                    </ThemedText>
                    <View style={styles.bookingMeta}>
                      <Ionicons name="location-outline" size={14} color="#999" />
                      <ThemedText style={[styles.bookingMetaText, styles.pastBookingText]}>
                        {booking.sessions?.gyms?.name || 'Gym'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.pastBadge}>
                    <ThemedText style={styles.pastBadgeText}>Completed</ThemedText>
                  </View>
                </View>
                
                <View style={styles.bookingDetails}>
                  <View style={styles.bookingDetailItem}>
                    <Ionicons name="calendar-outline" size={16} color="#999" />
                    <ThemedText style={[styles.bookingDetailText, styles.pastBookingText]}>
                      {formatDate(booking.sessions?.date || booking.booking_date)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Check-in Modal */}
      <Modal
        visible={checkInModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCheckInModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Check In</ThemedText>
              <TouchableOpacity onPress={() => setCheckInModalVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <ThemedText style={styles.modalSubtitle}>
                Please enter the confirmation code provided by the gym staff.
              </ThemedText>
              
              <View style={styles.codeDisplay}>
                <ThemedText style={styles.codeLabel}>Your Code:</ThemedText>
                <ThemedText style={styles.codeValue}>{selectedBooking?.confirmation_code}</ThemedText>
              </View>

              <TextInput
                style={styles.codeInput}
                placeholder="Enter Code"
                value={confirmationCode}
                onChangeText={setConfirmationCode}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TouchableOpacity 
                style={[styles.modalButton, checkingIn && styles.modalButtonDisabled]}
                onPress={handleCheckIn}
                disabled={checkingIn}
              >
                {checkingIn ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.modalButtonText}>Confirm Check In</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  LoggedOutContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#666',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    paddingVertical: 15,
    marginRight: 25,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#002fff',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#002fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pastBookingCard: {
    backgroundColor: '#fcfcfc',
    borderColor: '#f5f5f5',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pastBookingText: {
    color: '#999',
  },
  bookingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookingMetaText: {
    fontSize: 14,
    color: '#666',
  },
  checkInButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  checkedInText: {
    color: '#4caf50',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pastBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pastBadgeText: {
    color: '#999',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bookingDetails: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bookingDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingDetailText: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalBody: {
    gap: 20,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  codeDisplay: {
    backgroundColor: '#f0f4ff',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  codeLabel: {
    fontSize: 14,
    color: '#002fff',
    fontWeight: '600',
  },
  codeValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#002fff',
    letterSpacing: 4,
  },
  codeInput: {
    backgroundColor: '#f8f8f8',
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalButton: {
    backgroundColor: '#002fff',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  modalButtonDisabled: {
    backgroundColor: '#ccc',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
