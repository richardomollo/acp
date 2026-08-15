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

type Programme = {
  id: string;
  gym_id: string;
  instructor_id: string | null;
  intro_session_id: string;
  title: string;
  description: string | null;
  category: string | null;
  programme_weeks: number;
  programme_price_kes: number;
  deposit_pct: number;
  instalment_frequency_weeks: number;
  image_url: string | null;
};

type Gym = { id: string; name: string; image_url: string | null };
type Instructor = { full_name: string } | null;
type IntroSession = { id: string; date: string; time: string; drop_in_price: number | null };
type Enrollment = { id: string; status: string; trainer_intro_confirmed: boolean };

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function GymProgrammeDetailsScreen() {
  const router = useRouter();
  const { programmeId } = useLocalSearchParams<{ programmeId: string }>();
  const { showAuthModal } = useAuthModal();
  const [programme, setProgramme] = useState<Programme | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [instructor, setInstructor] = useState<Instructor>(null);
  const [introSession, setIntroSession] = useState<IntroSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const fetchEnrollment = useCallback(async (progId: string, uid: string) => {
    const { data } = await supabase
      .from('gym_programme_enrollments')
      .select('id, status, trainer_intro_confirmed')
      .eq('programme_id', progId)
      .eq('user_id', uid)
      .maybeSingle();
    setEnrollment(data as Enrollment | null);
  }, []);

  const load = useCallback(async () => {
    const [{ data: { user } }, { data: progData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('gym_programmes').select('*').eq('id', programmeId).single(),
    ]);

    const uid = user?.id ?? null;
    setUserId(uid);
    if (!progData) { setLoading(false); return; }
    setProgramme(progData as any);

    const [{ data: gymData }, { data: storedIntro }] = await Promise.all([
      supabase.from('gyms').select('id, name, image_url').eq('id', progData.gym_id).single(),
      supabase.from('sessions').select('id, gym_id, name, date, time, drop_in_price, category, recurring').eq('id', progData.intro_session_id).single(),
    ]);
    if (gymData) setGym(gymData as any);

    if (progData.instructor_id) {
      const { data: trainerData } = await supabase.from('gym_trainers').select('full_name').eq('id', progData.instructor_id).maybeSingle();
      setInstructor(trainerData as any);
    }

    // Resolve to the soonest upcoming occurrence if the intro session is recurring
    // (same gym_id + name + time + category grouping used everywhere else).
    let resolvedIntro: IntroSession | null = storedIntro as any;
    if (storedIntro?.recurring) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: nextOccurrence } = await supabase
        .from('sessions')
        .select('id, date, time, drop_in_price')
        .eq('gym_id', storedIntro.gym_id).eq('name', storedIntro.name)
        .eq('time', storedIntro.time).eq('category', storedIntro.category).eq('recurring', true)
        .gte('date', todayStr).order('date', { ascending: true }).limit(1).maybeSingle();
      if (nextOccurrence) resolvedIntro = nextOccurrence as any;
    }
    setIntroSession(resolvedIntro);

    if (uid) await fetchEnrollment(progData.id, uid);
    setLoading(false);
  }, [programmeId, fetchEnrollment]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  if (!programme || !gym) return null;

  const total = Number(programme.programme_price_kes);
  const depositPct = programme.deposit_pct ?? 30;
  const deposit = Math.round(total * depositPct / 100);
  const remaining = total - deposit;
  const freq = programme.instalment_frequency_weeks;
  const numInstalments = freq ? Math.floor(programme.programme_weeks / freq) : 0;
  const instalmentAmount = numInstalments > 0 ? Math.round(remaining / numInstalments) : remaining;

  const handleBookIntro = () => {
    if (!introSession) return;
    if (!userId) {
      showAuthModal((uid) => {
        setUserId(uid);
        router.push({ pathname: '/session-details', params: { sessionId: introSession.id } });
      });
      return;
    }
    router.push({ pathname: '/session-details', params: { sessionId: introSession.id } });
  };

  const handleJoinProgramme = () => {
    if (!enrollment) return;
    router.push({ pathname: '/gym-programme-enroll', params: { programmeId: programme.id, enrollmentId: enrollment.id } });
  };

  const renderBottomBar = () => {
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
            <ThemedText style={styles.awaitingText}>Awaiting confirmation</ThemedText>
          </View>
        </View>
      );
    }

    if (!introSession) {
      return (
        <View style={styles.bottomBar}>
          <ThemedText style={styles.bottomLabel}>No upcoming intro sessions</ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.bottomBar}>
        <View>
          <ThemedText style={styles.bottomLabel}>Intro session</ThemedText>
          {introSession.drop_in_price
            ? <ThemedText style={styles.priceText}>KES {Number(introSession.drop_in_price).toLocaleString()}</ThemedText>
            : <ThemedText style={styles.freePriceText}>Free</ThemedText>}
        </View>
        <TouchableOpacity style={styles.bookBtn} onPress={handleBookIntro}>
          <ThemedText style={styles.bookBtnText}>Book Intro Session</ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          {programme.image_url || gym.image_url ? (
            <Image source={{ uri: programme.image_url ?? gym.image_url! }} style={styles.heroImg} contentFit="cover" />
          ) : (
            <View style={[styles.heroImg, styles.heroFallback]} />
          )}
          <View style={styles.heroOverlay} />
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={palette.white} />
          </TouchableOpacity>
          <View style={[styles.typeBadge, { backgroundColor: '#4f46e5' }]}>
            <ThemedText style={styles.typeBadgeText}>{programme.programme_weeks}-Week Programme</ThemedText>
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.title}>{programme.title}</ThemedText>

          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Ionicons name="calendar-outline" size={15} color="#4f46e5" />
              <ThemedText style={[styles.statText, { color: '#4f46e5' }]}>{programme.programme_weeks} weeks</ThemedText>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="cash-outline" size={15} color={palette.blue500} />
              <ThemedText style={styles.statText}>KES {total.toLocaleString()} total</ThemedText>
            </View>
          </View>

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

          <View style={styles.introBanner}>
            <Ionicons name="information-circle-outline" size={18} color={palette.warning700} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.introBannerTitle}>Starts with an intro session</ThemedText>
              <ThemedText style={styles.introBannerSub}>
                Book a trial class first. Once the venue confirms it went well, you can join the full programme.
              </ThemedText>
              {introSession && (
                <ThemedText style={styles.introBannerSub}>
                  Next: {fmtDate(introSession.date)} at {fmtTime(introSession.time)}
                </ThemedText>
              )}
            </View>
          </View>

          <ThemedText style={styles.sectionTitle}>Venue</ThemedText>
          <TouchableOpacity
            style={styles.trainerCard}
            onPress={() => router.push({ pathname: '/gym-details', params: { gymId: gym.id } })}
            activeOpacity={0.8}
          >
            {gym.image_url ? (
              <Image source={{ uri: gym.image_url }} style={styles.trainerAvatar} contentFit="cover" />
            ) : (
              <View style={styles.trainerAvatarFallback}>
                <ThemedText style={styles.trainerInitial}>{gym.name[0].toUpperCase()}</ThemedText>
              </View>
            )}
            <View style={styles.trainerInfo}>
              <View style={styles.trainerNameRow}>
                <ThemedText style={styles.trainerName}>{gym.name}</ThemedText>
              </View>
              {instructor?.full_name && (
                <ThemedText style={styles.trainerSpec} numberOfLines={1}>Instructor: {instructor.full_name}</ThemedText>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>

          {programme.description ? (
            <>
              <ThemedText style={styles.sectionTitle}>About this programme</ThemedText>
              <ThemedText style={styles.description}>{programme.description}</ThemedText>
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
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 16, left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center',
  },
  typeBadge: {
    position: 'absolute', bottom: 36, left: 20,
    backgroundColor: palette.blue500, borderRadius: radii.sm, paddingHorizontal: 12, paddingVertical: 4,
  },
  typeBadgeText: { color: palette.white, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },

  card: {
    backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'],
    marginTop: -24, padding: 24,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, marginBottom: 16 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue50, borderRadius: radii.xl,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  statText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },

  scheduleCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: palette.border,
  },
  scheduleTitle: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  scheduleLabel: { fontSize: fontSize.sm, color: palette.gray450, flex: 1, marginRight: 8 },
  scheduleAmount: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },
  scheduleTotalRow: { borderTopWidth: 1, borderTopColor: palette.border, marginTop: 4, paddingTop: 10, marginBottom: 0 },
  scheduleTotalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900 },
  scheduleTotalAmount: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },

  introBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: palette.warning50, borderWidth: 1, borderColor: palette.warning100,
    borderRadius: radii.lg, padding: 14, marginBottom: 28,
  },
  introBannerTitle: { fontSize: fontSize.sm, fontWeight: '700', color: palette.warning800, marginBottom: 3 },
  introBannerSub: { fontSize: fontSize.xs, color: palette.warning700, lineHeight: 17 },

  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 12 },

  trainerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginBottom: 28,
    borderWidth: 1, borderColor: palette.borderFaint,
  },
  trainerAvatar: { width: 52, height: 52, borderRadius: 26 },
  trainerAvatarFallback: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center' },
  trainerInitial: { fontSize: fontSize.xl, fontWeight: '800', color: palette.blue500 },
  trainerInfo: { flex: 1 },
  trainerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  trainerName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  trainerSpec: { fontSize: fontSize.sm, color: palette.gray450 },

  description: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 24 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1, borderTopColor: palette.hairline,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.white,
  },
  bottomLabel: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', marginBottom: 2 },
  priceText: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },
  freePriceText: { fontSize: fontSize.base, fontWeight: '700', color: '#15803d' },
  bookBtn: { backgroundColor: palette.ink900, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 30 },
  bookBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },

  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeBadgeText: { fontSize: fontSize.base, fontWeight: '700', color: palette.success700 },
  awaitingBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  awaitingText: { fontSize: fontSize.sm, fontWeight: '600', color: '#d97706', flex: 1 },
});
