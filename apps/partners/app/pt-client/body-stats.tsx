import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface MeasurementRow {
  id: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  notes: string | null;
  logged_at: string;
  logged_by_pt_id: string | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PTClientBodyStatsScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) { setLoading(false); return; }

    const { data: pcRow } = await supabase
      .from('pt_clients').select('share_progress').eq('pt_id', pt.id).eq('client_user_id', clientId).single();
    setShared(!!pcRow?.share_progress);

    // Always fetch — RLS returns the client's full history when share_progress
    // is on, or just this trainer's own logged-in-person entries when it's
    // off (a trainer should always see what they themselves logged).
    const { data } = await supabase
      .from('client_measurements')
      .select('id, weight_kg, waist_cm, chest_cm, hips_cm, notes, logged_at, logged_by_pt_id')
      .eq('user_id', clientId)
      .order('logged_at', { ascending: false })
      .limit(50);
    setRows((data as any) ?? []);
    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const weights = rows.map(r => r.weight_kg).filter((w): w is number => w != null);
  const maxWeight = Math.max(1, ...weights);
  const latest = rows[0];
  const previous = rows[1];

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <ThemedText style={s.headerTitle}>Body Stats</ThemedText>
        <View style={{ width: 38 }} />
      </SafeAreaView>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : !shared && rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="lock-closed-outline" size={48} color="#d1d5db" />
          <ThemedText style={s.emptyText}>Not shared</ThemedText>
          <ThemedText style={s.emptyHint}>This client hasn't shared their progress with you yet</ThemedText>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="body-outline" size={48} color="#d1d5db" />
          <ThemedText style={s.emptyText}>No measurements yet</ThemedText>
          <ThemedText style={s.emptyHint}>Nothing logged by this client so far</ThemedText>
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

          {!shared && (
            <View style={s.partialShareNote}>
              <Ionicons name="lock-closed-outline" size={13} color="#9ca3af" />
              <ThemedText style={s.partialShareNoteText}>
                This client hasn't shared their full progress — showing only what you've logged yourself
              </ThemedText>
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
                  <Ionicons name="person-circle-outline" size={12} color="#1d3cb0" />
                  <ThemedText style={s.trainerBadgeText}>Logged by you</ThemedText>
                </View>
              )}
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#000', textAlign: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 20 },

  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#000', borderRadius: 20,
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
    fontSize: 12, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },

  entryCard: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0f0f0', borderRadius: 16,
    padding: 16, marginBottom: 12,
  },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  entryDate: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  entryWeight: { fontSize: 18, fontWeight: '900', color: '#000' },

  barTrack: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#1d3cb0', borderRadius: 3 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { backgroundColor: '#f9fafb', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },

  entryNote: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', lineHeight: 18 },
  trainerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  trainerBadgeText: { fontSize: 11, fontWeight: '600', color: '#1d3cb0' },
  partialShareNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 16,
  },
  partialShareNoteText: { fontSize: 12, color: '#6b7280', flex: 1, lineHeight: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#000', textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
});
