import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { buildDateRange } from '@/components/date-rail';
import { LinearGradient } from 'expo-linear-gradient';
import { authService } from '@/services/auth';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { getEligiblePersonalTrainerIds } from '@/services/professional-eligibility-service';
import { SearchTrigger, SearchModal, SearchResultRow, SearchEmpty } from '@/components/search-trigger-modal';
import { filterClassesLocally, filterTrainersLocally, homeSearchResultRoute } from '@/lib/marketplace/home-search';
import {
  isValidAssessment, CATEGORY_LABEL,
  type AIAssessment, type ActivityCategory as AssessmentCategory, type StartingPlanActivity,
} from '@/lib/ai-assessment';
import { resolveActivityDate } from '@/lib/home-intelligence';
import { localISODate, getFulfilmentForActivity } from '@/lib/fulfilment';
import { ActivityFulfilmentCard } from '@/components/activity-fulfilment-card';
import type { PlanActivityCompletion } from '@/lib/completion';
import {
  resolvePlannedActivityForDate, isActivityCompleted,
  checkInEligibleBookingsForDate, FITNESS_UPCOMING_BOOKING_STATUSES,
  type FitnessBookingRow,
} from '@/lib/fitness-tab';

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

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same icon mapping This Week's Plan uses for a plan activity's category.
const PLAN_CATEGORY_ICON: Record<AssessmentCategory, string> = {
  strength: 'barbell-outline',
  cardio: 'walk-outline',
  recovery: 'leaf-outline',
  mobility: 'body-outline',
  sport: 'football-outline',
};

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

