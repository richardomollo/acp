import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Clipboard, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

type ClientRow = {
  id: string;
  client_user_id: string | null;
  status: 'pending' | 'active' | 'inactive';
  share_progress: boolean;
  invite_code: string | null;
  invited_name: string | null;
  users: { name: string | null; email: string | null } | null;
};

export default function PTClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in'); setLoading(false); return; }

    const { data: pt, error: ptErr } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) { setError(ptErr?.message ?? 'No trainer profile found for this account'); setLoading(false); return; }

    const { data, error: pcErr } = await supabase
      .from('pt_clients')
      .select('id, client_user_id, status, share_progress, invite_code, invited_name, users(name, email)')
      .eq('pt_id', pt.id)
      .order('created_at', { ascending: false });

    if (pcErr) { setError(pcErr.message); setLoading(false); return; }
    setClients((data as any) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const copyCode = (row: ClientRow) => {
    if (!row.invite_code) return;
    Clipboard.setString(row.invite_code);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelInvite = (row: ClientRow) => {
    const name = row.users?.name ?? row.invited_name ?? 'this invite';
    Alert.alert('Cancel invite?', `This will cancel the invite for ${name}.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel Invite', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('pt_clients').delete().eq('id', row.id);
          if (!error) setClients(prev => prev.filter(c => c.id !== row.id));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Clients</ThemedText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/pt-client/add-client')} style={styles.addBtn}>
            <Ionicons name="person-add-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={load} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Ionicons name="warning-outline" size={48} color="#dc2626" />
          <ThemedText style={[styles.emptyText, { color: '#dc2626' }]}>Couldn't load clients</ThemedText>
          <ThemedText style={styles.emptyHint}>{error}</ThemedText>
        </View>
      ) : clients.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color="#d1d5db" />
          <ThemedText style={styles.emptyText}>No clients yet</ThemedText>
          <ThemedText style={styles.emptyHint}>
            Add an existing client or invite a new one, or wait for a booking to add them automatically
          </ThemedText>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.cardList}>
            {clients.map(c => {
              const name = c.users?.name ?? c.users?.email ?? c.invited_name ?? 'Unknown client';
              const isPendingInvite = c.status === 'pending' && !!c.client_user_id;
              const isPendingCode = c.status === 'pending' && !c.client_user_id;
              const card = (
                <View style={styles.cardInner}>
                  <View style={styles.avatarCircle}>
                    <ThemedText style={styles.avatarText}>{name[0].toUpperCase()}</ThemedText>
                  </View>
                  <View style={styles.cardInfo}>
                    <ThemedText style={styles.clientName}>{name}</ThemedText>
                    {isPendingInvite ? (
                      <View style={styles.metaRow}>
                        <Ionicons name="time-outline" size={12} color="#d97706" />
                        <ThemedText style={[styles.metaText, { color: '#d97706' }]}>Invite sent, awaiting response</ThemedText>
                      </View>
                    ) : isPendingCode ? (
                      <View style={styles.metaRow}>
                        <Ionicons name="key-outline" size={12} color="#d97706" />
                        <ThemedText style={[styles.metaText, { color: '#d97706' }]}>
                          Code {c.invite_code} · not yet redeemed
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={styles.metaRow}>
                        <Ionicons
                          name={c.share_progress ? 'eye-outline' : 'eye-off-outline'}
                          size={12} color="#9ca3af"
                        />
                        <ThemedText style={styles.metaText}>
                          {c.share_progress ? 'Sharing progress' : 'Progress not shared'}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  {isPendingCode ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity onPress={() => copyCode(c)} style={styles.copyBtn} hitSlop={8}>
                        <Ionicons name={copiedId === c.id ? 'checkmark' : 'copy-outline'} size={16} color="#6b7280" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => cancelInvite(c)} style={styles.cancelBtn} hitSlop={8}>
                        <Ionicons name="close" size={16} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  ) : isPendingInvite ? (
                    <TouchableOpacity onPress={() => cancelInvite(c)} style={styles.cancelBtn} hitSlop={8}>
                      <Ionicons name="close" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  )}
                </View>
              );

              if (isPendingInvite || isPendingCode) {
                return <View key={c.id} style={styles.card}>{card}</View>;
              }
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/pt-client/[clientId]', params: { clientId: c.client_user_id! } })}
                >
                  {card}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: { padding: 6 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
  emptyHint: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },

  cardList: { gap: 12, padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#1d3cb0' },
  cardInfo: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '700', color: '#000' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 12, color: '#9ca3af' },
  copyBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f9fafb',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center',
  },
});
