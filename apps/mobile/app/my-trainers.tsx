import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch, TextInput, Alert,
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

interface TrainerRelationship {
  id: string;
  status: 'pending' | 'active' | 'inactive';
  share_progress: boolean;
  personal_trainers: { professional_name: string | null; full_name: string } | null;
}

function trainerName(row: TrainerRelationship): string {
  return row.personal_trainers?.professional_name || row.personal_trainers?.full_name || 'Trainer';
}

export default function MyTrainersScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<TrainerRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user.id) { setLoading(false); return; }

    const { data } = await supabase
      .from('pt_clients')
      .select('id, status, share_progress, personal_trainers(professional_name, full_name)')
      .eq('client_user_id', session.user.id)
      .order('created_at', { ascending: false });

    setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleShare = async (row: TrainerRelationship) => {
    const next = !row.share_progress;
    setSavingId(row.id);
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, share_progress: next } : r));
    const { error } = await supabase.from('pt_clients').update({ share_progress: next }).eq('id', row.id);
    if (error) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, share_progress: !next } : r));
    }
    setSavingId(null);
  };

  const acceptInvite = async (row: TrainerRelationship) => {
    setSavingId(row.id);
    const { error } = await supabase.from('pt_clients').update({ status: 'active' }).eq('id', row.id);
    if (!error) setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'active' } : r));
    setSavingId(null);
  };

  const declineInvite = (row: TrainerRelationship) => {
    Alert.alert('Decline invite?', `You won't be connected with ${trainerName(row)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setSavingId(row.id);
          const { error } = await supabase.from('pt_clients').delete().eq('id', row.id);
          if (!error) setRows(prev => prev.filter(r => r.id !== row.id));
          setSavingId(null);
        },
      },
    ]);
  };

  const handleRedeem = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setRedeeming(true);
    const { data, error } = await supabase.rpc('redeem_pt_invite_code', { p_code: trimmed });
    setRedeeming(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
      return;
    }
    const name = data?.[0]?.out_trainer_name ?? 'trainer';
    setCode('');
    setRedeemOpen(false);
    Alert.alert('Connected!', `You're now connected with ${name}.`);
    load();
  };

  const pending = rows.filter(r => r.status === 'pending');
  const active = rows.filter(r => r.status !== 'pending');

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>My Trainers</ThemedText>
          <ThemedText style={s.headerSub}>Control who can see your progress</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {pending.length > 0 && (
            <>
              <ThemedText style={s.sectionLabel}>Pending Invites</ThemedText>
              {pending.map(row => (
                <View key={row.id} style={s.card}>
                  <View style={s.avatarCircle}>
                    <ThemedText style={s.avatarText}>{trainerName(row)[0]?.toUpperCase()}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.trainerName}>{trainerName(row)}</ThemedText>
                    <ThemedText style={s.shareLabel}>Wants to add you as a client</ThemedText>
                  </View>
                  {savingId === row.id ? (
                    <ActivityIndicator size="small" color={palette.blue500} />
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={s.declineBtn} onPress={() => declineInvite(row)} hitSlop={8}>
                        <Ionicons name="close" size={16} color={palette.danger600} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.acceptBtn} onPress={() => acceptInvite(row)} hitSlop={8}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {active.length === 0 && pending.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="people-outline" size={32} color={palette.gray300} />
              </View>
              <ThemedText style={s.emptyText}>No trainers yet</ThemedText>
              <ThemedText style={s.emptySub}>
                Trainers appear here once you book, enroll, or connect with them.
              </ThemedText>
            </View>
          ) : active.length > 0 && (
            <>
              {pending.length > 0 && <ThemedText style={s.sectionLabel}>Your Trainers</ThemedText>}
              {active.map(row => (
                <View key={row.id} style={s.card}>
                  <View style={s.avatarCircle}>
                    <ThemedText style={s.avatarText}>{trainerName(row)[0]?.toUpperCase()}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.trainerName}>{trainerName(row)}</ThemedText>
                    <ThemedText style={s.shareLabel}>Share my workout progress</ThemedText>
                  </View>
                  {savingId === row.id ? (
                    <ActivityIndicator size="small" color={palette.blue500} />
                  ) : (
                    <Switch
                      value={row.share_progress}
                      onValueChange={() => toggleShare(row)}
                      trackColor={{ false: palette.hairline, true: palette.blue500 }}
                      thumbColor="#fff"
                    />
                  )}
                </View>
              ))}
            </>
          )}

          <TouchableOpacity style={s.redeemToggle} onPress={() => setRedeemOpen(o => !o)} activeOpacity={0.7}>
            <ThemedText style={s.redeemToggleText}>Have an invite code?</ThemedText>
            <Ionicons name={redeemOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.blue500} />
          </TouchableOpacity>

          {redeemOpen && (
            <View style={s.redeemRow}>
              <TextInput
                style={s.redeemInput}
                placeholder="Enter code"
                placeholderTextColor={palette.gray300}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                maxLength={8}
              />
              <TouchableOpacity style={s.redeemBtn} onPress={handleRedeem} disabled={redeeming}>
                {redeeming
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={s.redeemBtnText}>Connect</ThemedText>
                }
              </TouchableOpacity>
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

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.white, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.hairline,
    padding: 14, marginBottom: 12,
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: palette.blue500 },
  trainerName: { fontSize: 15, fontWeight: '700', color: palette.ink900 },
  shareLabel: { fontSize: 12, color: palette.gray300, marginTop: 2 },

  acceptBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.blue500,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },

  redeemToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginTop: 8,
  },
  redeemToggleText: { fontSize: 14, fontWeight: '700', color: palette.blue500 },
  redeemRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  redeemInput: {
    flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '700',
    letterSpacing: 2, color: palette.ink900,
  },
  redeemBtn: {
    backgroundColor: palette.blue500, borderRadius: radii.md,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  redeemBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
