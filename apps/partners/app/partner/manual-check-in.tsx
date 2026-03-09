import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Booking {
  id: string;
  confirmation_code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  session_id: string;
  session_name: string;
  session_date: string;
  session_time: string;
  gym_name: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled';
  created_at: string;
}

export default function ManualCheckinScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [searchResult, setSearchResult] = useState<Booking | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<Booking[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadRecentCheckins();
  }, []);

  const loadRecentCheckins = async () => {
    try {
      setRefreshing(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id')
        .eq('partner_id', partner.id);

      const gymIds = partnerGyms?.map(pg => pg.gym_id) || [];
      if (gymIds.length === 0) return;

      const today = new Date().toISOString().split('T')[0];

      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          confirmation_code,
          user_id,
          session_id,
          status,
          created_at,
          users(name, email),
          sessions(
            name,
            date,
            time,
            gym_id,
            gyms(name)
          )
        `)
        .in('sessions.gym_id', gymIds)
        .eq('status', 'checked_in')
        .gte('sessions.date', today)
        .order('created_at', { ascending: false })
        .limit(10);

      const formatted = (bookings || []).map(b => ({
        id: b.id,
        confirmation_code: b.confirmation_code,
        user_id: b.user_id,
        user_name: (b.users as any)?.name || 'Unknown',
        user_email: (b.users as any)?.email || '',
        session_id: b.session_id,
        session_name: (b.sessions as any)?.name || 'Unknown',
        session_date: (b.sessions as any)?.date || '',
        session_time: (b.sessions as any)?.time || '',
        gym_name: (b.sessions as any)?.gyms?.name || 'Unknown',
        status: b.status as any,
        created_at: b.created_at,
      }));

      setRecentCheckins(formatted);

    } catch (error) {
      console.error('Load recent check-ins error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearch = async () => {
    const code = confirmationCode.trim().toUpperCase();
    
    if (code.length < 4) {
      Alert.alert('Invalid Code', 'Please enter at least 4 characters of the confirmation code');
      return;
    }

    setLoading(true);
    setSearchResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id')
        .eq('partner_id', partner.id);

      const gymIds = partnerGyms?.map(pg => pg.gym_id) || [];
      if (gymIds.length === 0) return;

      const today = new Date().toISOString().split('T')[0];

      // Search by exact confirmation code
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          confirmation_code,
          user_id,
          session_id,
          status,
          created_at,
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
        .eq('confirmation_code', code)
        .in('sessions.gym_id', gymIds)
        .gte('sessions.date', today);

      if (!bookings || bookings.length === 0) {
        // Try partial match if exact match fails
        const { data: partialBookings } = await supabase
          .from('bookings')
          .select(`
            id,
            confirmation_code,
            user_id,
            session_id,
            status,
            created_at,
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
          .ilike('confirmation_code', `%${code}%`)
          .in('sessions.gym_id', gymIds)
          .gte('sessions.date', today)
          .in('status', ['confirmed', 'pending'])
          .limit(1);

        if (!partialBookings || partialBookings.length === 0) {
          Alert.alert(
            'Booking Not Found', 
            `No active booking found with code "${code}".\n\nPlease check the code and try again.`
          );
          setLoading(false);
          return;
        }

        const booking = partialBookings[0];
        
        if (booking.status === 'checked_in') {
          Alert.alert(
            'Already Checked In',
            `This customer was already checked in at ${formatTime(new Date(booking.created_at).toTimeString().slice(0, 5))}`
          );
          setLoading(false);
          return;
        }

        if (booking.status === 'cancelled') {
          Alert.alert('Booking Cancelled', 'This booking has been cancelled');
          setLoading(false);
          return;
        }

        const formatted: Booking = {
          id: booking.id,
          confirmation_code: booking.confirmation_code,
          user_id: booking.user_id,
          user_name: (booking.users as any)?.name || 'Unknown',
          user_email: (booking.users as any)?.email || '',
          session_id: booking.session_id,
          session_name: (booking.sessions as any)?.name || 'Unknown',
          session_date: (booking.sessions as any)?.date || '',
          session_time: (booking.sessions as any)?.time || '',
          gym_name: (booking.sessions as any)?.gyms?.name || 'Unknown',
          status: booking.status as any,
          created_at: booking.created_at,
        };

        setSearchResult(formatted);
        setLoading(false);
        return;
      }

      const booking = bookings[0];

      // Check if already checked in
      if (booking.status === 'checked_in') {
        Alert.alert(
          'Already Checked In',
          `${(booking.users as any)?.name || 'This customer'} was already checked in.`
        );
        setLoading(false);
        return;
      }

      // Check if cancelled
      if (booking.status === 'cancelled') {
        Alert.alert('Booking Cancelled', 'This booking has been cancelled');
        setLoading(false);
        return;
      }

      const formatted: Booking = {
        id: booking.id,
        confirmation_code: booking.confirmation_code,
        user_id: booking.user_id,
        user_name: (booking.users as any)?.name || 'Unknown',
        user_email: (booking.users as any)?.email || '',
        session_id: booking.session_id,
        session_name: (booking.sessions as any)?.name || 'Unknown',
        session_date: (booking.sessions as any)?.date || '',
        session_time: (booking.sessions as any)?.time || '',
        gym_name: (booking.sessions as any)?.gyms?.name || 'Unknown',
        status: booking.status as any,
        created_at: booking.created_at,
      };

      setSearchResult(formatted);

    } catch (error: any) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!searchResult) return;

    Alert.alert(
      'Confirm Check-In',
      `Check in ${searchResult.user_name} for ${searchResult.session_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check In',
          onPress: async () => {
            setChecking(true);

            try {
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'checked_in' })
                .eq('id', searchResult.id);

              if (error) throw error;

              Alert.alert(
                'Check-In Successful! ✅', 
                `${searchResult.user_name} checked in for ${searchResult.session_name}`
              );
              
              // Clear search
              setSearchResult(null);
              setConfirmationCode('');
              
              // Refresh recent check-ins
              loadRecentCheckins();

            } catch (error) {
              Alert.alert('Error', 'Failed to check in customer. Please try again.');
            } finally {
              setChecking(false);
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
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
        <ThemedText style={styles.headerTitle}>Check-In</ThemedText>
        <TouchableOpacity 
          style={styles.qrButton}
          onPress={() => router.push('/(tabs)/checkin')}
        >
          <Ionicons name="qr-code-outline" size={24} color="#002fff" />
        </TouchableOpacity>
      </View>

      {/* Search Section */}
      <View style={styles.searchSection}>
        <View style={styles.instructionBox}>
          <Ionicons name="information-circle" size={20} color="#002fff" />
          <ThemedText style={styles.instructionText}>
            Ask customer for their confirmation code
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>Confirmation Code</ThemedText>
        
        <View style={styles.searchContainer}>
          <Ionicons 
            name="shield-checkmark-outline" 
            size={24} 
            color="#002fff" 
            style={styles.searchIcon} 
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Enter confirmation code..."
            placeholderTextColor="#999"
            value={confirmationCode}
            onChangeText={(text) => setConfirmationCode(text.toUpperCase())}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="characters"
            autoFocus
          />
          {confirmationCode.length > 0 && (
            <TouchableOpacity onPress={() => {
              setConfirmationCode('');
              setSearchResult(null);
            }}>
              <Ionicons name="close-circle" size={24} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        <ThemedText style={styles.helperText}>
          Format: FP-2024-ABC123
        </ThemedText>

        <TouchableOpacity
          style={[styles.searchButton, loading && { opacity: 0.6 }]}
          onPress={handleSearch}
          disabled={loading || confirmationCode.length < 4}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="search" size={20} color="#fff" />
              <ThemedText style={styles.searchButtonText}>Find Booking</ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Search Result */}
      {searchResult && (
        <View style={styles.resultSection}>
          <ThemedText style={styles.resultTitle}>Booking Found</ThemedText>
          
          <View style={styles.bookingCard}>
            <View style={styles.bookingHeader}>
              <View style={styles.userInfo}>
                <View style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>
                    {searchResult.user_name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.userDetails}>
                  <ThemedText style={styles.userName}>{searchResult.user_name}</ThemedText>
                  <ThemedText style={styles.userEmail}>{searchResult.user_email}</ThemedText>
                </View>
              </View>
              <View style={[
                styles.statusBadge,
                { backgroundColor: searchResult.status === 'confirmed' ? '#00c853' : '#ff9500' }
              ]}>
                <ThemedText style={styles.statusText}>
                  {searchResult.status}
                </ThemedText>
              </View>
            </View>

            <View style={styles.confirmationCodeBox}>
              <Ionicons name="shield-checkmark" size={18} color="#002fff" />
              <ThemedText style={styles.confirmationCode}>
                {searchResult.confirmation_code}
              </ThemedText>
            </View>

            <View style={styles.bookingDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="barbell-outline" size={18} color="#666" />
                <ThemedText style={styles.detailText}>{searchResult.session_name}</ThemedText>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={18} color="#666" />
                <ThemedText style={styles.detailText}>{searchResult.gym_name}</ThemedText>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={18} color="#666" />
                <ThemedText style={styles.detailText}>
                  {formatDate(searchResult.session_date)} • {formatTime(searchResult.session_time)}
                </ThemedText>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.checkInButton, checking && { opacity: 0.6 }]}
              onPress={handleCheckIn}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <ThemedText style={styles.checkInButtonText}>Check In Customer</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recent Check-Ins */}
      {!searchResult && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <ThemedText style={styles.sectionTitle}>Recent Check-Ins Today</ThemedText>
            <TouchableOpacity onPress={loadRecentCheckins}>
              <Ionicons name="refresh" size={20} color="#002fff" />
            </TouchableOpacity>
          </View>

          {recentCheckins.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-outline" size={60} color="#e0e0e0" />
              <ThemedText style={styles.emptyTitle}>No Check-Ins Yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                Enter a confirmation code to check in a customer
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={recentCheckins}
              renderItem={({ item }) => (
                <View style={[styles.bookingCard, { backgroundColor: '#f0f9f4' }]}>
                  <View style={styles.bookingHeader}>
                    <View style={styles.userInfo}>
                      <View style={[styles.avatar, { backgroundColor: '#00c853' }]}>
                        <Ionicons name="checkmark" size={24} color="#fff" />
                      </View>
                      <View style={styles.userDetails}>
                        <ThemedText style={styles.userName}>{item.user_name}</ThemedText>
                        <ThemedText style={styles.userEmail}>{item.user_email}</ThemedText>
                      </View>
                    </View>
                  </View>
                  <View style={styles.confirmationCodeBox}>
                    <Ionicons name="shield-checkmark" size={16} color="#00c853" />
                    <ThemedText style={[styles.confirmationCode, { color: '#00c853' }]}>
                      {item.confirmation_code}
                    </ThemedText>
                  </View>
                  <View style={styles.bookingDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="barbell-outline" size={16} color="#666" />
                      <ThemedText style={styles.detailText}>{item.session_name}</ThemedText>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <ThemedText style={styles.detailText}>
                        Checked in at {formatTime(new Date(item.created_at).toTimeString().slice(0, 5))}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.resultsList}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={loadRecentCheckins} />
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  qrButton: {
    padding: 8,
  },
  searchSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#002fff',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#002fff',
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  searchButton: {
    flexDirection: 'row',
    backgroundColor: '#002fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  resultSection: {
    backgroundColor: '#fff',
    padding: 20,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00c853',
    marginBottom: 16,
  },
  resultsList: {
    paddingBottom: 20,
  },
  recentSection: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'capitalize',
  },
  confirmationCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  confirmationCode: {
    fontSize: 16,
    fontWeight: '800',
    color: '#002fff',
    letterSpacing: 2,
  },
  bookingDetails: {
    gap: 10,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00c853',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  checkInButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
});