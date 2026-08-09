import {
  StyleSheet, View, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ensureHealthPermission, syncHealthData, getHealthSyncError } from '@/services/health';

export default function HealthSettingsScreen() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'synced' | 'error'>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setStatus('idle');
    setErrorDetail(null);
    const granted = await ensureHealthPermission();
    if (!granted) {
      setConnecting(false);
      setStatus('error');
      setErrorDetail(getHealthSyncError());
      return;
    }
    const synced = await syncHealthData();
    setConnecting(false);
    setStatus(synced ? 'synced' : 'error');
    if (!synced) setErrorDetail(getHealthSyncError());
    if (synced) {
      setTimeout(() => router.back(), 900);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Apple Health</ThemedText>
          </View>
        </SafeAreaView>

        <View style={s.content}>
          <View style={s.iconWrap}>
            <Ionicons name="heart" size={40} color="#ff6b6b" />
          </View>
          <ThemedText style={s.title}>Connect Apple Health</ThemedText>
          <ThemedText style={s.desc}>
            Active City Pass reads your steps, active and resting energy, heart rate,
            workouts, and body measurements (weight, height, body fat, waist) from Apple
            Health to show them in your Analytics page. This data stays private to your account.
          </ThemedText>

          {Platform.OS !== 'ios' ? (
            <View style={s.notice}>
              <Ionicons name="information-circle-outline" size={18} color={palette.gray450} />
              <ThemedText style={s.noticeText}>Apple Health is only available on iOS.</ThemedText>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[s.connectBtn, connecting && s.connectBtnDisabled]}
                onPress={handleConnect}
                disabled={connecting}
                activeOpacity={0.85}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={s.connectBtnText}>
                    {status === 'synced' ? 'Connected ✓' : 'Connect Apple Health'}
                  </ThemedText>
                )}
              </TouchableOpacity>
              {status === 'error' ? (
                <ThemedText style={s.errorText}>
                  {errorDetail ?? "Couldn't connect right now. Make sure Health access is available on this device and try again."}
                </ThemedText>
              ) : null}
            </>
          )}
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },

  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#ffe5e5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 32 },

  connectBtn: {
    alignSelf: 'stretch', backgroundColor: palette.ink900,
    borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center',
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  errorText: { fontSize: 12.5, color: palette.danger500, textAlign: 'center', marginTop: 12 },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 13, color: palette.gray450 },
});
