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
  member_name: string;
  session_name: string;
  session_time: string;
  confirmed_at: string;
}

interface TodaySession {
  id: string;
  name: string;
  time: string;
}

const fmtTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function CheckinScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'code'>('scan');
  const [codeInput, setCodeInput] = useState('');
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
  const [todaySessions, setTodaySessions] = useState<TodaySession[]>([]);
  const [gymIds, setGymIds] = useState<string[]>([]);

  useFocusEffect(useCallback(() => { init(); }, []));

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let ids: string[] = [];

      // Primary: partners + partner_gyms join
      const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).single();
      if (partner) {
        const { data: pgs } = await supabase.from('partner_gyms').select('gym_id').eq('partner_id', partner.id);
        ids = (pgs || []).map((pg: any) => pg.gym_id);
      }

      // Fallback: gyms linked by contact_email (web-signup partners)
      if (ids.length === 0 && user.email) {
        const { data: gyms } = await supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '');
        ids = (gyms || []).map((g: any) => g.id);
      }

      if (!ids.length) return;
      setGymIds(ids);

      const today = new Date().toISOString().split('T')[0];

      // Today's sessions
      const { data: sessions } = await supabase
        .from('sessions').select('id, name, time')
        .in('gym_id', ids).eq('date', today).eq('is_active', true).order('time');
      setTodaySessions((sessions || []).map((s: any) => ({ id: s.id, name: s.name, time: s.time })));

      // Recent check-ins
      await loadRecentCheckins(ids);
    } catch {}
  };

  const loadRecentCheckins = async (ids?: string[]) => {
    const gIds = ids || gymIds;
    if (!gIds.length) return;
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('bookings')
      .select('id, check_in_time, users(name), sessions(name, time, gym_id)')
      .eq('status', 'checked_in')
      .eq('booking_date', today)
      .order('check_in_time', { ascending: false })
      .limit(20);

    setRecentCheckins(
      (data || [])
        .filter((b: any) => gIds.includes(b.sessions?.gym_id))
        .map((b: any) => ({
          id: b.id,
          member_name: b.users?.name || 'Member',
          session_name: b.sessions?.name || 'Session',
          session_time: b.sessions?.time || '',
          confirmed_at: b.check_in_time,
        }))
    );
  };

  const processCheckin = async (code: string, onDone: () => void) => {
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: booking, error } = await supabase
        .from('bookings')
        .select('id, status, remainder_amount, remainder_collected, users(name), sessions(name, gym_id)')
        .eq('confirmation_code', code)
        .single();

      if (error || !booking) {
        Alert.alert('Not found', 'No booking found for this code at your venues.', [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      if (!gymIds.includes((booking.sessions as any)?.gym_id)) {
        Alert.alert('Invalid', 'This booking is not for one of your venues.', [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      if (booking.status === 'checked_in' || booking.status === 'completed') {
        Alert.alert('Already checked in', `${(booking.users as any)?.name} is already present.`, [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      const cancelledStatuses = ['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'no_show', 'rescheduled'];
      if (cancelledStatuses.includes(booking.status)) {
        const label = booking.status.replace(/_/g, ' ');
        Alert.alert('Cannot check in', `This booking has been ${label}.`, [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      if (booking.status === 'pending_payment') {
        Alert.alert('Payment pending', 'Deposit payment has not been confirmed yet.', [
          { text: 'OK', onPress: onDone },
        ]);
        return;
      }

      const memberName = (booking.users as any)?.name || 'Member';
      const sessionName = (booking.sessions as any)?.name || 'Session';
      const remainder = Number(booking.remainder_amount ?? 0);
      const remainderCollected = booking.remainder_collected ?? false;

      const confirmCheckin = async () => {
        const now = new Date().toISOString();
        const { error: upErr } = await supabase
          .from('bookings')
          .update({
            status: 'checked_in',
            checked_in: true,
            check_in_time: now,
            ...(remainder > 0 && !remainderCollected
              ? { remainder_collected: true, remainder_collected_at: now }
              : {}),
          })
          .eq('id', booking.id);
        if (upErr) throw upErr;
        await loadRecentCheckins(gymIds);
        Alert.alert('✅ Checked in!', `${memberName}\n${sessionName}`, [{ text: 'Done', onPress: onDone }]);
      };

      if (remainder > 0 && !remainderCollected) {
        setProcessing(false);
        Alert.alert(
          'Collect Remainder',
          `${memberName}\n${sessionName}\n\nCollect KES ${remainder.toLocaleString()} from member before check-in.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: onDone },
            {
              text: `Collected KES ${remainder.toLocaleString()} ✓`,
              onPress: async () => {
                setProcessing(true);
                try { await confirmCheckin(); } catch (e: any) {
                  Alert.alert('Error', e.message || 'Check-in failed', [{ text: 'OK', onPress: onDone }]);
                } finally { setProcessing(false); }
              },
            },
          ]
        );
        return;
      }

      await confirmCheckin();
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
    // Handle acp:booking:{id}:{confirmationCode} format
    let code = data;
    if (data.startsWith('acp:booking:')) {
      const parts = data.split(':');
      code = parts[3] ?? data;
    } else {
      try { const parsed = JSON.parse(data); code = parsed.confirmationCode || parsed.confirmation_code || data; } catch { /* plain text code */ }
    }
    await processCheckin(code, () => setScanned(false));
  };

  const handleCodeSubmit = async () => {
    const code = codeInput.trim();
    if (!code) {
      Alert.alert('Enter a code', 'Please enter a booking confirmation code.');
      return;
    }
    await processCheckin(code, () => setCodeInput(''));
  };

  // ── Permission states ──
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
            <Ionicons name="qr-code-outline" size={56} color="#d1d5db" />
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
                <ThemedText style={styles.permSub}>We use your camera to scan QR codes to check customers in.</ThemedText>
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
      {/* Top section: Camera or Code entry */}
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
                {processing ? 'Processing…' : "Point at member's QR code"}
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
              placeholder="e.g. ABC123"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="characters"
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

      {/* Bottom content */}
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

        {/* Today's sessions */}
        {todaySessions.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Today's sessions</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sessionChips}>
              {todaySessions.map((s) => (
                <View key={s.id} style={styles.sessionChip}>
                  <ThemedText style={styles.sessionChipName}>{s.name}</ThemedText>
                  <ThemedText style={styles.sessionChipTime}>{fmtTime(s.time)}</ThemedText>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent check-ins */}
        <ThemedText style={[styles.sectionTitle, { marginTop: 20 }]}>
          Today's check-ins ({recentCheckins.length})
        </ThemedText>
        {recentCheckins.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="people-outline" size={28} color="#d1d5db" />
            <ThemedText style={styles.emptyText}>No check-ins yet today</ThemedText>
          </View>
        ) : (
          recentCheckins.map((c) => {
            const initials = c.member_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <View key={c.id} style={styles.checkinRow}>
                <View style={styles.checkinAvatar}>
                  <ThemedText style={styles.checkinInitials}>{initials}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.checkinName}>{c.member_name}</ThemedText>
                  <ThemedText style={styles.checkinSession}>{c.session_name} · {fmtTime(c.session_time)}</ThemedText>
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

  // Camera
  cameraWrap: { height: width * 0.95, backgroundColor: '#000' },
  cameraHeader: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  cameraActions: { flexDirection: 'row', gap: 8 },
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

  // Code entry mode
  codeWrap: { height: width * 0.95, backgroundColor: PRIMARY, paddingHorizontal: 20 },
  codePanel: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  codePanelTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 8 },
  codeInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 4, textAlign: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  codeSubmitBtn: { width: '100%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  codeSubmitText: { fontSize: 16, fontWeight: '700', color: PRIMARY },

  // Mode toggle
  modeToggle: { flexDirection: 'row', backgroundColor: PRIMARY + '15', borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeBtnActive: { backgroundColor: PRIMARY },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  modeBtnTextActive: { color: '#fff' },

  // Permission
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  permBox: { alignItems: 'center', padding: 32, gap: 12, maxWidth: 300 },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  permSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Bottom
  bottom: { flex: 1, backgroundColor: '#f5f5f7' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 },

  sessionChips: { flexDirection: 'row' },
  sessionChip: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, borderWidth: 1.5, borderColor: PRIMARY + '30' },
  sessionChipName: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  sessionChipTime: { fontSize: 11, color: '#6b7280', marginTop: 2 },

  manualBtn: { backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: PRIMARY + '25', marginBottom: 4 },
  manualBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: PRIMARY },

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
