import { useRouter } from 'expo-router';
import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePickerModal from '@/components/DatePickerModal';

const METRICS = [
  { key: 'distance_km', label: 'Distance (km)' },
  { key: 'activity_count', label: 'Activity count' },
  { key: 'days_active', label: 'Days active' },
] as const;

const ACTIVITY_TYPES = ['run', 'walk', 'cycle'] as const;

interface ChallengeRow {
  id: string; title: string; description: string | null;
  metric: typeof METRICS[number]['key']; target_value: number;
  activity_types: string[]; period_start: string; period_end: string;
}
interface LeaderboardRow {
  user_id: string; name: string | null; metric_value: number; rank: number;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

export default function CommunityChallengesScreen() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [metric, setMetric] = useState<typeof METRICS[number]['key']>('distance_km');
  const [targetValue, setTargetValue] = useState('');
  const [activityTypes, setActivityTypes] = useState<string[]>(['run']);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardRow[]>>({});
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: membership } = await supabase
      .from('community_members').select('community_id')
      .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const cid = membership?.community_id ?? null;
    setCommunityId(cid);
    if (!cid) { setLoading(false); return; }

    const { data: rows } = await supabase
      .from('challenges')
      .select('id, title, description, metric, target_value, activity_types, period_start, period_end')
      .eq('community_id', cid)
      .order('period_start', { ascending: false });
    setChallenges((rows as ChallengeRow[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActivityType = (a: string) => {
    setActivityTypes(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const handleCreate = async () => {
    if (!communityId) return;
    if (!title.trim()) { Alert.alert('Missing title', 'Give the challenge a title.'); return; }
    if (!targetValue || Number(targetValue) <= 0) { Alert.alert('Missing target', 'Set a target value.'); return; }
    if (activityTypes.length === 0) { Alert.alert('Pick activity types', 'Select at least one activity type.'); return; }
    if (!periodStart || !periodEnd) { Alert.alert('Missing dates', 'Set a start and end date.'); return; }

    setSaving(true);
    const { error } = await supabase.from('challenges').insert({
      community_id: communityId,
      title: title.trim(),
      description: description.trim() || null,
      metric,
      target_value: Number(targetValue),
      activity_types: activityTypes,
      period_start: periodStart,
      period_end: periodEnd,
    });
    setSaving(false);
    if (error) { Alert.alert('Could not create challenge', error.message); return; }

    setTitle(''); setDescription(''); setTargetValue(''); setActivityTypes(['run']);
    setPeriodStart(''); setPeriodEnd(''); setShowForm(false);
    load();
  };

  const toggleExpand = async (challengeId: string) => {
    if (expandedId === challengeId) { setExpandedId(null); return; }
    setExpandedId(challengeId);
    if (!leaderboards[challengeId]) {
      setLeaderboardLoading(true);
      const { data } = await supabase.rpc('get_challenge_leaderboard', { p_challenge_id: challengeId });
      setLeaderboards(prev => ({ ...prev, [challengeId]: (data as LeaderboardRow[]) ?? [] }));
      setLeaderboardLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Challenges</ThemedText>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowForm(v => !v)}>
            <Ionicons name={showForm ? 'close' : 'add'} size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {showForm && (
            <View style={styles.formCard}>
              <ThemedText style={styles.inputLabel}>Title</ThemedText>
              <TextInput style={styles.input} placeholder="e.g. August Distance Challenge" placeholderTextColor="#999" value={title} onChangeText={setTitle} />

              <ThemedText style={styles.inputLabel}>Description (optional)</ThemedText>
              <TextInput style={[styles.input, styles.textArea]} placeholder="What are members competing for?" placeholderTextColor="#999" value={description} onChangeText={setDescription} multiline numberOfLines={3} />

              <ThemedText style={styles.inputLabel}>Metric</ThemedText>
              <View style={styles.chipRow}>
                {METRICS.map(m => (
                  <TouchableOpacity key={m.key} style={[styles.chip, metric === m.key && styles.chipActive]} onPress={() => setMetric(m.key)}>
                    <ThemedText style={[styles.chipText, metric === m.key && styles.chipTextActive]}>{m.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <ThemedText style={styles.inputLabel}>Target value</ThemedText>
              <TextInput style={styles.input} placeholder="50" placeholderTextColor="#999" value={targetValue} onChangeText={setTargetValue} keyboardType="decimal-pad" />

              <ThemedText style={styles.inputLabel}>Activity types</ThemedText>
              <View style={styles.chipRow}>
                {ACTIVITY_TYPES.map(a => (
                  <TouchableOpacity key={a} style={[styles.chip, activityTypes.includes(a) && styles.chipActive]} onPress={() => toggleActivityType(a)}>
                    <ThemedText style={[styles.chipText, activityTypes.includes(a) && styles.chipTextActive]}>{a}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Start date</ThemedText>
                  <TouchableOpacity style={styles.input} onPress={() => setShowStartPicker(true)}>
                    <ThemedText style={{ color: periodStart ? '#000' : '#999' }}>{periodStart || 'Select date'}</ThemedText>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>End date</ThemedText>
                  <TouchableOpacity style={styles.input} onPress={() => setShowEndPicker(true)}>
                    <ThemedText style={{ color: periodEnd ? '#000' : '#999' }}>{periodEnd || 'Select date'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitBtnText}>Create Challenge</ThemedText>}
              </TouchableOpacity>
            </View>
          )}

          {challenges.length === 0 && !showForm && (
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={32} color="#d1d5db" />
              <ThemedText style={styles.emptyText}>No challenges yet</ThemedText>
              <ThemedText style={styles.emptySub}>Create a challenge to get members competing.</ThemedText>
            </View>
          )}

          {challenges.map(c => {
            const unit = c.metric === 'distance_km' ? 'km' : c.metric === 'days_active' ? 'days' : 'activities';
            const expanded = expandedId === c.id;
            return (
              <View key={c.id} style={styles.challengeCard}>
                <TouchableOpacity onPress={() => toggleExpand(c.id)} style={styles.challengeCardHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.challengeTitle}>{c.title}</ThemedText>
                    <ThemedText style={styles.challengeMeta}>
                      Target {c.target_value} {unit} · {fmtDate(c.period_start)} – {fmtDate(c.period_end)}
                    </ThemedText>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
                </TouchableOpacity>
                {expanded && (
                  <View style={styles.leaderboardBox}>
                    {leaderboardLoading && !leaderboards[c.id] ? (
                      <ActivityIndicator color="#000" style={{ marginVertical: 12 }} />
                    ) : (leaderboards[c.id]?.length ?? 0) === 0 ? (
                      <ThemedText style={styles.emptySub}>No activity logged yet.</ThemedText>
                    ) : (
                      leaderboards[c.id].map(row => (
                        <View key={row.user_id} style={styles.lbRow}>
                          <ThemedText style={styles.lbRank}>#{row.rank}</ThemedText>
                          <ThemedText style={styles.lbName} numberOfLines={1}>{row.name ?? 'Member'}</ThemedText>
                          <ThemedText style={styles.lbValue}>
                            {c.metric === 'distance_km' ? Number(row.metric_value).toFixed(1) : row.metric_value} {unit}
                          </ThemedText>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <DatePickerModal
        visible={showStartPicker}
        value={periodStart ? new Date(`${periodStart}T00:00:00`) : new Date()}
        onConfirm={(d: Date) => { setPeriodStart(d.toISOString().slice(0, 10)); setShowStartPicker(false); }}
        onCancel={() => setShowStartPicker(false)}
      />
      <DatePickerModal
        visible={showEndPicker}
        value={periodEnd ? new Date(`${periodEnd}T00:00:00`) : new Date()}
        minimumDate={periodStart ? new Date(`${periodStart}T00:00:00`) : new Date()}
        onConfirm={(d: Date) => { setPeriodEnd(d.toISOString().slice(0, 10)); setShowEndPicker(false); }}
        onCancel={() => setShowEndPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#000', flex: 1 },
  createBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  formCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0', padding: 16, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#000', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, fontSize: 15, color: '#000',
    borderWidth: 1, borderColor: '#e0e0e0', justifyContent: 'center',
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#444', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: '#000', paddingVertical: 16, borderRadius: 25, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#000' },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center' },
  challengeCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0', marginBottom: 10, overflow: 'hidden' },
  challengeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  challengeTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  challengeMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  leaderboardBox: { borderTopWidth: 1, borderTopColor: '#f0f0f0', padding: 14 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lbRank: { fontSize: 12, fontWeight: '800', color: '#9ca3af', width: 26 },
  lbName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#000' },
  lbValue: { fontSize: 12, fontWeight: '700', color: '#444' },
});
