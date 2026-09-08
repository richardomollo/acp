// ACP Intelligence™ Day 2 — minimal programme view, ORIGINALLY generating
// (if none existed) and displaying a structured, persisted multi-week
// legacy programme. Opening a workout reuses the existing workout-detail.tsx
// screen unmodified — it already reads any `workouts` row generically by id.
//
// Workout Prescription durable fix (Lana precedence, product decision) —
// this legacy System-1 generator (workout_programs, generic full_body_a/b
// only, no upper/lower/support concept) is no longer offered for NEW
// generation or regeneration: Lana Intelligence's own weekly plan is now
// the authoritative source for workout execution. This screen still
// displays an EXISTING programme in full (read-only history) — no data is
// deleted, and programmeService.generateProgramme/regenerateProgramme
// still exist, just unused by this screen now.
import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '@/services/auth';
import { programmeService } from '@/services/programme-service';
import { getDueCheckIn, type DueCheckIn } from '@/services/adaptation-service';

interface ProgrammeWorkout {
  id: string;
  title: string;
  description: string | null;
  category: string;
  day_of_week: string | null;
  workout_type: string | null;
  sequence: number | null;
  is_activity_block: boolean;
  duration_minutes: number;
  program_week_id: string;
}

interface ProgrammeOverview {
  program: {
    id: string; goal: string; experience_level: string;
    sessions_per_week: number; session_duration_minutes: number;
    duration_weeks: number; explanation: string | null;
  };
  weeks: { id: string; week_number: number }[];
  workouts: ProgrammeWorkout[];
}

const DAY_LABEL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const GOAL_LABEL: Record<string, string> = {
  lose_weight: 'Lose weight', build_muscle: 'Build strength & muscle',
  maintain_weight: 'Maintain a healthy weight', general_fitness: 'General fitness',
  body_recomposition: 'Build muscle & lose fat', improve_running: 'Improve running',
  improve_mobility: 'Improve mobility', healthy_lifestyle: 'Healthy lifestyle',
  improve_health: 'Improve health', eat_healthier: 'Eat healthier',
};

