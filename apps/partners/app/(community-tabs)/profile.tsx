import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Community {
  id: string; name: string; description: string | null; location: string | null;
  community_type: 'open' | 'approval_required'; review_status: string;
}

export default function CommunityProfileScreen() {
  const router = useRouter();
  const [community, setCommunity] = useState<Community | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasVenueRole, setHasVenueRole] = useState(false);
  const [hasPTRole, setHasPTRole] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [{ data: membership }, { data: gym }, { data: pt }] = await Promise.all([
      supabase.from('community_members').select('communities(id, name, description, location, community_type, review_status)')
        .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle(),
      supabase.from('personal_trainers').select('status').eq('user_id', user.id).maybeSingle(),
    ]);

    const c = membership?.communities as any;
    if (c) {
      setCommunity(c);
      setName(c.name);
      setDescription(c.description ?? '');
      setLocation(c.location ?? '');
      setApprovalRequired(c.community_type === 'approval_required');
    }
    setHasVenueRole(!!gym);
    setHasPTRole(!!pt && pt.status === 'approved');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSave = async () => {
    if (!community) return;
    setSaving(true);
    const { error } = await supabase.from('communities').update({
      name: name.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      community_type: approvalRequired ? 'approval_required' : 'open',
    }).eq('id', community.id);
    setSaving(false);
    if (error) { Alert.alert('Could not save', error.message); return; }
    setEditing(false);
    load();
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/(auth)/partner-login'); } },
    ]);
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>;
  }

  if (!community) {
    return <View style={styles.loadingContainer}><ThemedText style={{ color: '#666' }}>No community found.</ThemedText></View>;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText style={styles.headerTitle}>Community Settings</ThemedText>
        <TouchableOpacity onPress={() => editing ? handleSave() : setEditing(true)} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <ThemedText style={styles.editLink}>{editing ? 'Save' : 'Edit'}</ThemedText>}
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Name</ThemedText>
          {editing ? (
            <TextInput style={styles.input} value={name} onChangeText={setName} />
          ) : (
            <ThemedText style={styles.readValue}>{community.name}</ThemedText>
          )}
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Location</ThemedText>
          {editing ? (
            <TextInput style={styles.input} value={location} onChangeText={setLocation} />
          ) : (
            <ThemedText style={styles.readValue}>{community.location || '—'}</ThemedText>
          )}
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Description</ThemedText>
          {editing ? (
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline numberOfLines={4} />
          ) : (
            <ThemedText style={styles.readValue}>{community.description || '—'}</ThemedText>
          )}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.inputLabel}>Approval required to join</ThemedText>
            <ThemedText style={styles.helperText}>Off = anyone can join instantly</ThemedText>
          </View>
          <Switch value={approvalRequired} onValueChange={setApprovalRequired} disabled={!editing} />
        </View>

        {hasVenueRole && (
          <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/(tabs)' as any)}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
            <ThemedText style={styles.switchText}>Switch to Venue Dashboard</ThemedText>
          </TouchableOpacity>
        )}
        {hasPTRole && (
          <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/(pt-tabs)' as any)}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
            <ThemedText style={styles.switchText}>Switch to Trainer Dashboard</ThemedText>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <ThemedText style={styles.logoutText}>Log Out</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#000', paddingTop: 8 },
  editLink: { fontSize: 15, fontWeight: '700', color: '#002fff', paddingTop: 8 },
  content: { padding: 20, paddingBottom: 40 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6 },
  readValue: { fontSize: 15, color: '#000' },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: '#000', borderWidth: 1, borderColor: '#e0e0e0' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#888', marginTop: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#c7d7ff', backgroundColor: '#eff6ff', marginBottom: 12,
  },
  switchText: { fontSize: 15, fontWeight: '600', color: '#000000' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});
