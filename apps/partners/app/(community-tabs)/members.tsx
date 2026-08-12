import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Clipboard, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

const INVITE_BASE_URL = 'https://activecitypass.com/community/join';

interface MemberRow {
  id: string; user_id: string; role: string; status: string; joined_at: string | null; created_at: string;
}
interface UserInfo { name: string | null; email: string | null; avatar_url: string | null }

type Tab = 'pending' | 'active';

export default function CommunityMembersScreen() {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [tab, setTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

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

    const { data: communityRow } = await supabase
      .from('communities').select('slug, invite_token').eq('id', cid).single();
    setInviteToken(communityRow?.invite_token ?? null);
    setCommunitySlug(communityRow?.slug ?? null);

    const { data: memberRows } = await supabase
      .from('community_members')
      .select('id, user_id, role, status, joined_at, created_at')
      .eq('community_id', cid)
      .order('created_at', { ascending: false });

    setMembers((memberRows as MemberRow[]) ?? []);

    const userIds = [...new Set((memberRows ?? []).map(m => m.user_id))];
    if (userIds.length > 0) {
      const { data: userRows } = await supabase.from('users').select('id, name, email, avatar_url').in('id', userIds);
      const map: Record<string, UserInfo> = {};
      for (const u of userRows ?? []) map[u.id] = { name: u.name, email: u.email, avatar_url: u.avatar_url };
      setUsers(map);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const inviteUrl = inviteToken && communityId ? `${INVITE_BASE_URL}/${communitySlug ?? communityId}/${inviteToken}` : null;

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    Clipboard.setString(inviteUrl);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  };

  const regenerateInviteLink = () => {
    Alert.alert(
      'Generate a new link?',
      'The current invite link will stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new link', style: 'destructive',
          onPress: async () => {
            if (!communityId) return;
            setRegenerating(true);
            const { data: newToken, error } = await supabase.rpc('regenerate_community_invite_token', { p_community_id: communityId });
            setRegenerating(false);
            if (error) { Alert.alert('Error', error.message); return; }
            setInviteToken(newToken);
          },
        },
      ],
    );
  };

  const approve = async (m: MemberRow) => {
    setActioningId(m.id);
    const { error } = await supabase.from('community_members').update({ status: 'active', joined_at: new Date().toISOString() }).eq('id', m.id);
    if (!error) setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: 'active' } : x));
    setActioningId(null);
  };

  const decline = (m: MemberRow) => {
    Alert.alert('Decline this request?', users[m.user_id]?.name ?? users[m.user_id]?.email ?? 'this member', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setActioningId(m.id);
          const { error } = await supabase.from('community_members').delete().eq('id', m.id);
          if (!error) setMembers(prev => prev.filter(x => x.id !== m.id));
          setActioningId(null);
        },
      },
    ]);
  };

  const remove = (m: MemberRow) => {
    Alert.alert('Remove this member?', users[m.user_id]?.name ?? users[m.user_id]?.email ?? 'this member', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setActioningId(m.id);
          const { error } = await supabase.from('community_members').delete().eq('id', m.id);
          if (!error) setMembers(prev => prev.filter(x => x.id !== m.id));
          setActioningId(null);
        },
      },
    ]);
  };

  const pending = members.filter(m => m.status === 'pending');
  const active = members.filter(m => m.status === 'active');
  const list = tab === 'pending' ? pending : active;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText style={styles.headerTitle}>Members</ThemedText>
        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]} onPress={() => setTab('pending')}>
            <ThemedText style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>Requests{pending.length > 0 ? ` (${pending.length})` : ''}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'active' && styles.tabBtnActive]} onPress={() => setTab('active')}>
            <ThemedText style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>Members ({active.length})</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {inviteUrl && (
            <View style={styles.inviteCard}>
              <View style={styles.inviteCardHeader}>
                <Ionicons name="link-outline" size={16} color="#1d3cb0" />
                <ThemedText style={styles.inviteCardTitle}>Invite people</ThemedText>
              </View>
              <ThemedText style={styles.inviteLink} numberOfLines={1}>{inviteUrl}</ThemedText>
              <View style={styles.inviteBtnRow}>
                <TouchableOpacity style={styles.inviteCopyBtn} onPress={copyInviteLink}>
                  <Ionicons name="copy-outline" size={14} color="#fff" />
                  <ThemedText style={styles.inviteCopyBtnText}>Copy link</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.inviteRegenBtn} onPress={regenerateInviteLink} disabled={regenerating}>
                  {regenerating ? <ActivityIndicator size="small" color="#666" /> : (
                    <ThemedText style={styles.inviteRegenBtnText}>New link</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name={tab === 'pending' ? 'person-add-outline' : 'people-outline'} size={32} color="#d1d5db" />
              <ThemedText style={styles.emptyText}>{tab === 'pending' ? 'No pending requests' : 'No members yet'}</ThemedText>
            </View>
          ) : (
            list.map(m => {
              const u = users[m.user_id];
              const name = u?.name ?? u?.email ?? 'Member';
              return (
                <View key={m.id} style={styles.memberRow}>
                  {u?.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatar}><ThemedText style={styles.avatarText}>{name[0]?.toUpperCase()}</ThemedText></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.memberName}>{name}</ThemedText>
                    <ThemedText style={styles.memberSub}>
                      {u?.email ?? ''}{m.role !== 'member' ? ` · ${m.role}` : ''}
                    </ThemedText>
                  </View>
                  {actioningId === m.id ? (
                    <ActivityIndicator color="#000" />
                  ) : tab === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => approve(m)}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.declineBtn} onPress={() => decline(m)}>
                        <Ionicons name="close" size={16} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  ) : m.role !== 'owner' ? (
                    <TouchableOpacity onPress={() => remove(m)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color="#d1d5db" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000', paddingTop: 8, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0' },
  tabBtnActive: { backgroundColor: '#000', borderColor: '#000' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#444' },
  tabTextActive: { color: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  inviteCard: {
    backgroundColor: '#f0f5ff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe4ff',
    padding: 14, marginBottom: 16,
  },
  inviteCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  inviteCardTitle: { fontSize: 13, fontWeight: '700', color: '#1d3cb0' },
  inviteLink: { fontSize: 12, color: '#444', marginBottom: 10 },
  inviteBtnRow: { flexDirection: 'row', gap: 8 },
  inviteCopyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#000', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  inviteCopyBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  inviteRegenBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#d0d0d0', alignItems: 'center', justifyContent: 'center',
  },
  inviteRegenBtnText: { fontSize: 12.5, fontWeight: '600', color: '#666' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#888' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 14, marginBottom: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f5ff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#1d3cb0' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#000' },
  memberSub: { fontSize: 12, color: '#888', marginTop: 1, textTransform: 'capitalize' },
  approveBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  declineBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
});
