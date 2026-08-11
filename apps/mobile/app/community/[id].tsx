import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

interface Community {
  id: string; name: string; description: string | null; category: string; location: string | null;
  logo_url: string | null; cover_url: string | null; community_type: 'open' | 'approval_required';
  member_count: number; owner_user_id: string;
}
interface EventRow {
  id: string; title: string; date: string; start_time: string; location: string;
  event_type: string; capacity: number | null; distance_km: number | null; image_url: string | null;
}
interface PostRow {
  id: string; post_type: string; body: string; created_at: string; author_user_id: string;
}
interface ChallengeRow {
  id: string; title: string; metric: 'distance_km' | 'activity_count' | 'days_active';
  target_value: number; period_start: string; period_end: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  running: 'Running', walking: 'Walking', cycling: 'Cycling', strength: 'Strength',
  boxing: 'Boxing', yoga: 'Yoga', pilates: 'Pilates', hiking: 'Hiking', dance: 'Dance',
  outdoor_fitness: 'Outdoor Fitness', football: 'Football', other: 'Other',
};

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t: string) => t.slice(0, 5);

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { showAuthModal } = useAuthModal();

  const [community, setCommunity] = useState<Community | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<'none' | 'pending' | 'active'>('none');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const session = await authService.getSession();
    const uid = session?.user.id ?? null;
    setUserId(uid);

    const { data: c } = await supabase
      .from('communities')
      .select('id, name, description, category, location, logo_url, cover_url, community_type, member_count, owner_user_id')
      .eq('id', id).single();
    setCommunity(c as Community);

    const today = new Date().toISOString().slice(0, 10);
    const { data: eventRows } = await supabase
      .from('community_events')
      .select('id, title, date, start_time, location, event_type, capacity, distance_km, image_url')
      .eq('community_id', id).eq('status', 'active').gte('date', today)
      .order('date', { ascending: true }).limit(10);
    setEvents((eventRows as EventRow[]) ?? []);

    const evIds = (eventRows ?? []).map(e => e.id);
    if (evIds.length > 0) {
      const { data: attendeeRows } = await supabase
        .from('community_event_attendees').select('event_id').in('event_id', evIds).eq('status', 'going');
      const counts: Record<string, number> = {};
      for (const r of attendeeRows ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      setAttendeeCounts(counts);
    }

    const { data: postRows } = await supabase
      .from('community_posts').select('id, post_type, body, created_at, author_user_id')
      .eq('community_id', id).order('created_at', { ascending: false }).limit(10);
    setPosts((postRows as PostRow[]) ?? []);

    const { data: challengeRows } = await supabase
      .from('challenges').select('id, title, metric, target_value, period_start, period_end')
      .eq('community_id', id).eq('is_active', true).order('period_start', { ascending: false });
    setChallenges((challengeRows as ChallengeRow[]) ?? []);

    if (uid) {
      const [{ data: follow }, { data: membership }] = await Promise.all([
        supabase.from('community_follows').select('id').eq('community_id', id).eq('user_id', uid).maybeSingle(),
        supabase.from('community_members').select('status').eq('community_id', id).eq('user_id', uid).maybeSingle(),
      ]);
      setIsFollowing(!!follow);
      setMembershipStatus(membership ? (membership.status === 'active' ? 'active' : 'pending') : 'none');
    } else {
      setIsFollowing(false);
      setMembershipStatus('none');
    }

    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleShare = async () => {
    if (!community) return;
    const url = `https://activecitypass.com/community/${community.id}`;
    const message = `Join "${community.name}" on Active CityPass\n\n${url}`;
    try {
      await Share.share({ message, url: Platform.OS === 'ios' ? url : undefined, title: community.name });
    } catch { /* cancelled */ }
  };

  const requireAuth = (action: () => void) => {
    if (!userId) { showAuthModal(() => load(), { defaultTab: 'signup' }); return; }
    action();
  };

  const toggleFollow = () => requireAuth(async () => {
    if (!id || !userId) return;
    setBusy(true);
    if (isFollowing) {
      await supabase.from('community_follows').delete().eq('community_id', id).eq('user_id', userId);
      setIsFollowing(false);
    } else {
      await supabase.from('community_follows').insert({ community_id: id, user_id: userId });
      setIsFollowing(true);
    }
    setBusy(false);
  });

  const handleJoin = () => requireAuth(async () => {
    if (!id || !userId || !community) return;
    setBusy(true);
    const isOpen = community.community_type === 'open';
    const { error } = await supabase.from('community_members').insert({
      community_id: id, user_id: userId, status: isOpen ? 'active' : 'pending',
    });
    setBusy(false);
    if (error) { Alert.alert('Could not join', error.message); return; }
    setMembershipStatus(isOpen ? 'active' : 'pending');
    if (isOpen) load();
    else Alert.alert('Request sent', 'The organiser will review your request to join.');
  });

  const handleLeave = () => {
    Alert.alert('Leave this community?', community?.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          if (!id || !userId) return;
          await supabase.from('community_members').delete().eq('community_id', id).eq('user_id', userId);
          setMembershipStatus('none');
          load();
        },
      },
    ]);
  };

  if (loading) {
    return <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 100 }} />;
  }
  if (!community) {
    return (
      <View style={s.notFound}>
        <ThemedText>Community not found.</ThemedText>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare} hitSlop={12}>
            <Ionicons name="share-outline" size={20} color={palette.ink900} />
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={s.heroRow}>
            {community.logo_url ? (
              <Image source={{ uri: community.logo_url }} style={s.logo} />
            ) : (
              <View style={s.logoFallback}><ThemedText style={s.logoFallbackText}>{community.name[0]}</ThemedText></View>
            )}
            <View style={{ flex: 1 }}>
              <ThemedText style={s.name}>{community.name}</ThemedText>
              <ThemedText style={s.meta}>
                {CATEGORY_LABEL[community.category] ?? community.category}
                {community.location ? ` · ${community.location}` : ''} · {community.member_count} members
              </ThemedText>
            </View>
          </View>

          <View style={s.content}>
            {community.description ? <ThemedText style={s.description}>{community.description}</ThemedText> : null}

            <View style={s.actionsRow}>
              <TouchableOpacity
                style={[s.followBtn, isFollowing && s.followBtnActive]}
                onPress={toggleFollow}
                disabled={busy}
              >
                <ThemedText style={[s.followBtnText, isFollowing && s.followBtnTextActive]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </ThemedText>
              </TouchableOpacity>

              {membershipStatus === 'active' ? (
                <TouchableOpacity style={s.joinBtnActive} onPress={handleLeave} disabled={busy}>
                  <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                  <ThemedText style={s.joinBtnActiveText}>Member</ThemedText>
                </TouchableOpacity>
              ) : membershipStatus === 'pending' ? (
                <View style={s.joinBtnPending}>
                  <ThemedText style={s.joinBtnPendingText}>Request Sent</ThemedText>
                </View>
              ) : (
                <TouchableOpacity style={s.joinBtn} onPress={handleJoin} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                    <ThemedText style={s.joinBtnText}>
                      {community.community_type === 'open' ? 'Join Community' : 'Request to Join'}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <ThemedText style={s.sectionLabel}>Upcoming</ThemedText>
            {events.length === 0 ? (
              <ThemedText style={s.emptyText}>No upcoming events yet.</ThemedText>
            ) : (
              events.map(e => (
                <TouchableOpacity
                  key={e.id}
                  style={s.eventCard}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/community/[id]/event/[eventId]', params: { id: community.id, eventId: e.id } } as any)}
                >
                  {e.image_url && <Image source={{ uri: e.image_url }} style={s.eventThumb} />}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.eventTitle}>{e.title}</ThemedText>
                    <ThemedText style={s.eventMeta}>
                      {e.distance_km ? `${e.distance_km} km · ` : ''}{e.location}
                    </ThemedText>
                    <ThemedText style={s.eventMeta}>{fmtDate(e.date)} · {fmtTime(e.start_time)}</ThemedText>
                  </View>
                  <View style={s.goingBadge}>
                    <ThemedText style={s.goingBadgeText}>
                      {attendeeCounts[e.id] ?? 0}{e.capacity ? `/${e.capacity}` : ''}
                    </ThemedText>
                    <ThemedText style={s.goingBadgeLabel}>going</ThemedText>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {challenges.length > 0 && (
              <>
                <ThemedText style={s.sectionLabel}>Challenges</ThemedText>
                {challenges.map(c => {
                  const unit = c.metric === 'distance_km' ? 'km' : c.metric === 'days_active' ? 'days' : 'activities';
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={s.eventCard}
                      activeOpacity={0.85}
                      onPress={() => router.push({ pathname: '/community/[id]/challenge/[challengeId]', params: { id: community.id, challengeId: c.id } } as any)}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.eventTitle}>{c.title}</ThemedText>
                        <ThemedText style={s.eventMeta}>
                          Target: {c.target_value} {unit} · ends {new Date(`${c.period_end}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {posts.length > 0 && (
              <>
                <ThemedText style={s.sectionLabel}>Updates</ThemedText>
                {posts.map(p => (
                  <View key={p.id} style={s.postCard}>
                    {p.post_type === 'announcement' && (
                      <View style={s.postTag}><ThemedText style={s.postTagText}>Announcement</ThemedText></View>
                    )}
                    <ThemedText style={s.postBody}>{p.body}</ThemedText>
                    <ThemedText style={s.postDate}>
                      {new Date(p.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  shareBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  heroRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 70, paddingBottom: 20,
  },
  logo: { width: 64, height: 64, borderRadius: 32 },
  logoFallback: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 24, fontWeight: '800', color: palette.blue500 },
  name: { fontSize: 20, fontWeight: '800', color: palette.ink900 },
  meta: { fontSize: 12.5, color: palette.gray300, marginTop: 3 },
  content: { paddingHorizontal: 20 },
  description: { fontSize: 14, color: palette.gray450, lineHeight: 20, marginBottom: 16 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  followBtn: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.white,
  },
  followBtnActive: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  followBtnText: { fontSize: 13.5, fontWeight: '700', color: palette.ink900 },
  followBtnTextActive: { color: '#fff' },
  joinBtn: { flex: 1, paddingVertical: 12, borderRadius: radii.pill, backgroundColor: palette.blue500, alignItems: 'center' },
  joinBtnText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  joinBtnActive: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: radii.pill, backgroundColor: palette.success50,
  },
  joinBtnActiveText: { fontSize: 13.5, fontWeight: '700', color: palette.success700 },
  joinBtnPending: { flex: 1, paddingVertical: 12, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, alignItems: 'center' },
  joinBtnPendingText: { fontSize: 13.5, fontWeight: '700', color: palette.gray450 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  emptyText: { fontSize: 13, color: palette.gray300, marginBottom: 20 },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.white, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline,
    padding: 14, marginBottom: 10, ...shadows.sm,
  },
  eventThumb: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: palette.surfaceMuted },
  eventTitle: { fontSize: 14, fontWeight: '700', color: palette.ink900 },
  eventMeta: { fontSize: 12, color: palette.gray300, marginTop: 2 },
  goingBadge: { alignItems: 'center' },
  goingBadgeText: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  goingBadgeLabel: { fontSize: 10, color: palette.gray300 },
  postCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 10,
  },
  postTag: { alignSelf: 'flex-start', backgroundColor: palette.blue25, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  postTagText: { fontSize: 10.5, fontWeight: '700', color: palette.blue500 },
  postBody: { fontSize: 13.5, color: palette.ink700, lineHeight: 19 },
  postDate: { fontSize: 11, color: palette.gray300, marginTop: 6 },
});
