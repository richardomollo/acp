import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { authService } from './services/auth';
import { Ionicons } from '@expo/vector-icons';

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
  spots_left: number;
}

interface Booking {
  id: string;
  status: string;
}

export default function SessionDetailsScreen() {
  const router = useRouter();
  const { sessionId, gymName } = useLocalSearchParams();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null);
  const [userCredits, setUserCredits] = useState(0);

  useEffect(() => {
    loadSessionDetails();
    checkExistingBooking();
    loadUserCredits();
  }, [sessionId]);

  const loadSessionDetails = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      setSession(data);
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  const loadUserCredits = async () => {
    try {
      const authSession = await authService.getSession();
      if (!authSession) return;

      const { data, error } = await supabase
        .from('users')
        .select('credits')
        .eq('id', authSession.user.id)
        .single();

      if (error) throw error;
      setUserCredits(data?.credits || 0);
    } catch (error) {
      console.error('Error loading credits:', error);
    }
  };

  const checkExistingBooking = async () => {
    try {
      const authSession = await authService.getSession();
      if (!authSession) return;

      const { data, error } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('user_id', authSession.user.id)
        .eq('session_id', sessionId)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setExistingBooking(data);
    } catch (error) {
      console.error('Error checking booking:', error);
    }
  };

  const handleBookSession = async () => {
    try {
      const authSession = await authService.getSession();
      
      if (!authSession) {
        Alert.alert('Sign In Required', 'Please sign in to book sessions', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/login') }
        ]);
        return;
      }

      if (!session) return;

      if (userCredits < session.credits_required) {
        Alert.alert(
          'Insufficient Credits',
          `You need ${session.credits_required} credits but only have ${userCredits}.`,
          [{ text: 'OK' }]
        );
        return;
      }

      if (session.spots_left <= 0) {
        Alert.alert('Session Full', 'This session is fully booked');
        return;
      }

      setBooking(true);

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert([
          {
            user_id: authSession.user.id,
            session_id: sessionId,
            gym_id: session.gym_id,
            booking_date: new Date().toISOString(),
            status: 'confirmed',
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      const { error: creditsError } = await supabase
        .from('users')
        .update({ credits: userCredits - session.credits_required })
        .eq('id', authSession.user.id);

      if (creditsError) throw creditsError;

      const { error: spotsError } = await supabase
        .from('sessions')
        .update({ spots_left: session.spots_left - 1 })
        .eq('id', sessionId);

      if (spotsError) throw spotsError;

      Alert.alert('Success!', 'Session booked successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);

      setExistingBooking(bookingData);
      setUserCredits(userCredits - session.credits_required);
      setSession({ ...session, spots_left: session.spots_left - 1 });
    } catch (error: any) {
      console.error('Error booking session:', error);
      Alert.alert('Error', error.message || 'Failed to book session');
    } finally {
      setBooking(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ThemedText>Session not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>Session Details</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.sessionHeader}>
          <View style={styles.iconContainer}>
            <Ionicons name="barbell" size={48} color="#fff" />
          </View>
          <ThemedText style={styles.sessionName}>{session.name}</ThemedText>
          <ThemedText style={styles.gymName}>{gymName as string}</ThemedText>
        </View>

        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={24} color="#002fff" />
            <ThemedText style={styles.infoCardLabel}>Date</ThemedText>
            <ThemedText style={styles.infoCardValue}>{formatDate(session.date)}</ThemedText>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="time-outline" size={24} color="#002fff" />
            <ThemedText style={styles.infoCardLabel}>Time</ThemedText>
            <ThemedText style={styles.infoCardValue}>{session.time}</ThemedText>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="hourglass-outline" size={24} color="#002fff" />
            <ThemedText style={styles.infoCardLabel}>Duration</ThemedText>
            <ThemedText style={styles.infoCardValue}>{session.duration_minutes} min</ThemedText>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="people-outline" size={24} color="#002fff" />
            <ThemedText style={styles.infoCardLabel}>Spots Left</ThemedText>
            <ThemedText style={styles.infoCardValue}>{session.spots_left}</ThemedText>
          </View>
        </View>

        {session.instructor && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Instructor</ThemedText>
            <View style={styles.instructorCard}>
              <View style={styles.instructorAvatar}>
                <Ionicons name="person" size={32} color="#fff" />
              </View>
              <View style={styles.instructorInfo}>
                <ThemedText style={styles.instructorName}>{session.instructor}</ThemedText>
                <ThemedText style={styles.instructorTitle}>Certified Instructor</ThemedText>
              </View>
            </View>
          </View>
        )}

        {session.description && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About This Session</ThemedText>
            <ThemedText style={styles.description}>{session.description}</ThemedText>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Credits Required</ThemedText>
          <View style={styles.creditsCard}>
            <View style={styles.creditsLeft}>
              <Ionicons name="wallet" size={32} color="#002fff" />
              <View>
                <ThemedText style={styles.creditsAmount}>{session.credits_required} Credits</ThemedText>
                <ThemedText style={styles.creditsBalance}>You have {userCredits} credits</ThemedText>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {existingBooking ? (
          <View style={styles.bookedContainer}>
            <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
            <ThemedText style={styles.bookedText}>Already Booked</ThemedText>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.bookButton, (booking || userCredits < session.credits_required || session.spots_left <= 0) && styles.bookButtonDisabled]}
            onPress={handleBookSession}
            disabled={booking || userCredits < session.credits_required || session.spots_left <= 0}
          >
            {booking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.bookButtonText}>
                {session.spots_left <= 0 ? 'Session Full' : `Book for ${session.credits_required} Credits`}
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
  centerContent: {
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
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  sessionHeader: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f8f8',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sessionName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  gymName: {
    fontSize: 16,
    color: '#666',
  },
  infoCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  infoCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  infoCardLabel: {
    fontSize: 13,
    color: '#666',
  },
  infoCardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  section: {
    padding: 20,
    borderTopWidth: 8,
    borderTopColor: '#f8f8f8',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  instructorAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructorInfo: {
    flex: 1,
  },
  instructorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  instructorTitle: {
    fontSize: 14,
    color: '#666',
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  creditsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
  },
  creditsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditsAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  creditsBalance: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  bookButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  bookedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  bookedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4caf50',
  },
});