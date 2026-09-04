import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { buildDateRange } from '@/components/date-rail';
import { LinearGradient } from 'expo-linear-gradient';
import { authService } from '@/services/auth';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { MarketplaceUnavailableNotice } from '@/components/marketplace/marketplace-gate';
import {
  resolveFitnessDayState, scheduleOccursOnDate,
} from '@/lib/fitness-empty-state';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FitnessSession {
  id: string;
  name: string;
  category: string | null;
  image_url: string | null;
  duration_minutes: number;
  date: string;
  gyms: { name: string } | null;
}

interface ScheduledWorkout {
  workout_id: string;
  start_date: string;
  recurrence: string;
  weekdays: number[];
  workouts: { title: string | null } | null;
}

// Real `sessions.category` values seen in production — bucketed into two
// honest, non-fabricated rails. Anything not recognised as a self-directed
// workout style falls into Classes (the safer default for instructor-led
// content like pilates/martial arts/dance).
const WORKOUT_CATEGORIES = new Set(['hiit', 'strength training', 'cardio', 'crossfit', 'strength']);
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isWorkoutCategory(category: string | null): boolean {
  return WORKOUT_CATEGORIES.has((category ?? '').toLowerCase());
}

// ── Card ───────────────────────────────────────────────────────────────────────

