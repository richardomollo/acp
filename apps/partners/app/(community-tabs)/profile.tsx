import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

interface Community {
  id: string; name: string; description: string | null; location: string | null; category: string;
  logo_url: string | null; cover_url: string | null;
  community_type: 'open' | 'approval_required'; review_status: string;
}

const CATEGORIES = [
  { key: 'running',        label: 'Running' },
  { key: 'walking',        label: 'Walking' },
  { key: 'cycling',        label: 'Cycling' },
  { key: 'strength',       label: 'Strength' },
  { key: 'boxing',         label: 'Boxing' },
  { key: 'yoga',           label: 'Yoga' },
  { key: 'pilates',        label: 'Pilates' },
  { key: 'hiking',         label: 'Hiking' },
  { key: 'dance',          label: 'Dance' },
  { key: 'outdoor_fitness', label: 'Outdoor Fitness' },
  { key: 'football',       label: 'Football' },
  { key: 'other',          label: 'Other' },
] as const;

async function uploadCommunityImage(base64: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `communities/temp/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { data, error } = await supabase.storage
      .from('fitpass-images')
      .upload(filename, bytes, { contentType: mimeType, upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('fitpass-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    Alert.alert('Error', 'Failed to upload image');
    return null;
  }
}

export default function CommunityProfileScreen() {
  const router = useRouter();
  const [community, setCommunity] = useState<Community | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('other');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
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

    const [{ data: membership }, { data: partner }, { data: gym }, { data: pt }] = await Promise.all([
      supabase.from('community_members').select('communities(id, name, description, location, category, logo_url, cover_url, community_type, review_status)')
        .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('partners').select('id').eq('user_id', user.id).maybeSingle(),
      // Fallback: gyms linked by contact_email (web-signup partners with no
      // matching `partners` row — see checkin.tsx for the same pattern).
      supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle(),
      supabase.from('personal_trainers').select('status').eq('user_id', user.id).maybeSingle(),
    ]);

    const c = membership?.communities as any;
    if (c) {
      setCommunity(c);
      setName(c.name);
      setDescription(c.description ?? '');
      setLocation(c.location ?? '');
      setCategory(c.category);
      setLogoUrl(c.logo_url ?? null);
      setCoverUrl(c.cover_url ?? null);
      setApprovalRequired(c.community_type === 'approval_required');
    }
    setHasVenueRole(!!partner || !!gym);
    setHasPTRole(!!pt && pt.status === 'approved');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickImage = async (target: 'logo' | 'cover') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to update your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, base64: true, allowsEditing: true,
      aspect: target === 'logo' ? [1, 1] : [16, 9],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const setUploading = target === 'logo' ? setUploadingLogo : setUploadingCover;
    setUploading(true);
    const url = await uploadCommunityImage(result.assets[0].base64, result.assets[0].uri);
    if (url) {
      if (target === 'logo') setLogoUrl(url); else setCoverUrl(url);
      if (community) {
        await supabase.from('communities').update(
          target === 'logo' ? { logo_url: url } : { cover_url: url }
        ).eq('id', community.id);
      }
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!community) return;
    setSaving(true);
    const { error } = await supabase.from('communities').update({
      name: name.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      category,
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
          <ThemedText style={styles.inputLabel}>Cover photo</ThemedText>
          <TouchableOpacity
            style={styles.coverPicker}
            onPress={() => editing && pickImage('cover')}
            disabled={!editing || uploadingCover}
            activeOpacity={editing ? 0.8 : 1}
          >
            {uploadingCover ? (
              <ActivityIndicator color="#000" />
            ) : coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImage} />
            ) : (
              <>
                <Ionicons name="image-outline" size={24} color="#666" />
                <ThemedText style={styles.imagePickerText}>{editing ? 'Add cover photo' : 'No cover photo'}</ThemedText>
              </>
            )}
            {editing && coverUrl && (
              <View style={styles.imageEditBadge}><Ionicons name="camera" size={14} color="#fff" /></View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Logo</ThemedText>
          <TouchableOpacity
            style={styles.logoPicker}
            onPress={() => editing && pickImage('logo')}
            disabled={!editing || uploadingLogo}
            activeOpacity={editing ? 0.8 : 1}
          >
            {uploadingLogo ? (
              <ActivityIndicator color="#000" />
            ) : logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoImage} />
            ) : (
              <Ionicons name="image-outline" size={22} color="#666" />
            )}
            {editing && (
              <View style={styles.imageEditBadgeSmall}><Ionicons name="camera" size={11} color="#fff" /></View>
            )}
          </TouchableOpacity>
        </View>

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
          <ThemedText style={styles.inputLabel}>Activity</ThemedText>
          {editing ? (
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c.key} style={[styles.chip, category === c.key && styles.chipActive]} onPress={() => setCategory(c.key)}>
                  <ThemedText style={[styles.chipText, category === c.key && styles.chipTextActive]}>{c.label}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.readValue}>{CATEGORIES.find(c => c.key === community.category)?.label ?? community.category}</ThemedText>
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
  coverPicker: {
    height: 130, borderRadius: 14, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%' },
  logoPicker: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImage: { width: 72, height: 72 },
  imagePickerText: { fontSize: 12, color: '#666', marginTop: 6 },
  imageEditBadge: {
    position: 'absolute', bottom: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  imageEditBadgeSmall: {
    position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#444' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#c7d7ff', backgroundColor: '#eff6ff', marginBottom: 12,
  },
  switchText: { fontSize: 15, fontWeight: '600', color: '#000000' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});
