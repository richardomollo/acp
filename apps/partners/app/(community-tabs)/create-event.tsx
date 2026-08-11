import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet, TouchableOpacity, View, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import DatePickerModal from '@/components/DatePickerModal';
import * as ImagePicker from 'expo-image-picker';

async function uploadEventImage(base64: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `community-events/temp/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

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

const EVENT_TYPES = [
  { key: 'free', label: 'Free', icon: 'heart-outline' },
  { key: 'paid', label: 'Paid', icon: 'cash-outline' },
  { key: 'partner_session', label: 'Partner Session', icon: 'business-outline' },
  { key: 'external', label: 'External', icon: 'link-outline' },
] as const;

const ACTIVITY_TYPES = [
  'running', 'walking', 'cycling', 'strength', 'boxing', 'yoga',
  'pilates', 'hiking', 'dance', 'outdoor_fitness', 'football', 'other',
] as const;

interface LinkedSession {
  id: string; name: string; date: string; time: string; gym_id: string; gym_name: string;
}

export default function CreateCommunityEventScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const isEditMode = !!eventId;
  const [loadingEvent, setLoadingEvent] = useState(isEditMode);
  const [communityId, setCommunityId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<typeof EVENT_TYPES[number]['key']>('free');
  const [activityType, setActivityType] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [priceKes, setPriceKes] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [distanceKm, setDistanceKm] = useState('');

  const [linkedSessions, setLinkedSessions] = useState<LinkedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<LinkedSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, base64: true, allowsEditing: true, aspect: [16, 9],
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploadingImage(true);
    const url = await uploadEventImage(result.assets[0].base64, result.assets[0].uri);
    if (url) setImageUrl(url);
    setUploadingImage(false);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from('community_members').select('community_id')
        .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      setCommunityId(membership?.community_id ?? null);

      if (eventId) {
        const { data: event } = await supabase
          .from('community_events')
          .select('*')
          .eq('id', eventId)
          .single();
        if (event) {
          setTitle(event.title ?? '');
          setDescription(event.description ?? '');
          setEventType(event.event_type);
          setActivityType(event.activity_type);
          setDate(event.date ?? '');
          setTime((event.start_time ?? '').slice(0, 5));
          setLocation(event.location ?? '');
          setCapacity(event.capacity != null ? String(event.capacity) : '');
          setPriceKes(event.price_kes != null ? String(event.price_kes) : '');
          setExternalUrl(event.external_url ?? '');
          setDistanceKm(event.distance_km != null ? String(event.distance_km) : '');
          setImageUrl(event.image_url ?? null);

          if (event.event_type === 'partner_session' && event.session_id) {
            const { data: session } = await supabase
              .from('sessions').select('id, name, date, time, gym_id, gyms(name)')
              .eq('id', event.session_id).maybeSingle();
            if (session) {
              setSelectedSession({
                id: session.id, name: session.name, date: session.date, time: session.time,
                gym_id: session.gym_id, gym_name: (session as any).gyms?.name ?? 'Venue',
              });
            }
            loadLinkedSessions();
          }
        }
        setLoadingEvent(false);
      }
    })();
  }, []);

  // partner_session: only show sessions at gyms this same account owns —
  // organisers who are also venue partners can link their real classes.
  const loadLinkedSessions = async () => {
    setLoadingSessions(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingSessions(false); return; }

    const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).maybeSingle();
    if (!partner) { setLinkedSessions([]); setLoadingSessions(false); return; }

    const { data: gymLinks } = await supabase.from('partner_gyms').select('gym_id').eq('partner_id', partner.id);
    const gymIds = (gymLinks ?? []).map(g => g.gym_id);
    if (gymIds.length === 0) { setLinkedSessions([]); setLoadingSessions(false); return; }

    const today = new Date().toISOString().slice(0, 10);
    const { data: sessions } = await supabase
      .from('sessions').select('id, name, date, time, gym_id, gyms(name)')
      .in('gym_id', gymIds).gte('date', today).order('date', { ascending: true }).limit(30);

    setLinkedSessions((sessions ?? []).map((s: any) => ({
      id: s.id, name: s.name, date: s.date, time: s.time, gym_id: s.gym_id, gym_name: s.gyms?.name ?? 'Venue',
    })));
    setLoadingSessions(false);
  };

  const selectEventType = (key: typeof EVENT_TYPES[number]['key']) => {
    setEventType(key);
    if (key === 'partner_session' && linkedSessions.length === 0) loadLinkedSessions();
  };

  const applySelectedSession = (s: LinkedSession) => {
    setSelectedSession(s);
    setLocation(s.gym_name);
    setDate(s.date);
    setTime(s.time.slice(0, 5));
    if (!title.trim()) setTitle(s.name);
  };

  const handleSave = async () => {
    if (!communityId) return;
    if (!title.trim()) { Alert.alert('Missing title', 'Give the event a title.'); return; }
    if (!date || !time) { Alert.alert('Missing date/time', 'Pick a date and start time.'); return; }
    if (eventType !== 'external' && !location.trim()) { Alert.alert('Missing location', 'Where is this happening?'); return; }
    if (eventType === 'partner_session' && !selectedSession) { Alert.alert('Pick a session', 'Select which of your venue\'s sessions this links to.'); return; }
    if (eventType === 'paid' && (!priceKes || Number(priceKes) <= 0)) { Alert.alert('Missing price', 'Set a price in KES for a paid event.'); return; }
    if (eventType === 'external' && !externalUrl.trim()) { Alert.alert('Missing link', 'Add the external registration link.'); return; }

    setSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_type: eventType,
      activity_type: activityType,
      date,
      start_time: `${time}:00`,
      location: eventType === 'external' ? (location.trim() || 'Online') : location.trim(),
      capacity: capacity ? Number(capacity) : null,
      price_kes: eventType === 'paid' ? Number(priceKes) : null,
      external_url: eventType === 'external' ? externalUrl.trim() : null,
      distance_km: distanceKm ? Number(distanceKm) : null,
      gym_id: eventType === 'partner_session' ? selectedSession!.gym_id : null,
      session_id: eventType === 'partner_session' ? selectedSession!.id : null,
      image_url: imageUrl,
    };

    const { error } = isEditMode
      ? await supabase.from('community_events').update(payload).eq('id', eventId)
      : await supabase.from('community_events').insert({
          ...payload,
          community_id: communityId,
          organiser_user_id: (await supabase.auth.getUser()).data.user?.id,
        });

    setSaving(false);
    if (error) { Alert.alert(isEditMode ? 'Could not update event' : 'Could not create event', error.message); return; }
    router.back();
  };

  if (loadingEvent) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#000" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{isEditMode ? 'Edit Event' : 'Create Event'}</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Event type</ThemedText>
          <View style={styles.chipRow}>
            {EVENT_TYPES.map(t => (
              <TouchableOpacity key={t.key} style={[styles.chip, eventType === t.key && styles.chipActive]} onPress={() => selectEventType(t.key)}>
                <Ionicons name={t.icon as any} size={14} color={eventType === t.key ? '#fff' : '#444'} />
                <ThemedText style={[styles.chipText, eventType === t.key && styles.chipTextActive]}>{t.label}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {eventType === 'partner_session' && (
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Link to your venue's session</ThemedText>
            {loadingSessions ? (
              <ActivityIndicator color="#000" style={{ marginVertical: 12 }} />
            ) : linkedSessions.length === 0 ? (
              <ThemedText style={styles.helperText}>
                No upcoming sessions found under a venue you own. Partner-linked events require a venue partner account with sessions scheduled.
              </ThemedText>
            ) : (
              linkedSessions.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.sessionRow, selectedSession?.id === s.id && styles.sessionRowActive]}
                  onPress={() => applySelectedSession(s)}
                >
                  <Ionicons name={selectedSession?.id === s.id ? 'radio-button-on' : 'radio-button-off'} size={18} color="#000" />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.sessionName}>{s.name}</ThemedText>
                    <ThemedText style={styles.sessionMeta}>{s.gym_name} · {s.date} · {s.time.slice(0, 5)}</ThemedText>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Event image (optional)</ThemedText>
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={uploadingImage}>
            {uploadingImage ? (
              <ActivityIndicator color="#000" />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
            ) : (
              <>
                <Ionicons name="image-outline" size={24} color="#666" />
                <ThemedText style={styles.imagePickerText}>Add a photo</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Title</ThemedText>
          <TextInput style={styles.input} placeholder="e.g. Wednesday Social Run" placeholderTextColor="#999" value={title} onChangeText={setTitle} />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Activity</ThemedText>
          <View style={styles.chipRow}>
            {ACTIVITY_TYPES.map(a => (
              <TouchableOpacity key={a} style={[styles.chip, activityType === a && styles.chipActive]} onPress={() => setActivityType(a)}>
                <ThemedText style={[styles.chipText, activityType === a && styles.chipTextActive]}>{a.replace('_', ' ')}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.inputLabel}>Date</ThemedText>
            <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
              <ThemedText style={{ color: date ? '#000' : '#999' }}>{date || 'Select date'}</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.inputLabel}>Start time</ThemedText>
            <TextInput style={styles.input} placeholder="18:30" placeholderTextColor="#999" value={time} onChangeText={setTime} />
          </View>
        </View>

        {eventType !== 'partner_session' && (
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>{eventType === 'external' ? 'Location (optional)' : 'Location'}</ThemedText>
            <TextInput style={styles.input} placeholder="e.g. Karura Forest" placeholderTextColor="#999" value={location} onChangeText={setLocation} />
          </View>
        )}

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.inputLabel}>Capacity (optional)</ThemedText>
            <TextInput style={styles.input} placeholder="50" placeholderTextColor="#999" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.inputLabel}>Distance km (optional)</ThemedText>
            <TextInput style={styles.input} placeholder="5" placeholderTextColor="#999" value={distanceKm} onChangeText={setDistanceKm} keyboardType="decimal-pad" />
          </View>
        </View>

        {eventType === 'paid' && (
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Price (KES)</ThemedText>
            <TextInput style={styles.input} placeholder="1500" placeholderTextColor="#999" value={priceKes} onChangeText={setPriceKes} keyboardType="decimal-pad" />
          </View>
        )}

        {eventType === 'external' && (
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Registration link</ThemedText>
            <TextInput style={styles.input} placeholder="https://…" placeholderTextColor="#999" value={externalUrl} onChangeText={setExternalUrl} autoCapitalize="none" />
          </View>
        )}

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Description</ThemedText>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What should people know before showing up?"
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitBtnText}>{isEditMode ? 'Save Changes' : 'Create Event'}</ThemedText>}
        </TouchableOpacity>
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        value={date ? new Date(`${date}T00:00:00`) : new Date()}
        minimumDate={new Date()}
        onConfirm={(d: Date) => { setDate(d.toISOString().slice(0, 10)); setShowDatePicker(false); }}
        onCancel={() => setShowDatePicker(false)}
      />
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
  row: { flexDirection: 'row', gap: 12 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 8 },
  input: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, fontSize: 15, color: '#000',
    borderWidth: 1, borderColor: '#e0e0e0', justifyContent: 'center',
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  helperText: { fontSize: 13, color: '#888', lineHeight: 19 },
  imagePicker: {
    height: 120, borderRadius: 12, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePickerText: { fontSize: 12, color: '#666', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#444', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 8,
  },
  sessionRowActive: { borderColor: '#000', backgroundColor: '#f9fafb' },
  sessionName: { fontSize: 14, fontWeight: '700', color: '#000' },
  sessionMeta: { fontSize: 12, color: '#888', marginTop: 1 },
  submitBtn: { backgroundColor: '#000', paddingVertical: 18, borderRadius: 25, alignItems: 'center', marginTop: 12 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
