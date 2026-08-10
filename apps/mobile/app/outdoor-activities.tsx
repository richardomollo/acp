import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { getStravaStatus } from '@/services/strava';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const STRAVA_ORANGE = '#FC4C02';

interface ActivityRow {
  id: string;
  activity_type: 'run' | 'walk' | 'cycle' | 'strength' | 'mobility' | 'class' | 'other';
  name: string | null;
  start_time: string;
  duration_seconds: number | null;
  moving_time_seconds: number | null;
  distance_meters: number | null;
}

interface OutdoorStats {
  runs: number;
  walks: number;
  rides: number;
  distanceKm: number;
  activeMinutes: number;
}

const ACTIVITY_ICON: Record<string, string> = {
  run: 'walk-outline',
  walk: 'footsteps-outline',
  cycle: 'bicycle-outline',
  strength: 'barbell-outline',
  mobility: 'body-outline',
  class: 'people-outline',
  other: 'fitness-outline',
};

function formatActiveTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatActivityDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <View style={s.statCard}>
      <Ionicons name={icon as any} size={22} color={STRAVA_ORANGE} />
      <ThemedText style={s.statValue}>{value}</ThemedText>
      <ThemedText style={s.statLabel}>{label}</ThemedText>
    </View>
  );
}

export default function OutdoorActivitiesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [stats, setStats] = useState<OutdoorStats>({ runs: 0, walks: 0, rides: 0, distanceKm: 0, activeMinutes: 0 });

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

      const [{ data }, stravaStatus] = await Promise.all([
        supabase
          .from('activities')
          .select('id, activity_type, name, start_time, duration_seconds, moving_time_seconds, distance_meters')
          .eq('user_id', session.user.id)
          .order('start_time', { ascending: false })
          .limit(50),
        getStravaStatus(),
      ]);

      if (!active) return;
      setStravaConnected(stravaStatus.connected);

      const rows = (data as unknown as ActivityRow[]) ?? [];
      setActivities(rows);

      const totalDistanceMeters = rows.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0);
      const totalActiveSeconds = rows.reduce((sum, a) => sum + (a.moving_time_seconds ?? a.duration_seconds ?? 0), 0);
      setStats({
        runs: rows.filter(a => a.activity_type === 'run').length,
        walks: rows.filter(a => a.activity_type === 'walk').length,
        rides: rows.filter(a => a.activity_type === 'cycle').length,
        distanceKm: totalDistanceMeters / 1000,
        activeMinutes: Math.round(totalActiveSeconds / 60),
      });

      setLoading(false);
    })();
    return () => { active = false; };
  }, []));

  const hasActivities = (stats.runs + stats.walks + stats.rides) > 0;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Outdoor Activities</ThemedText>
          <ThemedText style={s.headerSub}>Runs, walks & rides via Strava</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : !isLoggedIn ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="lock-closed-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>Sign in to track activities</ThemedText>
          <ThemedText style={s.emptySub}>Your outdoor activities are saved to your account.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {hasActivities && (
            <>
              <View style={s.statsGrid}>
                <StatCard value={String(stats.runs)} label="Runs" icon="walk-outline" />
                <StatCard value={String(stats.walks)} label="Walks" icon="footsteps-outline" />
                <StatCard value={String(stats.rides)} label="Rides" icon="bicycle-outline" />
              </View>
              <View style={s.statsGrid}>
                <StatCard value={`${stats.distanceKm.toFixed(1)} km`} label="Distance" icon="map-outline" />
                <StatCard value={formatActiveTime(stats.activeMinutes)} label="Active time" icon="time-outline" />
              </View>
            </>
          )}

          <TouchableOpacity
            style={s.stravaCta}
            onPress={() => router.push('/strava-settings' as any)}
            activeOpacity={0.85}
          >
            <View style={[s.stravaCtaIcon, { backgroundColor: '#fff1eb' }]}>
              <Ionicons name={stravaConnected ? 'checkmark-circle' : 'walk'} size={20} color={STRAVA_ORANGE} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.stravaCtaTitle}>
                {stravaConnected ? 'Strava Connected ✓' : 'Connect Strava'}
              </ThemedText>
              <ThemedText style={s.stravaCtaSub}>
                {stravaConnected
                  ? 'Tap to sync now or manage your connection'
                  : 'Bring your runs, walks & rides into your journey'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
          </TouchableOpacity>

          {activities.length > 0 && (
            <>
              <ThemedText style={s.sectionTitle}>Recent Activities</ThemedText>
              {activities.map(a => (
                <View key={a.id} style={s.activityRow}>
                  <View style={s.activityIcon}>
                    <Ionicons name={(ACTIVITY_ICON[a.activity_type] ?? 'fitness-outline') as any} size={16} color={STRAVA_ORANGE} />
                  </View>
                  <View style={s.activityBody}>
                    <ThemedText style={s.activityName} numberOfLines={1}>
                      {a.name ?? (a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1))}
                    </ThemedText>
                    <ThemedText style={s.activityMeta}>
                      {formatActivityDate(a.start_time)}
                      {a.distance_meters ? ` · ${(a.distance_meters / 1000).toFixed(1)} km` : ''}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </>
          )}

          {!hasActivities && activities.length === 0 && (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="walk-outline" size={32} color={palette.gray300} />
              </View>
              <ThemedText style={s.emptyText}>No outdoor activities yet</ThemedText>
              <ThemedText style={s.emptySub}>Connect Strava to bring in your runs, walks & rides.</ThemedText>
            </View>
          )}

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

  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14, alignItems: 'center', gap: 6, ...shadows.sm,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: palette.ink900, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },

  stravaCta: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 16, marginBottom: 28, ...shadows.sm,
  },
  stravaCtaIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  stravaCtaTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  stravaCtaSub: { fontSize: 12, color: palette.gray300, marginTop: 1 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14,
  },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  activityIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff1eb',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  activityBody: { flex: 1 },
  activityName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  activityMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },
});
