import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';

interface Partner {
  id: string;
  business_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  description: string | null;
  created_at: string;
}

interface Venue {
  id: string;
  name: string;
  location: string;
  type: string;
  is_active: boolean;
}

const initials = (name: string) =>
  name.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'P';

const memberSince = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasPTRole, setHasPTRole] = useState(false);
  const [hasCommunityRole, setHasCommunityRole] = useState(false);

  // Editable fields
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/(auth)/partner-login'); return; }

      const { data: p } = await supabase
        .from('partners').select('*').eq('user_id', user.id).single();
      if (!p) { router.replace('/(auth)/partner-login'); return; }

      setPartner(p);
      setBusinessName(p.business_name || '');
      setPhone(p.phone || '');
      setWebsite(p.website || '');
      setDescription(p.description || '');

      const { data: pgs } = await supabase
        .from('partner_gyms').select('gym_id, gyms(id, name, location, type, is_active)')
        .eq('partner_id', p.id);
      setVenues((pgs || []).map((pg: any) => pg.gyms).filter(Boolean));

      const { count } = await supabase
        .from('partner_notifications').select('*', { count: 'exact', head: true })
        .eq('partner_id', p.id).eq('read', false);
      setUnreadCount(count || 0);

      const { data: ptProfile } = await supabase
        .from('personal_trainers').select('id').eq('user_id', user.id).maybeSingle();
      setHasPTRole(!!ptProfile);

      const { data: communityMembership } = await supabase
        .from('community_members').select('id')
        .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active').maybeSingle();
      setHasCommunityRole(!!communityMembership);
    } catch (e) {
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!partner) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('partners').update({
        business_name: businessName.trim(),
        phone: phone.trim() || null,
        website: website.trim() || null,
        description: description.trim() || null,
      }).eq('id', partner.id);
      if (error) throw error;
      setPartner(prev => prev ? { ...prev, business_name: businessName.trim(), phone: phone.trim() || null, website: website.trim() || null, description: description.trim() || null } : prev);
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/partner-login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      hasPTRole
        ? 'This will permanently delete your venue partner profile and all associated data. Your personal trainer account will not be affected.'
        : 'This will permanently delete your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hasPTRole ? 'Delete venue profile' : 'Delete account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              hasPTRole
                ? 'Your venue profile, venues and payout history will be permanently deleted.'
                : 'Your account and all data will be permanently deleted.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { error } = await supabase.rpc('delete_partner_account', {
                        delete_auth_user: !hasPTRole,
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
      ]
    );
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  }

  const quickLinks = [
    { icon: 'notifications-outline', label: 'Notifications', badge: unreadCount > 0 ? unreadCount : null, onPress: () => router.push('/(tabs)/notifications' as any) },
    { icon: 'cash-outline', label: 'Payout information', badge: null, onPress: () => router.push('/partner/payout-information' as any) },
    { icon: 'business-outline', label: 'Manage venues', badge: null, onPress: () => router.push('/partner/venues' as any) },
    { icon: 'walk-outline', label: 'Connect Strava', badge: null, onPress: () => router.push('/strava-settings' as any) },
    { icon: 'lock-closed-outline', label: 'Change password', badge: null, onPress: () => router.push('/partner/change-password' as any) },
    { icon: 'mail-outline', label: 'Change email', badge: null, onPress: () => router.push('/partner/change-email' as any) },
    ...(hasPTRole ? [{ icon: 'swap-horizontal-outline', label: 'Switch to PT Dashboard', badge: null, onPress: () => router.replace('/(pt-tabs)' as any) }] : []),
    ...(hasCommunityRole
      ? [{ icon: 'swap-horizontal-outline', label: 'Switch to Community Dashboard', badge: null, onPress: () => router.replace('/(community-tabs)' as any) }]
      : [{ icon: 'people-outline', label: 'Start a Community', badge: null, onPress: () => router.push('/(community-onboarding)/create' as any) }]),
  ];

  return (
    <View style={styles.root}>
      {/* Hero */}
      <View style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.heroInner}>
            <View style={styles.avatarCircle}>
              <ThemedText style={styles.avatarText}>
                {initials(partner?.business_name || 'P')}
              </ThemedText>
            </View>
            <ThemedText style={styles.heroName}>{partner?.business_name || 'Partner'}</ThemedText>
            <ThemedText style={styles.heroEmail}>{partner?.email}</ThemedText>
            {partner?.created_at && (
              <ThemedText style={styles.heroSince}>Member since {memberSince(partner.created_at)}</ThemedText>
            )}
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Venues */}
        {venues.length > 0 && (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>Your venues</ThemedText>
            {venues.map((v, i) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.venueRow, i < venues.length - 1 && styles.venueDivider]}
                onPress={() => router.push(`/partner/venue-details/${v.id}` as any)}
              >
                <View style={[styles.venueIcon, { backgroundColor: PRIMARY + '12' }]}>
                  <Ionicons name="business-outline" size={18} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.venueName}>{v.name}</ThemedText>
                  <ThemedText style={styles.venueLocation}>{v.location} · {v.type}</ThemedText>
                </View>
                <View style={[styles.liveBadge, { backgroundColor: v.is_active ? '#dcfce7' : '#fef3c7' }]}>
                  <ThemedText style={[styles.liveBadgeText, { color: v.is_active ? '#16a34a' : '#d97706' }]}>
                    {v.is_active ? 'Live' : 'Pending'}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Business info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText style={styles.cardTitle}>Business information</ThemedText>
            {!editing ? (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <ThemedText style={styles.editLink}>Edit</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { setEditing(false); setBusinessName(partner?.business_name || ''); }}>
                <ThemedText style={[styles.editLink, { color: '#6b7280' }]}>Cancel</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <>
              {[
                { label: 'Business name', value: businessName, setter: setBusinessName, placeholder: 'Your business name' },
                { label: 'Phone number', value: phone, setter: setPhone, placeholder: '+254 7XX XXX XXX' },
                { label: 'Website', value: website, setter: setWebsite, placeholder: 'https://yourvenue.com' },
              ].map((f) => (
                <View key={f.label} style={styles.fieldGroup}>
                  <ThemedText style={styles.fieldLabel}>{f.label}</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              ))}
              <View style={styles.fieldGroup}>
                <ThemedText style={styles.fieldLabel}>Description</ThemedText>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Tell members about your venue…"
                  placeholderTextColor="#9ca3af"
                  multiline numberOfLines={3}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={save} disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <ThemedText style={styles.saveBtnText}>Save changes</ThemedText>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              {[
                { label: 'Business name', value: partner?.business_name },
                { label: 'Email', value: partner?.email },
                { label: 'Phone', value: partner?.phone || '—' },
                { label: 'Website', value: partner?.website || '—' },
              ].map((f) => (
                <View key={f.label} style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>{f.label}</ThemedText>
                  <ThemedText style={styles.infoValue}>{f.value}</ThemedText>
                </View>
              ))}
              {partner?.description ? (
                <View style={styles.infoRow}>
                  <ThemedText style={styles.infoLabel}>Description</ThemedText>
                  <ThemedText style={[styles.infoValue, { flex: 1 }]}>{partner.description}</ThemedText>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Quick links */}
        <View style={styles.card}>
          {quickLinks.map((link, i) => (
            <TouchableOpacity
              key={link.label}
              style={[styles.linkRow, i < quickLinks.length - 1 && styles.linkDivider]}
              onPress={link.onPress}
            >
              <View style={styles.linkIcon}>
                <Ionicons name={link.icon as any} size={20} color={PRIMARY} />
              </View>
              <ThemedText style={styles.linkLabel}>{link.label}</ThemedText>
              {link.badge ? (
                <View style={styles.notifBadge}>
                  <ThemedText style={styles.notifBadgeText}>{link.badge}</ThemedText>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <ThemedText style={styles.signOutText}>Sign out</ThemedText>
        </TouchableOpacity>

        {/* Delete account */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
          <ThemedText style={styles.deleteText}>
            {hasPTRole ? 'Delete venue profile' : 'Delete account'}
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.version}>ActiveCityPass Partner · v1.0</ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { backgroundColor: PRIMARY },
  heroInner: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8 },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  heroSince: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  editLink: { fontSize: 14, fontWeight: '700', color: PRIMARY },

  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  venueDivider: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  venueIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  venueName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  venueLocation: { fontSize: 12, color: '#6b7280', marginTop: 1, textTransform: 'capitalize' },
  liveBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveBadgeText: { fontSize: 11, fontWeight: '700' },

  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#fafafa' },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  infoLabel: { fontSize: 12, fontWeight: '600', color: '#9ca3af', width: 100 },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '500' },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  linkDivider: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  linkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY + '10', alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  notifBadge: { backgroundColor: '#ef4444', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginRight: 4 },
  notifBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#fecaca' },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },

  deleteBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
  deleteText: { fontSize: 13, fontWeight: '500', color: '#9ca3af' },

  version: { textAlign: 'center', fontSize: 12, color: '#d1d5db', marginBottom: 8 },
});
