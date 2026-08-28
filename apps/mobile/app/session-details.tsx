import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { palette, radii, fontSize } from '@/constants/theme';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SessionDetails {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  drop_in_price?: number | null;
  max_capacity: number;
  category: string | null;
  image_url: string | null;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
  gyms: { name: string; location: string; cancellation_cutoff_hours?: number | null; deposit_pct?: number | null; no_show_grace_mins?: number | null };
}

interface Booking {
  id: string;
  status: string;
  confirmation_code: string | null;
  deposit_amount?: number | null;
  remainder_amount?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
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

const SESSION_TOUR: TourStep[] = [
  {
    icon: 'information-circle-outline',
    title: 'Everything About This Session',
    description: 'Date, time, venue, instructor, and what\'s included — all right here. Scroll down to see the full breakdown before you book.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Secure Your Spot with a Deposit',
    description: 'Tap "Book & Pay Deposit" to reserve your place with a small upfront payment. The remaining balance is settled directly at the venue.',
  },
];

export default function SessionDetailsScreen() {
  const router = useRouter();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('session-details');
  const { sessionId } = useLocalSearchParams();
  const { showAuthModal } = useAuthModal();

  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null);
  const [spotsLeft, setSpotsLeft] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const pendingBookRef = useRef(false);

  const isFree = useMemo(() => {
    if (!session) return false;
    const price = Number(session.drop_in_price) || 0;
    const pct = session.deposit_pct ?? session.gyms?.deposit_pct ?? 30;
    return Math.round(price * pct / 100) <= 0;
  }, [session]);

  const loadSessionDetails = useCallback(async () => {
    try {
      setLoading(true);

      const authSession = await authService.getSession();
      const currentUserId = authSession?.user.id ?? null;
      setUserId(currentUserId);

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*, gyms(name, location, cancellation_cutoff_hours, deposit_pct, no_show_grace_mins)')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!sessionData) { setSession(null); return; }
      setSession(sessionData);

      const { count: bookingsCount } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .in('status', ['deposit_paid', 'confirmed', 'checked_in']);

      setSpotsLeft(Math.max(0, (sessionData.max_capacity || 0) - (bookingsCount || 0)));

      if (currentUserId) {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('id, status, confirmation_code, deposit_amount, remainder_amount')
          .eq('user_id', currentUserId)
          .eq('session_id', sessionId)
          .in('status', ['deposit_paid', 'confirmed', 'checked_in', 'completed'])
          .maybeSingle();
        setExistingBooking(bookingData as Booking);
      } else {
        setExistingBooking(null);
      }
    } catch {
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setExistingBooking(null);
    if (sessionId) loadSessionDetails();
  }, [loadSessionDetails, sessionId]);

  const navigateToCheckout = useCallback(() => {
    if (!session) return;
    const price = Number(session.drop_in_price) || 0;
    const pct = session.gyms?.deposit_pct ?? 30;
    const deposit = Math.round(price * pct / 100);
    router.push({
      pathname: '/checkout',
      params: {
        bookingType: 'session',
        itemId: String(session.id),
        title: session.name,
        subtitle: session.gyms?.name ?? '',
        imageUrl: session.image_url ?? '',
        totalPrice: String(price),
        depositAmount: String(deposit),
        remainderAmount: String(price - deposit),
      },
    } as any);
  }, [session, router]);

  // Free sessions are booked instantly — no need to send the user through checkout.
  const bookFreeSession = useCallback(async () => {
    if (!sessionId) return;
    setBookingSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('book-session', {
        body: { sessionId, platform: Platform.OS },
      });
      if (error) throw new Error(error.message ?? 'Booking failed');
      if (data?.error) throw new Error(data.error);
      setExistingBooking({
        id: data.bookingId,
        status: 'confirmed',
        confirmation_code: data.confirmationCode ?? null,
        deposit_amount: 0,
        remainder_amount: 0,
      });
      setSpotsLeft((s) => Math.max(0, s - 1));
    } catch (e: any) {
      Alert.alert('Booking failed', e.message || 'Please try again');
    } finally {
      setBookingSubmitting(false);
    }
  }, [sessionId]);

  const handleBook = useCallback(() => {
    if (!userId) {
      pendingBookRef.current = true;
      showAuthModal(async (newUid) => {
        setUserId(newUid);
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('id, status, confirmation_code, deposit_amount, remainder_amount')
          .eq('user_id', newUid)
          .eq('session_id', sessionId)
          .in('status', ['deposit_paid', 'confirmed', 'checked_in', 'completed'])
          .maybeSingle();
        setExistingBooking(bookingData as Booking);
        if (pendingBookRef.current) {
          pendingBookRef.current = false;
          if (bookingData) return;
          if (isFree) bookFreeSession();
          else navigateToCheckout();
        }
      });
      return;
    }
    if (isFree) bookFreeSession();
    else navigateToCheckout();
  }, [userId, showAuthModal, sessionId, navigateToCheckout, bookFreeSession, isFree]);

