import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Community {
  id: string; name: string; logo_url: string | null; category: string;
  member_count: number; review_status: string; is_active: boolean;
}

export default function CommunityHomeScreen() {
  const router = useRouter();
  const [community, setCommunity] = useState<Community | null>(null);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: membership } = await supabase
      .from('community_members')
      .select('communities(id, name, logo_url, category, member_count, review_status, is_active)')
      .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const c = membership?.communities as any;
    setCommunity(c ?? null);

    if (c?.id) {
      const today = new Date().toISOString().slice(0, 10);
      const [{ count: upcoming }, { count: pending }] = await Promise.all([
        supabase.from('community_events').select('id', { count: 'exact', head: true })
          .eq('community_id', c.id).eq('status', 'active').gte('date', today),
        supabase.from('community_members').select('id', { count: 'exact', head: true })
          .eq('community_id', c.id).eq('status', 'pending'),
      ]);
      setUpcomingCount(upcoming ?? 0);
      setPendingRequestCount(pending ?? 0);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>;
  }

  if (!community) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedText style={{ color: '#666' }}>No community found.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          {community.logo_url ? (
            <Image source={{ uri: community.logo_url }} style={styles.logo} />
          ) : (
            <View style={styles.logoFallback}><ThemedText style={styles.logoFallbackText}>{community.name[0]}</ThemedText></View>
          )}
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.communityName}>{community.name}</ThemedText>
            <ThemedText style={styles.communityMeta}>{community.member_count} members · {community.category}</ThemedText>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!community.is_active && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#92400e" />
            <ThemedText style={styles.warningText}>This community is currently deactivated by an admin.</ThemedText>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{community.member_count}</ThemedText>
            <ThemedText style={styles.statLabel}>Members</ThemedText>
          </View>
          <View style={styles.statCard}>
            <ThemedText style={styles.statValue}>{upcomingCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Upcoming Events</ThemedText>
          </View>
        </View>

        {pendingRequestCount > 0 && (
          <TouchableOpacity style={styles.pendingCard} onPress={() => router.push('/(community-tabs)/members' as any)}>
            <View style={styles.pendingIconWrap}>
              <Ionicons name="person-add-outline" size={18} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.pendingTitle}>{pendingRequestCount} join request{pendingRequestCount > 1 ? 's' : ''}</ThemedText>
              <ThemedText style={styles.pendingSub}>Waiting for your approval</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
          </TouchableOpacity>
        )}

        <ThemedText style={styles.sectionLabel}>Quick actions</ThemedText>
        <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(community-tabs)/create-event' as any)}>
          <View style={styles.actionIcon}><Ionicons name="add-circle-outline" size={20} color="#000" /></View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.actionTitle}>Create Event</ThemedText>
            <ThemedText style={styles.actionSub}>Schedule a run, class, or meetup</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(community-tabs)/checkin' as any)}>
          <View style={styles.actionIcon}><Ionicons name="qr-code-outline" size={20} color="#000" /></View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.actionTitle}>Check In Attendees</ThemedText>
            <ThemedText style={styles.actionSub}>Scan or enter a code at your event</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(community-tabs)/members' as any)}>
          <View style={styles.actionIcon}><Ionicons name="people-outline" size={20} color="#000" /></View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.actionTitle}>Manage Members</ThemedText>
            <ThemedText style={styles.actionSub}>View roster and approve requests</ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  logoFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0f5ff', alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 18, fontWeight: '800', color: '#1d3cb0' },
  communityName: { fontSize: 18, fontWeight: '800', color: '#000' },
  communityMeta: { fontSize: 12, color: '#888', marginTop: 2, textTransform: 'capitalize' },
  content: { padding: 20, paddingBottom: 40 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  warningText: { flex: 1, fontSize: 12, color: '#92400e' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 16, alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '900', color: '#000' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#888', marginTop: 4, textTransform: 'uppercase' },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 14, marginBottom: 20,
  },
  pendingIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  pendingTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  pendingSub: { fontSize: 12, color: '#92400e', marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 14, marginBottom: 10,
  },
  actionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  actionSub: { fontSize: 12, color: '#888', marginTop: 1 },
});
