import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';
const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.68;

interface RecentCheckin {
  id: string;
  client_name: string;
  offering_name: string;
  scheduled_time: string;
  check_in_time: string;
}

const fmtTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function PTCheckInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'code'>('scan');
  const [codeInput, setCodeInput] = useState('');
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
  const [ptId, setPtId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { init(); }, []));

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pt } = await supabase
        .from('personal_trainers').select('id').eq('user_id', user.id).single();
      if (!pt) return;

      setPtId(pt.id);
      await loadRecentCheckins(pt.id);
    } catch {}
  };

  const loadRecentCheckins = async (id?: string) => {
    const pid = id || ptId;
    if (!pid) return;
    const today = new Date().toISOString().split('T')[0];

    const base = supabase
      .from('pt_bookings')
      .eq('pt_id', pid)
      .eq('scheduled_date', today)
      .order('check_in_time', { ascending: false })
      .limit(20);

    // Try with check_in columns; fall back to status filter if migration not applied
    let res = await base.select('id, check_in_time, scheduled_time, users(name, email), pt_offerings(title)').eq('checked_in', true);
    if (res.error) {
      res = await supabase
        .from('pt_bookings')
        .select('id, scheduled_time, users(name, email), pt_offerings(title)')
        .eq('pt_id', pid)
        .eq('scheduled_date', today)
        .eq('status', 'completed')
        .order('scheduled_time', { ascending: false })
        .limit(20);
    }

    setRecentCheckins(
      (res.data || []).map((b: any) => ({
        id: b.id,
        client_name: b.users?.name || b.users?.email || 'Client',
        offering_name: b.pt_offerings?.title || 'Session',
        scheduled_time: b.scheduled_time || '',
        check_in_time: b.check_in_time || '',
      }))
    );
  };

  const processCheckin = async (code: string, onDone: () => void) => {
    setProcessing(true);
    try {
      const pid = ptId;
      if (!pid) throw new Error('Not authenticated');

      // Try with check-in columns first, fall back if migration not applied
      const fullCols = 'id, status, checked_in, confirmation_code, users(name, email), pt_offerings(title)';
      const basicCols = 'id, status, confirmation_code, users(name, email), pt_offerings(title)';

      let res = await supabase
        .from('pt_bookings')
        .select(fullCols)
        .eq('confirmation_code', code)
        .eq('pt_id', pid)
        .maybeSingle();

      if (res.error) {
        res = await supabase
          .from('pt_bookings')
          .select(basicCols)
          .eq('confirmation_code', code)
          .eq('pt_id', pid)
          .maybeSingle();
      }

      const booking = res.data;

      if (!booking) {
        Alert.alert('Not found', 'No booking found for this code.', [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      const clientName = (booking as any).users?.name || (booking as any).users?.email || 'Client';
      const offeringName = (booking as any).pt_offerings?.title || 'Session';

      if ((booking as any).checked_in || booking.status === 'completed') {
        Alert.alert('Already checked in', `${clientName} is already present.`, [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      if (booking.status === 'cancelled' || booking.status === 'no_show') {
        Alert.alert('Invalid booking', `This booking has status: ${booking.status}.`, [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      const { error: upErr } = await supabase
        .from('pt_bookings')
        .update({
          checked_in: true,
          check_in_time: new Date().toISOString(),
          status: 'completed',
        })
        .eq('id', booking.id);

      if (upErr) throw upErr;

      await loadRecentCheckins();
      Alert.alert('✅ Checked in!', `${clientName}\n${offeringName}`, [
        { text: 'Done', onPress: onDone },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Check-in failed', [
        { text: 'OK', onPress: onDone },
      ]);
    } finally {
      setProcessing(false);
    }
  };

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    let code = data;
    if (data.startsWith('acp:booking:') || data.startsWith('acp:ptbooking:')) {
      const parts = data.split(':');
      code = parts[3] ?? data;
    } else {
      try {
        const parsed = JSON.parse(data);
        code = parsed.confirmationCode || parsed.confirmation_code || data;
      } catch { /* plain text code */ }
    }
    await processCheckin(code, () => setScanned(false));
  };

  const handleCodeSubmit = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Enter a code', 'Please enter the client\'s confirmation code.');
      return;
    }
    await processCheckin(code, () => setCodeInput(''));
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  }

  if (!permission.granted) {
    const permanentlyDenied = !permission.canAskAgain;
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <ThemedText style={styles.headerTitle}>Check-in</ThemedText>
        </SafeAreaView>
        <View style={styles.center}>
          <View style={styles.permBox}>
            <Ionicons name="camera-outline" size={56} color="#d1d5db" />
            {permanentlyDenied ? (
              <>
                <ThemedText style={styles.permTitle}>Camera Access</ThemedText>
                <ThemedText style={styles.permSub}>Camera access is disabled. You can enable it in Settings.</ThemedText>
                <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
                  <ThemedText style={styles.permBtnText}>Open Settings</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ThemedText style={styles.permTitle}>Camera Access</ThemedText>
                <ThemedText style={styles.permSub}>We use your camera to scan client QR codes for check-in.</ThemedText>
                <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                  <ThemedText style={styles.permBtnText}>Continue</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
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
            <ThemedText style={styles.cameraTitle}>Check-in</ThemedText>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setTorchOn(!torchOn)}>
              <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={22} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.scanFrame}>
            <View style={styles.scanBox}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              {processing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.scanHint}>
              <ThemedText style={styles.scanHintText}>
                {processing ? 'Processing…' : "Point at client's QR code"}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.codeWrap}>
          <SafeAreaView edges={['top']}>
            <ThemedText style={styles.cameraTitle}>Check-in</ThemedText>
          </SafeAreaView>
          <View style={styles.codePanel}>
            <Ionicons name="keypad-outline" size={40} color="rgba(255,255,255,0.6)" />
            <ThemedText style={styles.codePanelTitle}>Enter Confirmation Code</ThemedText>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={setCodeInput}
              placeholder="e.g. 482916"
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="number-pad"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleCodeSubmit}
              editable={!processing}
            />
            <TouchableOpacity
              style={[styles.codeSubmitBtn, processing && { opacity: 0.6 }]}
              onPress={handleCodeSubmit}
              disabled={processing}
            >
              {processing
                ? <ActivityIndicator color={PRIMARY} />
                : <ThemedText style={styles.codeSubmitText}>Check In</ThemedText>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.bottom} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}
            onPress={() => setMode('scan')}
          >
            <Ionicons name="qr-code-outline" size={16} color={mode === 'scan' ? '#fff' : PRIMARY} />
            <ThemedText style={[styles.modeBtnText, mode === 'scan' && styles.modeBtnTextActive]}>
              Scan QR
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'code' && styles.modeBtnActive]}
            onPress={() => setMode('code')}
          >
            <Ionicons name="keypad-outline" size={16} color={mode === 'code' ? '#fff' : PRIMARY} />
            <ThemedText style={[styles.modeBtnText, mode === 'code' && styles.modeBtnTextActive]}>
              Enter Code
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Recent check-ins */}
        <ThemedText style={[styles.sectionTitle, { marginTop: 4 }]}>
          Today's check-ins ({recentCheckins.length})
        </ThemedText>
        {recentCheckins.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="people-outline" size={28} color="#d1d5db" />
            <ThemedText style={styles.emptyText}>No check-ins yet today</ThemedText>
          </View>
        ) : (
          recentCheckins.map((c) => {
            const initials = c.client_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <View key={c.id} style={styles.checkinRow}>
                <View style={styles.checkinAvatar}>
                  <ThemedText style={styles.checkinInitials}>{initials}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.checkinName}>{c.client_name}</ThemedText>
                  <ThemedText style={styles.checkinSession}>
                    {c.offering_name} · {fmtTime(c.scheduled_time)}
                  </ThemedText>
                </View>
                <View style={styles.presentBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <ThemedText style={styles.presentText}>Present</ThemedText>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const CORNER = 20;
const BORDER = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f7' },

  cameraWrap: { height: width * 0.95, backgroundColor: '#000' },
  cameraHeader: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  cameraBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  scanFrame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: SCAN_SIZE, height: SCAN_SIZE, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff' },
  tl: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  scanHint: { marginTop: 16 },
  scanHintText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },

  codeWrap: { height: width * 0.95, backgroundColor: PRIMARY, paddingHorizontal: 20 },
  codePanel: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  codePanelTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 8 },
  codeInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 4, textAlign: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  codeSubmitBtn: { width: '100%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  codeSubmitText: { fontSize: 16, fontWeight: '700', color: PRIMARY },

  modeToggle: { flexDirection: 'row', backgroundColor: PRIMARY + '15', borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnActive: { backgroundColor: PRIMARY },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  modeBtnTextActive: { color: '#fff' },

  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  permBox: { alignItems: 'center', padding: 32, gap: 12, maxWidth: 300 },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  permSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  bottom: { flex: 1, backgroundColor: '#f5f5f7' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  checkinRow: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  checkinAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  checkinInitials: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  checkinName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  checkinSession: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  presentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  presentText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
});