  const handleShare = async () => {
    if (!session) return;
    const url = `https://activecitypass.com/sessions/${session.id}`;
    const message = `Book "${session.name}" at ${session.gyms?.name} — ${formatDate(session.date)} at ${formatTime(session.time)}\n\n${url}`;
    try {
      await Share.share({ message, url: Platform.OS === 'ios' ? url : undefined, title: session.name });
    } catch { /* cancelled */ }
  };

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Ionicons name="calendar-outline" size={48} color={palette.gray200} />
        <ThemedText style={styles.emptyText}>Session not found</ThemedText>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={styles.backLinkText}>Go back</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isFull = spotsLeft <= 0;
  const sessionPrice = Number(session.drop_in_price) || 0;
  const effectiveCutoff = session.cancellation_cutoff_hours ?? session.gyms?.cancellation_cutoff_hours ?? 24;
  const depositPct = session.deposit_pct ?? session.gyms?.deposit_pct ?? 30;
  const effectiveGrace = session.no_show_grace_mins ?? session.gyms?.no_show_grace_mins ?? 15;
  const depositAmount = Math.round(sessionPrice * depositPct / 100);
  const remainderAmount = sessionPrice - depositAmount;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Cover photo — fixed background layer, fades out through the middle of the screen; scrollable content rides on top of it. */}
      <View style={styles.coverBg} pointerEvents="none">
        {session.image_url ? (
          <Image source={{ uri: session.image_url }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Ionicons name="barbell-outline" size={64} color="rgba(255,255,255,0.4)" />
          </View>
        )}
        <View style={styles.heroOverlay} />
        <LinearGradient
          colors={['rgba(255,255,255,0)', palette.white]}
          style={styles.coverFade}
        />
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={palette.white} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-outline" size={22} color={palette.white} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

        {/* Spacer — reveals the fixed cover background above the content card */}
        <View style={styles.coverSpacer} />

        {/* ── Content card lifted over hero ── */}
        <View style={styles.card}>

          {session.category ? (
            <View style={styles.categoryBadge}>
              <ThemedText style={styles.categoryBadgeText}>{session.category}</ThemedText>
            </View>
          ) : null}

          {/* Title + gym */}
          <ThemedText style={styles.title}>{session.name}</ThemedText>
          <View style={styles.gymRow}>
            <Ionicons name="location" size={16} color={palette.blue500} />
            <View>
              <ThemedText style={styles.gymName}>{session.gyms?.name}</ThemedText>
              <ThemedText style={styles.gymLocation}>{session.gyms?.location}</ThemedText>
            </View>
          </View>

          {/* Stat pills */}
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <ThemedText style={styles.statText}>{session.duration_minutes} min</ThemedText>
            </View>
            <View style={styles.statPill}>
              <ThemedText style={[styles.statText, isFull && { color: palette.danger600 }]}>
                {isFull ? 'Full' : `${spotsLeft} spots`}
              </ThemedText>
            </View>
            <View style={styles.statPill}>
              <ThemedText style={styles.statText}>KES {sessionPrice.toLocaleString()}</ThemedText>
            </View>
          </View>

          {/* Schedule */}
          <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIcon}>
                <Ionicons name="calendar-outline" size={18} color={palette.blue500} />
              </View>
              <View>
                <ThemedText style={styles.scheduleLabel}>Date</ThemedText>
                <ThemedText style={styles.scheduleValue}>{formatDate(session.date)}</ThemedText>
              </View>
            </View>
            <View style={styles.scheduleDivider} />
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIcon}>
                <Ionicons name="time-outline" size={18} color={palette.blue500} />
              </View>
              <View>
                <ThemedText style={styles.scheduleLabel}>Time</ThemedText>
                <ThemedText style={styles.scheduleValue}>{formatTime(session.time)}</ThemedText>
              </View>
            </View>
          </View>

          {/* Booking Policy */}
          {(() => {
            const startMs = new Date(`${session.date}T${(session.time ?? '00:00').slice(0, 5)}:00+03:00`).getTime();
            const hoursUntil = (startMs - Date.now()) / (1000 * 60 * 60);
            if (hoursUntil <= 0) return null;
            const isRefundable = effectiveCutoff > 0 && hoursUntil > effectiveCutoff;
            const deadline = effectiveCutoff > 0 ? new Date(startMs - effectiveCutoff * 60 * 60 * 1000) : null;
            const deadlineStr = deadline
              ? deadline.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' }) +
                ' at ' + deadline.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
              : null;
            return (
              <View style={styles.policyBlock}>
                <ThemedText style={styles.sectionTitle}>Booking Policy</ThemedText>
                <View style={styles.policyDetailCard}>
                  {/* Cancellation window */}
                  <View style={styles.policyDetailRow}>
                    <View style={[styles.policyDetailIcon, { backgroundColor: isRefundable ? '#f0fdf4' : '#fffbeb' }]}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={isRefundable ? '#16a34a' : '#d97706'} />
                    </View>
                    <View style={styles.policyDetailContent}>
                      <ThemedText style={styles.policyDetailLabel}>Cancellation</ThemedText>
                      <ThemedText style={[styles.policyDetailValue, { color: isRefundable ? '#15803d' : '#92400e' }]}>
                        {effectiveCutoff === 0
                          ? 'No free cancellation'
                          : isRefundable
                            ? `Free until ${deadlineStr}`
                            : `Window closed (${effectiveCutoff}h before session)`}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.policyDivider} />
                  {/* Deposit */}
                  <View style={styles.policyDetailRow}>
                    <View style={[styles.policyDetailIcon, { backgroundColor: '#f0f5ff' }]}>
                      <Ionicons name="cash-outline" size={16} color={palette.blue500} />
                    </View>
                    <View style={styles.policyDetailContent}>
                      <ThemedText style={styles.policyDetailLabel}>Deposit required</ThemedText>
                      <ThemedText style={styles.policyDetailValue}>
                        {depositPct}% — KES {depositAmount.toLocaleString()} now, KES {remainderAmount.toLocaleString()} at venue
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.policyDivider} />
                  {/* Grace period */}
                  <View style={styles.policyDetailRow}>
                    <View style={[styles.policyDetailIcon, { backgroundColor: '#fff7ed' }]}>
                      <Ionicons name="warning-outline" size={16} color="#c2410c" />
                    </View>
                    <View style={styles.policyDetailContent}>
                      <ThemedText style={styles.policyDetailLabel}>No-show grace</ThemedText>
                      <ThemedText style={styles.policyDetailValue}>
                        {effectiveGrace === 0 ? 'No grace period — mark immediate' : `${effectiveGrace} min after session starts`}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Instructor */}
          {session.instructor ? (
            <>
              <ThemedText style={styles.sectionTitle}>Instructor</ThemedText>
              <View style={styles.instructorCard}>
                <View style={styles.instructorAvatar}>
                  <ThemedText style={styles.instructorInitial}>
                    {session.instructor[0].toUpperCase()}
                  </ThemedText>
                </View>
                <View>
                  <ThemedText style={styles.instructorName}>{session.instructor}</ThemedText>
                  <ThemedText style={styles.instructorRole}>Certified Instructor</ThemedText>
                </View>
              </View>
            </>
          ) : null}

          {/* Description */}
          {session.description ? (
            <>
              <ThemedText style={styles.sectionTitle}>About this session</ThemedText>
              <ThemedText style={styles.description}>{session.description}</ThemedText>
            </>
          ) : null}

          {/* Share section */}
          {(() => {
            const shareUrl = `https://activecitypass.com/sessions/${session.id}`;
            const shareText = encodeURIComponent(`Book "${session.name}" at ${session.gyms?.name} — ${formatDate(session.date)} at ${formatTime(session.time)}`);
            const encodedUrl = encodeURIComponent(shareUrl);
            return (
              <View style={styles.shareSection}>
                <ThemedText style={styles.shareLabel}>Share this session</ThemedText>
                <View style={styles.shareRow}>
                  <TouchableOpacity
                    style={[styles.shareIcon, { backgroundColor: '#25D366' }]}
                    onPress={() => Linking.openURL(`https://wa.me/?text=${shareText}%20${encodedUrl}`)}
                  >
                    <Ionicons name="logo-whatsapp" size={22} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.shareIcon, { backgroundColor: palette.ink900 }]}
                    onPress={() => Linking.openURL(`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`)}
                  >
                    <ThemedText style={styles.shareIconX}>𝕏</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.shareIcon, { backgroundColor: '#1877F2' }]}
                    onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}
                  >
                    <Ionicons name="logo-facebook" size={22} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.shareIcon, { backgroundColor: '#229ED9' }]}
                    onPress={() => Linking.openURL(`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`)}
                  >
                    <Ionicons name="send" size={18} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.shareIcon, { backgroundColor: palette.hairline, borderWidth: 1, borderColor: palette.border }]}
                    onPress={handleShare}
                  >
                    <Ionicons name="share-outline" size={20} color={palette.ink600} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={styles.bottomBar}>
        {existingBooking ? (
          <>
            <View>
              <ThemedText style={styles.priceLabel}>Booked ✓</ThemedText>
              {(existingBooking.remainder_amount ?? 0) > 0 && (
                <ThemedText style={styles.priceValue}>KES {existingBooking.remainder_amount!.toLocaleString()} at venue</ThemedText>
              )}
            </View>
            <TouchableOpacity
              style={[styles.bookBtn, styles.bookedBtn]}
              onPress={() => router.push({ pathname: '/(tabs)/check-in', params: { sessionId: session.id } })}
            >
              <Ionicons name="qr-code-outline" size={18} color={palette.white} />
              <ThemedText style={styles.bookBtnText}>Check In</ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View>
              {isFree ? (
                <ThemedText style={styles.priceValue}>Free</ThemedText>
              ) : (
                <>
                  <ThemedText style={styles.priceLabel}>Deposit now</ThemedText>
                  <ThemedText style={styles.priceValue}>KES {depositAmount.toLocaleString()}</ThemedText>
                  {remainderAmount > 0 && (
                    <ThemedText style={styles.priceSub}>+ KES {remainderAmount.toLocaleString()} at venue</ThemedText>
                  )}
                </>
              )}
            </View>
            <TouchableOpacity
              style={[styles.bookBtn, (isFull || bookingSubmitting) && styles.disabledBtn]}
              onPress={handleBook}
              disabled={isFull || bookingSubmitting}
            >
              {bookingSubmitting ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <ThemedText style={styles.bookBtnText}>
                  {isFull ? 'Fully Booked' : isFree ? 'Book for Free' : 'Book & Pay Deposit'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <TourOverlay visible={tourVisible} steps={SESSION_TOUR} onDismiss={dismissTour} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { flex: 1 },

  emptyText: { fontSize: fontSize.lg, color: palette.gray450, marginTop: 8 },
  backLink: { marginTop: 8 },
  backLinkText: { color: palette.blue500, fontSize: fontSize.base, fontWeight: '600' },

  // Cover photo — fixed background layer (not part of the ScrollView); fades
  // out through the middle of its own height rather than at a hard edge.
  coverBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center' },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverFade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  // Empty space at the top of the scroll content that lets the fixed cover
  // image show through before the content card begins.
  coverSpacer: { height: 300 },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.blue500,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  categoryBadgeText: { color: palette.white, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },

  // Content card
  card: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    marginTop: -24,
    padding: 24,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: 'bold', color: palette.ink900, marginBottom: 10 },
  gymRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 20 },
  gymName: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  gymLocation: { fontSize: fontSize.sm, color: palette.gray450 },

  // Stat pills
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  statPill: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: palette.blue50,
    borderRadius: radii.xl,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },

  // Section title
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 12 },

  // Schedule
  scheduleCard: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.borderFaint,
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scheduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.blue50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleLabel: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', textTransform: 'uppercase', marginBottom: 2 },
  scheduleValue: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  scheduleDivider: { height: 1, backgroundColor: palette.borderFaint, marginVertical: 12 },

  // Instructor
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.borderFaint,
  },
  instructorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.ink900,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructorInitial: { color: palette.white, fontSize: fontSize.xl, fontWeight: 'bold' },
  instructorName: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  instructorRole: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },

  // Cancellation policy
  policyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, marginBottom: 24,
  },
  policyText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20, fontWeight: '500' },
  policyBlock: { marginBottom: 24 },
  policyDetailCard: {
    backgroundColor: palette.surfaceApp,
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  policyDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  policyDetailIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  policyDetailContent: { flex: 1, gap: 2 },
  policyDetailLabel: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  policyDetailValue: { fontSize: fontSize.sm, fontWeight: '500', color: palette.ink900, lineHeight: 20 },
  policyDivider: { height: 1, backgroundColor: palette.hairline, marginLeft: 44 },

  // Description
  description: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 24, marginBottom: 24 },

  // Bottom bar
  bottomBar: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.white,
  },
  priceLabel: { fontSize: fontSize.xs, color: palette.gray450, marginBottom: 2 },
  priceValue: { fontSize: fontSize.lg, fontWeight: 'bold', color: palette.ink700 },
  priceSub: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },
  bookBtn: {
    backgroundColor: palette.ink900,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minWidth: 150,
  },
  bookedBtn: { backgroundColor: palette.success700 },
  disabledBtn: { backgroundColor: palette.gray200 },
  bookBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },

  // Share section
  shareSection: {
    marginBottom: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  shareLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.gray300,
    marginBottom: 14,
  },
  shareRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  shareIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIconX: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },
});
