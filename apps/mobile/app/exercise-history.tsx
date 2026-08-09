import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SetLogRow {
  id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  logged_at: string;
  workout_history_id: string;
  workout_history: { completed_at: string; workouts: { title: string } | null; logged_by_pt_id: string | null } | null;
}

interface SessionGroup {
  workoutHistoryId: string;
  completedAt: string;
  workoutTitle: string;
  sets: SetLogRow[];
  topWeight: number;
  loggedByTrainer: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ExerciseHistoryScreen() {
  const { exerciseId, name } = useLocalSearchParams<{ exerciseId: string; name?: string }>();
  const router = useRouter();

  const [logs, setLogs] = useState<SetLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!exerciseId) return;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user.id) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      setIsLoggedIn(true);

      const { data } = await supabase
        .from('workout_set_logs')
        .select('id, set_number, weight_kg, reps, logged_at, workout_history_id, workout_history ( completed_at, logged_by_pt_id, workouts ( title ) )')
        .eq('user_id', session.user.id)
        .eq('exercise_id', exerciseId)
        .order('logged_at', { ascending: false });

      setLogs((data as unknown as SetLogRow[]) ?? []);
      setLoading(false);
    })();
  }, [exerciseId]);

  const sessions = useMemo(() => {
    const byWorkout = new Map<string, SetLogRow[]>();
    for (const log of logs) {
      if (!byWorkout.has(log.workout_history_id)) byWorkout.set(log.workout_history_id, []);
      byWorkout.get(log.workout_history_id)!.push(log);
    }
    const groups: SessionGroup[] = [...byWorkout.entries()].map(([workoutHistoryId, sets]) => ({
      workoutHistoryId,
      completedAt: sets[0].workout_history?.completed_at ?? sets[0].logged_at,
      workoutTitle: sets[0].workout_history?.workouts?.title ?? 'Workout',
      sets: sets.sort((a, b) => a.set_number - b.set_number),
      topWeight: Math.max(0, ...sets.map(s => s.weight_kg ?? 0)),
      loggedByTrainer: !!sets[0].workout_history?.logged_by_pt_id,
    }));
    return groups.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [logs]);

  const personalBest = useMemo(
    () => Math.max(0, ...logs.map(l => l.weight_kg ?? 0)),
    [logs],
  );
  const maxTopWeight = useMemo(
    () => Math.max(1, ...sessions.map(s => s.topWeight)),
    [sessions],
  );

  const label = name ?? 'Exercise';

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle} numberOfLines={1}>{label}</ThemedText>
          <ThemedText style={s.headerSub}>Weight History</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !isLoggedIn ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>Sign in to track progress</ThemedText>
          <ThemedText style={s.emptySub}>Your logged weights are saved to your account.</ThemedText>
        </View>
      ) : sessions.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="barbell-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>No logged sets yet</ThemedText>
          <ThemedText style={s.emptySub}>Log a weight next time you do this exercise in a workout.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {personalBest > 0 && (
            <View style={s.pbCard}>
              <View style={s.pbIcon}>
                <Ionicons name="trophy" size={20} color="#FFD700" />
              </View>
              <View>
                <ThemedText style={s.pbLabel}>Personal Best</ThemedText>
                <ThemedText style={s.pbValue}>{personalBest}kg</ThemedText>
              </View>
            </View>
          )}

          <ThemedText style={s.sectionTitle}>Sessions</ThemedText>

          {sessions.map(session => (
            <View key={session.workoutHistoryId} style={s.sessionCard}>
              <View style={s.sessionHeader}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={s.sessionTitle}>{session.workoutTitle}</ThemedText>
                  <ThemedText style={s.sessionDate}>{formatDate(session.completedAt)}</ThemedText>
                  {session.loggedByTrainer && (
                    <View style={s.trainerBadge}>
                      <Ionicons name="person-circle-outline" size={11} color={palette.blue500} />
                      <ThemedText style={s.trainerBadgeText}>Logged by your trainer</ThemedText>
                    </View>
                  )}
                </View>
                {session.topWeight > 0 && (
                  <View style={s.sessionWeightWrap}>
                    <ThemedText style={s.sessionWeight}>{session.topWeight}kg</ThemedText>
                    {session.topWeight === personalBest && (
                      <View style={s.pbBadge}>
                        <ThemedText style={s.pbBadgeText}>PB</ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {session.topWeight > 0 && (
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(session.topWeight / maxTopWeight) * 100}%` }]} />
                </View>
              )}

              <View style={s.setsRow}>
                {session.sets.map(set => (
                  <View key={set.id} style={s.setChip}>
                    <ThemedText style={s.setChipText}>
                      {set.weight_kg ? `${set.weight_kg}kg` : 'BW'} × {set.reps ?? '-'}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  pbCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.ink900, borderRadius: radii.xl,
    padding: 16, marginBottom: 24,
  },
  pbIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  pbLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  pbValue: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 2 },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  sessionCard: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 16, marginBottom: 12,
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  sessionTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  sessionDate: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  trainerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  trainerBadgeText: { fontSize: 11, fontWeight: '600', color: palette.blue500 },
  sessionWeightWrap: { alignItems: 'flex-end', gap: 4 },
  sessionWeight: { fontSize: 18, fontWeight: '900', color: palette.ink900 },
  pbBadge: { backgroundColor: '#FFD700', borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  pbBadgeText: { fontSize: 9, fontWeight: '900', color: palette.ink900 },

  barTrack: { height: 6, backgroundColor: palette.hairline, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: palette.blue500, borderRadius: 3 },

  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setChip: { backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  setChipText: { fontSize: 12, fontWeight: '700', color: palette.gray450 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
});
