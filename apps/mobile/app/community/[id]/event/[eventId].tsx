import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Modal, Image, Share, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

interface EventDetail {
  id: string; community_id: string; title: string; description: string | null;
  event_type: 'free' | 'paid' | 'partner_session' | 'external';
  activity_type: string | null; difficulty: string | null;
  date: string; start_time: string; end_time: string | null; location: string;
  capacity: number | null; price_kes: number | null; distance_km: number | null;
  external_url: string | null; status: string; image_url: string | null;
  communities: { name: string; logo_url: string | null } | null;
}
interface Attendee {
  id: string; status: string; confirmation_code: string | null; checked_in: boolean;
  activity_id: string | null;
  activities: { distance_meters: number | null; moving_time_seconds: number | null } | null;
}

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

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (t: string) => t.slice(0, 5);

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function CommunityEventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const router = useRouter();
  const { showAuthModal } = useAuthModal();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendee, setAttendee] = useState<Attendee | null>(null);
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

    const { data: e } = await supabase
      .from('community_events')
      .select('id, community_id, title, description, event_type, activity_type, difficulty, date, start_time, end_time, location, capacity, price_kes, distance_km, external_url, status, image_url, communities(name, logo_url)')
      .eq('id', eventId).single();
    setEvent(e as any);

    const { count } = await supabase
      .from('community_event_attendees').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('status', 'going');
    setGoingCount(count ?? 0);

    if (uid) {
      const { data: a } = await supabase
        .from('community_event_attendees')
        .select('id, status, confirmation_code, checked_in, activity_id, activities(distance_meters, moving_time_seconds)')
        .eq('event_id', eventId).eq('user_id', uid).maybeSingle();
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
    const url = `https://activecitypass.com/community/${event.community_id}/event/${event.id}`;
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

  if (loading) return <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 100 }} />;
  if (!event) return <View style={s.notFound}><ThemedText>Event not found.</ThemedText></View>;

  const isGoing = attendee?.status === 'going';
  const isPendingPayment = attendee?.status === 'pending_payment';
  const isFull = event.capacity != null && goingCount >= event.capacity && !isGoing;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle} numberOfLines={1}>{event.title}</ThemedText>
            <ThemedText style={s.headerSub}>{event.communities?.name}</ThemedText>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={handleShare} hitSlop={12}>
            <Ionicons name="share-outline" size={20} color={palette.ink900} />
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {event.image_url && <Image source={{ uri: event.image_url }} style={s.heroImage} />}
          <View style={s.detailCard}>
            <View style={s.detailRow}><Ionicons name="location-outline" size={16} color={palette.gray300} /><ThemedText style={s.detailText}>{event.location}</ThemedText></View>
            <View style={s.detailRow}><Ionicons name="calendar-outline" size={16} color={palette.gray300} /><ThemedText style={s.detailText}>{fmtDate(event.date)}</ThemedText></View>
            <View style={s.detailRow}>
              <Ionicons name="time-outline" size={16} color={palette.gray300} />
              <ThemedText style={s.detailText}>{fmtTime(event.start_time)}{event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}</ThemedText>
            </View>
            {event.distance_km ? (
              <View style={s.detailRow}><Ionicons name="speedometer-outline" size={16} color={palette.gray300} /><ThemedText style={s.detailText}>{event.distance_km} km</ThemedText></View>
            ) : null}
            {event.difficulty ? (
              <View style={s.detailRow}><Ionicons name="trending-up-outline" size={16} color={palette.gray300} /><ThemedText style={s.detailText}>{DIFFICULTY_LABEL[event.difficulty] ?? event.difficulty}</ThemedText></View>
            ) : null}
            <View style={s.detailRow}>
              <Ionicons name="people-outline" size={16} color={palette.gray300} />
              <ThemedText style={s.detailText}>{goingCount}{event.capacity ? `/${event.capacity}` : ''} going</ThemedText>
            </View>
          </View>

          {event.description ? <ThemedText style={s.description}>{event.description}</ThemedText> : null}

          {/* ── CTA ── */}
          {event.status !== 'active' ? (
            <View style={s.cancelledBanner}><ThemedText style={s.cancelledText}>This event has been cancelled.</ThemedText></View>
          ) : isGoing ? (
            <>
              {attendee?.activity_id && attendee.activities ? (
                <View style={s.stravaBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={palette.success700} />
                  <ThemedText style={s.stravaBadgeText}>Synced with Strava — {fmtStravaStat(attendee.activities)}</ThemedText>
                </View>
              ) : null}
              <TouchableOpacity style={s.qrBtn} onPress={() => setQrVisible(true)}>
                <Ionicons name="qr-code-outline" size={18} color="#fff" />
                <ThemedText style={s.qrBtnText}>Show Check-in Code</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={cancelRsvp}>
                <ThemedText style={s.cancelBtnText}>Cancel RSVP</ThemedText>
              </TouchableOpacity>
            </>
          ) : isPendingPayment ? (
            <View style={s.pendingBanner}>
              <ActivityIndicator color={palette.warning700} size="small" />
              <ThemedText style={s.pendingText}>Payment pending — approve the M-Pesa prompt on your phone.</ThemedText>
            </View>
          ) : attendee?.status === 'waitlisted' ? (
            <View style={s.pendingBanner}>
              <Ionicons name="hourglass-outline" size={16} color={palette.warning700} />
              <ThemedText style={s.pendingText}>You're on the waitlist — this event is full.</ThemedText>
            </View>
          ) : event.event_type === 'free' ? (
            <TouchableOpacity style={s.rsvpBtn} onPress={rsvpFree} disabled={booking}>
              {booking ? <ActivityIndicator color="#fff" /> : <ThemedText style={s.rsvpBtnText}>{isFull ? 'Join Waitlist' : 'RSVP — Free'}</ThemedText>}
            </TouchableOpacity>
          ) : event.event_type === 'paid' ? (
            <TouchableOpacity style={s.rsvpBtn} onPress={bookPaid} disabled={booking || isFull}>
              <ThemedText style={s.rsvpBtnText}>{isFull ? 'Event Full' : `Book — KES ${event.price_kes?.toLocaleString()}`}</ThemedText>
            </TouchableOpacity>
          ) : event.event_type === 'partner_session' ? (
            <TouchableOpacity style={s.rsvpBtn} onPress={partnerSessionCta}>
              <ThemedText style={s.rsvpBtnText}>Book via Classes</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.rsvpBtn} onPress={() => event.external_url && Linking.openURL(event.external_url)}>
              <ThemedText style={s.rsvpBtnText}>Register externally</ThemedText>
              <Ionicons name="open-outline" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* ── QR modal ── */}
        <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.qrCard}>
              <ThemedText style={s.qrTitle}>{event.title}</ThemedText>
              {attendee?.confirmation_code && (
                <>
                  <View style={s.qrWrap}>
                    <QRCode value={`acp:community-event:${attendee.id}:${attendee.confirmation_code}`} size={180} />
                  </View>
                  <ThemedText style={s.qrHint}>Or show code</ThemedText>
                  <ThemedText style={s.qrCode}>{attendee.confirmation_code}</ThemedText>
                </>
              )}
              <TouchableOpacity style={s.qrCloseBtn} onPress={() => setQrVisible(false)}>
                <ThemedText style={s.qrCloseBtnText}>Close</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },
  content: { padding: 20, paddingBottom: 60 },
  heroImage: { width: '100%', height: 180, borderRadius: radii.lg, marginBottom: 16, backgroundColor: palette.surfaceMuted },
  detailCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.lg, padding: 16, marginBottom: 16, gap: 10,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontSize: 13.5, color: palette.ink700, fontWeight: '600' },
  description: { fontSize: 14, color: palette.gray450, lineHeight: 20, marginBottom: 24 },
  rsvpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.blue500, paddingVertical: 16, borderRadius: radii.pill,
  },
  rsvpBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  qrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.ink900, paddingVertical: 16, borderRadius: radii.pill, marginBottom: 12,
  },
  qrBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 13.5, fontWeight: '600', color: palette.danger500 },
  stravaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.success50, borderRadius: radii.lg, padding: 12, marginBottom: 12,
  },
  stravaBadgeText: { fontSize: 12.5, fontWeight: '600', color: palette.success700 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.warning50, borderRadius: radii.lg, padding: 14,
  },
  pendingText: { flex: 1, fontSize: 13, color: palette.warning800, lineHeight: 18 },
  cancelledBanner: { backgroundColor: palette.danger50, borderRadius: radii.lg, padding: 14 },
  cancelledText: { fontSize: 13.5, color: palette.danger600, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  qrCard: { backgroundColor: '#fff', borderRadius: radii.xl, padding: 28, alignItems: 'center', width: '100%' },
  qrTitle: { fontSize: 16, fontWeight: '800', color: palette.ink900, marginBottom: 16, textAlign: 'center' },
  qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: radii.lg, borderWidth: 1, borderColor: palette.hairline, marginBottom: 14 },
  qrHint: { fontSize: 12, color: palette.gray300 },
  qrCode: { fontSize: 24, fontWeight: '800', letterSpacing: 4, color: palette.ink900, marginTop: 4, fontFamily: 'monospace' },
  qrCloseBtn: { marginTop: 18, paddingVertical: 10 },
  qrCloseBtnText: { fontSize: 14, fontWeight: '600', color: palette.gray450 },
});
