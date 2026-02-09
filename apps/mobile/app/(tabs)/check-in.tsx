import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { authService } from '../services/auth';
import { Ionicons } from '@expo/vector-icons';

interface Booking {
  id: string;
  booking_date: string;
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

export default function ProfileScreen() {
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
      
      const session = await authService.getSession();
      
      if (!session) {
        setIsGuest(true);
        setLoading(false);
        return;
      }

      setIsGuest(false);

      // Load user profile
      const { data: userData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', session.user.id)
        .single();

      if (userData) setUser(userData);

      // Load bookings
      const today = new Date().toISOString().split('T')[0];

      // Upcoming bookings
      const { data: upcomingData } = await supabase
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
        .eq('user_id', session.user.id)
        .eq('status', 'confirmed')
        .gte('booking_date', today)
        .order('booking_date', { ascending: true });

      if (upcomingData) setUpcomingBookings(upcomingData);

      // Past bookings
      const { data: pastData } = await supabase
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
        .eq('user_id', session.user.id)
        .lt('booking_date', today)
        .order('booking_date', { ascending: false })
        .limit(10);

      if (pastData) setPastBookings(pastData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateConfirmationCode = () => {
    // Generate a 6-digit confirmation code
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCheckInPress = async (booking: Booking) => {
    // If no confirmation code exists, generate one
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
      // Verify confirmation code
      if (confirmationCode !== selectedBooking.confirmation_code) {
        Alert.alert('Error', 'Invalid confirmation code');
        setCheckingIn(false);
        return;
      }

      // Update booking to checked in
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
      loadData(); // Reload bookings
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to check in');
    } finally {
      setCheckingIn(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
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
            Sign in to view your bookings and check in to classes
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>
            {getInitials(user?.name)}
          </ThemedText>
        </View>
        <ThemedText type="title" style={styles.name}>{user?.name}</ThemedText>
        <ThemedText style={styles.email}>{user?.email}</ThemedText>

        <TouchableOpacity 
          style={styles.settingsIcon}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={24} color="#666" />
        </TouchableOpacity>
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
              <TouchableOpacity 
                style={styles.exploreButton}
                onPress={() => router.push('/(tabs)/explore')}
              >
                <ThemedText style={styles.exploreButtonText}>Explore Classes</ThemedText>
              </TouchableOpacity>
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
                      <Ionicons name="checkmark-circle" size={20} color="#4caf50" />
                      <ThemedText style={styles.checkedInText}>Checked In</ThemedText>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.checkInButton}
                      onPress={() => handleCheckInPress(booking)}
                    >
                      <Ionicons name="qr-code-outline" size={20} color="#002fff" />
                      <ThemedText style={styles.checkInButtonText}>Check In</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.bookingDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <ThemedText style={styles.detailText}>
                      {formatDate(booking.sessions?.date || booking.booking_date)}
                    </ThemedText>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <ThemedText style={styles.detailText}>
                      {booking.sessions?.time || 'TBD'}
                    </ThemedText>
                  </View>
                </View>

                {booking.confirmation_code && !booking.checked_in && (
                  <View style={styles.confirmationCodeContainer}>
                    <ThemedText style={styles.confirmationCodeLabel}>Confirmation Code:</ThemedText>
                    <ThemedText style={styles.confirmationCodeText}>
                      {booking.confirmation_code}
                    </ThemedText>
                  </View>
                )}
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
                  {booking.checked_in && (
                    <Ionicons name="checkmark-circle" size={28} color="#4caf50" />
                  )}
                </View>

                <View style={styles.bookingDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <ThemedText style={styles.detailText}>
                      {formatDate(booking.sessions?.date || booking.booking_date)}
                    </ThemedText>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <ThemedText style={styles.detailText}>
                      {booking.sessions?.time || 'TBD'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>

      {/* Check-In Modal */}
      <Modal
        visible={checkInModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckInModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Check In</ThemedText>
              <TouchableOpacity onPress={() => setCheckInModalVisible(false)}>
                <Ionicons name="close" size={28} color="#000" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.modalClassName}>
              {selectedBooking?.sessions?.name}
            </ThemedText>

            {/* QR Code Placeholder */}
            <View style={styles.qrCodePlaceholder}>
              <Ionicons name="qr-code" size={120} color="#ccc" />
              <ThemedText style={styles.qrCodeText}>
                QR Code Check-In
              </ThemedText>
              <ThemedText style={styles.qrCodeSubtext}>
                Feature not available
              </ThemedText>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>OR</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            {/* Confirmation Code Input */}
            <View style={styles.confirmationSection}>
              <ThemedText style={styles.confirmationLabel}>
                Enter Confirmation Code
              </ThemedText>
              {selectedBooking?.confirmation_code && (
                <View style={styles.codeHint}>
                  <Ionicons name="information-circle-outline" size={16} color="#002fff" />
                  <ThemedText style={styles.codeHintText}>
                    Your code: {selectedBooking.confirmation_code}
                  </ThemedText>
                </View>
              )}
              <TextInput
                style={styles.codeInput}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#999"
                value={confirmationCode}
                onChangeText={setConfirmationCode}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              style={[styles.confirmButton, checkingIn && styles.confirmButtonDisabled]}
              onPress={handleCheckIn}
              disabled={checkingIn || confirmationCode.length !== 6}
            >
              {checkingIn ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.confirmButtonText}>Confirm Check-In</ThemedText>
              )}
            </TouchableOpacity>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    position: 'relative',
  },
  settingsIcon: {
    position: 'absolute',
    top: 60,
    right: 20,
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
    marginBottom: 20,
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
  section: {
    padding: 20,
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#002fff',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#002fff',
  },
  content: {
    flex: 1,
  },
  bookingCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f4ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checkInButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002fff',
  },
  checkedInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkedInText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4caf50',
  },
  bookingDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  confirmationCodeContainer: {
    backgroundColor: '#f0f4ff',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmationCodeLabel: {
    fontSize: 13,
    color: '#666',
  },
  confirmationCodeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#002fff',
    letterSpacing: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  modalClassName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 24,
  },
  qrCodePlaceholder: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    marginBottom: 24,
  },
  qrCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  qrCodeSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#999',
  },
  confirmationSection: {
    marginBottom: 24,
  },
  confirmationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  codeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f4ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  codeHintText: {
    fontSize: 14,
    color: '#002fff',
    fontWeight: '600',
  },
  codeInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  confirmButton: {
    backgroundColor: '#002fff',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});