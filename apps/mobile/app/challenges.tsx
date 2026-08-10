import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const STRAVA_ORANGE = '#FC4C02';

interface ActivityRow {
  activity_type: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility' | 'class' | 'other';
  start_time: string;
  distance_meters: number | null;
}

interface ChallengeRow {
  id: string;
  title: string;
  description: string | null;
  metric: 'distance_km' | 'activity_count' | 'days_active';
  target_value: number;
  activity_types: string[];
  period_start: string;
  period_end: string;
}

interface ChallengeProgress extends ChallengeRow {
  value: number;
}

export default function ChallengesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const session = await authService.getSession();
      if (!active) return;

      if (!session?.user.id) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      setIsLoggedIn(true);

      const [{ data: activitiesData }, { data: challengesData }] = await Promise.all([
        supabase
          .from('activities')
          .select('activity_type, start_time, distance_meters')
          .eq('user_id', session.user.id)
          .order('start_time', { ascending: false })
          .limit(500),
        supabase
          .from('challenges')
          .select('id, title, description, metric, target_value, activity_types, period_start, period_end')
          .eq('is_active', true),
      ]);

      if (!active) return;

      const activityRows = (activitiesData as unknown as ActivityRow[]) ?? [];

      // Challenge progress is computed live from activities, not stored —
      // no participants/leaderboard table for this first pass.
      const challengeRows = (challengesData as unknown as ChallengeRow[]) ?? [];
      setChallenges(challengeRows.map(c => {
        const inWindow = activityRows.filter(a =>
          c.activity_types.includes(a.activity_type) &&
          a.start_time.slice(0, 10) >= c.period_start &&
          a.start_time.slice(0, 10) <= c.period_end,
        );
        let value = 0;
        if (c.metric === 'distance_km') value = inWindow.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0) / 1000;
        else if (c.metric === 'activity_count') value = inWindow.length;
        else if (c.metric === 'days_active') value = new Set(inWindow.map(a => a.start_time.slice(0, 10))).size;
        return { ...c, value };
      }));

      setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Challenges</ThemedText>
          <ThemedText style={s.headerSub}>Compete against yourself this month</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !isLoggedIn ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>Sign in to see challenges</ThemedText>
          <ThemedText style={s.emptySub}>Track your progress against active challenges.</ThemedText>
        </View>
      ) : challenges.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="trophy-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>No active challenges</ThemedText>
          <ThemedText style={s.emptySub}>Check back soon for new challenges to join.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {challenges.map(c => {
            const pct = Math.min(100, Math.round((c.value / c.target_value) * 100));
            const unit = c.metric === 'distance_km' ? 'km' : c.metric === 'days_active' ? 'days' : 'activities';
            const displayValue = c.metric === 'distance_km' ? c.value.toFixed(1) : c.value;
            return (
              <View key={c.id} style={s.challengeCard}>
                <ThemedText style={s.challengeTitle}>{c.title}</ThemedText>
                {c.description && <ThemedText style={s.challengeDesc}>{c.description}</ThemedText>}
                <View style={s.challengeBarTrack}>
                  <View style={[s.challengeBarFill, { width: `${pct}%` }]} />
                </View>
                <ThemedText style={s.challengeProgressText}>
                  {displayValue} / {c.target_value} {unit}
                </ThemedText>
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
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
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 24 },

  challengeCard: {
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 12, ...shadows.sm,
  },
  challengeTitle: { fontSize: 14, fontWeight: '800', color: palette.ink900 },
  challengeDesc: { fontSize: 12, color: palette.gray300, marginTop: 2, marginBottom: 10 },
  challengeBarTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden', marginTop: 10 },
  challengeBarFill: { height: 8, borderRadius: 4, backgroundColor: STRAVA_ORANGE },
  challengeProgressText: { fontSize: 12, fontWeight: '700', color: palette.gray450, marginTop: 8 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
});
