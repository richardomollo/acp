import {
  View, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Clipboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Match = { id: string; name: string | null; email: string | null; phone: string | null };

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AddClientScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'search' | 'invite'>('search');

  // Search tab state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<Match | null | undefined>(undefined); // undefined = not searched yet
  const [sendingInvite, setSendingInvite] = useState(false);

  // Invite tab state
  const [invitedName, setInvitedName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const getPtId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    return pt?.id ?? null;
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMatch(undefined);
    const { data, error } = await supabase.rpc('search_client_by_contact', { p_query: q });
    if (error) {
      Alert.alert('Error', error.message);
      setSearching(false);
      return;
    }
    setMatch((data && data[0]) ?? null);
    setSearching(false);
  };

  const handleSendInvite = async () => {
    if (!match) return;
    setSendingInvite(true);
    const ptId = await getPtId();
    if (!ptId) { setSendingInvite(false); return; }

    const { error } = await supabase.from('pt_clients').insert({
      pt_id: ptId,
      client_user_id: match.id,
      status: 'pending',
    });

    setSendingInvite(false);
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already added', 'This person is already in your client list.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }
    Alert.alert('Invite sent', `${match.name ?? 'They'} will see your request in their app.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    const ptId = await getPtId();
    if (!ptId) { setGenerating(false); return; }

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomCode();
      const { error } = await supabase.from('pt_clients').insert({
        pt_id: ptId,
        status: 'pending',
        invite_code: code,
        invited_name: invitedName.trim() || null,
      });
      if (!error) {
        setGeneratedCode(code);
        setGenerating(false);
        return;
      }
      lastError = error;
      if (error.code !== '23505') break;
    }
    setGenerating(false);
    Alert.alert('Error', lastError?.message ?? 'Could not generate an invite code.');
  };

  const copyCode = () => {
    if (!generatedCode) return;
    Clipboard.setString(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Add Client</ThemedText>
          <View style={{ width: 38 }} />
        </SafeAreaView>

        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'search' && s.tabBtnActive]}
            onPress={() => setTab('search')}
          >
            <ThemedText style={[s.tabText, tab === 'search' && s.tabTextActive]}>Search Existing</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'invite' && s.tabBtnActive]}
            onPress={() => setTab('invite')}
          >
            <ThemedText style={[s.tabText, tab === 'invite' && s.tabTextActive]}>Invite New</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {tab === 'search' ? (
            <>
              <ThemedText style={s.label}>Client's phone or email</ThemedText>
              <View style={s.searchRow}>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 07XX XXX XXX or name@email.com"
                  placeholderTextColor="#9ca3af"
                  value={query}
                  onChangeText={text => { setQuery(text); setMatch(undefined); }}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={s.searchBtn} onPress={handleSearch} disabled={searching}>
                  {searching
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="search" size={18} color="#fff" />
                  }
                </TouchableOpacity>
              </View>

              {match === null && (
                <View style={s.noticeCard}>
                  <Ionicons name="alert-circle-outline" size={18} color="#9ca3af" />
                  <ThemedText style={s.noticeText}>
                    No account found with that phone or email. Try "Invite New" instead.
                  </ThemedText>
                </View>
              )}

              {match && (
                <View style={s.matchCard}>
                  <View style={s.avatarCircle}>
                    <ThemedText style={s.avatarText}>{(match.name ?? match.email ?? '?')[0]?.toUpperCase()}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.matchName}>{match.name ?? 'Unnamed user'}</ThemedText>
                    <ThemedText style={s.matchContact}>{match.email ?? match.phone}</ThemedText>
                  </View>
                </View>
              )}

              {match && (
                <TouchableOpacity style={s.primaryBtn} onPress={handleSendInvite} disabled={sendingInvite}>
                  {sendingInvite
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <ThemedText style={s.primaryBtnText}>Send Invite</ThemedText>
                  }
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <ThemedText style={s.label}>Client's name (optional)</ThemedText>
              <TextInput
                style={s.input}
                placeholder="e.g. Jane Doe"
                placeholderTextColor="#9ca3af"
                value={invitedName}
                onChangeText={setInvitedName}
                editable={!generatedCode}
              />

              {!generatedCode ? (
                <TouchableOpacity style={s.primaryBtn} onPress={handleGenerateCode} disabled={generating}>
                  {generating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <ThemedText style={s.primaryBtnText}>Generate Invite Code</ThemedText>
                  }
                </TouchableOpacity>
              ) : (
                <>
                  <ThemedText style={s.label}>Share this code with your client</ThemedText>
                  <TouchableOpacity style={s.codeRow} onPress={copyCode} activeOpacity={0.8}>
                    <ThemedText style={s.codeText}>{generatedCode}</ThemedText>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#6b7280" />
                  </TouchableOpacity>
                  <ThemedText style={s.hint}>
                    They enter this code in the "My Trainers" section of their app to connect with you.
                  </ThemedText>
                  <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
                    <ThemedText style={s.doneBtnText}>Done</ThemedText>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#000' },

  tabRow: {
    flexDirection: 'row', gap: 8, padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  tabBtnActive: { backgroundColor: '#000' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  tabTextActive: { color: '#fff' },

  content: { padding: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },

  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#000', marginBottom: 16,
  },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  searchBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },

  noticeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 14, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 13, color: '#9ca3af', lineHeight: 18 },

  matchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 14, marginBottom: 16,
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#1d3cb0' },
  matchName: { fontSize: 15, fontWeight: '700', color: '#000' },
  matchContact: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  primaryBtn: {
    backgroundColor: '#000', borderRadius: 30, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
    paddingVertical: 18, marginBottom: 12,
  },
  codeText: { fontSize: 24, fontWeight: '800', color: '#000', letterSpacing: 4 },
  hint: { fontSize: 13, color: '#9ca3af', lineHeight: 18, marginBottom: 20 },

  doneBtn: { paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
});
