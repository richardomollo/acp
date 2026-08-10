import {
  StyleSheet, View, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface HistoryRow {
  id: string;
  completed_at: string;
  duration_minutes: number | null;
  rating: number | null;
  notes: string | null;
  logged_by_pt_id: string | null;
  workouts: { title: string; category: string } | null;
}

function formatHistoryDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const CATEGORY_GRAD: Record<string, readonly [string, string]> = {
  full_body: [palette.blue500, '#0044ee'],
  hiit:      ['#ef4444', '#f97316'],
  mobility:  ['#15803d', '#16a34a'],
  core:      ['#7c3aed', '#9333ea'],
  push:      ['#111111', '#374151'],
  pull:      ['#1d4ed8', '#1e40af'],
  legs:      ['#92400e', '#b45309'],
  strength:  ['#000000', '#111827'],
};
const DEF_GRAD: readonly [string, string] = [palette.ink900, '#333'];

export default function WorkoutHistoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

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

      const { data } = await supabase
        .from('workout_history')
        .select('id, completed_at, duration_minutes, rating, notes, logged_by_pt_id, workouts ( title, category )')
        .eq('user_id', session.user.id)
        .order('completed_at', { ascending: false })
        .limit(200);

      if (active) {
        setHistory((data as unknown as HistoryRow[]) ?? []);
        setLoading(false);
      }
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
          <ThemedText style={s.headerTitle}>Workout History</ThemedText>
          <ThemedText style={s.headerSub}>Your completed sessions</ThemedText>
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
          <ThemedText style={s.emptySub}>Your workout history is saved to your account.</ThemedText>
        </View>
      ) : history.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="barbell-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>No workouts logged yet</ThemedText>
          <ThemedText style={s.emptySub}>Complete a workout and it'll show up here.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {history.map(row => {
            const cat  = row.workouts?.category ?? 'full_body';
            const grad = CATEGORY_GRAD[cat] ?? DEF_GRAD;
            return (
              <View key={row.id} style={s.historyRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <LinearGradient colors={grad} style={s.historyDot} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </LinearGradient>
                  <View style={s.historyBody}>
                    <ThemedText style={s.historyName} numberOfLines={1}>
                      {row.workouts?.title ?? 'Workout'}
                    </ThemedText>
                    <ThemedText style={s.historyMeta}>
                      {formatHistoryDate(row.completed_at)}
                      {row.duration_minutes ? ` · ${row.duration_minutes} min` : ''}
                    </ThemedText>
                  </View>
                  {row.rating ? (
                    <View style={s.historyRating}>
                      <Ionicons name="star" size={13} color="#EAB308" />
                      <ThemedText style={s.historyRatingText}>{row.rating}</ThemedText>
                    </View>
                  ) : null}
                </View>
                {row.notes ? (
                  <ThemedText style={s.historyNote} numberOfLines={2}>“{row.notes}”</ThemedText>
                ) : null}
                {row.logged_by_pt_id ? (
                  <ThemedText style={s.historyTrainerBadge}>Logged by your trainer</ThemedText>
                ) : null}
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

  content: { paddingHorizontal: 20, paddingTop: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },

  historyRow: {
    gap: 4,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  historyDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 12 },
  historyBody: { flex: 1 },
  historyName: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  historyMeta: { fontSize: 12, color: palette.gray450, marginTop: 2 },
  historyNote: { fontSize: 12.5, color: palette.gray450, fontStyle: 'italic', marginLeft: 44, lineHeight: 17 },
  historyTrainerBadge: { fontSize: 11, fontWeight: '600', color: palette.blue500, marginLeft: 44, marginTop: 4 },
  historyRating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  historyRatingText: { fontSize: 13, fontWeight: '700', color: palette.ink700 },
});
