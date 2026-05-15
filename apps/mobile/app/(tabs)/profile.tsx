import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { authService } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  credits: number;
  subscription_tier: string | null;
  subscription_status: string | null;
  trial_credits_used: number | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
}

interface UpcomingBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  session_id: string;
  session_name: string;
  gym_name: string;
  gym_location: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadUpcomingBookings();
  }, []);

  // ── Load profile from `users` table ────────────────────────────────────────
  const loadUserProfile = async () => {
    try {
      setLoading(true);

      const session = await authService.getSession();
      if (!session || !session.user) {
        setIsGuest(true);
        setLoading(false);
        return;
      }

      // Use maybeSingle() to avoid PGRST116 error if row is missing
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading profile:', profileError);
        // We don't alert here because we can still show basic session info
      }

      if (profileData) {
        setUser(profileData as UserProfile);
      } else {
        // FALLBACK: If user exists in Auth but not in public.users table
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || 'User',
          phone: session.user.phone || null,
          credits: 0,
          subscription_tier: 'free_trial',
          subscription_status: 'active',
          trial_credits_used: 0,
          trial_start_date: null,
          trial_end_date: null,
          subscription_start_date: null,
          subscription_end_date: null,
          created_at: new Date().toISOString(),
        });
      }
      
      setIsGuest(false);
    } catch (err) {
      console.error('Profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load upcoming bookings via bookings → sessions → gyms ──────────────────
  const loadUpcomingBookings = async () => {
    try {
      const session = await authService.getSession();
      if (!session || !session.user) return;

      const today = new Date().toISOString().split('T')[0];

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          booking_time,
          status,
          session_id,
          sessions (
            id,
            name,
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
        setUpcomingBookings([]);
        return;
      }

      const transformed: UpcomingBooking[] = bookingsData.map((b: any) => ({
        id: b.id,
        booking_date: b.booking_date,
        booking_time: b.booking_time,
        status: b.status,
        session_id: b.session_id,
        session_name: b.sessions?.name ?? 'Session',
        gym_name: b.sessions?.gyms?.name ?? 'Gym',
        gym_location: b.sessions?.gyms?.location ?? '',
      }));

      setUpcomingBookings(transformed);
    } catch (err) {
      console.error('Bookings error:', err);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getInitials = (name: string | null | undefined): string => {
    if (!name || typeof name !== 'string') return 'U';
    return (
      name
        .trim()
        .split(' ')
        .filter((n) => n.length > 0)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'
    );
  };

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  const formatTime = (timeString: string): string => {
    if (!timeString) return '';
    const parts = timeString.split(':');
    if (parts.length < 2) return timeString;
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getSubscriptionLabel = (tier: string | null, status: string | null): string => {
    if (!tier) return '';
    const tierMap: Record<string, string> = {
      free_trial: 'Free Trial',
      basic: 'Basic',
      standard: 'Standard',
      premium: 'Premium',
    };
    const label = tierMap[tier] ?? tier.replace(/_/g, ' ');
    return status ? `${label} · ${status.charAt(0).toUpperCase() + status.slice(1)}` : label;
  };

  const getSubscriptionBadgeColor = (tier: string | null): string => {
    switch (tier) {
      case 'premium':
        return '#6a0dad';
      case 'standard':
        return '#002fff';
      case 'basic':
        return '#4caf50';
      case 'free_trial':
      default:
        return '#ff9800';
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // ── Guest state ──────────────────────────────────────────────────────────────

  if (isGuest) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.emptyStateSignIn}>
          <Ionicons name="person-circle-outline" size={64} color="#ccc" />
          <View style={styles.gettingStartedCard}>
            <ThemedText style={styles.gettingStartedTitle}>
              You need to be signed in
            </ThemedText>
            <ThemedText style={styles.gettingStartedDescription}>
              Sign in to view your account settings, manage your bookings, edit your
              subscription and manage your payment details.
            </ThemedText>
            <TouchableOpacity
              style={styles.exploreButt}
              onPress={() => router.push('/login')}
            >
              <ThemedText style={styles.exploreButtText}>
                Sign In or Create Your Account
              </ThemedText>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Authenticated state ──────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>

          {/* Avatar with initials */}
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {getInitials(user?.name)}
            </ThemedText>
          </View>

          <ThemedText type="title" style={styles.name}>
            {user?.name ?? 'User'}
          </ThemedText>
          <ThemedText style={styles.email}>{user?.email}</ThemedText>

          {user?.phone ? (
            <ThemedText style={styles.phone}>{user.phone}</ThemedText>
          ) : null}

          {/* Subscription badge */}
          {user?.subscription_tier && (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getSubscriptionBadgeColor(user.subscription_tier) },
              ]}
            >
              <ThemedText style={styles.statusBadgeText}>
                {getSubscriptionLabel(user.subscription_tier, user.subscription_status)}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Settings icon */}
        <TouchableOpacity
          style={styles.settingsIcon}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      {/* ── Credits card ── */}
      <View style={styles.creditsCard}>
        <View style={styles.creditsContent}>
          <Ionicons name="wallet-outline" size={32} color="#666" />
          <View style={styles.creditsInfo}>
            <ThemedText style={styles.creditsLabel}>Available Credits</ThemedText>
            <ThemedText style={styles.creditsValue}>{user?.credits ?? 0}</ThemedText>
          </View>
        </View>
        <TouchableOpacity
          style={styles.creditsButton}
          onPress={() => router.push('/add-credits')}
        >
          <ThemedText style={styles.creditsButtonText}>Add Credits</ThemedText>
        </TouchableOpacity>
      </View>

      {/* ── Subscription info (trial expiry / renewal date) ── */}
      {user?.subscription_tier === 'free_trial' && user.trial_end_date && (
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#ff9800" />
          <ThemedText style={styles.infoCardText}>
            Trial ends on {formatDate(user.trial_end_date)}
          </ThemedText>
        </View>
      )}

      {user?.subscription_tier !== 'free_trial' && user?.subscription_end_date && (
        <View style={styles.infoCard}>
          <Ionicons name="refresh-circle-outline" size={20} color="#002fff" />
          <ThemedText style={styles.infoCardText}>
            Subscription renews on {formatDate(user.subscription_end_date)}
          </ThemedText>
        </View>
      )}

      {/* ── Upcoming sessions ── */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Upcoming Sessions</ThemedText>

        {upcomingBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <ThemedText style={styles.emptyText}>No upcoming sessions</ThemedText>
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
            <TouchableOpacity
              key={booking.id}
              style={styles.classCard}
              onPress={() =>
                router.push(`/session-details?sessionId=${booking.session_id}`)
              }
              activeOpacity={0.7}
            >
              <View style={styles.classHeader}>
                <View style={styles.classInfo}>
                  <ThemedText style={styles.className}>
                    {booking.session_name}
                  </ThemedText>
                  <View style={styles.classLocation}>
                    <Ionicons name="location-outline" size={16} color="#666" />
                    <ThemedText style={styles.locationText}>
                      {booking.gym_name}
                      {booking.gym_location ? ` · ${booking.gym_location}` : ''}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.classStatusContainer}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: booking.status === 'confirmed' ? '#4caf50' : '#ff9800' },
                    ]}
                  />
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
                    {formatTime(booking.booking_time)}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
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
    marginBottom: 4,
  },
  phone: {
    color: '#666',
    fontSize: 14,
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

  // Info card (trial / renewal notice)
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbf0',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffe0b2',
  },
  infoCardText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },

  // Credits card
  creditsCard: {
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginBottom: 20,
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

  // Section
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

  // Booking card
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

  // Empty / guest states
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

  // Getting started / CTA card
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
});
