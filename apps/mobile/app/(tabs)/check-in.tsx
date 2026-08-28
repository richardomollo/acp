import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';
import { useAuthModal } from '@/contexts/auth-modal-context';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string;
  status: string;
  confirmation_code: string | null;
  checked_in: boolean;
  check_in_time: string | null;
  deposit_amount: number | null;
  remainder_amount: number | null;
  session_price: number | null;
  sessions: {
    name: string;
    date: string;
    time: string;
    gyms: { name: string; location: string } | null;
  } | null;
}

interface PTBooking {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  payment_method: string | null;
  confirmation_code: string | null;
  checked_in: boolean;
  check_in_time: string | null;
  pt_offerings: { title: string; duration_minutes: number } | null;
  personal_trainers: { full_name: string; professional_name: string | null } | null;
}

interface ExperienceBooking {
  id: string;
  status: string;
  confirmation_code: string | null;
  deposit_amount: number | null;
  remainder_amount: number | null;
  created_at: string;
  experience_id: string;
  experiences: {
    name: string;
    date: string;
    start_time: string;
    gyms: { id: string; name: string; location: string } | null;
  } | null;
}

interface UserProfile {
  name: string;
  email: string;
}

type TabType = 'upcoming' | 'past';

type DisplayItem =
  | { kind: 'class'; data: Booking }
  | { kind: 'pt'; data: PTBooking }
  | { kind: 'experience'; data: ExperienceBooking };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return d; }
};

const formatTime = (t: string) => {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
};

// ─── Component ────────────────────────────────────────────────────────────────

const CHECKIN_TOUR: TourStep[] = [
  {
    icon: 'qr-code-outline',
    title: 'Your Check-In Code',
    description: 'When you arrive at a booked session, tap any upcoming booking to pull up your QR code. Show it at the front desk to check in instantly.',
  },
  {
    icon: 'list-outline',
    title: 'All Your Bookings in One Place',
    description: 'Switch between Upcoming and Past bookings. Tap any session to view its details, QR code, or get directions to the venue.',
  },
];

