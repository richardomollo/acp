import { useRouter } from 'expo-router';
import {
  StyleSheet, TouchableOpacity, View, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

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

export default function CreateCommunityScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('Nairobi');
  const [category, setCategory] = useState<string | null>(null);
  const [communityType, setCommunityType] = useState<'open' | 'approval_required'>('open');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, base64: true, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploadingLogo(true);
    const url = await uploadCommunityImage(result.assets[0].base64, result.assets[0].uri);
    if (url) setLogoUrl(url);
    setUploadingLogo(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Missing name', 'Give your community a name.'); return; }
    if (!category) { Alert.alert('Missing category', 'Pick the activity this community is organised around.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data, error } = await supabase
      .from('communities')
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        category,
        location: location.trim() || null,
        community_type: communityType,
        logo_url: logoUrl,
        owner_user_id: user.id,
      })
      .select('id')
      .single();

    setSaving(false);
    if (error) {
      Alert.alert('Could not create community', error.message);
      return;
    }

    // Confirmation to the applicant + alert to admins so it doesn't sit
    // unnoticed in the approval queue. Non-fatal — never blocks navigation.
    supabase.from('users').select('name, phone').eq('id', user.id).maybeSingle()
      .then(({ data: profile }) => {
        const categoryLabel = CATEGORIES.find(c => c.key === category)?.label ?? category;
        Promise.allSettled([
          supabase.functions.invoke('send-email', {
            body: {
              type: 'community_application_received',
              data: { email: user.email, name: profile?.name || user.email, communityName: name.trim() },
            },
          }),
          supabase.functions.invoke('send-email', {
            body: {
              type: 'community_application_alert',
              data: {
                email: 'info@activecitypass.com',
                communityName: name.trim(),
                category: categoryLabel,
                location: location.trim() || null,
                ownerName: profile?.name || null,
                ownerEmail: user.email,
                ownerPhone: profile?.phone || null,
              },
            },
          }),
        ]).catch(e => console.error('Community application emails failed:', e));
      });

    router.replace('/(community-onboarding)/pending' as any);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Start a Community</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.intro}>
          Organise runs, rides, classes or meetups around a shared activity. Your community will be reviewed by our team before it goes live — usually within 24–48 hours.
        </ThemedText>

        <TouchableOpacity style={styles.logoPicker} onPress={pickLogo} disabled={uploadingLogo}>
          {uploadingLogo ? (
            <ActivityIndicator color="#000" />
          ) : logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} />
          ) : (
            <>
              <Ionicons name="image-outline" size={26} color="#666" />
              <ThemedText style={styles.logoPickerText}>Add logo</ThemedText>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Community name</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="e.g. Nairobi Running Club"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Activity</ThemedText>
          <View style={styles.chipRow}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, category === c.key && styles.chipActive]}
                onPress={() => setCategory(c.key)}
              >
                <ThemedText style={[styles.chipText, category === c.key && styles.chipTextActive]}>{c.label}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Location</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="e.g. Nairobi"
            placeholderTextColor="#999"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Description</ThemedText>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What's this community about? Who's it for?"
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Membership</ThemedText>
          <TouchableOpacity style={styles.radioRow} onPress={() => setCommunityType('open')}>
            <Ionicons name={communityType === 'open' ? 'radio-button-on' : 'radio-button-off'} size={20} color="#000" />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.radioTitle}>Open</ThemedText>
              <ThemedText style={styles.radioSub}>Anyone can join instantly</ThemedText>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioRow} onPress={() => setCommunityType('approval_required')}>
            <Ionicons name={communityType === 'approval_required' ? 'radio-button-on' : 'radio-button-off'} size={20} color="#000" />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.radioTitle}>Approval required</ThemedText>
              <ThemedText style={styles.radioSub}>You approve each join request</ThemedText>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.6 }]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitBtnText}>Submit for Review</ThemedText>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#ffffff',
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  placeholder: { width: 40 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  intro: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 },
  logoPicker: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 24, overflow: 'hidden',
  },
  logoImage: { width: 88, height: 88 },
  logoPickerText: { fontSize: 11, color: '#666', marginTop: 4 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, fontSize: 15, color: '#000',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#444' },
  chipTextActive: { color: '#fff' },
  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 10,
  },
  radioTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  radioSub: { fontSize: 12, color: '#888', marginTop: 1 },
  submitBtn: {
    backgroundColor: '#000', paddingVertical: 18, borderRadius: 25,
    alignItems: 'center', marginTop: 12,
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
