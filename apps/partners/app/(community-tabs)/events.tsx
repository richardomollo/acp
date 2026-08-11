import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface EventRow {
  id: string; title: string; event_type: string; date: string; start_time: string;
  location: string; capacity: number | null; status: string; image_url: string | null;
}

const TYPE_LABEL: Record<string, string> = { free: 'Free', paid: 'Paid', partner_session: 'Partner Session', external: 'External' };

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t: string) => t.slice(0, 5);

export default function CommunityEventsScreen() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: membership } = await supabase
      .from('community_members').select('community_id')
      .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const cid = membership?.community_id ?? null;
    setCommunityId(cid);
    if (!cid) { setLoading(false); return; }

    const { data: eventRows } = await supabase
      .from('community_events')
      .select('id, title, event_type, date, start_time, location, capacity, status, image_url')
      .eq('community_id', cid)
      .order('date', { ascending: true });

    setEvents((eventRows as EventRow[]) ?? []);

    const ids = (eventRows ?? []).map(e => e.id);
    if (ids.length > 0) {
      const { data: attendeeRows } = await supabase
        .from('community_event_attendees').select('event_id').in('event_id', ids).eq('status', 'going');
      const counts: Record<string, number> = {};
      for (const r of attendeeRows ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
      setAttendeeCounts(counts);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancelEvent = (event: EventRow) => {
    Alert.alert('Cancel this event?', event.title, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Event', style: 'destructive',
        onPress: async () => {
          await supabase.from('community_events').update({ status: 'cancelled' }).eq('id', event.id);
          setEvents(prev => prev.map(e => e.id === event.id ? { ...e, status: 'cancelled' } : e));
        },
      },
    ]);
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter(e => e.date >= today && e.status === 'active');
  const past = events.filter(e => e.date < today || e.status === 'cancelled');

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Events</ThemedText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/(community-tabs)/challenges' as any)}>
              <Ionicons name="trophy-outline" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/(community-tabs)/create-event' as any)}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color="#000" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {events.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <ThemedText style={styles.emptyText}>No events yet</ThemedText>
              <ThemedText style={styles.emptySub}>Create your first event to get people moving.</ThemedText>
            </View>
          )}

          {upcoming.length > 0 && (
            <>
              <ThemedText style={styles.sectionLabel}>Upcoming</ThemedText>
              {upcoming.map(e => (
                <View key={e.id} style={styles.eventCard}>
                  {e.image_url && <Image source={{ uri: e.image_url }} style={styles.eventThumb} />}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.eventTitle}>{e.title}</ThemedText>
                    <ThemedText style={styles.eventMeta}>{fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}</ThemedText>
                    <View style={styles.eventTagsRow}>
                      <View style={styles.eventTag}><ThemedText style={styles.eventTagText}>{TYPE_LABEL[e.event_type] ?? e.event_type}</ThemedText></View>
                      <ThemedText style={styles.attendeeCount}>
                        {attendeeCounts[e.id] ?? 0}{e.capacity ? `/${e.capacity}` : ''} going
                      </ThemedText>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => cancelEvent(e)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color="#d1d5db" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {past.length > 0 && (
            <>
              <ThemedText style={[styles.sectionLabel, { marginTop: 20 }]}>Past / Cancelled</ThemedText>
              {past.map(e => (
                <View key={e.id} style={[styles.eventCard, { opacity: 0.6 }]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.eventTitle}>{e.title}</ThemedText>
                    <ThemedText style={styles.eventMeta}>
                      {fmtDate(e.date)} · {fmtTime(e.start_time)} · {e.location}{e.status === 'cancelled' ? ' · Cancelled' : ''}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000' },
  createBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#000' },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f0f0f0',
    padding: 14, marginBottom: 10,
  },
  eventThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#f0f0f0' },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#000' },
  eventMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  eventTagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  eventTag: { backgroundColor: '#f0f5ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  eventTagText: { fontSize: 11, fontWeight: '700', color: '#1d3cb0' },
  attendeeCount: { fontSize: 12, fontWeight: '600', color: '#666' },
});
