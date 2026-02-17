import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
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
}

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

  useEffect(() => {
    loadSessionDetails();
  }, [sessionId]);

  const loadSessionDetails = async () => {
    try {
      setLoading(true);

      const authSession = await authService.getSession();
      const currentUserId = authSession?.user.id || null;
      setUserId(currentUserId);

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select(`*, gyms (name, location)`)
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      const { count: bookingsCount, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('status', 'confirmed');

      if (countError) throw countError;
      setSpotsLeft(Math.max(0, (sessionData.max_capacity || 0) - (bookingsCount || 0)));

      if (currentUserId) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('credits')
          .eq('id', currentUserId)
          .single();

        if (userError) throw userError;
        setUserCredits(userData?.credits || 0);

        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('user_id', currentUserId)
          .eq('session_id', sessionId)
          .in('status', ['confirmed', 'pending'])
          .maybeSingle();

        if (bookingError && bookingError.code !== 'PGRST116') throw bookingError;
        setExistingBooking(bookingData);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  const handleBookSession = async () => {
    try {
      if (!userId) {
        Alert.alert('Sign In Required', 'Please sign in to book sessions', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/login') }
        ]);
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

      Alert.alert('Booked!', 'Session booked successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);

      setExistingBooking(bookingData);
      setUserCredits(userCredits - session.credits_required);
      setSpotsLeft(spotsLeft - 1);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to book session');
    } finally {
      setBooking(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
    } catch { return dateString; }
  };

  const formatTime = (timeString: string) => {
    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours);
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
      </View>
    );
  }

  const gymName = session.gyms?.name || 'Unknown Gym';
  const gymLocation = session.gyms?.location || '';
  const capacityPercent = Math.round(((session.max_capacity - spotsLeft) / session.max_capacity) * 100);
  const isUrgent = spotsLeft <= 3;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* ── HERO ─────────────────────────────── */}
        <View style={styles.heroContainer}>
          {session.image_url ? (
            <Image source={{ uri: session.image_url }} style={styles.heroImage} contentFit="cover" />
          ) : session.category ? (
            <Image
              source={{ uri: `https://source.unsplash.com/800x600/?${session.category},fitness` }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.heroImagePlaceholder}>
              <Ionicons name="barbell" size={80} color="rgba(255,255,255,0.3)" />
            </View>
          )}

          {/* Dark scrim */}
          <View style={styles.heroScrim} />

          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Category pill */}
          {session.category && (
            <View style={styles.categoryPill}>
              <ThemedText style={styles.categoryText}>{session.category.toUpperCase()}</ThemedText>
            </View>
          )}

          {/* Hero bottom text */}
          <View style={styles.heroBottom}>
            <ThemedText style={styles.heroTitle}>{session.name}</ThemedText>
            <View style={styles.heroMeta}>
              <View style={styles.heroDot} />
              <ThemedText style={styles.heroGymName}>{gymName}</ThemedText>
              {gymLocation ? (
                <>
                  <ThemedText style={styles.heroSep}>·</ThemedText>
                  <Ionicons name="location-sharp" size={13} color="rgba(255,255,255,0.75)" />
                  <ThemedText style={styles.heroLocationText}>{gymLocation}</ThemedText>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── FLOATING STATS CARD ───────────────── */}
        {/* ── DESCRIPTION ──────────────────────── */}
        {session.description && (
          <View style={styles.descCard}>
            <ThemedText style={styles.descText}>{session.description}</ThemedText>
          </View>
        )}

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons name="calendar" size={22} color="#666" />
            <ThemedText style={styles.statValue}>{formatDate(session.date)}</ThemedText>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Ionicons name="time" size={22} color="#666" />
            <ThemedText style={styles.statValue}>{formatTime(session.time)}</ThemedText>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Ionicons name="hourglass" size={22} color="#666" />
            <ThemedText style={styles.statValue}>{session.duration_minutes} min</ThemedText>
          </View>
        </View>

        {/* ── VENUE CARD ───────────────────────── */}
        {/* <View style={styles.card}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="business" size={22} color="#666" />
          </View>
          <View style={styles.cardContent}>
            <ThemedText style={styles.cardLabel}>VENUE</ThemedText>
            <ThemedText style={styles.cardTitle}>{gymName}</ThemedText>
            {gymLocation ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#888" />
                <ThemedText style={styles.locationText}>{gymLocation}</ThemedText>
              </View>
            ) : null}
          </View>
        </View> */}

        {/* ── AVAILABILITY ─────────────────────── */}
        <View style={styles.availCard}>
          <View style={styles.availHeader}>
            <ThemedText style={styles.availTitle}>Availability</ThemedText>
            <View style={[styles.badge, isUrgent && styles.badgeUrgent]}>
              <ThemedText style={[styles.badgeText, isUrgent && styles.badgeTextUrgent]}>
                {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
              </ThemedText>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[
              styles.fill,
              { width: `${capacityPercent}%` as any },
              isUrgent && styles.fillUrgent
            ]} />
          </View>
          <ThemedText style={styles.availMeta}>
            {session.max_capacity - spotsLeft} of {session.max_capacity} spots taken
          </ThemedText>
        </View>

        {/* ── INSTRUCTOR ───────────────────────── */}
        {session.instructor && (
          <View style={styles.card}>
            <View style={[styles.cardIconWrap, styles.instructorAvatarWrap]}>
              <ThemedText style={styles.instructorInitial}>
                {session.instructor.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.cardContent}>
              <ThemedText style={styles.cardLabel}>INSTRUCTOR</ThemedText>
              <ThemedText style={styles.cardTitle}>{session.instructor}</ThemedText>
              <ThemedText style={styles.cardSubtitle}>Certified Instructor</ThemedText>
            </View>
            <Ionicons name="checkmark-circle" size={20} color="#666" />
          </View>
        )}

        
        {/* ── CREDITS ──────────────────────────── */}
        <View style={styles.creditsCard}>
          <View>
            <ThemedText style={styles.creditsLabel}>SESSION COST</ThemedText>
            <View style={styles.creditsRow}>
              <ThemedText style={styles.creditsNumber}>{session.credits_required}</ThemedText>
              <ThemedText style={styles.creditsUnit}>credits</ThemedText>
            </View>
          </View>
          {userId && (
            <View style={styles.balanceBox}>
              <ThemedText style={styles.balanceLabel}>Your balance</ThemedText>
              <ThemedText style={[
                styles.balanceValue,
                userCredits < session.credits_required && styles.balanceLow
              ]}>
                {userCredits}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── STICKY CTA ───────────────────────── */}
      <View style={styles.footer}>
        {existingBooking ? (
          <View style={styles.bookedBanner}>
            <Ionicons name="checkmark-circle" size={22} color="#00c853" />
            <ThemedText style={styles.bookedText}>You're booked in!</ThemedText>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.bookBtn,
              (booking || !userId || userCredits < session.credits_required || spotsLeft <= 0)
              && styles.bookBtnDisabled
            ]}
            onPress={handleBookSession}
            disabled={booking || !userId || userCredits < session.credits_required || spotsLeft <= 0}
            activeOpacity={0.85}
          >
            {booking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.bookBtnText}>
                  {!userId
                    ? 'Sign In to Book'
                    : spotsLeft <= 0
                      ? 'Session Full'
                      : `Book · ${session.credits_required} Credits`}
                </ThemedText>
                {userId && spotsLeft > 0 && (
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                )}
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },

  // HERO
  heroContainer: { height: 460, position: 'relative' },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroImagePlaceholder: {
    width: '100%', height: '100%', position: 'absolute',
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  heroScrim: {
    position: 'absolute', inset: 0,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backButton: {
    position: 'absolute', top: 56, left: 20,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryPill: {
    position: 'absolute', top: 60, right: 20,
    backgroundColor: '#000000', paddingHorizontal: 12,
    paddingVertical: 5, borderRadius: 25,
  },
  categoryText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 24, paddingBottom: 30,
    backgroundColor: 'rgba(0,0,0,0.0)',
  },
  heroTitle: {
    fontSize: 28, fontWeight: '800', color: '#fff',
    letterSpacing: -0.5, marginBottom: 8, lineHeight: 34,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff' },
  heroGymName: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  heroSep: { color: '#fff)', fontSize: 14 },
  heroLocationText: { fontSize: 13, color: '#fff)' },

  // STATS CARD (floating)
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 5,
    borderRadius: 20, padding: 20,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 5 },
  statSep: { width: 1, backgroundColor: '#efefef', marginVertical: 4 },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#666', letterSpacing: 1.2, marginTop: 4 },
  statValue: { fontSize: 13, fontWeight: '700', color: '#111', textAlign: 'center' },

  // SHARED CARD
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10,
    borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardIconWrap: {
    width: 50, height: 50, borderRadius: 15,
    backgroundColor: '#eef0ff', alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardLabel: { fontSize: 9, fontWeight: '800', color: '#002fff', letterSpacing: 1.4, marginBottom: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  cardSubtitle: { fontSize: 13, color: '#888' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  locationText: { fontSize: 13, color: '#888' },

  // INSTRUCTOR
  instructorAvatarWrap: { backgroundColor: '#002fff' },
  instructorInitial: { fontSize: 22, fontWeight: '800', color: '#fff' },

  // AVAILABILITY
  availCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10,
    borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  availHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  availTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  badge: {
    backgroundColor: '#eef0ff', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 20,
  },
  badgeUrgent: { backgroundColor: '#fff0ee' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#002fff' },
  badgeTextUrgent: { color: '#ff3b30' },
  track: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  fill: { height: '100%', backgroundColor: '#002fff', borderRadius: 4 },
  fillUrgent: { backgroundColor: '#ff3b30' },
  availMeta: { fontSize: 12, color: '#aaa' },

  // DESCRIPTION
  descCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, padding: 8,
  },
  descText: {  color: '#555', lineHeight: 24, marginTop: 8 },

  // CREDITS
  creditsCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#002fff', marginHorizontal: 16, marginTop: 10,
    borderRadius: 20, padding: 22,
  },
  creditsLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.4, marginBottom: 4 },
  creditsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  creditsNumber: { fontSize: 52, fontWeight: '900', color: '#fff', lineHeight: 56 },
  creditsUnit: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 10 },
  balanceBox: { alignItems: 'flex-end' },
  balanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  balanceValue: { fontSize: 26, fontWeight: '800', color: '#fff' },
  balanceLow: { color: '#ffcc00' },

  // FOOTER
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', paddingHorizontal: 20,
    paddingTop: 16, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 10,
  },
  bookBtn: {
    backgroundColor: '#000000', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 25, gap: 8,
  },
  bookBtnDisabled: { opacity: 0.4 },
  bookBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  bookedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f0fff4', paddingVertical: 18, borderRadius: 25,
    gap: 10, borderWidth: 1.5, borderColor: '#00c853',
  },
  bookedText: { fontSize: 17, fontWeight: '700', color: '#00c853' },
});