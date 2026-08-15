import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { palette, fontSize, radii } from '@/constants/theme';

type Instalment = {
  id: string;
  sequence: number;
  amount_kes: number;
  due_date: string | null;
  status: 'pending' | 'paid' | 'failed' | 'waived';
};

type Enrollment = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string;
  trainer_intro_confirmed: boolean;
  programme_start_date: string | null;
  total_price_kes: number | null;
  customerName: string;
  customerEmail: string | null;
  instalments: Instalment[];
};

const STATUS_LABEL: Record<string, string> = {
  intro_booked: 'Intro booked',
  intro_complete: 'Intro complete — awaiting enrollment',
  programme_active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  intro_booked: '#92400e',
  intro_complete: '#1d4ed8',
  programme_active: '#15803d',
  completed: '#374151',
  cancelled: '#b91c1c',
};

export default function ProgrammeEnrollmentsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [title, setTitle] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: programme } = await supabase.from('gym_programmes').select('title').eq('id', id).single();
    setTitle(programme?.title ?? 'Programme');

    const { data: rows } = await supabase
      .from('gym_programme_enrollments')
      .select('id, user_id, guest_name, guest_email, guest_phone, status, trainer_intro_confirmed, programme_start_date, total_price_kes')
      .eq('programme_id', id)
      .order('created_at', { ascending: false });

    const userIds = [...new Set((rows ?? []).map(r => r.user_id).filter(Boolean))] as string[];
    const usersById: Record<string, { name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
      for (const u of users ?? []) usersById[u.id] = { name: u.name, email: u.email };
    }

    const enrollmentIds = (rows ?? []).map(r => r.id);
    const instalmentsByEnrollment: Record<string, Instalment[]> = {};
    if (enrollmentIds.length > 0) {
      const { data: instalments } = await supabase
        .from('gym_programme_instalments')
        .select('id, sequence, amount_kes, due_date, status, enrollment_id')
        .in('enrollment_id', enrollmentIds)
        .order('sequence', { ascending: true });
      for (const inst of instalments ?? []) {
        (instalmentsByEnrollment[inst.enrollment_id] ??= []).push(inst);
      }
    }

    setEnrollments((rows ?? []).map(r => ({
      ...r,
      customerName: r.guest_name ?? (r.user_id ? usersById[r.user_id]?.name : null) ?? 'Unknown',
      customerEmail: r.guest_email ?? (r.user_id ? usersById[r.user_id]?.email : null),
      instalments: instalmentsByEnrollment[r.id] ?? [],
    })));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const confirmIntro = async (enrollmentId: string) => {
    setConfirming(enrollmentId);
    try {
      const res = await fetch('https://activecitypass.com/api/gym-programme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: enrollmentId, trainer_intro_confirmed: true, status: 'intro_complete' }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to confirm');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not confirm intro session');
    } finally {
      setConfirming(null);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={palette.ink900} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle}>Enrollments</ThemedText>
          <ThemedText style={styles.headerSub}>{title}</ThemedText>
        </View>
      </View>

      {enrollments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={palette.gray200} style={{ marginBottom: 12 }} />
          <ThemedText style={styles.emptyTitle}>No enrollments yet</ThemedText>
          <ThemedText style={styles.emptySub}>Enrollments appear once a customer books this programme's intro session.</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {enrollments.map(e => (
            <View key={e.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.customerName}>{e.customerName}</ThemedText>
                  {e.customerEmail && <ThemedText style={styles.customerEmail}>{e.customerEmail}</ThemedText>}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR[e.status]}1a` }]}>
                  <ThemedText style={[styles.statusBadgeText, { color: STATUS_COLOR[e.status] }]}>
                    {STATUS_LABEL[e.status] ?? e.status}
                  </ThemedText>
                </View>
              </View>

              {e.status === 'intro_booked' && !e.trainer_intro_confirmed && (
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => confirmIntro(e.id)}
                  disabled={confirming === e.id}
                >
                  {confirming === e.id
                    ? <ActivityIndicator size="small" color={palette.white} />
                    : <ThemedText style={styles.confirmBtnText}>Mark intro session complete</ThemedText>}
                </TouchableOpacity>
              )}

              {e.instalments.length > 0 && (
                <View style={styles.instalments}>
                  <ThemedText style={styles.instalmentsLabel}>Payment schedule</ThemedText>
                  {e.instalments.map(inst => (
                    <View key={inst.id} style={styles.instalmentRow}>
                      <ThemedText style={styles.instalmentSeq}>
                        {inst.sequence === 0 ? 'Deposit' : `Instalment ${inst.sequence}`}
                      </ThemedText>
                      <ThemedText style={styles.instalmentAmount}>KES {Number(inst.amount_kes).toLocaleString()}</ThemedText>
                      {inst.due_date && <ThemedText style={styles.instalmentDue}>{inst.due_date}</ThemedText>}
                      <View style={[styles.instStatusBadge, inst.status === 'paid' ? styles.instStatusPaid : inst.status === 'failed' ? styles.instStatusFailed : styles.instStatusPending]}>
                        <ThemedText style={styles.instStatusText}>{inst.status}</ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.surfaceApp },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, backgroundColor: palette.surfaceApp },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2 },

  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700, marginBottom: 8 },
  emptySub: { fontSize: fontSize.sm, color: palette.gray300, textAlign: 'center', lineHeight: 20 },

  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: palette.white, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    padding: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  customerName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  customerEmail: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  statusBadgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  confirmBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.md, paddingVertical: 10,
    alignItems: 'center', marginTop: 12,
  },
  confirmBtnText: { color: palette.white, fontSize: fontSize.sm, fontWeight: '700' },

  instalments: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.hairline },
  instalmentsLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300, marginBottom: 8, letterSpacing: 0.5 },
  instalmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  instalmentSeq: { fontSize: fontSize.sm, color: palette.ink600, fontWeight: '600', width: 80 },
  instalmentAmount: { fontSize: fontSize.sm, color: palette.ink900, fontWeight: '700', flex: 1 },
  instalmentDue: { fontSize: fontSize.xs, color: palette.gray300 },
  instStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  instStatusPaid: { backgroundColor: '#dcfce7' },
  instStatusFailed: { backgroundColor: '#fee2e2' },
  instStatusPending: { backgroundColor: '#f3f4f6' },
  instStatusText: { fontSize: 10, fontWeight: '700', color: palette.ink600, textTransform: 'capitalize' },
});
