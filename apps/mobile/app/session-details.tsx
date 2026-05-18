import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface SessionDetails {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  category: string | null;
  image_url: string | null;
  gyms: {
    name: string;
    location: string;
  };
}

interface Booking {
  id: string;
  status: string;
  confirmation_code: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SessionDetailsScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null);
  const [userCredits, setUserCredits] = useState(0);
  const [spotsLeft, setSpotsLeft] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    if (sessionId) {
      loadSessionDetails();
    }
  }, [sessionId]);

  const loadSessionDetails = async () => {
    try {
      setLoading(true);

      const authSession = await authService.getSession();
      const currentUserId = authSession?.user.id || null;
      setUserId(currentUserId);

      // 1. Load Session Data
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select(`*, gyms (name, location)`)
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) {
        console.error('Error loading session:', sessionError);
        throw sessionError;
      }

      if (!sessionData) {
        setSession(null);
        setLoading(false);
        return;
      }

      setSession(sessionData);

      // 2. Load Bookings Count
      const { count: bookingsCount, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (countError) {
        console.error('Error loading bookings count:', countError);
      }
      
      setSpotsLeft(Math.max(0, (sessionData.max_capacity || 0) - (bookingsCount || 0)));

      // 3. Load User Data (if logged in)
      if (currentUserId) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('credits')
          .eq('id', currentUserId)
          .maybeSingle();

        if (userError) {
          console.error('Error loading user credits:', userError);
        }
        setUserCredits(userData?.credits || 0);

        // 4. Check for Existing Booking (Diagnostic Version)
        console.log('--- DIAGNOSTIC START ---');
        console.log('Current User ID:', currentUserId);
        console.log('Target Session ID:', sessionId);
        
        // Let's fetch ALL bookings for this user to see what's in the DB
        const { data: allUserBookings } = await supabase
          .from('bookings')
          .select('id, session_id, status')
          .eq('user_id', currentUserId);
        
        console.log('All bookings for this user:', allUserBookings);

        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('id, status, confirmation_code')
          .eq('user_id', currentUserId)
          .eq('session_id', sessionId)
          .neq('status', 'cancelled')
          .maybeSingle();

        if (bookingError) {
          console.error('Error checking existing booking:', bookingError);
        }
        console.log('Specific booking query result:', bookingData);
        console.log('--- DIAGNOSTIC END ---');
        
        setExistingBooking(bookingData as Booking);
      }
    } catch (error) {
      console.error('Fatal error loading session details:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  const handleBookSession = async () => {
    try {
      if (!userId) {
        setShowAuthModal(true);
        return;
      }

      if (!session) return;

      if (userCredits < session.credits_required) {
        Alert.alert('Insufficient Credits', `You need ${session.credits_required} credits but only have ${userCredits}.`);
        return;
      }

      if (spotsLeft <= 0) {
        Alert.alert('Session Full', 'This session is fully booked');
        return;
      }

      setBooking(true);

      const { count: currentBookings, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (countError) throw countError;

      if ((currentBookings || 0) >= (session.max_capacity || 0)) {
        Alert.alert('Session Full', 'This session was just fully booked');
        await loadSessionDetails();
        return;
      }

      const now = new Date();
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          user_id: userId,
          session_id: sessionId,
          gym_id: session.gym_id,
          booking_date: now.toISOString().split('T')[0],
          booking_time: now.toTimeString().split(' ')[0],
          status: 'confirmed',
          credits_used: session.credits_required,
        }])
        .select()
        .single();

      if (bookingError) throw bookingError;

      const { error: creditsError } = await supabase
        .from('users')
        .update({ credits: userCredits - session.credits_required })
        .eq('id', userId);

      if (creditsError) {
        await supabase.from('bookings').delete().eq('id', bookingData.id);
        throw creditsError;
      }

      Alert.alert('Booked!', 'Session booked successfully');
      setExistingBooking(bookingData as Booking);
      setUserCredits(userCredits - session.credits_required);
      setSpotsLeft(spotsLeft - 1);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to book session');
    } finally {
      setBooking(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
    } catch { return dateString; }
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

  if (!session) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ThemedText>Session not found</ThemedText>
        <TouchableOpacity style={{marginTop: 20}} onPress={() => router.back()}>
          <ThemedText style={{color: '#002fff'}}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {session.image_url ? (
            <Image source={{ uri: session.image_url }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="image-outline" size={64} color="#ccc" />
            </View>
          )}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.category}>{session.category || 'Fitness'}</ThemedText>
            <ThemedText type="title" style={styles.title}>{session.name}</ThemedText>
            
            <View style={styles.gymInfo}>
              <Ionicons name="location" size={18} color="#002fff" />
              <View>
                <ThemedText style={styles.gymName}>{session.gyms?.name}</ThemedText>
                <ThemedText style={styles.location}>{session.gyms?.location}</ThemedText>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color="#666" />
              <ThemedText style={styles.statLabel}>{session.duration_minutes} min</ThemedText>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={20} color="#666" />
              <ThemedText style={styles.statLabel}>{spotsLeft} spots left</ThemedText>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="flash-outline" size={20} color="#666" />
              <ThemedText style={styles.statLabel}>{session.credits_required} credits</ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About this session</ThemedText>
            <ThemedText style={styles.description}>
              {session.description || 'No description available for this session.'}
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Instructor</ThemedText>
            <View style={styles.instructorCard}>
              <View style={styles.instructorAvatar}>
                <ThemedText style={styles.instructorInitial}>
                  {session.instructor?.[0] || 'I'}
                </ThemedText>
              </View>
              <ThemedText style={styles.instructorName}>
                {session.instructor || 'Professional Instructor'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
            <View style={styles.scheduleCard}>
              <View style={styles.scheduleItem}>
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <ThemedText style={styles.scheduleText}>{formatDate(session.date)}</ThemedText>
              </View>
              <View style={styles.scheduleItem}>
                <Ionicons name="time-outline" size={20} color="#666" />
                <ThemedText style={styles.scheduleText}>{formatTime(session.time)}</ThemedText>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.priceContainer}>
          <ThemedText style={styles.priceLabel}>Total Price</ThemedText>
          <View style={styles.priceRow}>
            <Ionicons name="flash" size={20} color="#002fff" />
            <ThemedText style={styles.priceValue}>{session.credits_required} Credits</ThemedText>
          </View>
        </View>

        {existingBooking ? (
          <TouchableOpacity 
            style={[styles.bookButton, styles.checkInButton]}
            onPress={() => router.push('/(tabs)/check-in', { sessionId: session.id })}
          >
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
            <ThemedText style={styles.bookButtonText}>Session Booked. Check In Now</ThemedText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.bookButton, (spotsLeft <= 0 || booking) && styles.disabledButton]}
            onPress={handleBookSession}
            disabled={spotsLeft <= 0 || booking}
          >
            {booking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.bookButtonText}>
                {spotsLeft <= 0 ? 'Fully Booked' : 'Book Session'}
              </ThemedText>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContainer: {
    height: 300,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    backgroundColor: '#fff',
  },
  header: {
    marginBottom: 24,
  },
  category: {
    color: '#002fff',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  gymInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gymName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  location: {
    fontSize: 14,
    color: '#666',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 24,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#444',
    lineHeight: 24,
  },
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 12,
  },
  instructorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructorInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  instructorName: {
    fontSize: 16,
    fontWeight: '600',
  },
  scheduleCard: {
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scheduleText: {
    fontSize: 15,
    color: '#444',
  },
  bottomBar: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  priceContainer: {
    gap: 4,
  },
  priceLabel: {
    fontSize: 12,
    color: '#666',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002fff',
  },
  bookButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 160,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  checkInButton: {
    backgroundColor: '#4caf50',
  },
  checkedInButton: {
    backgroundColor: '#9e9e9e',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