function SessionCard({ session, onPress }: { session: FitnessSession; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {session.image_url ? (
        <Image source={{ uri: session.image_url }} style={s.cardImage} />
      ) : (
        <View style={[s.cardImage, s.cardImageFallback]}>
          <Ionicons name="barbell-outline" size={28} color={palette.gray300} />
        </View>
      )}
      {session.category ? (
        <View style={s.cardBadge}>
          <ThemedText style={s.cardBadgeText}>{session.category}</ThemedText>
        </View>
      ) : null}
      <View style={s.cardBody}>
        <ThemedText style={s.cardTitle} numberOfLines={2}>{session.name}</ThemedText>
        <ThemedText style={s.cardMeta}>
          {session.gyms?.name ? `${session.gyms.name} · ` : ''}{session.duration_minutes} min
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

function SessionRail({
  title, sessions, loading, onSeeAll, onPressSession,
}: {
  title: string; sessions: FitnessSession[]; loading: boolean;
  onSeeAll: () => void; onPressSession: (s: FitnessSession) => void;
}) {
  if (!loading && sessions.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.sectionHeaderRow}>
        <ThemedText style={s.sectionTitle}>{title}</ThemedText>
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={s.seeAllRow}>
          <ThemedText style={s.seeAllText}>See all</ThemedText>
          <Ionicons name="chevron-forward" size={14} color={palette.blue600} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={palette.blue500} style={{ marginVertical: 20 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent}>
          {sessions.map(session => (
            <SessionCard key={session.id} session={session} onPress={() => onPressSession(session)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FitnessScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<FitnessSession[]>([]);
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState(today);
  const days = useMemo(() => buildDateRange(14), []);

  // Beta #019 — these rails are bookable marketplace classes; scope to venues
  // within the supported radius. `venueScopeIds`: string[] → scope; null →
  // kill switch off, fetch as before. Location resolved in the background —
  // no GPS prompt on this tab.
  const ml = useMarketplaceLocation();
  const scopeIds = ml.venueScopeIds;
  const scopeKey = scopeIds === null ? 'all' : scopeIds.join(',');
  useEffect(() => { ml.ensureResolved({ requestPermission: false }); }, [ml]);

  // Beta #019B — self-guided / trainer-scheduled workouts for the selected day.
  // These are NEVER hidden because marketplace supply is absent (§4).
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([]);
  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      if (!session?.user) { setScheduledWorkouts([]); return; }
      const { data } = await supabase
        .from('workout_schedules')
        .select('workout_id, start_date, recurrence, weekdays, workouts(title)')
        .eq('user_id', session.user.id)
        .eq('is_active', true);
      setScheduledWorkouts((data as unknown as ScheduledWorkout[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (scopeIds !== null && scopeIds.length === 0) { setSessions([]); setLoading(false); return; }
      setLoading(true);
      let q = supabase
        .from('sessions')
        .select('id, name, category, image_url, duration_minutes, date, gyms(name)')
        .eq('is_active', true)
        .gte('date', today);
      if (scopeIds !== null) q = q.in('gym_id', scopeIds);
      const { data } = await q.order('date', { ascending: true }).limit(40);
      setSessions((data as unknown as FitnessSession[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, scopeKey]);

  const sessionDates = useMemo(() => new Set(sessions.map(sess => sess.date)), [sessions]);
  const workoutSessions = useMemo(() => sessions.filter(sess => isWorkoutCategory(sess.category)), [sessions]);
  const classSessions = useMemo(() => sessions.filter(sess => !isWorkoutCategory(sess.category)), [sessions]);
  const plannedToday = sessionDates.has(selectedDate);

  // Beta #019B — the empty state depends on BOTH day content and #019
  // marketplace availability, and a planned workout always wins.
  const dayWorkouts = useMemo(
    () => scheduledWorkouts.filter(w => scheduleOccursOnDate(w, selectedDate)),
    [scheduledWorkouts, selectedDate],
  );
  const dayState = resolveFitnessDayState({
    hasMarketplaceSessionOnDay: plannedToday,
    hasPlannedWorkoutOnDay: dayWorkouts.length > 0,
    marketplaceStatus: ml.availability?.status ?? null,
    geoGatingEnabled: ml.geoGatingEnabled,
  });

  const openSession = (session: FitnessSession) => {
    router.push({ pathname: '/session-details', params: { sessionId: session.id, gymName: session.gyms?.name || 'Gym' } } as any);
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={s.topFadeBg}
        pointerEvents="none"
      />
      <View style={s.header}>
        <ThemedText style={s.headerTitle}>Fitness</ThemedText>
        <ThemedText style={s.headerSub}>Plan your workouts and classes</ThemedText>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={s.todayLabel}>Today</ThemedText>
        {/* Date strip — same styling as the Weekly Plan page's week strip. */}
        <View style={s.weekStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.weekStripRow}>
            {days.map(({ date, dateStr }) => {
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === today;
              const hasSessions = sessionDates.has(dateStr);
              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[s.stripDay, isSelected && s.stripDaySelected]}
                  onPress={() => setSelectedDate(dateStr)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[s.stripDayLabel, isToday && s.stripDayLabelToday]}>
                    {isToday ? 'Today' : DAY_ABBR[date.getDay()]}
                  </ThemedText>
                  <ThemedText style={[s.stripDayNum, isToday && s.stripDayNumToday]}>{date.getDate()}</ThemedText>
                  <View style={[s.stripDot, hasSessions && s.stripDotActive]} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Beta #019B — empty state depends on day content AND #019 market
            availability; a self-guided workout is never hidden (§4). */}
        {dayState === 'has_planned_workout' ? (
          <TouchableOpacity
            style={s.emptyCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: dayWorkouts[0].workout_id } } as any)}
          >
            <View style={s.emptyIconWrap}>
              <Ionicons name="barbell-outline" size={22} color={palette.blue600} />
            </View>
            <ThemedText style={s.emptyText}>
              {dayWorkouts[0].workouts?.title
                ? `Planned: ${dayWorkouts[0].workouts.title}`
                : 'You have a workout planned for this day'}
            </ThemedText>
            <ThemedText style={s.emptyCta}>Open workout</ThemedText>
          </TouchableOpacity>
        ) : dayState === 'has_marketplace_session' ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={22} color={palette.blue600} />
            </View>
            <ThemedText style={s.emptyText}>Sessions are available this day</ThemedText>
            <TouchableOpacity onPress={() => router.push('/workout-hub' as any)} activeOpacity={0.7}>
              <ThemedText style={s.emptyCta}>Plan something</ThemedText>
            </TouchableOpacity>
          </View>
        ) : dayState === 'empty_available' ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={22} color={palette.blue600} />
            </View>
            <ThemedText style={s.emptyText}>You&apos;ve got nothing planned for this day</ThemedText>
            <TouchableOpacity onPress={() => router.push('/workout-hub' as any)} activeOpacity={0.7}>
              <ThemedText style={s.emptyCta}>Plan something</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          // empty_no_local_inventory | empty_location_unknown — reuse the #019
          // availability notice verbatim so Fitness, Discover and Home speak
          // the same language (§2/§9).
          <View style={s.noticeWrap}>
            <MarketplaceUnavailableNotice supplyNoun="bookable gyms, classes or trainers" showLoading={false} />
          </View>
        )}

        <SessionRail
          title="Workouts"
          sessions={workoutSessions}
          loading={loading}
          onSeeAll={() => router.push('/(tabs)/discover' as any)}
          onPressSession={openSession}
        />
        <SessionRail
          title="Classes"
          sessions={classSessions}
          loading={loading}
          onSeeAll={() => router.push('/(tabs)/discover' as any)}
          onPressSession={openSession}
        />

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 220;
const CARD_IMAGE_HEIGHT = 130;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.56, color: palette.ink900, paddingTop: 10 },
  headerSub: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },

  content: { paddingTop: 4 },

  todayLabel: {
    fontSize: 13, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 20, marginTop: 16,
  },

  // Date strip — mirrors weekly-plan.tsx's weekStrip / stripDay styling.
  weekStrip: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'], padding: 12,
    marginHorizontal: 20, marginTop: 8, marginBottom: 16,
  },
  weekStripRow: { gap: 6 },
  stripDay: { alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.lg, minWidth: 52 },
  stripDaySelected: { backgroundColor: palette.white },
  stripDayLabel: { fontSize: 11, fontWeight: '600', color: palette.gray450, textTransform: 'uppercase' },
  stripDayLabelToday: { color: palette.blue600 },
  stripDayNum: { fontSize: fontSize.base, fontWeight: '800', color: palette.ink900 },
  stripDayNumToday: { color: palette.blue600 },
  stripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.border, marginTop: 2 },
  stripDotActive: { backgroundColor: palette.blue500 },

  emptyCard: {
    marginHorizontal: 20, marginTop: 4, marginBottom: 24,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    paddingVertical: 28, paddingHorizontal: 20,
    alignItems: 'center', gap: 8,
  },
  emptyIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyText: { fontSize: 14, fontWeight: '600', color: palette.ink700, textAlign: 'center' },
  emptyCta: { fontSize: 13, fontWeight: '700', color: palette.blue600 },
  noticeWrap: { paddingHorizontal: 20, marginTop: 4, marginBottom: 24 },

  section: { marginBottom: 24 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: palette.ink900, letterSpacing: -0.3 },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '700', color: palette.blue600 },

  railContent: { paddingHorizontal: 20, gap: 14 },

  card: {
    width: CARD_WIDTH, borderRadius: radii.xl, overflow: 'hidden',
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline,
    ...shadows.sm,
  },
  cardImage: { width: CARD_WIDTH, height: CARD_IMAGE_HEIGHT },
  cardImageFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  cardBadge: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radii.pill,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  cardBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  cardBody: { padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900, lineHeight: 18 },
  cardMeta: { fontSize: 12, color: palette.gray450, marginTop: 3 },
});
