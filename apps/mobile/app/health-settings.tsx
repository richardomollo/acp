import {
  StyleSheet, View, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  checkAppleHealthConnection, ensureHealthPermission, syncHealthData, getHealthSyncError,
} from '@/services/health';
import type { AppleHealthState } from '@/lib/connected-fitness';

// 'checking' is a screen-only loading state before the first reconcile.
type ScreenState = 'checking' | AppleHealthState;

export default function HealthSettingsScreen() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>('checking');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  // Reconcile against real iOS/HealthKit state every time the screen is
  // focused (first open, returning from the permission sheet, coming back
  // after changing permissions in iOS Settings). Never trust ephemeral state.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Re-derive from real iOS state, but never stomp an in-flight request
      // or drop a known state back to a spinner on re-focus.
      checkAppleHealthConnection().then(next => {
        if (active) setState(prev => (prev === 'connecting' ? prev : next));
      });
      return () => { active = false; };
    }, []),
  );

  const handleConnect = async () => {
    setState('connecting');
    setErrorDetail(null);
    const result = await ensureHealthPermission();
    setState(result);
    if (result === 'error') {
      setErrorDetail(getHealthSyncError());
      return;
    }
    if (result === 'connected') {
      // Pull whatever the user allowed, in the background. Sync success or
      // failure no longer decides connection state — a connected user with
      // no data yet is still connected.
      syncHealthData().catch(() => {});
    }
  };

  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';
  const isUnavailable = state === 'unavailable';
  const isError = state === 'error';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <LinearGradient
          colors={[palette.blue100, 'rgba(208,224,255,0)']}
          style={s.topFadeBg}
          pointerEvents="none"
        />
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Apple Health</ThemedText>
          </View>
        </SafeAreaView>

        <View style={s.content}>
          <View style={[s.iconWrap, isConnected && s.iconWrapConnected]}>
            <Ionicons
              name={isConnected ? 'checkmark-circle' : 'heart'}
              size={40}
              color={isConnected ? palette.success700 : '#ff6b6b'}
            />
          </View>

          {state === 'checking' ? (
            <ActivityIndicator size="small" color={palette.blue500} style={{ marginTop: 12 }} />
          ) : isConnected ? (
            <>
              <ThemedText style={s.title}>Apple Health connected</ThemedText>
              <ThemedText style={s.desc}>
                Lana can use the Apple Health data you chose to share — activity and
                workouts you record show up in your trends, and count towards
                activities in your plan. Change what you share anytime in
                Settings › Health › Data Access &amp; Devices › Lana Health.
              </ThemedText>
              <View style={s.statusPill}>
                <Ionicons name="checkmark" size={15} color={palette.success700} />
                <ThemedText style={s.statusPillText}>Connected</ThemedText>
              </View>
            </>
          ) : isUnavailable ? (
            <>
              <ThemedText style={s.title}>Apple Health</ThemedText>
              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={18} color={palette.gray450} />
                <ThemedText style={s.noticeText}>
                  {errorDetail ?? "Apple Health isn't available on this device."}
                </ThemedText>
              </View>
            </>
          ) : (
            <>
              <ThemedText style={s.title}>Connect Apple Health</ThemedText>
              <ThemedText style={s.desc}>
                With your permission, Lana Health reads activity and workout data
                from Apple Health — steps, energy, heart rate, workouts and body
                measurements. You choose exactly what to share in Apple&apos;s permission
                screen. Lana uses it to show your trends and to recognise activity
                you&apos;ve completed.
              </ThemedText>

              <TouchableOpacity
                style={[s.connectBtn, isConnecting && s.connectBtnDisabled]}
                onPress={handleConnect}
                disabled={isConnecting}
                activeOpacity={0.85}
              >
                {isConnecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={s.connectBtnText}>
                    {isError ? 'Try again' : 'Connect Apple Health'}
                  </ThemedText>
                )}
              </TouchableOpacity>

              {isError ? (
                <ThemedText style={s.errorText}>
                  {errorDetail ?? "We couldn't connect Apple Health. Please try again."}
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
  root: { flex: 1, backgroundColor: palette.surfaceApp },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
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
  iconWrapConnected: { backgroundColor: palette.success50 },
  title: { fontSize: 22, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.success50, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  statusPillText: { fontSize: 13.5, fontWeight: '700', color: palette.success700 },

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
