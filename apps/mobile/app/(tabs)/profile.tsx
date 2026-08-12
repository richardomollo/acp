import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect, useCallback } from 'react';
import { authService } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';
import { useAuthModal } from '@/contexts/auth-modal-context';
import * as ImagePicker from 'expo-image-picker';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  avatar_url: string | null;
}

interface ClubMembership {
  community_id: string;
  role: string;
  communities: {
    id: string; slug: string | null; name: string; category: string;
    logo_url: string | null; member_count: number;
  } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  running: 'Running', walking: 'Walking', cycling: 'Cycling', strength: 'Strength',
  boxing: 'Boxing', yoga: 'Yoga', pilates: 'Pilates', hiking: 'Hiking', dance: 'Dance',
  outdoor_fitness: 'Outdoor Fitness', football: 'Football', other: 'Other',
};

// ─── Avatar upload ────────────────────────────────────────────────────────────

async function uploadAvatarImage(base64: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `avatars/temp/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

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
    console.error('Avatar upload error:', error);
    Alert.alert('Error', 'Failed to upload photo');
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getInitials = (name: string | null | undefined) => {
  if (!name) return 'U';
  return name.trim().split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
};

// ─── Component ────────────────────────────────────────────────────────────────

const PROFILE_TOUR: TourStep[] = [
  {
    icon: 'person-circle-outline',
    title: 'Your Profile',
    description: 'See your account details all in one place. Tap Edit to update your name or email.',
  },
  {
    icon: 'settings-outline',
    title: 'Account & Settings',
    description: 'View your booking history and control your account settings from here.',
  },
];

export default function ProfileScreen() {
  const { visible: tourVisible, dismiss: dismissTour } = useTour('profile');
  const router = useRouter();
  const { showAuthModal } = useAuthModal();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<ClubMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const pickAvatar = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to update your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, base64: true, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploadingAvatar(true);
    const url = await uploadAvatarImage(result.assets[0].base64, result.assets[0].uri);
    if (url) {
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', user.id);
      if (!error) setUser(prev => prev ? { ...prev, avatar_url: url } : prev);
    }
    setUploadingAvatar(false);
  };

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { loadAll(); });
    return () => subscription.unsubscribe();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const session = await authService.getSession();
      if (!session?.user) { setIsGuest(true); return; }
      setIsGuest(false);

      const { data } = await supabase.from('users').select('id, email, name, phone, created_at, avatar_url').eq('id', session.user.id).maybeSingle();

      const profile = data ?? {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.user_metadata?.full_name || 'User',
        phone: null,
        created_at: new Date().toISOString(),
        avatar_url: null,
      };

      setUser(profile);
      setEditName(profile.name || '');
      setEditPhone(profile.phone || '');

      const { data: clubRows } = await supabase
        .from('community_members')
        .select('community_id, role, communities(id, slug, name, category, logo_url, member_count)')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      setClubs((clubRows as any) ?? []);
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('users').update({ name: editName, phone: editPhone }).eq('id', user.id);
      if (error) throw error;
      setUser(prev => prev ? { ...prev, name: editName, phone: editPhone } : prev);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(user?.name || '');
    setEditPhone(user?.phone || '');
    setEditing(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await authService.logout();
          router.replace('/');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Info', 'Account deletion coming soon') },
      ]
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }

  // ── Guest ──────────────────────────────────────────────────────────────────

  if (isGuest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        </View>
        <View style={styles.guestContainer}>
          <View style={styles.guestIconWrap}>
            <Ionicons name="person-outline" size={48} color={palette.blue500} />
          </View>
          <ThemedText style={styles.guestTitle}>You're not signed in</ThemedText>
          <ThemedText style={styles.guestSubtitle}>
            Sign in to manage your account, view bookings, and track your fitness journey.
          </ThemedText>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => showAuthModal(() => loadAll(), { redirectTo: '/(tabs)/fitness' })}
          >
            <ThemedText style={styles.primaryBtnText}>Sign In</ThemedText>
            <Ionicons name="arrow-forward" size={18} color={palette.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => showAuthModal(() => loadAll(), { redirectTo: '/(tabs)/fitness' })}
          >
            <ThemedText style={styles.secondaryBtnText}>Create Account</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Authenticated ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.avatar} onPress={pickAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            {uploadingAvatar ? (
              <ActivityIndicator color={palette.white} />
            ) : user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <ThemedText style={styles.avatarText}>{getInitials(user?.name)}</ThemedText>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <ThemedText style={styles.heroName}>{user?.name ?? 'User'}</ThemedText>
          <ThemedText style={styles.heroEmail}>{user?.email}</ThemedText>
        </View>

        {/* ── Account details ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText style={styles.cardTitle}>Account Details</ThemedText>
            {editing ? (
              <View style={styles.editActions}>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.cancelBtn}>
                  <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color={palette.white} />
                    : <ThemedText style={styles.saveBtnText}>Save</ThemedText>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
                <Ionicons name="pencil-outline" size={15} color={palette.blue500} />
                <ThemedText style={styles.editBtnText}>Edit</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.fieldLabel}>Full Name</ThemedText>
            <TextInput
              style={[styles.fieldInput, !editing && styles.fieldInputDisabled]}
              value={editName}
              onChangeText={setEditName}
              editable={editing}
              placeholder="Enter your name"
              placeholderTextColor={palette.gray200}
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.fieldLabel}>Email</ThemedText>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputDisabled]}
              value={user?.email ?? ''}
              editable={false}
              placeholderTextColor={palette.gray200}
            />
            <ThemedText style={styles.fieldHelper}>Email cannot be changed</ThemedText>
          </View>

          <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
            <ThemedText style={styles.fieldLabel}>Phone Number</ThemedText>
            <TextInput
              style={[styles.fieldInput, !editing && styles.fieldInputDisabled]}
              value={editPhone}
              onChangeText={setEditPhone}
              editable={editing}
              placeholder="Enter your phone number"
              placeholderTextColor={palette.gray200}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* ── My Clubs ── */}
        <View style={styles.menuSection}>
          <View style={styles.clubsSectionHeader}>
            <ThemedText style={[styles.menuSectionTitle, { marginBottom: 0, marginLeft: 0 }]}>MY CLUBS</ThemedText>
            <TouchableOpacity onPress={() => router.push('/(tabs)/communities' as any)} hitSlop={8}>
              <ThemedText style={styles.clubsDiscoverLink}>Discover</ThemedText>
            </TouchableOpacity>
          </View>
          {clubs.length === 0 ? (
            <View style={styles.menuCard}>
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/communities' as any)}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="people-outline" size={20} color={palette.ink600} />
                  <ThemedText style={styles.menuText}>Join a community</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.menuCard}>
              {clubs.map((c, i) => c.communities && (
                <View key={c.community_id}>
                  {i > 0 && <View style={styles.menuDivider} />}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.communities!.slug ?? c.communities!.id } } as any)}
                  >
                    <View style={styles.menuItemLeft}>
                      {c.communities.logo_url ? (
                        <Image source={{ uri: c.communities.logo_url }} style={styles.clubAvatar} />
                      ) : (
                        <View style={styles.clubAvatarFallback}>
                          <ThemedText style={styles.clubAvatarFallbackText}>{c.communities.name[0]}</ThemedText>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.menuText} numberOfLines={1}>{c.communities.name}</ThemedText>
                        <ThemedText style={styles.clubMeta}>
                          {CATEGORY_LABEL[c.communities.category] ?? c.communities.category} · {c.communities.member_count} members
                        </ThemedText>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Preferences ── */}
        <View style={styles.menuSection}>
          <ThemedText style={styles.menuSectionTitle}>PREFERENCES</ThemedText>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="notifications-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Notifications</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/health-settings' as any)}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="heart-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Apple Health</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="language-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Language</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Support ── */}
        <View style={styles.menuSection}>
          <ThemedText style={styles.menuSectionTitle}>SUPPORT</ThemedText>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="help-circle-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Help & Support</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="document-text-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Terms & Conditions</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color={palette.ink600} />
                <ThemedText style={styles.menuText}>Privacy Policy</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.gray200} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sign out ── */}
        <View style={styles.signOutSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color={palette.danger600} />
            <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Danger zone ── */}
        <View style={styles.dangerSection}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={16} color={palette.danger600} />
            <ThemedText style={styles.dangerText}>Delete Account</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.versionWrap}>
          <ThemedText style={styles.versionText}>Version 1.0.0</ThemedText>
        </View>

      </ScrollView>

      <TourOverlay visible={tourVisible} steps={PROFILE_TOUR} onDismiss={dismissTour} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.surfaceApp },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: fontSize['3xl'], fontWeight: 'bold', color: palette.ink900 },

  // Guest
  guestContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12, paddingVertical: 80,
  },
  guestIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: palette.blue50, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  guestTitle: { fontSize: 22, fontWeight: 'bold', color: palette.ink900, textAlign: 'center' },
  guestSubtitle: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 22, marginBottom: 8 },

  primaryBtn: {
    backgroundColor: palette.ink900, flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 15, paddingHorizontal: 32, borderRadius: 30, marginTop: 4,
  },
  primaryBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12 },
  secondaryBtnText: { color: palette.blue500, fontSize: fontSize.base, fontWeight: '600' },

  // Hero
  hero: {
    backgroundColor: palette.white,
    paddingTop: 32, paddingBottom: 28, paddingHorizontal: 20,
    alignItems: 'center', gap: 6,
    marginBottom: 8,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: palette.blue500,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8, overflow: 'hidden',
  },
  avatarImage: { width: 80, height: 80 },
  avatarText: { color: palette.white, fontSize: fontSize['3xl'], fontWeight: 'bold', paddingTop: 3 },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12,
    backgroundColor: palette.ink900, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: palette.white,
  },
  heroName: { fontSize: 22, fontWeight: 'bold', color: palette.ink900 },
  heroEmail: { fontSize: fontSize.base, color: palette.gray450 },

  // Account card
  card: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: radii.lg, padding: 16, backgroundColor: palette.white,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 18,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: fontSize.base, fontWeight: '600', color: palette.blue500 },
  editActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.xl, borderWidth: 1, borderColor: palette.borderFaint },
  cancelBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  saveBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radii.xl, backgroundColor: palette.blue500 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.white },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 13,
    fontSize: fontSize.base, borderWidth: 1, borderColor: palette.hairline, color: palette.ink900,
  },
  fieldInputDisabled: { backgroundColor: palette.surfaceMuted, color: palette.gray450 },
  fieldHelper: { fontSize: fontSize.xs, color: palette.gray200, marginTop: 5 },

  // Menu sections
  menuSection: { marginHorizontal: 16, marginBottom: 8 },
  menuSectionTitle: {
    fontSize: fontSize.xs, fontWeight: '600', color: palette.gray300,
    letterSpacing: 0.5, marginBottom: 8, marginLeft: 4,
  },
  menuCard: { borderRadius: radii.lg, backgroundColor: palette.white, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  menuText: { fontSize: fontSize.base, color: palette.ink900 },
  menuDivider: { height: 1, backgroundColor: palette.hairline, marginHorizontal: 16 },

  clubsSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, marginLeft: 4, marginRight: 2,
  },
  clubsDiscoverLink: { fontSize: fontSize.sm, fontWeight: '600', color: palette.blue500 },
  clubAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surfaceMuted },
  clubAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  clubAvatarFallbackText: { fontSize: 14, fontWeight: '800', color: palette.blue500 },
  clubMeta: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2, textTransform: 'capitalize' },

  // Sign out
  signOutSection: { paddingHorizontal: 16, paddingTop: 16 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderRadius: radii.md, backgroundColor: palette.white,
    borderWidth: 1, borderColor: palette.danger50,
  },
  signOutText: { fontSize: fontSize.base, fontWeight: '600', color: palette.danger600 },

  // Danger
  dangerSection: { paddingHorizontal: 16, paddingTop: 8 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  dangerText: { fontSize: fontSize.base, color: palette.danger600, fontWeight: '500' },

  versionWrap: { alignItems: 'center', paddingVertical: 28 },
  versionText: { fontSize: fontSize.sm, color: palette.gray200 },
});