// ── Selected-day workout card ─────────────────────────────────────────────────
// LH-36 — the canonical plan activity for the selected day. The activity
// summary mirrors This Week's Plan (category / title / activity · duration /
// description / completion); the CTA is the shared ActivityFulfilmentCard, so
// "View workout" resolves to the SAME real /workout-detail session My Plan /
// This Week's Plan / Home open — no separate prescription display or route.
function SelectedDayWorkout({
  activity, activityIndex, completed, userId, planId, plannedDate,
}: {
  activity: StartingPlanActivity;
  activityIndex: number;
  completed: boolean;
  userId: string | null;
  planId: string | null;
  plannedDate: string;
}) {
  const fulfilment = useMemo(
    () => getFulfilmentForActivity(activity, activityIndex, [], false, new Date()),
    [activity, activityIndex],
  );
  return (
    <View style={s.planCard}>
      <View style={s.planCardHead}>
        <View style={s.planIconWrap}>
          <Ionicons name={(PLAN_CATEGORY_ICON[activity.category] ?? 'ellipse-outline') as any} size={18} color={palette.ink700} />
        </View>
        <View style={{ flex: 1 }}>
          {completed ? (
            <View style={s.planCompletedRow}>
              <Ionicons name="checkmark-circle" size={13} color={palette.success700} />
              <ThemedText style={s.planCompletedText}>{CATEGORY_LABEL[activity.category]} · Completed</ThemedText>
            </View>
          ) : (
            <ThemedText style={s.planEyebrow}>{CATEGORY_LABEL[activity.category]}</ThemedText>
          )}
          <ThemedText style={s.planTitle}>{activity.title}</ThemedText>
        </View>
      </View>
      <ThemedText style={s.planMeta}>{activity.activity} · {activity.duration_minutes} min</ThemedText>
      {activity.description ? (
        <ThemedText style={s.planDesc} numberOfLines={3}>{activity.description}</ThemedText>
      ) : null}
      <ActivityFulfilmentCard
        userId={userId}
        activity={activity}
        fulfilment={fulfilment}
        onInfoPress={() => {}}
        planContext={planId ? { planId, activityIndex, plannedDate } : undefined}
      />
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
  const [selectedDate, setSelectedDate] = useState(today);
  // buildDateRange returns Date objects; take the LOCAL YYYY-MM-DD off each
  // (its own `dateStr` is a UTC slice — not used here).
  const days = useMemo(
    () => buildDateRange(14).map(d => ({ date: d.date, dateStr: localISODate(d.date) })),
    [],
  );

  // Beta #019 — these rails are bookable marketplace classes; scope to venues
  // within the supported radius. `venueScopeIds`: string[] → scope; null →
  // kill switch off, fetch as before. Location resolved in the background —
  // no GPS prompt on this tab.
  const ml = useMarketplaceLocation();
  const scopeIds = ml.venueScopeIds;
  const scopeKey = scopeIds === null ? 'all' : scopeIds.join(',');
  useEffect(() => { ml.ensureResolved({ requestPermission: false }); }, [ml]);

  // LH-36 — the user's ACTUAL plan for the selected day comes from the ONE
  // canonical source My Plan / This Week's Plan / Today use
  // (fitness_profile.ai_assessment.starting_plan.activities +
  // plan_activity_completions). No second workout-schedule source, no
  // marketplace/location gating on this data. `bookings` is a best-effort
  // side lookup for the Check-in CTA and never blocks the plan from rendering.
  const [userId, setUserId] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [completions, setCompletions] = useState<PlanActivityCompletion[]>([]);
  const [bookings, setBookings] = useState<FitnessBookingRow[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setPlanLoading(true);
      try {
        const session = await authService.getSession();
        if (!session?.user?.id) {
          if (active) { setUserId(null); setAssessment(null); setPlanId(null); setCompletions([]); setBookings([]); }
          return;
        }
        const uid = session.user.id;
        if (active) setUserId(uid);

        const { data: profile } = await supabase
          .from('fitness_profile')
          .select('ai_assessment, ai_assessment_generated_at')
          .eq('user_id', uid)
          .maybeSingle();

        const validAssessment = profile?.ai_assessment && isValidAssessment(profile.ai_assessment) && profile.ai_assessment_generated_at
          ? (profile.ai_assessment as AIAssessment)
          : null;
        const resolvedPlanId = validAssessment ? (profile!.ai_assessment_generated_at as string) : null;
        if (!active) return;
        setAssessment(validAssessment);
        setPlanId(resolvedPlanId);

        if (validAssessment && resolvedPlanId) {
          const { data: completionsData } = await supabase
            .from('plan_activity_completions')
            .select('id, plan_id, activity_index, planned_date, completed_at, completion_source, source_entity_id')
            .eq('user_id', uid)
            .eq('plan_id', resolvedPlanId);
          if (!active) return;
          setCompletions(((completionsData ?? []) as any[]).map(c => ({
            id: c.id, planId: c.plan_id, activityIndex: c.activity_index, plannedDate: c.planned_date,
            completedAt: c.completed_at, completionSource: c.completion_source, sourceEntityId: c.source_entity_id,
          })));
        } else if (active) {
          setCompletions([]);
        }

        // Best-effort: bookings across the visible strip. A failure here NEVER
        // hides the plan — only the Check-in CTA may be unavailable (§10 G).
        const lastDay = days[days.length - 1]?.dateStr ?? today;
        try {
          const { data: bookingData, error } = await supabase
            .from('bookings')
            .select('id, user_id, booking_date, status, checked_in')
            .eq('user_id', uid)
            .in('status', [...FITNESS_UPCOMING_BOOKING_STATUSES])
            .gte('booking_date', today)
            .lte('booking_date', lastDay);
          if (!active) return;
          // A failure here NEVER hides the plan — `bookings` just stays empty
          // so the Check-in CTA is simply absent (§10 G).
          setBookings(error ? [] : ((bookingData ?? []) as FitnessBookingRow[]));
        } catch {
          if (active) setBookings([]);
        }
      } finally {
        if (active) setPlanLoading(false);
      }
    })();
    return () => { active = false; };
  }, [days, today]));

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

  // LH-36 — the canonical plan activity for the selected day (or null → honest
  // empty state). Same date rule every plan surface uses.
  const planActivities = useMemo(() => assessment?.starting_plan.activities ?? [], [assessment]);
  const anchor = useMemo(() => new Date(), []);
  const selectedActivity = useMemo(
    () => resolvePlannedActivityForDate(planActivities, selectedDate, anchor),
    [planActivities, selectedDate, anchor],
  );
  const selectedCompleted = selectedActivity
    ? isActivityCompleted(selectedActivity.activityIndex, completions)
    : false;
  // Strip dot marks days the plan schedules something.
  const plannedDates = useMemo(
    () => new Set(planActivities.map(a => resolveActivityDate(a, anchor)).filter((d): d is string => !!d)),
    [planActivities, anchor],
  );
  const checkInBookings = useMemo(
    () => (userId ? checkInEligibleBookingsForDate(bookings, selectedDate, userId) : []),
    [bookings, selectedDate, userId],
  );

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
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
        <ThemedText style={s.todayLabel}>Today</ThemedText>
        {/* Date strip — same styling as the Weekly Plan page's week strip. */}
        <View style={s.weekStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.weekStripRow}>
            {days.map(({ date, dateStr }) => {
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === today;
              const hasSessions = plannedDates.has(dateStr);
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

        {/* LH-36 — the user's actual plan for the selected day. Personal-plan
            data: renders regardless of marketplace location. Never a
            "Plan something" marketplace CTA. */}
        {planLoading ? (
          <ActivityIndicator color={palette.blue500} style={{ marginVertical: 28 }} />
        ) : !assessment ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="clipboard-outline" size={22} color={palette.blue600} />
            </View>
            <ThemedText style={s.emptyText}>You don&apos;t have a fitness plan yet.</ThemedText>
            <TouchableOpacity onPress={() => router.push('/my-plan' as any)} activeOpacity={0.7}>
              <ThemedText style={s.emptyCta}>Set up my plan</ThemedText>
            </TouchableOpacity>
          </View>
        ) : selectedActivity ? (
          <SelectedDayWorkout
            activity={selectedActivity.activity}
            activityIndex={selectedActivity.activityIndex}
            completed={selectedCompleted}
            userId={userId}
            planId={planId}
            plannedDate={selectedDate}
          />
        ) : (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="bed-outline" size={22} color={palette.blue600} />
            </View>
            <ThemedText style={s.emptyText}>No workout scheduled for this day.</ThemedText>
          </View>
        )}

        {/* An active class booking on the selected day → the existing check-in
            flow. Independent of whether the plan has an activity that day. */}
        {checkInBookings.length > 0 && (
          <TouchableOpacity
            style={s.checkInBtn}
            onPress={() => router.push('/(tabs)/check-in' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check in"
          >
            <Ionicons name="qr-code-outline" size={16} color={palette.white} />
            <ThemedText style={s.checkInBtnText}>
              Check in{checkInBookings.length > 1 ? ` (${checkInBookings.length})` : ''}
            </ThemedText>
          </TouchableOpacity>
        )}

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

  // LH-36 — selected-day plan workout card (mirrors This Week's Plan Day card).
  planCard: {
    marginHorizontal: 20, marginTop: 4, marginBottom: 16,
    backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'], padding: 20,
  },
  planCardHead: { flexDirection: 'row', gap: 12 },
  planIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.white,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  planEyebrow: { fontSize: 11, fontWeight: '800', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  planCompletedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  planCompletedText: { fontSize: 10, fontWeight: '800', color: palette.success700, letterSpacing: 0.5, textTransform: 'uppercase' },
  planTitle: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink900, marginTop: 2 },
  planMeta: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 10 },
  planDesc: { fontSize: fontSize.xs, color: palette.ink600, marginTop: 6, lineHeight: 17, marginBottom: 4 },

  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginHorizontal: 20, marginTop: 4, marginBottom: 24,
    backgroundColor: palette.ink900, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.xl,
  },
  checkInBtnText: { color: palette.white, fontSize: fontSize.sm, fontWeight: '700' },

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
