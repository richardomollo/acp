import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { palette, radii, fontSize } from '@/constants/theme';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';

type Experience = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  meeting_point: string | null;
  transport_info: string | null;
  price_kes: number;
  discount_kes: number;
  max_capacity: number;
  spots_left: number;
  includes: string[];
  itinerary: { time: string; activity: string; detail: string }[];
  image_url: string | null;
  category: string | null;
  gym_id: string;
  gyms?: { name: string; deposit_pct?: number | null } | null;
};

type ExperienceBooking = {
  id: string;
  status: string;
  confirmation_code: string | null;
  deposit_amount: number | null;
  remainder_amount: number | null;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const EXPERIENCE_TOUR: TourStep[] = [
  {
    icon: 'map-outline',
    title: 'Explore the Experience',
    description: 'Read the full itinerary, check what\'s included, and find the meeting point before you commit. Scroll down to see every detail.',
  },
  {
    icon: 'cash-outline',
    title: 'Reserve with a Deposit',
    description: 'Pay a small percentage upfront to secure your spot. The remaining balance is collected on the day of the experience — nothing to worry about now.',
  },
];

export default function ExperienceDetailsScreen() {
  const router = useRouter();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('experience-details');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAuthModal } = useAuthModal();

  const [experience, setExperience] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [existingBooking, setExistingBooking] = useState<ExperienceBooking | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const pendingBookRef = useRef(false);

  const isFree = useMemo(() => {
    if (!experience) return false;
    const price = Number(experience.price_kes);
    const pct = experience.gyms?.deposit_pct ?? 30;
    const deposit = Math.round(price * pct / 100);
    const discount = Math.min(Number(experience.discount_kes) || 0, deposit);
    return deposit - discount <= 0;
  }, [experience]);

  const load = useCallback(async () => {
    try {
      const authSession = await authService.getSession();
      const uid = authSession?.user.id ?? null;
      setUserId(uid);

      const { data } = await supabase
        .from('experiences')
        .select('*, gyms(name, deposit_pct)')
        .eq('id', id)
        .single();
      if (data) setExperience(data as any);

      if (uid) {
        const { data: booking } = await supabase
          .from('experience_bookings')
          .select('id, status, confirmation_code, deposit_amount, remainder_amount')
          .eq('user_id', uid)
          .eq('experience_id', id)
          .in('status', ['deposit_paid', 'confirmed', 'checked_in', 'completed'])
          .maybeSingle();
        setExistingBooking(booking as ExperienceBooking);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const navigateToCheckout = useCallback(() => {
    if (!experience) return;
    const price = Number(experience.price_kes);
    const pct = experience.gyms?.deposit_pct ?? 30;
    const deposit = Math.round(price * pct / 100);
    const discountKes = Math.min(Number(experience.discount_kes) || 0, deposit);
    router.push({
      pathname: '/checkout',
      params: {
        bookingType: 'experience',
        itemId: String(experience.id),
        title: experience.name,
        subtitle: experience.tagline ?? experience.gyms?.name ?? '',
        imageUrl: experience.image_url ?? '',
        totalPrice: String(price),
        depositAmount: String(deposit - discountKes),
        remainderAmount: String(price - deposit),
        discountKes: String(discountKes),
      },
    } as any);
  }, [experience, router]);

  // Free (or fully discounted) experiences are booked instantly — no need for checkout.
  const bookFreeExperience = useCallback(async () => {
    if (!id) return;
    setBookingSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('book-experience', {
        body: { experienceId: id },
      });
      if (error) throw new Error(error.message ?? 'Booking failed');
      if (data?.error) throw new Error(data.error);
      setExistingBooking({
        id: data.bookingId,
        status: 'confirmed',
        confirmation_code: data.confirmationCode ?? null,
        deposit_amount: 0,
        remainder_amount: data.remainderAmount ?? 0,
      });
    } catch (e: any) {
      Alert.alert('Booking failed', e.message || 'Please try again');
    } finally {
      setBookingSubmitting(false);
    }
  }, [id]);

  const handleBook = useCallback(() => {
    if (!userId) {
      pendingBookRef.current = true;
      showAuthModal(async (newUid) => {
        setUserId(newUid);
        const { data: booking } = await supabase
          .from('experience_bookings')
          .select('id, status, confirmation_code, deposit_amount, remainder_amount')
          .eq('user_id', newUid)
          .eq('experience_id', id)
          .in('status', ['deposit_paid', 'confirmed', 'checked_in', 'completed'])
          .maybeSingle();
        setExistingBooking(booking as ExperienceBooking);
        if (pendingBookRef.current) {
          pendingBookRef.current = false;
          if (booking) return;
          if (isFree) bookFreeExperience();
          else navigateToCheckout();
        }
      });
      return;
    }
    if (isFree) bookFreeExperience();
    else navigateToCheckout();
  }, [userId, showAuthModal, id, navigateToCheckout, bookFreeExperience, isFree]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!experience) {
    return (
      <View style={styles.center}>
        <ThemedText>Experience not found.</ThemedText>
      </View>
    );
  }

  const isSoldOut = experience.spots_left <= 0;
  const depositPct = experience.gyms?.deposit_pct ?? 30;
  const experiencePrice = Number(experience.price_kes);
  const depositAmount = Math.round(experiencePrice * depositPct / 100);
  const remainderAmount = experiencePrice - depositAmount;
  const discountKes = Math.min(Number(experience.discount_kes) || 0, depositAmount);
  const hasDiscount = discountKes > 0;
  const customerDeposit = depositAmount - discountKes;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Hero */}
        <View style={styles.hero}>
          {experience.image_url ? (
            <Image source={{ uri: experience.image_url }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]}>
              <Ionicons name="sparkles" size={48} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          <View style={styles.heroGradient} />

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={palette.white} />
          </TouchableOpacity>

          {experience.category && (
            <View style={styles.categoryBadge}>
              <ThemedText style={styles.categoryBadgeText}>{experience.category}</ThemedText>
            </View>
          )}
        </View>

        {/* Card */}
        <View style={styles.card}>
          <ThemedText style={styles.name}>{experience.name}</ThemedText>
          {experience.tagline ? (
            <ThemedText style={styles.tagline}>"{experience.tagline}"</ThemedText>
          ) : null}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="calendar-outline" size={16} color={palette.navy} />
              <ThemedText style={styles.statText}>{fmtDate(experience.date)}</ThemedText>
            </View>
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={16} color={palette.navy} />
              <ThemedText style={styles.statText}>
                {fmtTime(experience.start_time)}
                {experience.end_time ? ` – ${fmtTime(experience.end_time)}` : ''}
              </ThemedText>
            </View>
            <View style={styles.stat}>
              <Ionicons name="people-outline" size={16} color={palette.navy} />
              <ThemedText style={styles.statText}>
                {isSoldOut ? 'Sold out' : `${experience.spots_left} of ${experience.max_capacity} spots left`}
              </ThemedText>
            </View>
          </View>

          {/* Cancellation policy */}
          {(() => {
            const startMs = new Date(`${experience.date}T${experience.start_time.slice(0, 5)}:00+03:00`).getTime();
            const hours = (startMs - Date.now()) / (1000 * 60 * 60);
            if (hours <= 0) return null;
            const deadline = new Date(startMs - 24 * 60 * 60 * 1000);
            const deadlineStr =
              deadline.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' }) +
              ' at ' +
              deadline.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
            const isRefundable = hours > 24;
            return (
              <View style={[styles.policyCard, { backgroundColor: isRefundable ? '#f0fdf4' : '#fffbeb' }]}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color={isRefundable ? '#16a34a' : '#d97706'}
                />
                <ThemedText style={[styles.policyText, { color: isRefundable ? '#15803d' : '#92400e' }]}>
                  {isRefundable
                    ? `Free cancellation until ${deadlineStr}`
                    : 'No refund available — within 24-hour cancellation window'}
                </ThemedText>
              </View>
            );
          })()}

          {experience.meeting_point && (
            <View style={styles.infoBlock}>
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={16} color={palette.navy} />
                <View>
                  <ThemedText style={styles.infoLabel}>Meeting Point</ThemedText>
                  <ThemedText style={styles.infoValue}>{experience.meeting_point}</ThemedText>
                </View>
              </View>
            </View>
          )}

          {experience.transport_info && (
            <View style={styles.infoBlock}>
              <View style={styles.infoRow}>
                <Ionicons name="bus-outline" size={16} color={palette.navy} />
                <View>
                  <ThemedText style={styles.infoLabel}>Transport</ThemedText>
                  <ThemedText style={styles.infoValue}>{experience.transport_info}</ThemedText>
                </View>
              </View>
            </View>
          )}

          {experience.description && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>About this Experience</ThemedText>
              <ThemedText style={styles.description}>{experience.description}</ThemedText>
            </View>
          )}

          {experience.includes.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>What's Included</ThemedText>
              <View style={styles.chipsWrap}>
                {experience.includes.map((inc, i) => (
                  <View key={i} style={styles.includeChip}>
                    <Ionicons name="checkmark-circle" size={14} color="#059669" />
                    <ThemedText style={styles.includeChipText}>{inc}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {experience.itinerary.length > 0 && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
              <View style={styles.itinerary}>
                {experience.itinerary.map((row, i) => (
                  <View key={i} style={styles.itineraryRow}>
                    <View style={styles.itineraryLeft}>
                      <ThemedText style={styles.itineraryTime}>{row.time}</ThemedText>
                      {i < experience.itinerary.length - 1 && <View style={styles.itineraryLine} />}
                    </View>
                    <View style={styles.itineraryRight}>
                      <ThemedText style={styles.itineraryActivity}>{row.activity}</ThemedText>
                      {row.detail ? (
                        <ThemedText style={styles.itineraryDetail}>{row.detail}</ThemedText>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {experience.gyms?.name && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Hosted by</ThemedText>
              <ThemedText style={styles.venueName}>{experience.gyms.name}</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      <TourOverlay visible={tourVisible} steps={EXPERIENCE_TOUR} onDismiss={dismissTour} />

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {existingBooking ? (
          <>
            <View>
              <ThemedText style={styles.priceLabel}>Booked ✓</ThemedText>
              {(existingBooking.remainder_amount ?? 0) > 0 && (
                <ThemedText style={styles.priceValue}>KES {existingBooking.remainder_amount!.toLocaleString()} on day</ThemedText>
              )}
            </View>
            <View style={[styles.bookBtn, { backgroundColor: palette.success700, alignItems: 'center', justifyContent: 'center' }]}>
              <ThemedText style={styles.bookBtnText}>Confirmed</ThemedText>
            </View>
          </>
        ) : (
          <>
            <View>
              {isFree ? (
                <ThemedText style={styles.priceValue}>Free</ThemedText>
              ) : (
                <>
                  {hasDiscount && (
                    <View style={styles.saveBadge}>
                      <ThemedText style={styles.saveBadgeText}>Save KES {discountKes.toLocaleString()}</ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.priceLabel}>Deposit now ({depositPct}%)</ThemedText>
                  {hasDiscount ? (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <ThemedText style={styles.priceStrike}>KES {depositAmount.toLocaleString()}</ThemedText>
                      <ThemedText style={styles.priceValue}>KES {customerDeposit.toLocaleString()}</ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={styles.priceValue}>KES {depositAmount.toLocaleString()}</ThemedText>
                  )}
                  {remainderAmount > 0 && (
                    <ThemedText style={styles.priceSub}>+ KES {remainderAmount.toLocaleString()} on day</ThemedText>
                  )}
                </>
              )}
            </View>
            <TouchableOpacity
              style={[styles.bookBtn, (isSoldOut || bookingSubmitting) && styles.bookBtnDisabled]}
              onPress={handleBook}
              disabled={isSoldOut || bookingSubmitting}
            >
              {bookingSubmitting ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <ThemedText style={styles.bookBtnText}>
                  {isSoldOut ? 'Sold Out' : isFree ? 'Book for Free' : 'Book & Pay Deposit'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { height: 320, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  heroGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  backBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 20, left: 16,
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  categoryBadge: {
    position: 'absolute', bottom: 16, left: 16,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radii.xl,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  categoryBadgeText: { color: palette.white, fontSize: fontSize.xs, fontWeight: '600' },

  card: { marginTop: -24, backgroundColor: palette.white, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], padding: 24, minHeight: 200 },
  name: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink700, lineHeight: 30 },
  tagline: { fontSize: fontSize.base, color: palette.gray450, fontStyle: 'italic', marginTop: 6 },

  statsRow: { gap: 10, marginTop: 20, marginBottom: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statText: { fontSize: fontSize.base, color: palette.ink600, flex: 1 },

  infoBlock: { marginTop: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: fontSize.base, color: palette.ink600, marginTop: 2 },

  section: { marginTop: 28 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700, marginBottom: 12 },
  description: { fontSize: fontSize.base, color: palette.gray450, lineHeight: 22 },

  chipsWrap: { gap: 10 },
  includeChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  includeChipText: { fontSize: fontSize.base, color: palette.ink600 },

  itinerary: { gap: 0 },
  itineraryRow: { flexDirection: 'row', gap: 16, minHeight: 52 },
  itineraryLeft: { width: 70, alignItems: 'center' },
  itineraryTime: { fontSize: 12, fontWeight: '700', color: palette.navy, textAlign: 'center' },
  itineraryLine: { flex: 1, width: 1, backgroundColor: palette.border, marginTop: 4 },
  itineraryRight: { flex: 1, paddingBottom: 16 },
  itineraryActivity: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink700 },
  itineraryDetail: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },

  policyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, marginTop: 16,
  },
  policyText: { flex: 1, fontSize: fontSize.sm, lineHeight: 20, fontWeight: '500' },

  venueName: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink600 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.hairline,
    shadowColor: palette.ink900, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },
  priceLabel: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '600' },
  priceValue: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink700 },
  priceStrike: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray300, textDecorationLine: 'line-through' },
  priceSub: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },
  saveBadge: { alignSelf: 'flex-start', backgroundColor: palette.success700, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3 },
  saveBadgeText: { fontSize: 10, fontWeight: '700', color: palette.white },
  bookBtn: {
    backgroundColor: palette.navy, borderRadius: 28,
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', gap: 8,
  },
  bookBtnDisabled: { backgroundColor: palette.gray300 },
  bookBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
});
