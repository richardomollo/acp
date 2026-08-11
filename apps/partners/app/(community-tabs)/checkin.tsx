import {
  StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, Linking, Dimensions,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.68;

interface RecentCheckin {
  id: string; name: string; event_title: string; confirmed_at: string; hasStrava: boolean;
}

export default function CommunityCheckinScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'code'>('scan');
  const [codeInput, setCodeInput] = useState('');
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [recent, setRecent] = useState<RecentCheckin[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { init(); }, []));

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: membership } = await supabase
      .from('community_members').select('community_id')
      .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const cid = membership?.community_id ?? null;
    setCommunityId(cid);
    if (cid) await loadRecent(cid);
  };

  const loadRecent = async (cid: string) => {
    const { data: eventIds } = await supabase.from('community_events').select('id').eq('community_id', cid);
    const ids = (eventIds ?? []).map(e => e.id);
    if (ids.length === 0) return;
    const { data } = await supabase
      .from('community_event_attendees')
      .select('id, check_in_time, user_id, activity_id, community_events(title)')
      .in('event_id', ids).eq('checked_in', true)
      .order('check_in_time', { ascending: false }).limit(20);

    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    const { data: userRows } = userIds.length > 0
      ? await supabase.from('users').select('id, name, email').in('id', userIds)
      : { data: [] };
    const nameById: Record<string, string> = {};
    for (const u of userRows ?? []) nameById[u.id] = u.name ?? u.email ?? 'Member';

    setRecent((data ?? []).map((r: any) => ({
      id: r.id, name: nameById[r.user_id] ?? 'Member',
      event_title: r.community_events?.title ?? 'Event', confirmed_at: r.check_in_time,
      hasStrava: !!r.activity_id,
    })));
  };

  const processCheckin = async (code: string, onDone: () => void) => {
    if (!communityId) { onDone(); return; }
    setProcessing(true);
    try {
      const { data: eventIds } = await supabase.from('community_events').select('id').eq('community_id', communityId);
      const ids = (eventIds ?? []).map(e => e.id);

      const { data: attendee, error } = await supabase
        .from('community_event_attendees')
        .select('id, event_id, status, checked_in, deposit_paid_at, user_id, community_events(title, event_type)')
        .eq('confirmation_code', code.trim().toUpperCase())
        .in('event_id', ids)
        .maybeSingle();

      if (error || !attendee) {
        Alert.alert('Not found', 'No RSVP found for this code at one of your events.');
        return;
      }
      if (attendee.checked_in) {
        Alert.alert('Already checked in', 'This attendee has already been checked in.');
        return;
      }
      if (attendee.status === 'cancelled') {
        Alert.alert('Cancelled', 'This RSVP was cancelled.');
        return;
      }
      const eventInfo = attendee.community_events as any;
      if (eventInfo?.event_type === 'paid' && !attendee.deposit_paid_at) {
        Alert.alert('Payment pending', 'This attendee has not completed payment yet.');
        return;
      }

      const { data: userRow } = await supabase.from('users').select('name, email').eq('id', attendee.user_id).single();

      const { error: updateErr } = await supabase
        .from('community_event_attendees')
        .update({ checked_in: true, check_in_time: new Date().toISOString() })
        .eq('id', attendee.id);

      if (updateErr) {
        Alert.alert('Error', updateErr.message);
        return;
      }

      Alert.alert('Checked in ✓', `${userRow?.name ?? userRow?.email ?? 'Attendee'} — ${eventInfo?.title ?? 'Event'}`);
      await loadRecent(communityId);
    } finally {
      setProcessing(false);
      onDone();
    }
  };

  const handleScan = ({ data }: { data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    // QR payload format: acp:community-event:{attendeeId}:{code}
    const parts = data.split(':');
    const code = parts.length >= 4 ? parts[3] : data;
    processCheckin(code, () => setTimeout(() => setScanned(false), 1500));
  };

  const handleCodeSubmit = () => {
    if (!codeInput.trim() || processing) return;
    processCheckin(codeInput, () => setCodeInput(''));
  };

  if (!permission) return <View style={styles.root} />;

  if (mode === 'scan' && !permission.granted) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <ThemedText style={styles.headerTitle}>Check-in</ThemedText>
        </SafeAreaView>
        <View style={styles.permWrap}>
          <Ionicons name="camera-outline" size={40} color="#9ca3af" />
          <ThemedText style={styles.permTitle}>Camera Access</ThemedText>
          <ThemedText style={styles.permSub}>
            {permission.canAskAgain ? 'We use your camera to scan attendee QR codes.' : 'Camera access is disabled. Enable it in Settings.'}
          </ThemedText>
          <TouchableOpacity style={styles.permBtn} onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}>
            <ThemedText style={styles.permBtnText}>{permission.canAskAgain ? 'Continue' : 'Open Settings'}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('code')} style={{ marginTop: 16 }}>
            <ThemedText style={{ color: '#002fff', fontWeight: '600' }}>Enter code manually instead</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'scan' ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleScan}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            enableTorch={torchOn}
          />
          <SafeAreaView edges={['top']} style={styles.cameraHeader}>
            <ThemedText style={styles.cameraTitle}>Event Check-in</ThemedText>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setTorchOn(!torchOn)}>
              <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={22} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.scanFrame}>
            <View style={styles.scanBox}>
              {processing && <View style={styles.processingOverlay}><ActivityIndicator size="large" color="#fff" /></View>}
            </View>
            <ThemedText style={styles.scanHintText}>{processing ? 'Processing…' : "Point at attendee's QR code"}</ThemedText>
          </View>
        </View>
      ) : (
        <View style={styles.codeWrap}>
          <SafeAreaView edges={['top']}><ThemedText style={styles.cameraTitleDark}>Event Check-in</ThemedText></SafeAreaView>
          <View style={styles.codePanel}>
            <Ionicons name="keypad-outline" size={40} color="rgba(0,0,0,0.4)" />
            <ThemedText style={styles.codePanelTitle}>Enter Confirmation Code</ThemedText>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={setCodeInput}
              placeholder="e.g. ABC123"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleCodeSubmit}
              editable={!processing}
            />
            <TouchableOpacity style={[styles.codeSubmitBtn, processing && { opacity: 0.6 }]} onPress={handleCodeSubmit} disabled={processing}>
              {processing ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.codeSubmitText}>Check In</ThemedText>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]} onPress={() => setMode('scan')}>
          <Ionicons name="qr-code-outline" size={16} color={mode === 'scan' ? '#fff' : '#444'} />
          <ThemedText style={[styles.modeBtnText, mode === 'scan' && styles.modeBtnTextActive]}>Scan</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'code' && styles.modeBtnActive]} onPress={() => setMode('code')}>
          <Ionicons name="keypad-outline" size={16} color={mode === 'code' ? '#fff' : '#444'} />
          <ThemedText style={[styles.modeBtnText, mode === 'code' && styles.modeBtnTextActive]}>Code</ThemedText>
        </TouchableOpacity>
      </View>

      {recent.length > 0 && (
        <ScrollView style={styles.recentList} contentContainerStyle={{ padding: 16 }}>
          <ThemedText style={styles.recentLabel}>Recently checked in</ThemedText>
          {recent.map(r => (
            <View key={r.id} style={styles.recentRow}>
              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
              <ThemedText style={styles.recentName}>{r.name}</ThemedText>
              {r.hasStrava && <Ionicons name="walk-outline" size={13} color="#FC4C02" />}
              <ThemedText style={styles.recentEvent}>{r.event_title}</ThemedText>
            </View>
          ))}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#000', paddingTop: 8 },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permTitle: { fontSize: 17, fontWeight: '700', color: '#000', marginTop: 12, marginBottom: 6 },
  permSub: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  permBtnText: { color: '#fff', fontWeight: '700' },
  cameraWrap: { height: '55%', backgroundColor: '#000' },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  cameraTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cameraTitleDark: { color: '#000', fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 10 },
  cameraBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  scanFrame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: SCAN_SIZE, height: SCAN_SIZE, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 20 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  scanHintText: { color: '#fff', fontSize: 13, marginTop: 16 },
  codeWrap: { height: '55%', backgroundColor: '#f9fafb', paddingTop: 10 },
  codePanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  codePanelTitle: { fontSize: 15, fontWeight: '700', color: '#000', marginTop: 10, marginBottom: 16 },
  codeInput: {
    width: '100%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12,
    padding: 16, fontSize: 20, fontWeight: '700', color: '#000', textAlign: 'center', letterSpacing: 3, marginBottom: 16,
  },
  codeSubmitBtn: { backgroundColor: '#000', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24, minWidth: 140, alignItems: 'center' },
  codeSubmitText: { color: '#fff', fontWeight: '700' },
  bottomBar: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e0e0e0' },
  modeBtnActive: { backgroundColor: '#000', borderColor: '#000' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#444' },
  modeBtnTextActive: { color: '#fff' },
  recentList: { flex: 1 },
  recentLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  recentName: { fontSize: 13, fontWeight: '700', color: '#000' },
  recentEvent: { fontSize: 12, color: '#888', marginLeft: 'auto' },
});
