import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { Ionicons } from '@expo/vector-icons';

interface Community {
  id: string; slug: string | null; name: string; description: string | null; category: string; location: string | null;
  logo_url: string | null; cover_url: string | null; community_type: 'open' | 'approval_required';
  member_count: number; owner_user_id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface EventRow {
  id: string; slug: string | null; title: string; date: string; start_time: string; location: string;
  event_type: string; capacity: number | null; distance_km: number | null; image_url: string | null;
}
interface PostRow {
  id: string; post_type: string; body: string; created_at: string; author_user_id: string;
}
interface ChallengeRow {
  id: string; title: string; metric: 'distance_km' | 'activity_count' | 'days_active';
  target_value: number; period_start: string; period_end: string;
}
interface MemberInfo {
  user_id: string; name: string | null; avatar_url: string | null; role: string;
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
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<'none' | 'pending' | 'active'>('none');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const session = await authService.getSession();
    const uid = session?.user.id ?? null;
    setUserId(uid);

    const col = UUID_RE.test(id) ? 'id' : 'slug';
    const { data: c } = await supabase
      .from('communities')
      .select('id, slug, name, description, category, location, logo_url, cover_url, community_type, member_count, owner_user_id')
      .eq(col, id).single();
    setCommunity(c as Community);
    if (!c) { setLoading(false); return; }
    const cid = c.id;

    const today = new Date().toISOString().slice(0, 10);
    const { data: eventRows } = await supabase
      .from('community_events')
      .select('id, slug, title, date, start_time, location, event_type, capacity, distance_km, image_url')
      .eq('community_id', cid).eq('status', 'active').gte('date', today)
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
      .eq('community_id', cid).order('created_at', { ascending: false }).limit(10);
    setPosts((postRows as PostRow[]) ?? []);

    const { data: challengeRows } = await supabase
      .from('challenges').select('id, title, metric, target_value, period_start, period_end')
      .eq('community_id', cid).eq('is_active', true).order('period_start', { ascending: false });
    setChallenges((challengeRows as ChallengeRow[]) ?? []);

    const { data: memberRows } = await supabase.rpc('get_community_members', { p_community_id: cid });
    setMembers((memberRows as MemberInfo[]) ?? []);

