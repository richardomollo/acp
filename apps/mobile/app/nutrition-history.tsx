// ACP Intelligence™ — Nutrition N2. Recent nutrition history (§8) + the
// deterministic "What ACP has observed" evidence (§10/§29).
//
// One bounded query (foodLogService.getNutritionRange) for the whole window;
// everything on screen is derived from its frozen snapshots. Observation only —
// no targets, no coaching, no judgement.

import { useCallback, useMemo, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { palette, radii } from '@/constants/theme';
import { authService } from '@/services/auth';
import { foodLogService } from '@/services/food-log-service';
import { localISODate } from '@/lib/fulfilment';
import type { DayNutrition } from '@/lib/nutrition/nutrition-history';
import { buildNutritionPatterns, type NutritionPatternEvidence } from '@/lib/nutrition/nutrition-patterns';
import { ObservedPanel } from '@/components/nutrition/nutrition-observed';

const WINDOWS = [7, 14] as const;

function weekdayLabel(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function NutritionHistoryScreen() {
  const router = useRouter();
  const [days, setDays] = useState<7 | 14>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<DayNutrition[]>([]);
  const [patterns, setPatterns] = useState<NutritionPatternEvidence | null>(null);

  const load = useCallback(async (windowDays: 7 | 14, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(false);
    try {
      const session = await authService.getSession();
      if (!session?.user.id) { setHistory([]); setPatterns(null); return; }
      const end = localISODate(new Date());
      const range = await foodLogService.getNutritionRange(session.user.id, windowDays, end);
      setHistory(range.days);
      setPatterns(buildNutritionPatterns(range.entries, { windowDays, endLocalDate: end }));
    } catch {
      setError(true);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const loggedDayCount = useMemo(() => history.filter(d => d.hasLogs).length, [history]);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[palette.blue100, palette.white]} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={20} color={palette.ink900} />
            </TouchableOpacity>
            <ThemedText style={s.headerTitle}>Recent nutrition</ThemedText>
            <View style={{ width: 36 }} />
          </View>
          <View style={s.toggleRow}>
            {WINDOWS.map(w => (
              <TouchableOpacity
                key={w}
                style={[s.toggle, days === w && s.toggleOn]}
                onPress={() => setDays(w)}
              >
                <ThemedText style={[s.toggleText, days === w && s.toggleTextOn]}>{w} days</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={palette.ink700} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(days, true); }} />}
        >
          {error && (
            <View style={s.errorBox}>
              <ThemedText style={s.errorText}>Couldn&apos;t load your history.</ThemedText>
              <TouchableOpacity onPress={() => load(days)}><ThemedText style={s.retry}>Retry</ThemedText></TouchableOpacity>
            </View>
          )}

          {patterns && <ObservedPanel patterns={patterns} />}

          {!error && loggedDayCount === 0 ? (
            <ThemedText style={s.emptyText}>
              Log meals over a few days to start seeing your recent nutrition here.
            </ThemedText>
          ) : (
            <>
              {loggedDayCount > 0 && loggedDayCount < 2 && (
                <ThemedText style={s.hint}>
                  Keep logging — patterns appear once you have a couple of logged days.
                </ThemedText>
              )}
              <View style={s.list}>
                {history.map(d => (
                  <TouchableOpacity
                    key={d.localDate}
                    style={s.dayRow}
                    disabled={!d.hasLogs}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/nutrition-day-detail', params: { date: d.localDate } } as any)}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.dayTitle}>{weekdayLabel(d.localDate)}</ThemedText>
                      {d.hasLogs ? (
                        <ThemedText style={s.dayMeta}>
                          {d.entryCount} {d.entryCount === 1 ? 'item' : 'items'}
                          {' · '}{Math.round(d.energyKcal)} kcal
                          {'  ·  P '}{Math.round(d.proteinG)}{' g'}
                          {'  C '}{Math.round(d.carbohydrateG)}{' g'}
                          {'  F '}{Math.round(d.fatG)}{' g'}
                        </ThemedText>
                      ) : (
                        <ThemedText style={s.dayMetaMuted}>No food logged</ThemedText>
                      )}
                    </View>
                    {d.hasLogs && <Ionicons name="chevron-forward" size={16} color={palette.gray300} />}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 },
  toggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: palette.white },
  toggleOn: { backgroundColor: palette.ink900 },
  toggleText: { fontSize: 12.5, fontWeight: '700', color: palette.ink700 },
  toggleTextOn: { color: palette.white },

  content: { paddingHorizontal: 20, paddingTop: 18 },
  errorBox: { backgroundColor: palette.danger50, borderRadius: radii.lg, padding: 14, marginBottom: 14 },
  errorText: { fontSize: 13, color: palette.danger600 },
  retry: { fontSize: 13, fontWeight: '700', color: palette.danger600, marginTop: 6 },

  emptyText: { fontSize: 13.5, color: palette.gray450, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  hint: { fontSize: 12.5, color: palette.gray450, marginTop: 14, marginBottom: 4 },

  list: { marginTop: 14 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  dayTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  dayMeta: { fontSize: 12, color: palette.gray450, marginTop: 3 },
  dayMetaMuted: { fontSize: 12, color: palette.gray300, marginTop: 3, fontStyle: 'italic' },
});
