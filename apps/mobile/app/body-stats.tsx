import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MeasurementRow {
  id: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  notes: string | null;
  logged_at: string;
  logged_by_pt_id: string | null;
  personal_trainers: { professional_name: string | null; full_name: string } | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BodyStatsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }

    const { data } = await supabase
      .from('client_measurements')
      .select('id, weight_kg, waist_cm, chest_cm, hips_cm, notes, logged_at, logged_by_pt_id, personal_trainers(professional_name, full_name)')
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })
      .limit(50);

    setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const weights = rows.map(r => r.weight_kg).filter((w): w is number => w != null);
  const maxWeight = Math.max(1, ...weights);
  const latest = rows[0];
  const previous = rows[1];

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Body Stats</ThemedText>
          <ThemedText style={s.headerSub}>Weight & measurements history</ThemedText>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/log-measurement' as any)} hitSlop={12}>
          <Ionicons name="add" size={22} color={palette.blue500} />
        </TouchableOpacity>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="body-outline" size={32} color={palette.gray300} />
          </View>
          <ThemedText style={s.emptyText}>No measurements yet</ThemedText>
          <ThemedText style={s.emptySub}>Log your weight to start tracking your progress.</ThemedText>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/log-measurement' as any)}>
            <ThemedText style={s.emptyBtnText}>Log Measurement</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {latest?.weight_kg != null && (
            <View style={s.currentCard}>
              <View style={s.currentIcon}>
                <Ionicons name="scale-outline" size={20} color="#fff" />
              </View>
              <View>
                <ThemedText style={s.currentLabel}>Current Weight</ThemedText>
                <ThemedText style={s.currentValue}>{latest.weight_kg} kg</ThemedText>
                {previous?.weight_kg != null && (
                  <View style={s.currentDeltaRow}>
                    <Ionicons
                      name={latest.weight_kg >= previous.weight_kg ? 'arrow-up' : 'arrow-down'}
                      size={11} color="rgba(255,255,255,0.7)"
                    />
                    <ThemedText style={s.currentDelta}>
                      {Math.abs(latest.weight_kg - previous.weight_kg).toFixed(1)} kg since last log
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

          <ThemedText style={s.sectionTitle}>History</ThemedText>

          {rows.map(row => (
            <View key={row.id} style={s.entryCard}>
              <View style={s.entryHeader}>
                <ThemedText style={s.entryDate}>{formatDate(row.logged_at)}</ThemedText>
                {row.weight_kg != null && <ThemedText style={s.entryWeight}>{row.weight_kg} kg</ThemedText>}
              </View>

              {row.weight_kg != null && (
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(row.weight_kg / maxWeight) * 100}%` }]} />
                </View>
              )}

              {(row.waist_cm || row.chest_cm || row.hips_cm) && (
                <View style={s.chipsRow}>
                  {row.waist_cm && <View style={s.chip}><ThemedText style={s.chipText}>Waist {row.waist_cm}cm</ThemedText></View>}
                  {row.chest_cm && <View style={s.chip}><ThemedText style={s.chipText}>Chest {row.chest_cm}cm</ThemedText></View>}
                  {row.hips_cm && <View style={s.chip}><ThemedText style={s.chipText}>Hips {row.hips_cm}cm</ThemedText></View>}
                </View>
              )}

              {row.notes && <ThemedText style={s.entryNote}>"{row.notes}"</ThemedText>}

              {row.logged_by_pt_id && (
                <View style={s.trainerBadge}>
                  <Ionicons name="person-circle-outline" size={12} color={palette.blue500} />
                  <ThemedText style={s.trainerBadgeText}>
                    Logged by {row.personal_trainers?.professional_name ?? row.personal_trainers?.full_name ?? 'your trainer'}
                  </ThemedText>
                </View>
              )}
            </View>
          ))}

          <View style={{ height: 60 }} />
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
  addBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },

  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.ink900, borderRadius: radii.xl,
    padding: 16, marginBottom: 24,
  },
  currentIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  currentLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentValue: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 2 },
  currentDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  currentDelta: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  entryCard: {
    borderWidth: 1, borderColor: palette.hairline, borderRadius: radii.xl,
    padding: 16, marginBottom: 12,
  },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  entryDate: { fontSize: 13, fontWeight: '600', color: palette.gray450 },
  entryWeight: { fontSize: 18, fontWeight: '900', color: palette.ink900 },

  barTrack: { height: 6, backgroundColor: palette.hairline, borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: palette.blue500, borderRadius: 3 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { backgroundColor: palette.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '700', color: palette.gray450 },

  entryNote: { fontSize: 13, color: palette.gray450, fontStyle: 'italic', lineHeight: 18 },
  trainerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  trainerBadgeText: { fontSize: 11, fontWeight: '600', color: palette.blue500 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center', marginBottom: 20 },
  emptyBtn: { backgroundColor: palette.blue500, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