    if (uid) {
      const [{ data: follow }, { data: membership }] = await Promise.all([
        supabase.from('community_follows').select('id').eq('community_id', cid).eq('user_id', uid).maybeSingle(),
        supabase.from('community_members').select('status').eq('community_id', cid).eq('user_id', uid).maybeSingle(),
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
    const url = `https://activecitypass.com/community/${community.slug ?? community.id}`;
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
    if (!community || !userId) return;
    setBusy(true);
    if (isFollowing) {
      await supabase.from('community_follows').delete().eq('community_id', community.id).eq('user_id', userId);
      setIsFollowing(false);
    } else {
      await supabase.from('community_follows').insert({ community_id: community.id, user_id: userId });
      setIsFollowing(true);
    }
    setBusy(false);
  });

  const handleJoin = () => requireAuth(async () => {
    if (!community || !userId) return;
    setBusy(true);
    const isOpen = community.community_type === 'open';
    const { error } = await supabase.from('community_members').insert({
      community_id: community.id, user_id: userId, status: isOpen ? 'active' : 'pending',
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
          if (!community || !userId) return;
          await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', userId);
          setMembershipStatus('none');
          load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }
  if (!community) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="people-outline" size={56} color={palette.gray200} />
        <ThemedText style={styles.errorText}>Community not found</ThemedText>
        <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
          <ThemedText style={styles.errorBtnText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const categoryLabel = CATEGORY_LABEL[community.category] ?? community.category;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ── Cover hero ── */}
          <View style={styles.hero}>
            {community.cover_url ? (
              <Image source={{ uri: community.cover_url }} style={styles.heroImage} contentFit="cover" />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <Ionicons name="people" size={64} color="rgba(255,255,255,0.4)" />
              </View>
            )}
            <View style={styles.heroOverlay} />

            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={palette.white} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color={palette.white} />
            </TouchableOpacity>
          </View>

          {/* ── Content card ── */}
          <View style={styles.card}>
            <View style={styles.nameRow}>
              {community.logo_url ? (
                <Image source={{ uri: community.logo_url }} style={styles.logo} contentFit="cover" />
              ) : (
                <View style={styles.logoFallback}>
                  <ThemedText style={styles.logoFallbackText}>{community.name[0]}</ThemedText>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.communityName}>{community.name}</ThemedText>
                <View style={styles.memberBadge}>
                  <Ionicons name="people-outline" size={12} color={palette.blue500} />
                  <ThemedText style={styles.memberBadgeText}>{community.member_count} members</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.locationRow}>
              <Ionicons name="pricetag-outline" size={16} color={palette.blue500} />
              <ThemedText style={styles.locationText}>
                {categoryLabel}{community.location ? ` · ${community.location}` : ''}
              </ThemedText>
            </View>

            {community.description ? (
              <View style={{ marginBottom: 8 }}>
                <ThemedText style={styles.description} numberOfLines={descExpanded ? undefined : 3}>
                  {community.description}
                </ThemedText>
                {community.description.length > 120 && (
                  <TouchableOpacity onPress={() => setDescExpanded(v => !v)} hitSlop={8}>
                    <ThemedText style={styles.readMore}>{descExpanded ? 'Read less' : 'Read more'}</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={toggleFollow}
                disabled={busy}
              >
                <ThemedText style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </ThemedText>
              </TouchableOpacity>

              {membershipStatus === 'active' ? (
                <TouchableOpacity style={styles.joinBtnActive} onPress={handleLeave} disabled={busy}>
                  <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                  <ThemedText style={styles.joinBtnActiveText}>Member</ThemedText>
                </TouchableOpacity>
              ) : membershipStatus === 'pending' ? (
                <View style={styles.joinBtnPending}>
                  <ThemedText style={styles.joinBtnPendingText}>Request Sent</ThemedText>
                </View>
              ) : (
                <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                    <ThemedText style={styles.joinBtnText}>
                      {community.community_type === 'open' ? 'Join Community' : 'Request to Join'}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* ── Events section ── */}
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Upcoming events</ThemedText>
            </View>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={palette.gray200} />
                <ThemedText style={styles.emptyText}>No events scheduled yet</ThemedText>
              </View>
            ) : (
              events.map(e => {
                const going = attendeeCounts[e.id] ?? 0;
                const isFull = e.capacity != null && going >= e.capacity;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.sessionRow}
                    activeOpacity={0.85}
                    onPress={() => router.push({ pathname: '/community/[id]/event/[eventId]', params: { id: community.slug ?? community.id, eventId: e.slug ?? e.id } } as any)}
                  >
                    <View style={styles.sessionThumb}>
                      {e.image_url ? (
                        <Image source={{ uri: e.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      ) : (
                        <View style={[StyleSheet.absoluteFillObject, styles.sessionThumbFallback]}>
                          <Ionicons name="calendar-outline" size={22} color="rgba(255,255,255,0.9)" />
                        </View>
                      )}
                    </View>

                    <View style={styles.sessionInfo}>
                      <View style={styles.sessionBadges}>
                        <View style={styles.catChip}>
                          <ThemedText style={styles.catChipText}>{categoryLabel}</ThemedText>
                        </View>
                        <View style={[styles.spotsChip, { backgroundColor: isFull ? palette.danger50 : palette.success50 }]}>
                          <ThemedText style={[styles.spotsChipText, { color: isFull ? palette.danger600 : palette.success700 }]}>
                            {going}{e.capacity ? `/${e.capacity}` : ''} going
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>{e.title}</ThemedText>
                      <View style={styles.sessionMeta}>
                        <Ionicons name="time-outline" size={12} color={palette.gray450} />
                        <ThemedText style={styles.metaText}>{fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}</ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* ── Challenges section ── */}
            {challenges.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>Challenges</ThemedText>
                </View>
                {challenges.map(c => {
                  const unit = c.metric === 'distance_km' ? 'km' : c.metric === 'days_active' ? 'days' : 'activities';
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.challengeRow}
                      activeOpacity={0.85}
                      onPress={() => router.push({ pathname: '/community/[id]/challenge/[challengeId]', params: { id: community.slug ?? community.id, challengeId: c.id } } as any)}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.sessionName}>{c.title}</ThemedText>
                        <ThemedText style={styles.metaText}>
                          Target {c.target_value} {unit} · ends {new Date(`${c.period_end}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* ── Members section ── */}
            {members.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>Members</ThemedText>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersRow}>
                  {members.slice(0, 20).map(m => (
                    <View key={m.user_id} style={styles.memberItem}>
                      {m.avatar_url ? (
                        <Image source={{ uri: m.avatar_url }} style={styles.memberAvatar} contentFit="cover" />
                      ) : (
                        <View style={styles.memberAvatarFallback}>
                          <ThemedText style={styles.memberAvatarFallbackText}>{(m.name ?? 'M')[0]?.toUpperCase()}</ThemedText>
                        </View>
                      )}
                      <ThemedText style={styles.memberName} numberOfLines={1}>{m.name ?? 'Member'}</ThemedText>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Updates section ── */}
            {posts.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>Updates</ThemedText>
                </View>
                {posts.map(p => (
                  <View key={p.id} style={styles.postCard}>
                    {p.post_type === 'announcement' && (
                      <View style={styles.postTag}><ThemedText style={styles.postTagText}>Announcement</ThemedText></View>
                    )}
                    <ThemedText style={styles.postBody}>{p.body}</ThemedText>
                    <ThemedText style={styles.postDate}>
                      {new Date(p.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                ))}
              </>
            )}

            {community.location && (
              <View style={styles.contactRow}>
                <View style={styles.contactPill}>
                  <Ionicons name="location-outline" size={13} color={palette.blue500} />
                  <ThemedText style={styles.contactText}>{community.location}</ThemedText>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },
  errorText: { fontSize: fontSize.lg, color: palette.gray450, textAlign: 'center', marginTop: 8 },
  errorBtn: { backgroundColor: palette.ink900, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 25, marginTop: 4 },
  errorBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '600' },

  // Hero
  hero: { height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  backBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 16, left: 20,
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  shareBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 16, right: 20,
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Content card
  card: { backgroundColor: palette.white, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], marginTop: -24, padding: 24 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  logo: { width: 56, height: 56, borderRadius: 28 },
  logoFallback: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 22, fontWeight: '800', color: palette.blue500 },
  communityName: { fontSize: fontSize['2xl'], fontWeight: 'bold', color: palette.ink900, marginBottom: 4 },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: palette.blue50, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.xl,
  },
  memberBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.blue500 },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  locationText: { fontSize: fontSize.base, color: palette.gray450, textTransform: 'capitalize' },

  description: { fontSize: fontSize.base, color: palette.gray450, lineHeight: 22 },
  readMore: { fontSize: 13, fontWeight: '700', color: palette.blue500, marginTop: 4 },

  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  contactPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue50, borderRadius: radii.xl,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  contactText: { fontSize: fontSize.sm, color: palette.blue500, fontWeight: '500' },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
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

  // Section headers (gym-details divider pattern)
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
    borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: 24,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900 },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: fontSize.sm, color: palette.gray300 },

  // Row card (session-row pattern, reused for events)
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  sessionThumb: { width: 84, height: 84, borderRadius: radii.md, overflow: 'hidden', flexShrink: 0 },
  sessionThumbFallback: { backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center' },
  sessionInfo: { flex: 1, gap: 4 },
  sessionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.surfaceMuted, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 1,
  },
  catChipText: { fontSize: 11, fontWeight: '500', color: palette.gray450, textTransform: 'capitalize', flexShrink: 1 },
  spotsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  spotsChipText: { fontSize: 11, fontWeight: '600' },
  sessionName: { fontSize: 15.5, fontWeight: '700', color: palette.ink900 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: fontSize.xs, color: palette.gray450 },

  // Challenge row
  challengeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },

  // Members
  membersRow: { gap: 14, paddingBottom: 8, paddingRight: 8 },
  memberItem: { alignItems: 'center', width: 56 },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surfaceMuted },
  memberAvatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  memberAvatarFallbackText: { fontSize: 16, fontWeight: '800', color: palette.blue500 },
  memberName: { fontSize: 10.5, color: palette.gray450, marginTop: 4, textAlign: 'center' },

  // Updates / posts
  postCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 14, marginBottom: 10 },
  postTag: { alignSelf: 'flex-start', backgroundColor: palette.blue25, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  postTagText: { fontSize: 10.5, fontWeight: '700', color: palette.blue500 },
  postBody: { fontSize: 13.5, color: palette.ink700, lineHeight: 19 },
  postDate: { fontSize: 11, color: palette.gray300, marginTop: 6 },
});
