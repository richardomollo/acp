import {
  View, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Keyboard, Image
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchPTSpecialisations } from '../../lib/lookups';
import * as ImagePicker from 'expo-image-picker';

type PTProfile = {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  cover_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  years_of_experience: number | null;
  certifications: string[];
  specialisations: string[];
  languages: string[];
  training_locations: string[];
  session_types: string[];
  service_areas: string[];
  slug: string | null;
  status: string;
};

const LANGUAGES = ['English', 'Swahili', 'French', 'Arabic', 'German', 'Hindi'];
const TRAINING_LOCATIONS = ['Studio / Gym', 'Home-visit', 'Outdoor', 'Online'];
const SESSION_TYPES = ['1-on-1', 'group', 'online', 'outdoor', 'home-visit', 'drop-in'];
const SESSION_LABELS: Record<string, string> = {
  '1-on-1': '1-on-1', group: 'Group', online: 'Online',
  outdoor: 'Outdoor', 'home-visit': 'Home-visit', 'drop-in': 'Drop-in',
};

export default function PTProfileScreen() {
  const router = useRouter();
  const [pt, setPt] = useState<PTProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<PTProfile>>({});
  const [certInput, setCertInput] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [specialisations, setSpecialisations] = useState<string[]>([]);
  const [hasVenueRole, setHasVenueRole] = useState(false);
  const [hasCommunityRole, setHasCommunityRole] = useState(false);

  useEffect(() => { fetchPTSpecialisations().then(setSpecialisations); }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [ptRes, gymRes, communityRes] = await Promise.all([
      supabase.from('personal_trainers').select('*').eq('user_id', user.id).single(),
      supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle(),
      supabase.from('community_members').select('id')
        .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active').maybeSingle(),
    ]);
    if (ptRes.data) { setPt(ptRes.data as any); setForm(ptRes.data as any); }
    setHasVenueRole(!!gymRes.data);
    setHasCommunityRole(!!communityRes.data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleChip = (field: keyof PTProfile, value: string) => {
    setForm(f => {
      const list = (f[field] as string[]) ?? [];
      return { ...f, [field]: list.includes(value) ? list.filter(x => x !== value) : [...list, value] };
    });
  };

  const addTag = (field: keyof PTProfile, value: string, clearFn: () => void) => {
    const v = value.trim();
    if (!v) return;
    setForm(f => {
      const list = (f[field] as string[]) ?? [];
      if (list.includes(v)) return f;
      return { ...f, [field]: [...list, v] };
    });
    clearFn();
    Keyboard.dismiss();
  };

  const removeTag = (field: keyof PTProfile, value: string) => {
    setForm(f => ({ ...f, [field]: ((f[field] as string[]) ?? []).filter(x => x !== value) }));
  };

  const handleSave = async () => {
    if (!pt) return;
    setSaving(true);
    const { error } = await supabase.from('personal_trainers').update({
      full_name: form.full_name,
      professional_name: form.professional_name || null,
      bio: form.bio || null,
      instagram_handle: form.instagram_handle ? form.instagram_handle.replace('@', '') : null,
      phone: form.phone || null,
      years_of_experience: form.years_of_experience ?? null,
      certifications: form.certifications ?? [],
      specialisations: form.specialisations ?? [],
      languages: form.languages ?? [],
      training_locations: form.training_locations ?? [],
      session_types: form.session_types ?? [],
      service_areas: form.service_areas ?? [],
    }).eq('id', pt.id);
    if (!error) {
      setPt(f => ({ ...f!, ...form }));
      setEditing(false);
    } else {
      Alert.alert('Error', error.message);
    }
    setSaving(false);
  };

  const pickAndUpload = async (type: 'photo' | 'cover') => {
    if (!pt) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'cover' ? [16, 9] : [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Upload failed', 'Could not read image data. Please try again.');
      return;
    }

    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const fileName = `${pt.id}_${type}_${Date.now()}.${ext}`;

    type === 'photo' ? setUploadingPhoto(true) : setUploadingCover(true);
    try {
      // base64 → Uint8Array (most reliable in React Native / Hermes)
      const binaryStr = atob(asset.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from('pt-photos')
        .upload(fileName, bytes, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('pt-photos').getPublicUrl(fileName);
      // Append cache-buster so Image component reloads after replacing an existing photo
      const freshUrl = `${publicUrl}?t=${Date.now()}`;
      const field = type === 'photo' ? 'photo_url' : 'cover_url';
      const { error: updateError } = await supabase
        .from('personal_trainers').update({ [field]: publicUrl }).eq('id', pt.id);
      if (updateError) throw updateError;

      setPt(p => p ? { ...p, [field]: freshUrl } : p);
      setForm(f => ({ ...f, [field]: freshUrl }));
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Please try again');
    } finally {
      type === 'photo' ? setUploadingPhoto(false) : setUploadingCover(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); router.replace('/(auth)/partner-login'); }
      }
    ]);
  };

  const handleDeleteAccount = () => {
    const title = hasVenueRole ? 'Remove PT Profile' : 'Delete Account';
    const message = hasVenueRole
      ? 'This will permanently delete your personal trainer profile, offerings, and bookings. Your venue account will not be affected.'
      : 'This will permanently delete your personal trainer profile and your account. This cannot be undone.';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: hasVenueRole ? 'Remove PT Profile' : 'Delete Account',
        style: 'destructive',
        onPress: () => {
          // Second confirmation
          Alert.alert(
            'Are you absolutely sure?',
            hasVenueRole
              ? 'Your PT profile, offerings and bookings will be permanently deleted.'
              : 'Your account and all data will be permanently deleted.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes, delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    const { error } = await supabase.rpc('delete_pt_account', {
                      delete_auth_user: !hasVenueRole,
                    });
                    if (error) throw error;
                    await supabase.auth.signOut();
                    router.replace('/(auth)/partner-login');
                  } catch (err: any) {
                    Alert.alert('Error', err?.message ?? 'Failed to delete account. Please try again.');
                  }
                },
              },
            ]
          );
        },
      },
    ]);
  };

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>;
  if (!pt) return null;

  const displayData = editing ? form : pt;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>My Profile</ThemedText>
        <View style={styles.headerActions}>
          {editing ? (
            <>
              <TouchableOpacity onPress={() => { setForm(pt); setEditing(false); }} style={styles.cancelBtn}>
                <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={16} color="#000" />
              <ThemedText style={styles.editBtnText}>Edit</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Cover photo */}
      <TouchableOpacity style={styles.coverWrap} onPress={() => pickAndUpload('cover')} activeOpacity={0.9}>
        {pt.cover_url ? (
          <Image source={{ uri: pt.cover_url }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={styles.coverPlaceholder} />
        )}
        <View style={styles.coverEditBtn}>
          {uploadingCover
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="camera" size={18} color="#fff" />}
        </View>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <View style={styles.identityCard}>
          {/* Profile photo */}
          <TouchableOpacity style={styles.avatarWrap} onPress={() => pickAndUpload('photo')} activeOpacity={0.85}>
            {pt.photo_url ? (
              <Image source={{ uri: pt.photo_url }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <View style={styles.avatar}>
                <ThemedText style={styles.avatarText}>{pt.full_name[0]}</ThemedText>
              </View>
            )}
            <View style={styles.avatarEditDot}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color="#fff" style={{ width: 14, height: 14 }} />
                : <Ionicons name="camera" size={12} color="#fff" />}
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            {editing ? (
              <>
                <TextInput style={styles.inlineInput} value={form.full_name ?? ''} onChangeText={t => setForm(f => ({ ...f, full_name: t }))} placeholder="Full name" placeholderTextColor="#999" />
                <TextInput style={[styles.inlineInput, { marginTop: 6 }]} value={form.professional_name ?? ''} onChangeText={t => setForm(f => ({ ...f, professional_name: t }))} placeholder='Coach name, e.g. "Coach James"' placeholderTextColor="#999" />
              </>
            ) : (
              <>
                <ThemedText style={styles.identityName}>{pt.professional_name || pt.full_name}</ThemedText>
                {pt.professional_name && <ThemedText style={styles.identitySubname}>{pt.full_name}</ThemedText>}
              </>
            )}
            <View style={styles.slugRow}>
              <Ionicons name="link-outline" size={12} color="#9ca3af" />
              <ThemedText style={styles.slugText}>
                activecitypass.com/book/{pt.slug ?? '—'}
              </ThemedText>
            </View>
          </View>
        </View>

        <Section title="Bio">
          {editing ? (
            <TextInput style={[styles.input, styles.textarea]} value={form.bio ?? ''} onChangeText={t => setForm(f => ({ ...f, bio: t }))} placeholder="Tell clients about yourself…" placeholderTextColor="#999" multiline numberOfLines={4} textAlignVertical="top" />
          ) : (
            <ThemedText style={styles.bioText}>{pt.bio || 'No bio yet. Tap Edit to add one.'}</ThemedText>
          )}
        </Section>

        <Section title="Contact">
          <InfoRow icon="mail-outline" label="Email" value={pt.email} editing={editing}
            editNode={<TextInput style={styles.input} value={form.email ?? ''} onChangeText={t => setForm(f => ({ ...f, email: t }))} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#999" placeholder="email@example.com" />}
          />
          <InfoRow icon="call-outline" label="Phone" value={pt.phone} editing={editing}
            editNode={<TextInput style={styles.input} value={form.phone ?? ''} onChangeText={t => setForm(f => ({ ...f, phone: t }))} keyboardType="phone-pad" placeholderTextColor="#999" placeholder="+254 700 000 000" />}
          />
          <InfoRow icon="logo-instagram" label="Instagram" value={pt.instagram_handle ? `@${pt.instagram_handle}` : null} editing={editing}
            editNode={<TextInput style={styles.input} value={form.instagram_handle ?? ''} onChangeText={t => setForm(f => ({ ...f, instagram_handle: t }))} autoCapitalize="none" placeholderTextColor="#999" placeholder="yourhandle" />}
          />
          <InfoRow icon="briefcase-outline" label="Experience" value={pt.years_of_experience ? `${pt.years_of_experience} years` : null} editing={editing}
            editNode={<TextInput style={styles.input} value={form.years_of_experience != null ? String(form.years_of_experience) : ''} onChangeText={t => setForm(f => ({ ...f, years_of_experience: t ? parseInt(t) : null }))} keyboardType="number-pad" placeholderTextColor="#999" placeholder="5" />}
          />
        </Section>

        <Section title="Specialisations">
          <ChipGroup items={specialisations} selected={(displayData.specialisations as string[]) ?? []}
            onToggle={editing ? v => toggleChip('specialisations', v) : undefined} />
        </Section>

        <Section title="Certifications">
          {editing && (
            <View style={styles.addRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={certInput} onChangeText={setCertInput}
                placeholder="Add certification…" placeholderTextColor="#999"
                onSubmitEditing={() => addTag('certifications', certInput, () => setCertInput(''))}
                returnKeyType="done" />
              <TouchableOpacity style={styles.addBtn} onPress={() => addTag('certifications', certInput, () => setCertInput(''))}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <TagGroup items={(displayData.certifications as string[]) ?? []}
            onRemove={editing ? v => removeTag('certifications', v) : undefined} />
        </Section>

        <Section title="Languages">
          <ChipGroup items={LANGUAGES} selected={(displayData.languages as string[]) ?? []}
            onToggle={editing ? v => toggleChip('languages', v) : undefined} />
        </Section>

        <Section title="Training Locations">
          <ChipGroup items={TRAINING_LOCATIONS} selected={(displayData.training_locations as string[]) ?? []}
            onToggle={editing ? v => toggleChip('training_locations', v) : undefined} />
        </Section>

        <Section title="Session Types">
          <ChipGroup items={SESSION_TYPES} selected={(displayData.session_types as string[]) ?? []}
            labels={SESSION_LABELS}
            onToggle={editing ? v => toggleChip('session_types', v) : undefined} />
        </Section>

        <Section title="Service Areas">
          {editing && (
            <View style={styles.addRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={areaInput} onChangeText={setAreaInput}
                placeholder="e.g. Westlands, Karen…" placeholderTextColor="#999"
                onSubmitEditing={() => addTag('service_areas', areaInput, () => setAreaInput(''))}
                returnKeyType="done" />
              <TouchableOpacity style={styles.addBtn} onPress={() => addTag('service_areas', areaInput, () => setAreaInput(''))}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <TagGroup items={(displayData.service_areas as string[]) ?? []}
            onRemove={editing ? v => removeTag('service_areas', v) : undefined} />
        </Section>

        {/* Role switcher + Account actions + Logout */}
        {!editing && (
          <>
            {hasVenueRole && (
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => router.replace('/(tabs)' as any)}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
                <ThemedText style={styles.switchText}>Switch to Venue Dashboard</ThemedText>
              </TouchableOpacity>
            )}
            {hasCommunityRole ? (
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => router.replace('/(community-tabs)' as any)}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
                <ThemedText style={styles.switchText}>Switch to Community Dashboard</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => router.push('/(community-onboarding)/create' as any)}
              >
                <Ionicons name="people-outline" size={18} color="#000000" />
                <ThemedText style={styles.switchText}>Start a Community</ThemedText>
              </TouchableOpacity>
            )}
            <View style={styles.accountLinksCard}>
              <TouchableOpacity
                style={styles.accountLinkRow}
                onPress={() => router.push('/partner/change-password' as any)}
              >
                <View style={styles.accountLinkIcon}>
                  <Ionicons name="lock-closed-outline" size={18} color="#000000" />
                </View>
                <ThemedText style={styles.accountLinkLabel}>Change password</ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
              <View style={styles.accountLinkDivider} />
              <TouchableOpacity
                style={styles.accountLinkRow}
                onPress={() => router.push('/partner/change-email' as any)}
              >
                <View style={styles.accountLinkIcon}>
                  <Ionicons name="mail-outline" size={18} color="#000000" />
                </View>
                <ThemedText style={styles.accountLinkLabel}>Change email</ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#dc2626" />
              <ThemedText style={styles.logoutText}>Log Out</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
              <Ionicons name="trash-outline" size={16} color="#9ca3af" />
              <ThemedText style={styles.deleteText}>
                {hasVenueRole ? 'Remove PT Profile' : 'Delete Account'}
              </ThemedText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function InfoRow({ icon, label, value, editing, editNode }: {
  icon: any; label: string; value: string | null | undefined; editing: boolean; editNode: React.ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color="#9ca3af" style={{ width: 20 }} />
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        {editing ? editNode : (
          <ThemedText style={styles.infoValue}>{value ?? '—'}</ThemedText>
        )}
      </View>
    </View>
  );
}

function ChipGroup({ items, selected, onToggle, labels }: {
  items: string[]; selected: string[]; onToggle?: (v: string) => void; labels?: Record<string, string>;
}) {
  return (
    <View style={styles.chipWrap}>
      {items.map(item => {
        const isSelected = selected.includes(item);
        if (!onToggle && !isSelected) return null;
        return (
          <TouchableOpacity key={item} style={[styles.chip, isSelected && styles.chipActive]}
            onPress={() => onToggle?.(item)} disabled={!onToggle}>
            <ThemedText style={[styles.chipText, isSelected && styles.chipTextActive]}>
              {labels?.[item] ?? item}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
      {!onToggle && selected.length === 0 && <ThemedText style={styles.emptyHint}>None listed</ThemedText>}
    </View>
  );
}

function TagGroup({ items, onRemove }: { items: string[]; onRemove?: (v: string) => void }) {
  if (items.length === 0) return <ThemedText style={styles.emptyHint}>None listed</ThemedText>;
  return (
    <View style={styles.tagWrap}>
      {items.map(item => (
        <View key={item} style={styles.tag}>
          <ThemedText style={styles.tagText}>{item}</ThemedText>
          {onRemove && (
            <TouchableOpacity onPress={() => onRemove(item)} hitSlop={8}>
              <Ionicons name="close" size={13} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  coverWrap: { height: 160, backgroundColor: '#0d0d0d', position: 'relative' },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, backgroundColor: '#1a1a2e' },
  coverEditBtn: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  avatarWrap: { position: 'relative', width: 60, height: 60 },
  avatarImg: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#fff' },
  avatarEditDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0',
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: '#000' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0' },
  cancelBtnText: { fontSize: 14, color: '#555' },
  saveBtn: { backgroundColor: '#000', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, minWidth: 60, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  identityCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row',
    alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1, borderColor: '#f0f0f0',
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#f0f5ff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#1d3cb0' },
  identityName: { fontSize: 18, fontWeight: '800', color: '#000' },
  identitySubname: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  slugRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  slugText: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' },
  inlineInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#000',
  },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  bioText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  input: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: '#000', borderWidth: 1, borderColor: '#e0e0e0',
  },
  textarea: { height: 90, paddingTop: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  infoLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#000', fontWeight: '500' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0' },
  chipActive: { borderColor: '#000', backgroundColor: '#000' },
  chipText: { fontSize: 12, color: '#444', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f5ff', borderWidth: 1, borderColor: '#c7d7ff',
  },
  tagText: { fontSize: 12, color: '#1d3cb0', fontWeight: '500' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addBtn: { width: 46, borderRadius: 10, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyHint: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  accountLinksCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginTop: 8,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  accountLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  accountLinkDivider: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 64 },
  accountLinkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#000000' + '10', alignItems: 'center', justifyContent: 'center' },
  accountLinkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1,
    borderColor: '#c7d7ff', backgroundColor: '#eff6ff', marginTop: 8,
  },
  switchText: { fontSize: 15, fontWeight: '600', color: '#000000' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16, borderWidth: 1,
    borderColor: '#fecaca', backgroundColor: '#fef2f2', marginTop: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginTop: 4,
  },
  deleteText: { fontSize: 13, fontWeight: '500', color: '#9ca3af' },
});
