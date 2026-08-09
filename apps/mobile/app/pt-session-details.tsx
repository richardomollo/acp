import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { palette, radii, fontSize } from '@/constants/theme';

type Offering = {
  id: string;
  pt_id: string;
  title: string;
  description: string | null;
  type: string;
  duration_minutes: number;
  price_kes: number | null;
  max_participants: number;
  image_url: string | null;
  is_programme: boolean;
  programme_weeks: number | null;
  programme_price_kes: number | null;
  intro_price_kes: number | null;
  deposit_pct: number | null;
  instalment_frequency_weeks: number | null;
};

type PT = {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  cover_url: string | null;
  is_certified_verified: boolean;
  specialisations: string[];
};

type Enrollment = {
  id: string;
  status: string;
  trainer_intro_confirmed: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  '1-on-1': '1-on-1', group: 'Group', online: 'Online',
  outdoor: 'Outdoor', 'home-visit': 'Home-visit', 'drop-in': 'Drop-in',
};

export default function PTSessionDetailsScreen() {
  const router = useRouter();
  const { offeringId, ptId } = useLocalSearchParams<{ offeringId: string; ptId: string }>();
  const { showAuthModal } = useAuthModal();
  const [offering, setOffering] = useState<Offering | null>(null);
  const [pt, setPt] = useState<PT | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const fetchEnrollment = useCallback(async (programmeId: string, uid: string) => {
    const { data } = await supabase
      .from('pt_programme_enrollments')
      .select('id, status, trainer_intro_confirmed')
      .eq('programme_id', programmeId)
      .eq('user_id', uid)
      .maybeSingle();
    setEnrollment(data as Enrollment | null);
  }, []);

  const load = useCallback(async () => {
    const [
      { data: { user } },
      { data: offerData },
      { data: ptData },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('pt_offerings')
        .select('id, pt_id, title, description, type, duration_minutes, price_kes, max_participants, image_url, is_programme, programme_weeks, programme_price_kes, intro_price_kes, deposit_pct, instalment_frequency_weeks')
        .eq('id', offeringId)
        .single(),
      supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, photo_url, cover_url, is_certified_verified, specialisations')
        .eq('id', ptId)
        .single(),
    ]);

    const uid = user?.id ?? null;
    setUserId(uid);
    if (offerData) setOffering(offerData as any);
    if (ptData) setPt(ptData as any);

    if (offerData?.is_programme && uid) {
      await fetchEnrollment(offerData.id, uid);
    }

    setLoading(false);
  }, [offeringId, ptId, fetchEnrollment]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!offering || !pt) return null;

  const displayName = pt.professional_name ?? pt.full_name;
  const heroUri = offering.image_url ?? pt.cover_url ?? pt.photo_url;
  const price = offering.price_kes ?? 0;

  const total = Number(offering.programme_price_kes ?? 0);
  const depositPct = offering.deposit_pct ?? 30;
  const deposit = Math.round(total * depositPct / 100);
  const remaining = total - deposit;
  const freq = offering.instalment_frequency_weeks;
  const numInstalments = freq && offering.programme_weeks ? Math.floor(offering.programme_weeks / freq) : 0;
  const instalmentAmount = numInstalments > 0 ? Math.round(remaining / numInstalments) : remaining;
  const introPrice = offering.intro_price_kes ?? offering.price_kes;
  const isFreeIntro = (introPrice ?? 0) === 0;

  const handleBook = () => {
    if (!userId) {
      showAuthModal((uid) => {
        setUserId(uid);
        router.push({ pathname: '/trainer-booking', params: { offeringId, ptId } });
      });
      return;
    }
    router.push({ pathname: '/trainer-booking', params: { offeringId, ptId } });
  };

  const handleBookIntro = () => {
    const introPrice = String(offering.intro_price_kes ?? offering.price_kes ?? 0);
    if (!userId) {
      showAuthModal((uid) => {
        setUserId(uid);
        router.push({ pathname: '/trainer-booking', params: { offeringId, ptId, isProgramme: 'true', introPrice } });
      });
      return;
    }
    router.push({ pathname: '/trainer-booking', params: { offeringId, ptId, isProgramme: 'true', introPrice } });
  };

  const handleJoinProgramme = () => {
    if (!enrollment) return;
    router.push({ pathname: '/programme-enroll', params: { offeringId: offering.id, enrollmentId: enrollment.id } });
  };

  // Bottom bar CTA based on offering type and enrollment status
  const renderBottomBar = () => {
    if (!offering.is_programme) {
      return (
        <View style={styles.bottomBar}>
          <View>
            <ThemedText style={styles.priceText}>KES {price.toLocaleString()}</ThemedText>
          </View>
          <TouchableOpacity style={styles.bookBtn} onPress={handleBook}>
            <ThemedText style={styles.bookBtnText}>Book Session</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    if (enrollment?.status === 'programme_active' || enrollment?.status === 'completed') {
      return (
        <View style={styles.bottomBar}>
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success700} />
            <ThemedText style={styles.activeBadgeText}>Programme Active</ThemedText>
          </View>
        </View>
      );
    }

    if (enrollment?.trainer_intro_confirmed || enrollment?.status === 'intro_complete') {
      return (
        <View style={styles.bottomBar}>
          <View>
            <ThemedText style={styles.bottomLabel}>Deposit due now</ThemedText>
            <ThemedText style={styles.priceText}>KES {deposit.toLocaleString()}</ThemedText>
          </View>
          <TouchableOpacity style={[styles.bookBtn, { backgroundColor: '#4f46e5' }]} onPress={handleJoinProgramme}>
            <ThemedText style={styles.bookBtnText}>Join Programme</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    if (enrollment?.status === 'intro_booked') {
      return (
        <View style={styles.bottomBar}>
          <View style={styles.awaitingBadge}>
            <Ionicons name="time-outline" size={16} color="#d97706" />
            <ThemedText style={styles.awaitingText}>Awaiting trainer confirmation</ThemedText>
          </View>
        </View>
      );
    }

    // No enrollment — show intro booking CTA
    return (
      <View style={styles.bottomBar}>
        <View>
          <ThemedText style={styles.bottomLabel}>Intro session</ThemedText>
          {isFreeIntro
            ? <ThemedText style={styles.freePriceText}>Free</ThemedText>
            : <ThemedText style={styles.priceText}>KES {introPrice?.toLocaleString()}</ThemedText>
          }
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={handleBookIntro}>
          <ThemedText style={styles.bookBtnText}>
            {isFreeIntro ? 'Book Intro Session for Free' : 'Book Intro Session'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Hero */}
        <View style={styles.hero}>
          {heroUri ? (
            <Image source={{ uri: heroUri }} style={styles.heroImg} contentFit="cover" />
          ) : (
            <View style={[styles.heroImg, styles.heroFallback]} />
          )}
          <View style={styles.heroOverlay} />

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={palette.white} />
          </TouchableOpacity>

          {offering.is_programme ? (
            <View style={[styles.typeBadge, { backgroundColor: '#4f46e5' }]}>
              <ThemedText style={styles.typeBadgeText}>
                {offering.programme_weeks ? `${offering.programme_weeks}-Week ` : ''}Programme
              </ThemedText>
            </View>
          ) : (
            <View style={styles.typeBadge}>
              <ThemedText style={styles.typeBadgeText}>
                {TYPE_LABELS[offering.type] ?? offering.type}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Card */}
        <View style={styles.card}>
          <ThemedText style={styles.title}>{offering.title}</ThemedText>

          {offering.is_programme ? (
            <>
              {/* Programme stat pills */}
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Ionicons name="calendar-outline" size={15} color="#4f46e5" />
                  <ThemedText style={[styles.statText, { color: '#4f46e5' }]}>{offering.programme_weeks} weeks</ThemedText>
                </View>
                <View style={styles.statPill}>
                  <Ionicons name="cash-outline" size={15} color={palette.blue500} />
                  <ThemedText style={styles.statText}>KES {total.toLocaleString()} total</ThemedText>
                </View>
              </View>

              {/* Payment schedule */}
              <View style={styles.scheduleCard}>
                <ThemedText style={styles.scheduleTitle}>Payment schedule</ThemedText>
                <View style={styles.scheduleRow}>
                  <ThemedText style={styles.scheduleLabel}>Deposit ({depositPct}%) — due on joining</ThemedText>
                  <ThemedText style={styles.scheduleAmount}>KES {deposit.toLocaleString()}</ThemedText>
                </View>
                {numInstalments > 0 && (
                  <View style={styles.scheduleRow}>
                    <ThemedText style={styles.scheduleLabel}>
                      {numInstalments} instalment{numInstalments > 1 ? 's' : ''} every {freq} weeks
                    </ThemedText>
                    <ThemedText style={styles.scheduleAmount}>KES {instalmentAmount.toLocaleString()}</ThemedText>
                  </View>
                )}
                <View style={[styles.scheduleRow, styles.scheduleTotalRow]}>
                  <ThemedText style={styles.scheduleTotalLabel}>Total</ThemedText>
                  <ThemedText style={styles.scheduleTotalAmount}>KES {total.toLocaleString()}</ThemedText>
                </View>
              </View>

              {/* Amber callout */}
              <View style={styles.introBanner} accessibilityRole="none" accessible accessibilityLabel="This session starts with an intro session. Book a 1-on-1 intro first. Once confirmed by the trainer, you can join the full programme.">
                <Ionicons name="information-circle-outline" size={18} color={palette.warning700} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.introBannerTitle}>
                    {isFreeIntro ? 'Starts with a FREE intro session' : 'Starts with an intro session'}
                  </ThemedText>
                  <ThemedText style={styles.introBannerSub}>
                    Book a 1-on-1 intro session first. Once confirmed by the trainer, you can join the full programme.
                  </ThemedText>
                </View>
              </View>
            </>
          ) : (
            /* Regular session stat pills */
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Ionicons name="time-outline" size={15} color={palette.blue500} />
                <ThemedText style={styles.statText}>{offering.duration_minutes} min</ThemedText>
              </View>
              {offering.max_participants > 1 && (
                <View style={styles.statPill}>
                  <Ionicons name="people-outline" size={15} color={palette.blue500} />
                  <ThemedText style={styles.statText}>Up to {offering.max_participants}</ThemedText>
                </View>
              )}
            </View>
          )}

          {/* Trainer */}
          <ThemedText style={styles.sectionTitle}>Trainer</ThemedText>
          <TouchableOpacity
            style={styles.trainerCard}
            onPress={() => router.push({ pathname: '/trainer-profile', params: { id: pt.id } })}
            activeOpacity={0.8}
          >
            {pt.photo_url ? (
              <Image source={{ uri: pt.photo_url }} style={styles.trainerAvatar} contentFit="cover" />
            ) : (
              <View style={styles.trainerAvatarFallback}>
                <ThemedText style={styles.trainerInitial}>{displayName[0].toUpperCase()}</ThemedText>
              </View>
            )}
            <View style={styles.trainerInfo}>
              <View style={styles.trainerNameRow}>
                <ThemedText style={styles.trainerName}>{displayName}</ThemedText>
                {pt.is_certified_verified && (
                  <Ionicons name="checkmark-circle" size={16} color={palette.blue500} />
                )}
              </View>
              {pt.specialisations.length > 0 && (
                <ThemedText style={styles.trainerSpec} numberOfLines={1}>
                  {pt.specialisations.slice(0, 2).join(' · ')}
                </ThemedText>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>

          {/* Description */}
          {offering.description ? (
            <>
              <ThemedText style={styles.sectionTitle}>
                {offering.is_programme ? 'About this programme' : 'About this session'}
              </ThemedText>
              <ThemedText style={styles.description}>{offering.description}</ThemedText>
            </>
          ) : null}
        </View>
      </ScrollView>

      {renderBottomBar()}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  container: { flex: 1, backgroundColor: palette.white },

  hero: { height: 300, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: palette.navy },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 36, left: 20,
    backgroundColor: palette.blue500,
    borderRadius: radii.sm, paddingHorizontal: 12, paddingVertical: 4,
  },
  typeBadgeText: { color: palette.white, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },

  card: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'],
    marginTop: -24,
    padding: 24,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, marginBottom: 16 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue50, borderRadius: radii.xl,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  statText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },

  // Programme payment schedule
  scheduleCard: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  scheduleTitle: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  scheduleLabel: { fontSize: fontSize.sm, color: palette.gray450, flex: 1, marginRight: 8 },
  scheduleAmount: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  scheduleTotalRow: { borderTopWidth: 1, borderTopColor: palette.border, marginTop: 4, paddingTop: 10, marginBottom: 0 },
  scheduleTotalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900 },
  scheduleTotalAmount: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },

  // Intro callout
  introBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: palette.warning50,
    borderWidth: 1, borderColor: palette.warning100,
    borderRadius: radii.lg, padding: 14, marginBottom: 28,
  },
  introBannerTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.warning800, marginBottom: 3 },
  introBannerSub: { fontSize: fontSize.xs, color: palette.warning700, lineHeight: 17 },

  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 12 },

  trainerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg,
    padding: 16, marginBottom: 28,
    borderWidth: 1, borderColor: palette.borderFaint,
  },
  trainerAvatar: { width: 52, height: 52, borderRadius: 26 },
  trainerAvatarFallback: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
  },
  trainerInitial: { fontSize: fontSize.xl, fontWeight: '800', color: palette.blue500 },
  trainerInfo: { flex: 1 },
  trainerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  trainerName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  trainerSpec: { fontSize: fontSize.sm, color: palette.gray450 },

  description: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 24 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1, borderTopColor: palette.hairline,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.white,
  },
  bottomLabel: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', marginBottom: 2 },
  priceText: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },
  freePriceText: { fontSize: fontSize.base, fontWeight: '700', color: '#15803d' },
  bookBtn: {
    backgroundColor: palette.ink900,
    paddingHorizontal: 28, paddingVertical: 16,
    borderRadius: 30,
  },
  bookBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },

  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeBadgeText: { fontSize: fontSize.base, fontWeight: '700', color: palette.success700 },
  awaitingBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  awaitingText: { fontSize: fontSize.sm, fontWeight: '600', color: '#d97706', flex: 1 },
});