export default function MyProgrammeScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<ProgrammeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekIndex, setWeekIndex] = useState(0);
  const [dueCheckIn, setDueCheckIn] = useState<DueCheckIn | null>(null);

  const load = useCallback(async (uid: string) => {
    const data = await programmeService.getActiveProgramme(uid);
    setOverview(data as ProgrammeOverview | null);
    setDueCheckIn(await getDueCheckIn(uid));
  }, []);

  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      const uid = session?.user.id ?? null;
      if (uid) await load(uid);
      setLoading(false);
    })();
  }, [load]);

  const weeks = overview?.weeks ?? [];
  const currentWeek = weeks[weekIndex];
  const weekWorkouts = (overview?.workouts ?? [])
    .filter(w => w.program_week_id === currentWeek?.id)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Your Programme</ThemedText>
            <ThemedText style={s.headerSub}>Lana</ThemedText>
          </View>
        </SafeAreaView>

        {loading ? (
          <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {!overview ? (
              // Workout Prescription durable fix (Lana precedence, product
              // decision) — this legacy System-1 multi-week Programme
              // generator (workout_programs, generic full_body_a/b only, no
              // upper/lower/support concept) is no longer offered to users
              // who don't already have one. Lana Intelligence's own weekly
              // plan (My Plan) is the authoritative source for workout
              // execution now. Existing programmes remain fully viewable
              // below — nothing here deletes data or breaks the route.
              <View style={s.emptyWrap}>
                <Ionicons name="sparkles-outline" size={40} color={palette.blue500} />
                <ThemedText style={s.emptyTitle}>Your workouts live in My Plan</ThemedText>
                <ThemedText style={s.emptySub}>
                  Lana builds your day-by-day strength sessions directly from your weekly plan — open My Plan and tap into any scheduled workout to get started.
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={s.summaryCard}>
                  <ThemedText style={s.summaryTitle}>
                    Your {overview.program.duration_weeks}-week programme
                  </ThemedText>
                  <ThemedText style={s.summaryMeta}>
                    Goal: {GOAL_LABEL[overview.program.goal] ?? overview.program.goal}
                  </ThemedText>
                  <ThemedText style={s.summaryMeta}>
                    {overview.program.experience_level.charAt(0).toUpperCase() + overview.program.experience_level.slice(1)}
                    {' · '}{overview.program.sessions_per_week} workouts/week
                    {' · '}{overview.program.session_duration_minutes}–{overview.program.session_duration_minutes + 10} minutes
                  </ThemedText>
                  {!!overview.program.explanation && (
                    <ThemedText style={s.summaryExplanation}>{overview.program.explanation}</ThemedText>
                  )}
                </View>

                {dueCheckIn && (
                  <TouchableOpacity
                    style={s.checkinCta}
                    onPress={() => router.push({ pathname: '/weekly-checkin', params: { programId: dueCheckIn.programId, weekNumber: dueCheckIn.weekNumber } } as any)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="sparkles-outline" size={18} color={palette.blue500} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.checkinCtaTitle}>Weekly check-in ready</ThemedText>
                      <ThemedText style={s.checkinCtaSub}>Tell Lana how last week felt so it can adjust next week</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                )}

                <View style={s.weekRail}>
                  {weeks.map((w, i) => (
                    <TouchableOpacity
                      key={w.id}
                      style={[s.weekChip, i === weekIndex && s.weekChipActive]}
                      onPress={() => setWeekIndex(i)}
                    >
                      <ThemedText style={[s.weekChipText, i === weekIndex && s.weekChipTextActive]}>
                        Week {w.week_number}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.workoutList}>
                  {weekWorkouts.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={s.workoutRow}
                      onPress={() => router.push({ pathname: '/workout-detail', params: { workoutId: w.id } } as any)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.workoutDay}>{DAY_LABEL[w.day_of_week ?? ''] ?? ''}</ThemedText>
                        <ThemedText style={s.workoutTitle}>{w.title}</ThemedText>
                        <ThemedText style={s.workoutMeta}>
                          {w.is_activity_block ? w.description : `~${w.duration_minutes} min`}
                        </ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Workout Prescription durable fix — regeneration also
                    created fresh legacy conflicting rows, so it's retired
                    alongside initial generation above. This existing
                    programme itself is untouched (still fully viewable). */}
                <ThemedText style={s.legacyNotice}>
                  This is a saved programme from before Lana Intelligence built your weekly plan. It still works, but Lana no longer regenerates it — your current day-by-day workouts come from My Plan.
                </ThemedText>
              </>
            )}

            <View style={{ height: 80 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  messageBox: {
    backgroundColor: palette.blue25, borderRadius: radii.md, padding: 14, marginBottom: 16,
  },
  messageText: { fontSize: 13.5, color: palette.ink700, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginTop: 8 },
  emptySub: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', lineHeight: 19, marginBottom: 12 },
  primaryBtn: {
    backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  primaryBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  summaryCard: {
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 16, gap: 4,
  },
  summaryTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  summaryMeta: { fontSize: 13, color: palette.gray450 },
  summaryExplanation: { fontSize: 12.5, color: palette.gray450, marginTop: 8, lineHeight: 17 },

  checkinCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.blue25, borderRadius: radii.lg, padding: 14, marginBottom: 16,
  },
  checkinCtaTitle: { fontSize: 13.5, fontWeight: '700', color: palette.ink900 },
  checkinCtaSub: { fontSize: 12, color: palette.gray450, marginTop: 2 },

  weekRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  weekChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted,
  },
  weekChipActive: { backgroundColor: palette.ink900 },
  weekChipText: { fontSize: 12.5, fontWeight: '700', color: palette.gray450 },
  weekChipTextActive: { color: '#fff' },

  workoutList: { gap: 10, marginBottom: 20 },
  workoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radii.xl, borderWidth: 1, borderColor: palette.hairline, padding: 14,
  },
  workoutDay: { fontSize: 11, fontWeight: '700', color: palette.blue500, textTransform: 'uppercase', letterSpacing: 0.4 },
  workoutTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900, marginTop: 2 },
  workoutMeta: { fontSize: 12.5, color: palette.gray450, marginTop: 2 },

  regenBtn: { alignItems: 'center', paddingVertical: 12 },
  regenBtnText: { fontSize: 13, fontWeight: '700', color: palette.blue500 },
  legacyNotice: { fontSize: 12, color: palette.gray300, textAlign: 'center', lineHeight: 17, paddingVertical: 12, paddingHorizontal: 8 },
});
