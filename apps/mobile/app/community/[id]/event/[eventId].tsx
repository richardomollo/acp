import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Modal, Platform, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

interface EventDetail {
  id: string; slug: string | null; community_id: string; title: string; description: string | null;
  event_type: 'free' | 'paid' | 'partner_session' | 'external';
  activity_type: string | null; difficulty: string | null;
  date: string; start_time: string; end_time: string | null; location: string;
  capacity: number | null; price_kes: number | null; distance_km: number | null;
  external_url: string | null; status: string; image_url: string | null;
  communities: { name: string; logo_url: string | null; slug: string | null } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Attendee {
  id: string; status: string; confirmation_code: string | null; checked_in: boolean;
  activity_id: string | null;
  activities: { distance_meters: number | null; moving_time_seconds: number | null } | null;
}
interface AttendeeInfo { user_id: string; name: string | null; avatar_url: string | null }

const fmtStravaStat = (a: NonNullable<Attendee['activities']>) => {
  const parts: string[] = [];
  if (a.distance_meters) parts.push(`${(a.distance_meters / 1000).toFixed(1)} km`);
  if (a.moving_time_seconds) {
    const mins = Math.floor(a.moving_time_seconds / 60);
    const secs = a.moving_time_seconds % 60;
    parts.push(`${mins}:${String(secs).padStart(2, '0')}`);
  }
  return parts.join(' · ');
};

const DIFFICULTY_LABEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function CommunityEventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const router = useRouter();
  const { showAuthModal } = useAuthModal();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [attendees, setAttendees] = useState<AttendeeInfo[]>([]);
  const [goingCount, setGoingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const session = await authService.getSession();
    const uid = session?.user.id ?? null;
    setUserId(uid);

    const col = UUID_RE.test(eventId) ? 'id' : 'slug';
    const { data: e } = await supabase
      .from('community_events')
      .select('id, slug, community_id, title, description, event_type, activity_type, difficulty, date, start_time, end_time, location, capacity, price_kes, distance_km, external_url, status, image_url, communities(name, logo_url, slug)')
      .eq(col, eventId).single();
    setEvent(e as any);
    if (!e) { setLoading(false); return; }
    const eid = e.id;

    // community_event_attendees has no public-read RLS policy (only own row /
    // organiser), so a direct count() query gets silently filtered to what the
    // viewer themselves can see — get_event_attendees() is a SECURITY DEFINER
    // RPC that correctly returns the full public list regardless of viewer.
    const { data: attendeeRows } = await supabase.rpc('get_event_attendees', { p_event_id: eid });
    setGoingCount((attendeeRows as AttendeeInfo[] | null)?.length ?? 0);
    setAttendees((attendeeRows as AttendeeInfo[]) ?? []);

    if (uid) {
      const { data: a } = await supabase
        .from('community_event_attendees')
        .select('id, status, confirmation_code, checked_in, activity_id, activities(distance_meters, moving_time_seconds)')
        .eq('event_id', eid).eq('user_id', uid).maybeSingle();
      setAttendee(a as any);
    } else {
      setAttendee(null);
    }
    setLoading(false);
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requireAuth = (action: () => void) => {
    if (!userId) { showAuthModal(() => load(), { defaultTab: 'signup' }); return; }
    action();
  };

  const rsvpFree = () => requireAuth(async () => {
    if (!event) return;
    setBooking(true);
    const code = generateCode();
    const { error } = await supabase.from('community_event_attendees').insert({
      event_id: event.id, user_id: userId, confirmation_code: code,
      qr_payload: `acp:community-event:pending:${code}`,
    });
    setBooking(false);
    if (error) { Alert.alert('Could not RSVP', error.message); return; }
    load();
  });

  const cancelRsvp = () => {
    Alert.alert('Cancel your RSVP?', event?.title, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel RSVP', style: 'destructive',
        onPress: async () => {
          if (!attendee) return;
          await supabase.from('community_event_attendees').delete().eq('id', attendee.id);
          load();
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (!event) return;
    const url = `https://activecitypass.com/community/${event.communities?.slug ?? event.community_id}/event/${event.slug ?? event.id}`;
    const message = `Join "${event.title}"${event.communities?.name ? ` with ${event.communities.name}` : ''} — ${fmtDate(event.date)}\n\n${url}`;
    try {
      await Share.share({ message, url: Platform.OS === 'ios' ? url : undefined, title: event.title });
    } catch { /* cancelled */ }
  };

  const bookPaid = () => requireAuth(() => {
    if (!event) return;
    router.push({
      pathname: '/checkout',
      params: {
        bookingType: 'community_event',
        itemId: event.id,
        title: event.title,
        subtitle: event.communities?.name ?? '',
        totalPrice: String(event.price_kes ?? 0),
        depositAmount: String(event.price_kes ?? 0),
        remainderAmount: '0',
      },
    } as any);
  });

  const partnerSessionCta = () => {
    Alert.alert(
      'Book through the app',
      'This event is a real gym session. Find it under Classes to book your spot.',
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }
  if (!event) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Ionicons name="calendar-outline" size={48} color={palette.gray200} />
        <ThemedText style={styles.emptyText}>Event not found</ThemedText>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={styles.backLinkText}>Go back</ThemedText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isGoing = attendee?.status === 'going';
  const isPendingPayment = attendee?.status === 'pending_payment';
  const isWaitlisted = attendee?.status === 'waitlisted';
  const isFull = event.capacity != null && goingCount >= event.capacity && !isGoing;
  const isCancelled = event.status !== 'active';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={styles.heroImage} contentFit="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="calendar-outline" size={64} color="rgba(255,255,255,0.4)" />
            </View>
          )}
          <View style={styles.heroOverlay} />

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={palette.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={palette.white} />
          </TouchableOpacity>

          {event.activity_type ? (
            <View style={styles.categoryBadge}>
              <ThemedText style={styles.categoryBadgeText}>{event.activity_type.replace('_', ' ')}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* ── Content card ── */}
        <View style={styles.card}>
          <ThemedText style={styles.title}>{event.title}</ThemedText>
          <View style={styles.gymRow}>
            <Ionicons name="location" size={16} color={palette.blue500} />
            <View>
              <ThemedText style={styles.gymName}>{event.communities?.name}</ThemedText>
              <ThemedText style={styles.gymLocation}>{event.location}</ThemedText>
            </View>
          </View>

          {/* Stat pills */}
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Ionicons name="people-outline" size={16} color={isFull ? palette.danger600 : palette.blue500} />
              <ThemedText style={[styles.statText, isFull && { color: palette.danger600 }]}>
                {isFull ? 'Full' : `${goingCount}${event.capacity ? `/${event.capacity}` : ''} going`}
              </ThemedText>
            </View>
            {event.distance_km ? (
              <View style={styles.statPill}>
                <Ionicons name="speedometer-outline" size={16} color={palette.blue500} />
                <ThemedText style={styles.statText}>{event.distance_km} km</ThemedText>
              </View>
            ) : null}
            {event.difficulty ? (
              <View style={styles.statPill}>
                <ThemedText style={styles.statText}>{DIFFICULTY_LABEL[event.difficulty] ?? event.difficulty}</ThemedText>
              </View>
            ) : null}
            <View style={styles.statPill}>
              <ThemedText style={styles.statText}>{event.event_type === 'paid' ? `KES ${event.price_kes?.toLocaleString()}` : 'Free'}</ThemedText>
            </View>
          </View>

          {/* Schedule */}
          <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIcon}>
                <Ionicons name="calendar-outline" size={18} color={palette.blue500} />
              </View>
              <View>
                <ThemedText style={styles.scheduleLabel}>Date</ThemedText>
                <ThemedText style={styles.scheduleValue}>{fmtDate(event.date)}</ThemedText>
              </View>
            </View>
            <View style={styles.scheduleDivider} />
            <View style={styles.scheduleRow}>
              <View style={styles.scheduleIcon}>
                <Ionicons name="time-outline" size={18} color={palette.blue500} />
              </View>
              <View>
                <ThemedText style={styles.scheduleLabel}>Time</ThemedText>
                <ThemedText style={styles.scheduleValue}>
                  {fmtTime(event.start_time)}{event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Strava sync badge */}
          {attendee?.activity_id && attendee.activities ? (
            <View style={styles.policyBlock}>
              <View style={styles.policyDetailCard}>
                <View style={styles.policyDetailRow}>
                  <View style={[styles.policyDetailIcon, { backgroundColor: '#f0fdf4' }]}>
                    <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                  </View>
                  <View style={styles.policyDetailContent}>
                    <ThemedText style={styles.policyDetailLabel}>Synced with Strava</ThemedText>
                    <ThemedText style={[styles.policyDetailValue, { color: palette.success700 }]}>{fmtStravaStat(attendee.activities)}</ThemedText>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* Who's going */}
          {attendees.length > 0 && (
            <>
              <ThemedText style={styles.sectionTitle}>Who&apos;s going</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attendeesRow}>
                {attendees.slice(0, 20).map(a => (
                  <View key={a.user_id} style={styles.attendeeItem}>
                    {a.avatar_url ? (
                      <Image source={{ uri: a.avatar_url }} style={styles.attendeeAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.attendeeAvatarFallback}>
                        <ThemedText style={styles.attendeeAvatarFallbackText}>{(a.name ?? 'M')[0]?.toUpperCase()}</ThemedText>
                      </View>
                    )}
                    <ThemedText style={styles.attendeeName} numberOfLines={1}>{a.name ?? 'Member'}</ThemedText>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* Description */}
          {event.description ? (
            <>
              <ThemedText style={styles.sectionTitle}>About this event</ThemedText>
              <ThemedText style={styles.description}>{event.description}</ThemedText>
            </>
          ) : null}

          {isGoing && (
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelRsvp}>
              <ThemedText style={styles.cancelBtnText}>Cancel RSVP</ThemedText>
            </TouchableOpacity>
          )}

          {/* Share section */}
          {(() => {
            const shareUrl = `https://activecitypass.com/community/${event.communities?.slug ?? event.community_id}/event/${event.slug ?? event.id}`;
            const shareText = encodeURIComponent(`Join "${event.title}"${event.communities?.name ? ` with ${event.communities.name}` : ''} — ${fmtDate(event.date)}`);
            const encodedUrl = encodeURIComponent(shareUrl);
            return (
              <View style={styles.shareSection}>
                <ThemedText style={styles.shareLabel}>Share this event</ThemedText>
                <View style={styles.shareRow}>
                  <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#25D366' }]} onPress={() => Linking.openURL(`https://wa.me/?text=${shareText}%20${encodedUrl}`)}>
                    <Ionicons name="logo-whatsapp" size={22} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareIcon, { backgroundColor: palette.ink900 }]} onPress={() => Linking.openURL(`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`)}>
                    <ThemedText style={styles.shareIconX}>𝕏</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#1877F2' }]} onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>
                    <Ionicons name="logo-facebook" size={22} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#229ED9' }]} onPress={() => Linking.openURL(`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`)}>
                    <Ionicons name="send" size={18} color={palette.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareIcon, { backgroundColor: palette.hairline, borderWidth: 1, borderColor: palette.border }]} onPress={handleShare}>
                    <Ionicons name="share-outline" size={20} color={palette.ink600} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* ── Bottom bar ── */}
      <View style={styles.bottomBar}>
        {isCancelled ? (
          <ThemedText style={styles.cancelledText}>This event has been cancelled.</ThemedText>
        ) : isGoing ? (
          <>
            <View>
              <ThemedText style={styles.priceLabel}>You&apos;re going ✓</ThemedText>
            </View>
            <TouchableOpacity style={[styles.bookBtn, styles.bookedBtn]} onPress={() => setQrVisible(true)}>
              <Ionicons name="qr-code-outline" size={18} color={palette.white} />
              <ThemedText style={styles.bookBtnText}>Show Code</ThemedText>
            </TouchableOpacity>
          </>
        ) : isPendingPayment ? (
          <>
            <View>
              <ThemedText style={styles.priceLabel}>Payment pending</ThemedText>
              <ThemedText style={styles.priceSub}>Approve the M-Pesa prompt</ThemedText>
            </View>
            <ActivityIndicator color={palette.warning700} size="small" />
          </>
        ) : isWaitlisted ? (
          <View>
            <ThemedText style={styles.priceLabel}>You&apos;re on the waitlist</ThemedText>
            <ThemedText style={styles.priceSub}>This event is full</ThemedText>
          </View>
        ) : event.event_type === 'free' ? (
          <>
            <View><ThemedText style={styles.priceValue}>Free</ThemedText></View>
            <TouchableOpacity style={styles.bookBtn} onPress={rsvpFree} disabled={booking}>
              {booking ? <ActivityIndicator color={palette.white} /> : <ThemedText style={styles.bookBtnText}>{isFull ? 'Join Waitlist' : 'RSVP'}</ThemedText>}
            </TouchableOpacity>
          </>
        ) : event.event_type === 'paid' ? (
          <>
            <View><ThemedText style={styles.priceValue}>KES {event.price_kes?.toLocaleString()}</ThemedText></View>
            <TouchableOpacity style={[styles.bookBtn, isFull && styles.disabledBtn]} onPress={bookPaid} disabled={booking || isFull}>
              <ThemedText style={styles.bookBtnText}>{isFull ? 'Event Full' : 'Book Now'}</ThemedText>
            </TouchableOpacity>
          </>
        ) : event.event_type === 'partner_session' ? (
          <>
            <View><ThemedText style={styles.priceLabel}>Partner session</ThemedText></View>
            <TouchableOpacity style={styles.bookBtn} onPress={partnerSessionCta}>
              <ThemedText style={styles.bookBtnText}>Book via Classes</ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View><ThemedText style={styles.priceLabel}>External event</ThemedText></View>
            <TouchableOpacity style={styles.bookBtn} onPress={() => event.external_url && Linking.openURL(event.external_url)}>
              <Ionicons name="open-outline" size={16} color={palette.white} />
              <ThemedText style={styles.bookBtnText}>Register</ThemedText>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── QR modal ── */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.qrCard}>
            <ThemedText style={styles.qrTitle}>{event.title}</ThemedText>
            {attendee?.confirmation_code && (
              <>
                <View style={styles.qrWrap}>
                  <QRCode value={`acp:community-event:${attendee.id}:${attendee.confirmation_code}`} size={180} />
                </View>
                <ThemedText style={styles.qrHint}>Or show code</ThemedText>
                <ThemedText style={styles.qrCode}>{attendee.confirmation_code}</ThemedText>
              </>
            )}
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrVisible(false)}>
              <ThemedText style={styles.qrCloseBtnText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { flex: 1 },
  emptyText: { fontSize: fontSize.lg, color: palette.gray450, marginTop: 8 },
  backLink: { marginTop: 8 },
  backLinkText: { color: palette.blue500, fontSize: fontSize.base, fontWeight: '600' },

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
  categoryBadge: {
    position: 'absolute', bottom: 36, left: 20,
    backgroundColor: palette.blue500, borderRadius: radii.sm, paddingHorizontal: 12, paddingVertical: 4,
  },
  categoryBadgeText: { color: palette.white, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },

  // Content card
  card: { backgroundColor: palette.white, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], marginTop: -24, padding: 24 },
  title: { fontSize: fontSize['2xl'], fontWeight: 'bold', color: palette.ink900, marginBottom: 10 },
  gymRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 20 },
  gymName: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  gymLocation: { fontSize: fontSize.sm, color: palette.gray450 },

  // Stat pills
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 28, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue50, borderRadius: radii.xl, paddingHorizontal: 12, paddingVertical: 8,
  },
  statText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },

  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 12 },

  // Schedule
  scheduleCard: { backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: palette.borderFaint },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scheduleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.blue50, justifyContent: 'center', alignItems: 'center' },
  scheduleLabel: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500', textTransform: 'uppercase', marginBottom: 2 },
  scheduleValue: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  scheduleDivider: { height: 1, backgroundColor: palette.borderFaint, marginVertical: 12 },

  // Strava badge (policy-card pattern)
  policyBlock: { marginBottom: 24 },
  policyDetailCard: { backgroundColor: palette.surfaceApp, borderRadius: 16, paddingHorizontal: 16, overflow: 'hidden' },
  policyDetailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  policyDetailIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  policyDetailContent: { flex: 1, gap: 2 },
  policyDetailLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.4 },
  policyDetailValue: { fontSize: fontSize.sm, fontWeight: '500', color: palette.ink900, lineHeight: 20 },

  // Attendees
  attendeesRow: { gap: 14, paddingBottom: 24 },
  attendeeItem: { alignItems: 'center', width: 56 },
  attendeeAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surfaceMuted },
  attendeeAvatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.blue25, alignItems: 'center', justifyContent: 'center' },
  attendeeAvatarFallbackText: { fontSize: 16, fontWeight: '800', color: palette.blue500 },
  attendeeName: { fontSize: 10.5, color: palette.gray450, marginTop: 4, textAlign: 'center' },

  description: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 24, marginBottom: 24 },

  cancelBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 12 },
  cancelBtnText: { fontSize: 13.5, fontWeight: '600', color: palette.danger500 },
  cancelledText: { fontSize: 14, fontWeight: '600', color: palette.danger600 },

  // Bottom bar
  bottomBar: {
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1, borderTopColor: palette.hairline,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.white,
  },
  priceLabel: { fontSize: fontSize.xs, color: palette.gray450, marginBottom: 2 },
  priceValue: { fontSize: fontSize.lg, fontWeight: 'bold', color: palette.ink700 },
  priceSub: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },
  bookBtn: {
    backgroundColor: palette.ink900, paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, minWidth: 150,
  },
  bookedBtn: { backgroundColor: palette.success700 },
  disabledBtn: { backgroundColor: palette.gray200 },
  bookBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },

  // Share section
  shareSection: { marginBottom: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: palette.hairline },
  shareLabel: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: palette.gray300, marginBottom: 14 },
  shareRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  shareIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  shareIconX: { color: palette.white, fontSize: fontSize.lg, fontWeight: '700' },

  // QR modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  qrCard: { backgroundColor: '#fff', borderRadius: radii.xl, padding: 28, alignItems: 'center', width: '100%' },
  qrTitle: { fontSize: 16, fontWeight: '800', color: palette.ink900, marginBottom: 16, textAlign: 'center' },
  qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, marginBottom: 14 },
  qrHint: { fontSize: 12, color: palette.gray300 },
  qrCode: { fontSize: 24, fontWeight: '800', letterSpacing: 4, color: palette.ink900, marginTop: 4, fontFamily: 'monospace' },
  qrCloseBtn: { marginTop: 18, paddingVertical: 10 },
  qrCloseBtnText: { fontSize: 14, fontWeight: '600', color: palette.gray450 },
});
