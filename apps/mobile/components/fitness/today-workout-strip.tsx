// LH-36 — the "Today" date strip + selected-day workout card, extracted
// from app/(tabs)/fitness.tsx so Home can render the exact same section
// (same data source, same card, same check-in button) rather than a second,
// possibly-drifting copy. The canonical plan source is unchanged:
// fitness_profile.ai_assessment.starting_plan.activities +
// plan_activity_completions — no second workout-schedule source.
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { buildDateRange } from '@/components/date-rail';
import { authService } from '@/services/auth';
import {
  isValidAssessment, CATEGORY_LABEL,
  type AIAssessment, type StartingPlanActivity,
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

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function TodayWorkoutStrip() {
  const router = useRouter();
  // LH-26 — the user's LOCAL calendar day, never a UTC slice.
  const today = useMemo(() => localISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const days = useMemo(
    () => buildDateRange(14).map(d => ({ date: d.date, dateStr: localISODate(d.date) })),
    [],
  );

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
        // hides the plan — only the Check-in CTA may be unavailable.
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

  const planActivities = useMemo(() => assessment?.starting_plan.activities ?? [], [assessment]);
  const anchor = useMemo(() => new Date(), []);
  const selectedActivity = useMemo(
    () => resolvePlannedActivityForDate(planActivities, selectedDate, anchor),
    [planActivities, selectedDate, anchor],
  );
  const selectedCompleted = selectedActivity
    ? isActivityCompleted(selectedActivity.activityIndex, completions)
    : false;
  const plannedDates = useMemo(
    () => new Set(planActivities.map(a => resolveActivityDate(a, anchor)).filter((d): d is string => !!d)),
    [planActivities, anchor],
  );
  const checkInBookings = useMemo(
    () => (userId ? checkInEligibleBookingsForDate(bookings, selectedDate, userId) : []),
    [bookings, selectedDate, userId],
  );

  return (
    <>
      <ThemedText style={s.todayLabel}>Today</ThemedText>
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
    </>
  );
}

const s = StyleSheet.create({
  todayLabel: {
    fontSize: 13, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 20, marginTop: 16,
  },
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

  planCard: {
    marginHorizontal: 20, marginTop: 4, marginBottom: 16,
    backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'], padding: 20,
  },
  planCardHead: { flexDirection: 'row', gap: 12 },
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
});
