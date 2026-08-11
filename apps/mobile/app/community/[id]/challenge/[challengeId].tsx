import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const STRAVA_ORANGE = '#FC4C02';

interface ChallengeRow {
  id: string; title: string; description: string | null;
  metric: 'distance_km' | 'activity_count' | 'days_active';
  target_value: number; activity_types: string[];
  period_start: string; period_end: string;
}
interface ActivityRow {
  activity_type: string; start_time: string; distance_meters: number | null;
}
interface LeaderboardRow {
  user_id: string; name: string | null; avatar_url: string | null; metric_value: number; rank: number;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

export default function CommunityChallengeDetailScreen() {
  const { challengeId } = useLocalSearchParams<{ id: string; challengeId: string }>();
  const router = useRouter();

  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [myValue, setMyValue] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    const session = await authService.getSession();
    const uid = session?.user.id ?? null;
    setUserId(uid);

    const { data: c } = await supabase
      .from('challenges')
      .select('id, title, description, metric, target_value, activity_types, period_start, period_end')
      .eq('id', challengeId).single();
    setChallenge(c as ChallengeRow);

    if (uid && c) {
      const { data: activityRows } = await supabase
        .from('activities').select('activity_type, start_time, distance_meters')
        .eq('user_id', uid).order('start_time', { ascending: false }).limit(500);
      const inWindow = ((activityRows as ActivityRow[]) ?? []).filter(a =>
        c.activity_types.includes(a.activity_type) &&
        a.start_time.slice(0, 10) >= c.period_start &&
        a.start_time.slice(0, 10) <= c.period_end,
      );
      let value = 0;
      if (c.metric === 'distance_km') value = inWindow.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0) / 1000;
      else if (c.metric === 'activity_count') value = inWindow.length;
      else if (c.metric === 'days_active') value = new Set(inWindow.map(a => a.start_time.slice(0, 10))).size;
      setMyValue(value);
    }

    const { data: lb, error: lbErr } = await supabase.rpc('get_challenge_leaderboard', { p_challenge_id: challengeId });
    if (lbErr) { setLeaderboardError(lbErr.message); setLeaderboard([]); }
    else { setLeaderboardError(null); setLeaderboard((lb as LeaderboardRow[]) ?? []); }

    setLoading(false);
  }, [challengeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 100 }} />;
  if (!challenge) return <View style={s.notFound}><ThemedText>Challenge not found.</ThemedText></View>;

  const unit = challenge.metric === 'distance_km' ? 'km' : challenge.metric === 'days_active' ? 'days' : 'activities';
  const pct = Math.min(100, Math.round((myValue / challenge.target_value) * 100));
  const displayValue = challenge.metric === 'distance_km' ? myValue.toFixed(1) : myValue;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle} numberOfLines={1}>{challenge.title}</ThemedText>
            <ThemedText style={s.headerSub}>{fmtDate(challenge.period_start)} – {fmtDate(challenge.period_end)}</ThemedText>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {challenge.description ? <ThemedText style={s.description}>{challenge.description}</ThemedText> : null}

          {userId ? (
            <View style={s.progressCard}>
              <ThemedText style={s.progressLabel}>Your progress</ThemedText>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${pct}%` }]} />
              </View>
              <ThemedText style={s.progressText}>{displayValue} / {challenge.target_value} {unit}</ThemedText>
            </View>
          ) : null}

          <ThemedText style={s.sectionLabel}>Leaderboard</ThemedText>
          {leaderboardError ? (
            <ThemedText style={s.emptyText}>Join this community to see the leaderboard.</ThemedText>
          ) : leaderboard.length === 0 ? (
            <ThemedText style={s.emptyText}>No activity logged yet — be the first!</ThemedText>
          ) : (
            leaderboard.map(row => (
              <View key={row.user_id} style={[s.lbRow, row.user_id === userId && s.lbRowSelf]}>
                <ThemedText style={s.lbRank}>#{row.rank}</ThemedText>
                {row.avatar_url ? (
                  <Image source={{ uri: row.avatar_url }} style={s.lbAvatar} />
                ) : (
                  <View style={s.lbAvatarFallback}><ThemedText style={s.lbAvatarFallbackText}>{(row.name ?? 'M')[0]?.toUpperCase()}</ThemedText></View>
                )}
                <ThemedText style={s.lbName} numberOfLines={1}>{row.name ?? 'Member'}{row.user_id === userId ? ' (you)' : ''}</ThemedText>
                <ThemedText style={s.lbValue}>
                  {challenge.metric === 'distance_km' ? Number(row.metric_value).toFixed(1) : row.metric_value} {unit}
                </ThemedText>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  content: { padding: 20, paddingBottom: 60 },
  description: { fontSize: 14, color: palette.gray450, lineHeight: 20, marginBottom: 16 },
  progressCard: {
    backgroundColor: palette.white, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 24, ...shadows.sm,
  },
  progressLabel: { fontSize: 12.5, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted, overflow: 'hidden', marginTop: 10 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: STRAVA_ORANGE },
  progressText: { fontSize: 13, fontWeight: '700', color: palette.gray450, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  emptyText: { fontSize: 13, color: palette.gray300 },
  lbRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.lg,
    backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline, marginBottom: 8,
  },
  lbRowSelf: { borderColor: palette.blue500, backgroundColor: palette.blue25 },
  lbRank: { fontSize: 13, fontWeight: '800', color: palette.gray300, width: 30 },
  lbAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.surfaceMuted },
  lbAvatarFallback: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  lbAvatarFallbackText: { fontSize: 12, fontWeight: '800', color: palette.blue500 },
  lbName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: palette.ink900 },
  lbValue: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
});