export default function BookingsScreen() {
  const router = useRouter();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('check-in');
  const { showAuthModal } = useAuthModal();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [upcomingPTBookings, setUpcomingPTBookings] = useState<PTBooking[]>([]);
  const [pastPTBookings, setPastPTBookings] = useState<PTBooking[]>([]);
  const [upcomingExperiences, setUpcomingExperiences] = useState<ExperienceBooking[]>([]);
  const [pastExperiences, setPastExperiences] = useState<ExperienceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  // Check-in modal (class bookings)
  const [checkInVisible, setCheckInVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  // Check-in modal (PT bookings)
  const [ptCheckInVisible, setPtCheckInVisible] = useState(false);
  const [selectedPTBooking, setSelectedPTBooking] = useState<PTBooking | null>(null);
  const [ptCheckingIn, setPtCheckingIn] = useState(false);

  // Check-in modal (experience bookings)
  const [expCheckInVisible, setExpCheckInVisible] = useState(false);
  const [selectedExperienceBooking, setSelectedExperienceBooking] = useState<ExperienceBooking | null>(null);
  const [expCheckingIn, setExpCheckingIn] = useState(false);


  useFocusEffect(useCallback(() => { loadData(); }, []));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadData(); });
    return () => subscription.unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const authSession = await authService.getSession();

      if (!authSession?.user) {
        setIsGuest(true);
        return;
      }

      setIsGuest(false);

      const { data: userData } = await supabase
        .from('users').select('name, email')
        .eq('id', authSession.user.id).maybeSingle();

      setUser(userData ?? {
        name: authSession.user.user_metadata?.full_name || 'User',
        email: authSession.user.email || '',
      });

      const today = new Date().toISOString().split('T')[0];
      const bookingQuery = `*, sessions(name, date, time, gyms(name, location))`;

      const { data: upcomingData } = await supabase
        .from('bookings').select(bookingQuery)
        .eq('user_id', authSession.user.id)
        .in('status', ['pending_payment', 'deposit_paid', 'confirmed', 'checked_in'])
        .gte('booking_date', today)
        .order('booking_date', { ascending: true });

      const { data: pastData } = await supabase
        .from('bookings').select(bookingQuery)
        .eq('user_id', authSession.user.id)
        .lt('booking_date', today)
        .order('booking_date', { ascending: false })
        .limit(20);

      setUpcomingBookings((upcomingData as Booking[]) ?? []);
      setPastBookings((pastData as Booking[]) ?? []);

      const ptQueryFull = `id, scheduled_date, scheduled_time, status, payment_method, confirmation_code, checked_in, check_in_time, pt_offerings(title, duration_minutes), personal_trainers!pt_id(full_name, professional_name)`;
      const ptQueryBasic = `id, scheduled_date, scheduled_time, status, payment_method, pt_offerings(title, duration_minutes), personal_trainers!pt_id(full_name, professional_name)`;

      const [upcomingPTRes, pastPTRes] = await Promise.all([
        supabase.from('pt_bookings').select(ptQueryFull)
          .eq('user_id', authSession.user.id)
          .in('status', ['pending', 'confirmed'])
          .gte('scheduled_date', today)
          .order('scheduled_date', { ascending: true }),
        supabase.from('pt_bookings').select(ptQueryFull)
          .eq('user_id', authSession.user.id)
          .lt('scheduled_date', today)
          .order('scheduled_date', { ascending: false })
          .limit(20),
      ]);

      // Fall back to basic query if check-in migration columns don't exist yet
      let upcomingPTData = upcomingPTRes.data;
      let pastPTData = pastPTRes.data;
      if (upcomingPTRes.error || pastPTRes.error) {
        const [upcomingFallback, pastFallback] = await Promise.all([
          supabase.from('pt_bookings').select(ptQueryBasic)
            .eq('user_id', authSession.user.id)
            .in('status', ['pending', 'confirmed'])
            .gte('scheduled_date', today)
            .order('scheduled_date', { ascending: true }),
          supabase.from('pt_bookings').select(ptQueryBasic)
            .eq('user_id', authSession.user.id)
            .lt('scheduled_date', today)
            .order('scheduled_date', { ascending: false })
            .limit(20),
        ]);
        upcomingPTData = upcomingFallback.data as any;
        pastPTData = pastFallback.data as any;
      }

      setUpcomingPTBookings((upcomingPTData as unknown as PTBooking[]) ?? []);
      setPastPTBookings((pastPTData as unknown as PTBooking[]) ?? []);

      // Experience bookings — query by user_id AND by email (bookings made
      // while logged out never get a user_id set), mirroring the web fix.
      const expSelect = `id, status, confirmation_code, deposit_amount, remainder_amount, created_at, experience_id, experiences!experience_id(name, date, start_time, gyms!gym_id(id, name, location))`;
      const expStatuses = ['deposit_paid', 'confirmed', 'checked_in'];
      const userEmail = authSession.user.email;

      const [expByUserIdRes, expByEmailRes] = await Promise.all([
        supabase.from('experience_bookings').select(expSelect)
          .eq('user_id', authSession.user.id)
          .in('status', expStatuses)
          .order('created_at', { ascending: false })
          .limit(20),
        userEmail
          ? supabase.from('experience_bookings').select(expSelect)
              .eq('email', userEmail)
              .is('user_id', null)
              .in('status', expStatuses)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const expSeen = new Set<string>();
      const allExperiences = [...(expByUserIdRes.data ?? []), ...(expByEmailRes.data ?? [])]
        .filter((r: any) => { if (expSeen.has(r.id)) return false; expSeen.add(r.id); return true; }) as unknown as ExperienceBooking[];

      setUpcomingExperiences(allExperiences.filter(e => (e.experiences?.date ?? '') >= today));
      setPastExperiences(allExperiences.filter(e => (e.experiences?.date ?? '') < today));
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckInPress = async (booking: Booking) => {
    if (!booking.confirmation_code) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase
        .from('bookings').update({ confirmation_code: code }).eq('id', booking.id);
      if (!error) booking.confirmation_code = code;
    }
    setSelectedBooking(booking);
    setCheckInVisible(true);
  };

  const handleCheckIn = async () => {
    if (!selectedBooking) return;
    setCheckingIn(true);
    try {
      const { error } = await supabase.from('bookings').update({
        status: 'checked_in',
        checked_in: true,
        check_in_time: new Date().toISOString(),
      }).eq('id', selectedBooking.id);

      if (error) throw error;

      setCheckInVisible(false);
      Alert.alert('Checked in!', 'Enjoy your session.');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check in.');
    } finally {
      setCheckingIn(false);
    }
  };

  const handlePTCheckInPress = async (booking: PTBooking) => {
    if (!booking.confirmation_code) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase
        .from('pt_bookings').update({ confirmation_code: code }).eq('id', booking.id);
      if (!error) booking.confirmation_code = code;
    }
    setSelectedPTBooking(booking);
    setPtCheckInVisible(true);
  };

  const handlePTCheckIn = async () => {
    if (!selectedPTBooking) return;
    setPtCheckingIn(true);
    try {
      const { error } = await supabase.from('pt_bookings').update({
        checked_in: true,
        check_in_time: new Date().toISOString(),
        status: 'completed',
      }).eq('id', selectedPTBooking.id);

      if (error) throw error;

      setPtCheckInVisible(false);
      Alert.alert('Checked in!', 'Enjoy your PT session.');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check in.');
    } finally {
      setPtCheckingIn(false);
    }
  };

  const handleExperienceCheckInPress = async (booking: ExperienceBooking) => {
    if (!booking.confirmation_code) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase
        .from('experience_bookings').update({ confirmation_code: code }).eq('id', booking.id);
      if (!error) booking.confirmation_code = code;
    }
    setSelectedExperienceBooking(booking);
    setExpCheckInVisible(true);
  };

  const handleExperienceCheckIn = async () => {
    if (!selectedExperienceBooking) return;
    setExpCheckingIn(true);
    try {
      const { error } = await supabase.from('experience_bookings').update({
        status: 'checked_in',
      }).eq('id', selectedExperienceBooking.id);

      if (error) throw error;

      setExpCheckInVisible(false);
      Alert.alert('Checked in!', 'Enjoy your experience.');
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check in.');
    } finally {
      setExpCheckingIn(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  // ── Guest state ────────────────────────────────────────────────────────────

  if (isGuest) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={[palette.blue100, 'rgba(208,224,255,0)']}
          style={styles.topFadeBg}
          pointerEvents="none"
        />
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>My Bookings</ThemedText>
        </View>
        <View style={styles.guestContainer}>
          <View style={styles.guestIconWrap}>
            <Ionicons name="qr-code-outline" size={48} color={palette.blue500} />
          </View>
          <ThemedText style={styles.guestTitle}>Let's get checked in</ThemedText>
          <ThemedText style={styles.guestSubtitle}>
            Sign in to view your bookings and check in to your classes.
          </ThemedText>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => showAuthModal(() => loadData())}>
            <ThemedText style={styles.primaryBtnText}>Sign In</ThemedText>
            <Ionicons name="arrow-forward" size={18} color={palette.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => showAuthModal(() => loadData())}>
            <ThemedText style={styles.secondaryBtnText}>Create Account</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main content ───────────────────────────────────────────────────────────

  const buildMerged = (classes: Booking[], ptSessions: PTBooking[], experiences: ExperienceBooking[]): DisplayItem[] => {
    const items: DisplayItem[] = [
      ...classes.map(d => ({ kind: 'class' as const, data: d })),
      ...ptSessions.map(d => ({ kind: 'pt' as const, data: d })),
      ...experiences.map(d => ({ kind: 'experience' as const, data: d })),
    ];
    const dateOf = (item: DisplayItem) =>
      item.kind === 'class' ? item.data.booking_date
      : item.kind === 'pt' ? item.data.scheduled_date
      : item.data.experiences?.date ?? item.data.created_at;
    items.sort((a, b) => {
      const dateA = dateOf(a);
      const dateB = dateOf(b);
      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });
    return items;
  };

  const displayItems = activeTab === 'upcoming'
    ? buildMerged(upcomingBookings, upcomingPTBookings, upcomingExperiences)
    : buildMerged(pastBookings, pastPTBookings, pastExperiences).reverse();

  const upcomingCount = upcomingBookings.length + upcomingPTBookings.length + upcomingExperiences.length;
  const pastCount = pastBookings.length + pastPTBookings.length + pastExperiences.length;

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={styles.topFadeBg}
        pointerEvents="none"
      />
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>My Bookings</ThemedText>
        {user?.name ? (
          <ThemedText style={styles.headerSubtitle}>{user.name}</ThemedText>
        ) : null}
      </View>

      {/* Segmented tab control */}
      <View style={styles.tabBar}>
        <View style={styles.tabPill}>
          <TouchableOpacity
            style={[styles.tabPillItem, activeTab === 'upcoming' && styles.tabPillItemActive]}
            onPress={() => setActiveTab('upcoming')}
          >
            <ThemedText style={[styles.tabPillText, activeTab === 'upcoming' && styles.tabPillTextActive]}>
              Upcoming {upcomingCount > 0 ? `(${upcomingCount})` : ''}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPillItem, activeTab === 'past' && styles.tabPillItemActive]}
            onPress={() => setActiveTab('past')}
          >
            <ThemedText style={[styles.tabPillText, activeTab === 'past' && styles.tabPillTextActive]}>
              Past {pastCount > 0 ? `(${pastCount})` : ''}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Booking list */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>

        {displayItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
              size={52}
              color={palette.gray200}
            />
            <ThemedText style={styles.emptyTitle}>
              {activeTab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
            </ThemedText>
            {activeTab === 'upcoming' && (
              <>
                <ThemedText style={styles.emptySubtitle}>
                  Browse classes and book your next session to get started.
                </ThemedText>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => router.push('/(tabs)/classes')}
                >
                  <ThemedText style={styles.primaryBtnText}>Explore Classes</ThemedText>
                  <Ionicons name="arrow-forward" size={18} color={palette.white} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          displayItems.map(item => {
            if (item.kind === 'pt') {
              const pt = item.data;
              const trainerName = pt.personal_trainers?.professional_name || pt.personal_trainers?.full_name || 'Trainer';
              const isFree = pt.payment_method === 'free';
              return (
                <View
                  key={`pt-${pt.id}`}
                  style={[styles.bookingCard, activeTab === 'past' && styles.bookingCardPast]}
                >
                  <View style={[
                    styles.accent,
                    pt.checked_in
                      ? styles.accentGreen
                      : activeTab === 'past'
                      ? styles.accentGrey
                      : styles.accentIndigo,
                  ]} />
                  <View style={styles.bookingBody}>
                    <View style={styles.bookingTopRow}>
                      <ThemedText style={[styles.bookingName, activeTab === 'past' && styles.textMuted]} numberOfLines={1}>
                        {pt.pt_offerings?.title || 'PT Session'}
                      </ThemedText>
                      {pt.checked_in ? (
                        <View style={styles.badgeGreen}>
                          <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
                          <ThemedText style={styles.badgeGreenText}>Checked In</ThemedText>
                        </View>
                      ) : activeTab === 'past' ? (
                        <View style={styles.badgeGrey}>
                          <ThemedText style={styles.badgeGreyText}>Completed</ThemedText>
                        </View>
                      ) : (
                        <View style={styles.badgeIndigo}>
                          <ThemedText style={styles.badgeIndigoText}>PT Session</ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="person-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                      <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                        {trainerName}
                        {pt.pt_offerings?.duration_minutes ? ` · ${pt.pt_offerings.duration_minutes} min` : ''}
                        {isFree ? ' · Free intro' : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                      <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                        {formatDate(pt.scheduled_date)}
                        {pt.scheduled_time ? ` · ${formatTime(pt.scheduled_time)}` : ''}
                      </ThemedText>
                    </View>
                    {activeTab === 'upcoming' && !pt.checked_in && (
                      <TouchableOpacity
                        style={styles.checkInBtn}
                        onPress={() => handlePTCheckInPress(pt)}
                      >
                        <Ionicons name="qr-code-outline" size={16} color="#fff" />
                        <ThemedText style={styles.checkInBtnText}>Check In</ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }

            if (item.kind === 'experience') {
              const exp = item.data;
              const checkedIn = exp.status === 'checked_in';
              return (
                <View
                  key={`exp-${exp.id}`}
                  style={[styles.bookingCard, activeTab === 'past' && styles.bookingCardPast]}
                >
                  <View style={[
                    styles.accent,
                    checkedIn
                      ? styles.accentGreen
                      : activeTab === 'past'
                      ? styles.accentGrey
                      : styles.accentAmber,
                  ]} />
                  <View style={styles.bookingBody}>
                    <View style={styles.bookingTopRow}>
                      <ThemedText style={[styles.bookingName, activeTab === 'past' && styles.textMuted]} numberOfLines={1}>
                        {exp.experiences?.name || 'Experience'}
                      </ThemedText>
                      {checkedIn ? (
                        <View style={styles.badgeGreen}>
                          <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
                          <ThemedText style={styles.badgeGreenText}>Checked In</ThemedText>
                        </View>
                      ) : activeTab === 'past' ? (
                        <View style={styles.badgeGrey}>
                          <ThemedText style={styles.badgeGreyText}>Completed</ThemedText>
                        </View>
                      ) : (
                        <View style={styles.badgeAmberSolid}>
                          <ThemedText style={styles.badgeAmberSolidText}>Experience</ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                      <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                        {exp.experiences?.gyms?.name || 'Venue'}
                        {exp.experiences?.gyms?.location ? ` · ${exp.experiences.gyms.location}` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                      <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                        {formatDate(exp.experiences?.date || exp.created_at)}
                        {exp.experiences?.start_time ? ` · ${formatTime(exp.experiences.start_time)}` : ''}
                      </ThemedText>
                    </View>

                    {exp.deposit_amount != null && exp.deposit_amount > 0 && (
                      <View style={styles.depositRow}>
                        <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
                        <ThemedText style={styles.depositText}>
                          KES {exp.deposit_amount.toLocaleString()} deposit paid
                        </ThemedText>
                        {exp.remainder_amount != null && exp.remainder_amount > 0 && (
                          exp.status === 'confirmed' || checkedIn ? (
                            <ThemedText style={[styles.remainderText, { color: palette.success700 }]}>
                              {' · '}KES {exp.remainder_amount.toLocaleString()} balance paid
                            </ThemedText>
                          ) : (
                            <ThemedText style={styles.remainderText}>
                              {' · '}KES {exp.remainder_amount.toLocaleString()} balance due
                            </ThemedText>
                          )
                        )}
                      </View>
                    )}

                    {activeTab === 'upcoming' && !checkedIn && exp.status === 'deposit_paid' && exp.remainder_amount != null && exp.remainder_amount > 0 && (
                      <TouchableOpacity style={styles.payBalanceBtn} onPress={() => router.push({
                        pathname: '/checkout',
                        params: {
                          mode: 'balance',
                          existingBookingId: exp.id,
                          existingConfirmationCode: exp.confirmation_code ?? '',
                          bookingType: 'experience',
                          itemId: exp.id,
                          title: exp.experiences?.name ?? 'Experience',
                          subtitle: exp.experiences?.gyms?.name ?? '',
                          totalPrice: String(exp.remainder_amount ?? 0),
                          depositAmount: String(exp.remainder_amount ?? 0),
                          remainderAmount: '0',
                        },
                      } as any)}>
                        <Ionicons name="card-outline" size={15} color={palette.blue500} />
                        <ThemedText style={styles.payBalanceBtnText}>
                          Pay KES {(exp.remainder_amount ?? 0).toLocaleString()} balance to check in
                        </ThemedText>
                        <Ionicons name="chevron-forward" size={14} color={palette.blue500} />
                      </TouchableOpacity>
                    )}

                    {activeTab === 'upcoming' && !checkedIn && exp.status === 'confirmed' && (
                      <TouchableOpacity style={styles.checkInBtn} onPress={() => handleExperienceCheckInPress(exp)}>
                        <Ionicons name="qr-code-outline" size={16} color="#fff" />
                        <ThemedText style={styles.checkInBtnText}>Check In</ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }

            const booking = item.data;
            return (
              <View
                key={`class-${booking.id}`}
                style={[styles.bookingCard, activeTab === 'past' && styles.bookingCardPast]}
              >
                <View style={[
                  styles.accent,
                  booking.checked_in
                    ? styles.accentGreen
                    : activeTab === 'past'
                    ? styles.accentGrey
                    : styles.accentBlue,
                ]} />
                <View style={styles.bookingBody}>
                  <View style={styles.bookingTopRow}>
                    <ThemedText style={[styles.bookingName, activeTab === 'past' && styles.textMuted]} numberOfLines={1}>
                      {booking.sessions?.name || 'Class'}
                    </ThemedText>
                    {booking.checked_in ? (
                      <View style={styles.badgeGreen}>
                        <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
                        <ThemedText style={styles.badgeGreenText}>Checked In</ThemedText>
                      </View>
                    ) : booking.status === 'pending_payment' ? (
                      <View style={styles.badgeAmber}>
                        <Ionicons name="time-outline" size={13} color="#92400e" />
                        <ThemedText style={styles.badgeAmberText}>Payment Pending</ThemedText>
                      </View>
                    ) : activeTab === 'past' ? (
                      <View style={styles.badgeGrey}>
                        <ThemedText style={styles.badgeGreyText}>Completed</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                    <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                      {booking.sessions?.gyms?.name || 'Venue'}
                      {booking.sessions?.gyms?.location ? ` · ${booking.sessions.gyms.location}` : ''}
                    </ThemedText>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={activeTab === 'past' ? palette.gray200 : palette.gray450} />
                    <ThemedText style={[styles.metaText, activeTab === 'past' && styles.textMuted]}>
                      {formatDate(booking.sessions?.date || booking.booking_date)}
                      {' · '}
                      {formatTime(booking.sessions?.time || booking.booking_time)}
                    </ThemedText>
                  </View>

                  {/* Deposit / balance summary */}
                  {booking.deposit_amount != null && booking.deposit_amount > 0 && (
                    <View style={styles.depositRow}>
                      <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
                      <ThemedText style={styles.depositText}>
                        KES {booking.deposit_amount.toLocaleString()} deposit paid
                      </ThemedText>
                      {booking.remainder_amount != null && booking.remainder_amount > 0 && (
                        booking.status === 'confirmed' ? (
                          <ThemedText style={[styles.remainderText, { color: palette.success700 }]}>
                            {' · '}KES {booking.remainder_amount.toLocaleString()} balance paid
                          </ThemedText>
                        ) : (
                          <ThemedText style={styles.remainderText}>
                            {' · '}KES {booking.remainder_amount.toLocaleString()} balance due
                          </ThemedText>
                        )
                      )}
                    </View>
                  )}

                  {/* Pay balance to unlock check-in */}
                  {activeTab === 'upcoming' && !booking.checked_in && booking.status === 'deposit_paid' && (
                    <TouchableOpacity style={styles.payBalanceBtn} onPress={() => router.push({
                      pathname: '/checkout',
                      params: {
                        mode: 'balance',
                        existingBookingId: booking.id,
                        existingConfirmationCode: booking.confirmation_code ?? '',
                        bookingType: 'session',
                        itemId: booking.id,
                        title: booking.sessions?.name ?? 'Session',
                        subtitle: booking.sessions?.gyms?.name ?? '',
                        totalPrice: String(booking.remainder_amount ?? 0),
                        depositAmount: String(booking.remainder_amount ?? 0),
                        remainderAmount: '0',
                      },
                    } as any)}>
                      <Ionicons name="card-outline" size={15} color={palette.blue500} />
                      <ThemedText style={styles.payBalanceBtnText}>
                        Pay KES {(booking.remainder_amount ?? 0).toLocaleString()} balance to check in
                      </ThemedText>
                      <Ionicons name="chevron-forward" size={14} color={palette.blue500} />
                    </TouchableOpacity>
                  )}

                  {/* Check in (fully paid / confirmed) */}
                  {activeTab === 'upcoming' && !booking.checked_in && booking.status === 'confirmed' && (
                    <TouchableOpacity style={styles.checkInBtn} onPress={() => handleCheckInPress(booking)}>
                      <Ionicons name="qr-code-outline" size={16} color="#fff" />
                      <ThemedText style={styles.checkInBtnText}>Check In</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── PT Check-in modal ── */}
      <Modal visible={ptCheckInVisible} transparent animationType="slide" onRequestClose={() => setPtCheckInVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalTitle}>Check In</ThemedText>
              <TouchableOpacity onPress={() => setPtCheckInVisible(false)}>
                <Ionicons name="close" size={24} color={palette.gray450} />
              </TouchableOpacity>
            </View>

            {selectedPTBooking && (
              <>
                <ThemedText style={styles.modalSessionName} numberOfLines={2}>
                  {selectedPTBooking.pt_offerings?.title || 'PT Session'}
                </ThemedText>
                <ThemedText style={styles.modalGymName}>
                  {selectedPTBooking.personal_trainers?.professional_name || selectedPTBooking.personal_trainers?.full_name || 'Trainer'}
                  {selectedPTBooking.pt_offerings?.duration_minutes
                    ? ` · ${selectedPTBooking.pt_offerings.duration_minutes} min`
                    : ''}
                </ThemedText>

                <View style={styles.qrCard}>
                  <ThemedText style={styles.qrLabel}>Scan to check in</ThemedText>
                  <View style={styles.qrWrap}>
                    <QRCode
                      value={selectedPTBooking.confirmation_code ?? 'INVALID'}
                      size={180}
                      color={palette.navy}
                      backgroundColor={palette.white}
                    />
                  </View>
                  <View style={styles.codePill}>
                    <ThemedText style={styles.codeLabel}>Or show code</ThemedText>
                    <ThemedText style={styles.codeValue}>{selectedPTBooking.confirmation_code}</ThemedText>
                  </View>
                  <ThemedText style={styles.codeHint}>Partner scans this QR or enters the code above.</ThemedText>
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, ptCheckingIn && { opacity: 0.6 }]}
                  onPress={handlePTCheckIn}
                  disabled={ptCheckingIn}
                >
                  {ptCheckingIn ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmBtnText}>Confirm Check In</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Experience Check-in modal ── */}
      <Modal visible={expCheckInVisible} transparent animationType="slide" onRequestClose={() => setExpCheckInVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalTitle}>Check In</ThemedText>
              <TouchableOpacity onPress={() => setExpCheckInVisible(false)}>
                <Ionicons name="close" size={24} color={palette.gray450} />
              </TouchableOpacity>
            </View>

            {selectedExperienceBooking && (
              <>
                <ThemedText style={styles.modalSessionName} numberOfLines={2}>
                  {selectedExperienceBooking.experiences?.name || 'Experience'}
                </ThemedText>
                <ThemedText style={styles.modalGymName}>
                  {selectedExperienceBooking.experiences?.gyms?.name || 'Venue'}
                </ThemedText>

                <View style={styles.qrCard}>
                  <ThemedText style={styles.qrLabel}>Scan to check in</ThemedText>
                  <View style={styles.qrWrap}>
                    <QRCode
                      value={selectedExperienceBooking.confirmation_code ?? 'INVALID'}
                      size={180}
                      color={palette.navy}
                      backgroundColor={palette.white}
                    />
                  </View>
                  <View style={styles.codePill}>
                    <ThemedText style={styles.codeLabel}>Or show code</ThemedText>
                    <ThemedText style={styles.codeValue}>{selectedExperienceBooking.confirmation_code}</ThemedText>
                  </View>
                  <ThemedText style={styles.codeHint}>Partner scans this QR or enters the code above.</ThemedText>
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, expCheckingIn && { opacity: 0.6 }]}
                  onPress={handleExperienceCheckIn}
                  disabled={expCheckingIn}
                >
                  {expCheckingIn ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmBtnText}>Confirm Check In</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Class Check-in modal ── */}
      <Modal visible={checkInVisible} transparent animationType="slide" onRequestClose={() => setCheckInVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <ThemedText style={styles.modalTitle}>Check In</ThemedText>
              <TouchableOpacity onPress={() => setCheckInVisible(false)}>
                <Ionicons name="close" size={24} color={palette.gray450} />
              </TouchableOpacity>
            </View>

            {selectedBooking && (
              <>
                <ThemedText style={styles.modalSessionName} numberOfLines={2}>
                  {selectedBooking.sessions?.name}
                </ThemedText>
                <ThemedText style={styles.modalGymName}>
                  {selectedBooking.sessions?.gyms?.name}
                </ThemedText>

                {/* QR code */}
                <View style={styles.qrCard}>
                  <ThemedText style={styles.qrLabel}>Scan to check in</ThemedText>
                  <View style={styles.qrWrap}>
                    <QRCode
                      value={selectedBooking.confirmation_code ?? 'INVALID'}
                      size={180}
                      color={palette.navy}
                      backgroundColor={palette.white}
                    />
                  </View>
                  <View style={styles.codePill}>
                    <ThemedText style={styles.codeLabel}>Or show code</ThemedText>
                    <ThemedText style={styles.codeValue}>{selectedBooking.confirmation_code}</ThemedText>
                  </View>
                  <ThemedText style={styles.codeHint}>Partner scans this QR or enters the code above.</ThemedText>
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, checkingIn && { opacity: 0.6 }]}
                  onPress={handleCheckIn}
                  disabled={checkingIn}
                >
                  {checkingIn ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmBtnText}>Confirm Check In</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <TourOverlay visible={tourVisible} steps={CHECKIN_TOUR} onDismiss={dismissTour} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: fontSize['3xl'], fontWeight: 'bold', color: palette.ink900, paddingTop: 5 },
  headerSubtitle: { fontSize: fontSize.base, color: palette.gray450, marginTop: 2 },

  // Guest state
  guestContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
    paddingBottom: 60,
  },
  guestIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: palette.blue50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  guestTitle: { fontSize: fontSize.xl, fontWeight: 'bold', color: palette.ink900, textAlign: 'center' },
  guestSubtitle: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 22, marginBottom: 8 },

  // Buttons
  primaryBtn: {
    backgroundColor: palette.ink900,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 4,
  },
  primaryBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12 },
  secondaryBtnText: { color: palette.blue500, fontSize: fontSize.base, fontWeight: '600' },

  // Segmented tab
  tabBar: { paddingHorizontal: 20, paddingBottom: 16 },
  tabPill: {
    flexDirection: 'row',
    backgroundColor: palette.hairline,
    borderRadius: 14,
    padding: 4,
  },
  tabPillItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabPillItemActive: { backgroundColor: palette.ink900 },
  tabPillText: { fontSize: fontSize.base, fontWeight: '600', color: palette.gray300 },
  tabPillTextActive: { color: palette.white },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: palette.gray450, marginTop: 4 },
  emptySubtitle: { fontSize: fontSize.base, color: palette.gray300, textAlign: 'center', lineHeight: 20, marginBottom: 4 },

  // Booking card
  bookingCard: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.borderFaint,
    overflow: 'hidden',
    shadowColor: palette.ink900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  bookingCardPast: { backgroundColor: palette.surfaceMuted, borderColor: palette.hairline },

  accent: { width: 4 },
  accentBlue: { backgroundColor: palette.blue500 },
  accentGreen: { backgroundColor: palette.success700 },
  accentGrey: { backgroundColor: palette.borderFaint },
  accentIndigo: { backgroundColor: '#6366f1' },
  accentAmber: { backgroundColor: palette.warning500 },

  bookingBody: { flex: 1, padding: 16, gap: 6 },

  bookingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  bookingName: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, flex: 1 },
  textMuted: { color: palette.gray200 },

  badgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.success50,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeGreenText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.success700 },
  badgeGrey: {
    backgroundColor: palette.hairline,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeGreyText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300 },

  badgeIndigo: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeIndigoText: { fontSize: fontSize.xs, fontWeight: '700', color: '#4f46e5' },
  badgeAmberSolid: {
    backgroundColor: palette.warning50,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeAmberSolidText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.warning800 },
  badgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeAmberText: { fontSize: fontSize.xs, fontWeight: '700', color: '#92400e' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: fontSize.sm, color: palette.gray450 },

  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: palette.ink900,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.xl,
    marginTop: 6,
  },
  checkInBtnText: { color: palette.white, fontSize: fontSize.sm, fontWeight: '700' },

  // Deposit / balance info
  depositRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3, marginTop: 2 },
  depositText: { fontSize: 12, color: palette.success700, fontWeight: '600' },
  remainderText: { fontSize: 12, color: palette.gray450 },

  // Pay balance button
  payBalanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radii.xl, marginTop: 6,
    borderWidth: 1.5, borderColor: palette.blue500, backgroundColor: palette.blue50,
  },
  payBalanceBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue500 },


  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: palette.borderFaint,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },
  modalSessionName: { fontSize: fontSize.lg, fontWeight: '600', color: palette.ink900, marginBottom: 2, marginTop: 4 },
  modalGymName: { fontSize: fontSize.base, color: palette.gray450, marginBottom: 20 },

  codeCard: {
    backgroundColor: palette.blue50,
    borderRadius: radii.lg,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.blue100,
    alignSelf: 'stretch',
  },
  codeLabel: { fontSize: fontSize.xs, fontWeight: '600', color: palette.blue500, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeValue: { fontSize: fontSize['3xl'], fontWeight: 'bold', color: palette.blue500, letterSpacing: 3, textAlign: 'center', paddingTop: 5 },
  codeHint: { fontSize: fontSize.xs, color: '#6b8cff', textAlign: 'center', lineHeight: 18, marginTop: 2 },

  qrCard: {
    backgroundColor: palette.blue50,
    borderRadius: radii.xl,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.blue100,
    alignSelf: 'stretch',
  },
  qrLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.blue500, textTransform: 'uppercase', letterSpacing: 0.5 },
  qrWrap: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: 16,
    shadowColor: palette.blue500,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  codePill: { alignItems: 'center', gap: 4 },

  codeInput: {
    borderWidth: 1,
    borderColor: palette.borderFaint,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSize.xl,
    textAlign: 'center',
    color: palette.ink900,
    backgroundColor: palette.surfaceMuted,
    letterSpacing: 4,
    marginBottom: 16,
  },
  confirmBtn: {
    backgroundColor: palette.ink900,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },
});
