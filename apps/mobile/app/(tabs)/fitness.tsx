import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { getEligiblePersonalTrainerIds } from '@/services/professional-eligibility-service';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';
import { filterClassesLocally, filterTrainersLocally, homeSearchResultRoute } from '@/lib/marketplace/home-search';
import { localISODate } from '@/lib/fulfilment';
import { TodayWorkoutStrip } from '@/components/fitness/today-workout-strip';

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

interface FitnessTrainer {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  specialisations: string[];
}

interface FitnessVenue {
  id: string;
  name: string;
  location: string | null;
  image_url: string | null;
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

function TrainerCard({ trainer, onPress }: { trainer: FitnessTrainer; onPress: () => void }) {
  const name = trainer.professional_name ?? trainer.full_name;
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {trainer.photo_url ? (
        <Image source={{ uri: trainer.photo_url }} style={s.cardImage} />
      ) : (
        <View style={[s.cardImage, s.cardImageFallback]}>
          <Ionicons name="person-outline" size={28} color={palette.gray300} />
        </View>
      )}
      <View style={s.cardBody}>
        <ThemedText style={s.cardTitle} numberOfLines={2}>{name}</ThemedText>
        <ThemedText style={s.cardMeta} numberOfLines={1}>
          {trainer.specialisations.slice(0, 2).join(' · ') || 'Personal Trainer'}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

function TrainerRail({
  title, trainers, loading, onSeeAll, onPressTrainer,
}: {
  title: string; trainers: FitnessTrainer[]; loading: boolean;
  onSeeAll: () => void; onPressTrainer: (t: FitnessTrainer) => void;
}) {
  if (!loading && trainers.length === 0) return null;
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
          {trainers.map(trainer => (
            <TrainerCard key={trainer.id} trainer={trainer} onPress={() => onPressTrainer(trainer)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function VenueCard({ venue, onPress }: { venue: FitnessVenue; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {venue.image_url ? (
        <Image source={{ uri: venue.image_url }} style={s.cardImage} />
      ) : (
        <View style={[s.cardImage, s.cardImageFallback]}>
          <Ionicons name="business-outline" size={28} color={palette.gray300} />
        </View>
      )}
      <View style={s.cardBody}>
        <ThemedText style={s.cardTitle} numberOfLines={2}>{venue.name}</ThemedText>
        <ThemedText style={s.cardMeta} numberOfLines={1}>{venue.location ?? 'Venue'}</ThemedText>
      </View>
    </TouchableOpacity>
  );
}

function VenueRail({
  title, venues, loading, onSeeAll, onPressVenue,
}: {
  title: string; venues: FitnessVenue[]; loading: boolean;
  onSeeAll: () => void; onPressVenue: (v: FitnessVenue) => void;
}) {
  if (!loading && venues.length === 0) return null;
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
          {venues.map(venue => (
            <VenueCard key={venue.id} venue={venue} onPress={() => onPressVenue(venue)} />
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
  // LH-26 — the user's LOCAL calendar day, never a UTC slice.
  const today = useMemo(() => localISODate(new Date()), []);

  // Beta #019 — these rails are bookable marketplace classes; scope to venues
  // within the supported radius. `venueScopeIds`: string[] → scope; null →
  // kill switch off, fetch as before. Location resolved in the background —
  // no GPS prompt on this tab.
  const ml = useMarketplaceLocation();
  const scopeIds = ml.venueScopeIds;
  const scopeKey = scopeIds === null ? 'all' : scopeIds.join(',');
  useEffect(() => { ml.ensureResolved({ requestPermission: false }); }, [ml]);

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

  // Beta #019 — trainers are marketplace supply too: geo-scope in-person
  // coaches the same way Classes are scoped (a nearby venue link/offering, or
  // an explicit online offering). Fails closed on a scope query error.
  const [trainers, setTrainers] = useState<FitnessTrainer[]>([]);
  const [trainersLoading, setTrainersLoading] = useState(true);
  useEffect(() => {
    (async () => {
      if (scopeIds !== null && scopeIds.length === 0) { setTrainers([]); setTrainersLoading(false); return; }
      setTrainersLoading(true);
      const eligibility = await getEligiblePersonalTrainerIds(scopeIds);
      if (!eligibility.ok || (eligibility.ids !== null && eligibility.ids.length === 0)) {
        setTrainers([]); setTrainersLoading(false); return;
      }
      let q = supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, photo_url, specialisations')
        .eq('status', 'approved');
      if (eligibility.ids !== null) q = q.in('id', eligibility.ids);
      const { data } = await q.order('created_at', { ascending: false }).limit(20);
      setTrainers((data as unknown as FitnessTrainer[]) ?? []);
      setTrainersLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  // Beta #019 — venues are marketplace supply; scope to gyms within the
  // supported radius (same rule as the Venues tab).
  const [venues, setVenues] = useState<FitnessVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(true);
  useEffect(() => {
    (async () => {
      if (scopeIds !== null && scopeIds.length === 0) { setVenues([]); setVenuesLoading(false); return; }
      setVenuesLoading(true);
      let q = supabase
        .from('gyms')
        .select('id, name, location, image_url')
        .eq('is_active', true);
      if (scopeIds !== null) q = q.in('id', scopeIds);
      const { data } = await q.order('name', { ascending: true }).limit(20);
      setVenues((data as unknown as FitnessVenue[]) ?? []);
      setVenuesLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const openSession = (session: FitnessSession) => {
    router.push({ pathname: '/session-details', params: { sessionId: session.id, gymName: session.gyms?.name || 'Gym' } } as any);
  };

  const openTrainer = (trainer: FitnessTrainer) => {
    router.push({ pathname: '/trainer-profile', params: { id: trainer.id } } as any);
  };

  const openVenue = (venue: FitnessVenue) => {
    router.push({ pathname: '/gym-details', params: { gymId: venue.id } } as any);
  };

  // Search — filters the workouts/classes and trainers this screen already
  // loaded (no new query). Reuses the shared search sheet + the canonical
  // match/route helpers so results and destinations match the rest of the app.
  const params = useLocalSearchParams<{ openSearch?: string }>();
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Home's own search bar (mirrors this one) deep-links here rather than
  // duplicating the sessions/trainers fetch — this tab already owns that data.
  useEffect(() => {
    if (params.openSearch) setSearchVisible(true);
  }, [params.openSearch]);
  const searchedSessions = useMemo(
    () => (searchQuery.trim() ? filterClassesLocally(sessions, searchQuery) : []),
    [sessions, searchQuery],
  );
  const searchedTrainers = useMemo(
    () => (searchQuery.trim() ? filterTrainersLocally(trainers, searchQuery) : []),
    [trainers, searchQuery],
  );

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
        <View style={s.searchWrap}>
          <SearchTrigger
            placeholder="Search workouts, classes or trainers"
            onPress={() => setSearchVisible(true)}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* LH-36 — extracted to components/fitness/today-workout-strip.tsx so
            Home can render the exact same section (§ "add this section to
            Home") without a second, possibly-drifting copy. */}
        <TodayWorkoutStrip />

        <SessionRail
          title="Classes"
          sessions={sessions}
          loading={loading}
          onSeeAll={() => router.push('/(tabs)/classes' as any)}
          onPressSession={openSession}
        />
        <VenueRail
          title="Venues"
          venues={venues}
          loading={venuesLoading}
          onSeeAll={() => router.push('/(tabs)/venues' as any)}
          onPressVenue={openVenue}
        />
        <TrainerRail
          title="Personal Trainers"
          trainers={trainers}
          loading={trainersLoading}
          onSeeAll={() => router.push('/(tabs)/trainers' as any)}
          onPressTrainer={openTrainer}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      <SearchModal
        visible={searchVisible}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => { setSearchVisible(false); setSearchQuery(''); }}
        placeholder="Search workouts, classes or trainers"
      >
        {searchedSessions.length > 0 && (
          <ThemedText style={s.searchSectionLabel}>Workouts &amp; classes</ThemedText>
        )}
        {searchedSessions.map(session => (
          <SearchResultRow
            key={session.id}
            image={session.image_url}
            fallbackIcon="barbell"
            fallbackBg={palette.blue500}
            name={session.name}
            subtitle={session.gyms?.name ?? 'Session'}
            onPress={() => {
              setSearchVisible(false); setSearchQuery('');
              router.push(homeSearchResultRoute('classes', session) as any);
            }}
          />
        ))}
        {searchedTrainers.length > 0 && (
          <ThemedText style={s.searchSectionLabel}>Personal trainers</ThemedText>
        )}
        {searchedTrainers.map(trainer => (
          <SearchResultRow
            key={trainer.id}
            image={trainer.photo_url}
            fallbackIcon="person"
            fallbackBg={palette.blue500}
            rounded
            name={trainer.professional_name ?? trainer.full_name}
            subtitle={trainer.specialisations.slice(0, 2).join(' · ') || 'Personal Trainer'}
            onPress={() => {
              setSearchVisible(false); setSearchQuery('');
              router.push(homeSearchResultRoute('trainers', trainer) as any);
            }}
          />
        ))}
        {searchQuery.trim().length > 0 && searchedSessions.length === 0 && searchedTrainers.length === 0 && (
          <SearchEmpty query={searchQuery} />
        )}
      </SearchModal>
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
  searchWrap: { marginTop: 14 },
  searchSectionLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },

  content: { paddingTop: 4 },

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
