import {
  StyleSheet, View, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  connectStrava, getStravaStatus, syncStravaNow, disconnectStrava, type StravaStatus,
} from '@/services/strava';

const STRAVA_ORANGE = '#FC4C02';

// One shared connect/disconnect screen used from both the gym-partner and
// personal-trainer profile screens — a Strava connection is per-user, not
// per-role, so there's no need for two copies of this.
export default function StravaSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StravaStatus>({ connected: false });
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getStravaStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    const result = await connectStrava();
    setConnecting(false);
    if (result === 'connected') {
      await load();
    } else if (result === 'denied') {
      setError('Strava connection was cancelled — no data was imported.');
    } else if (result !== 'cancelled') {
      setError("Couldn't connect to Strava right now. Please try again.");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncStravaNow();
      await load();
    } catch {
      setError("Couldn't sync right now. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    const ok = await disconnectStrava();
    setDisconnecting(false);
    if (ok) {
      await load();
    } else {
      setError("Couldn't disconnect right now. Please try again.");
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
            <ThemedText style={s.headerTitle}>Strava</ThemedText>
          </View>
        </SafeAreaView>

        {loading ? (
          <View style={s.centerFill}>
            <ActivityIndicator size="large" color={palette.blue500} />
          </View>
        ) : (
          <View style={s.content}>
            <View style={s.iconWrap}>
              <Ionicons name="walk" size={40} color={STRAVA_ORANGE} />
            </View>

            {status.connected ? (
              <>
                <ThemedText style={s.title}>Strava Connected ✓</ThemedText>
                <ThemedText style={s.desc}>
                  Your activities are syncing with Active City Pass.
                </ThemedText>
                {status.lastSyncedAt && (
                  <ThemedText style={s.metaText}>
                    Last synced {new Date(status.lastSyncedAt).toLocaleString('en-KE', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </ThemedText>
                )}

                <TouchableOpacity
                  style={[s.connectBtn, syncing && s.connectBtnDisabled]}
                  onPress={handleSyncNow}
                  disabled={syncing || disconnecting}
                  activeOpacity={0.85}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={s.connectBtnText}>Sync now</ThemedText>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.disconnectBtn, disconnecting && s.connectBtnDisabled]}
                  onPress={handleDisconnect}
                  disabled={syncing || disconnecting}
                  activeOpacity={0.85}
                >
                  {disconnecting ? (
                    <ActivityIndicator size="small" color={palette.danger500} />
                  ) : (
                    <ThemedText style={s.disconnectBtnText}>Disconnect Strava</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <ThemedText style={s.title}>Connect Strava</ThemedText>
                <ThemedText style={s.desc}>
                  Connect your Strava account to automatically bring your runs, walks and
                  rides into Active City Pass.
                </ThemedText>

                <TouchableOpacity
                  style={[s.connectBtn, connecting && s.connectBtnDisabled]}
                  onPress={handleConnect}
                  disabled={connecting}
                  activeOpacity={0.85}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={s.connectBtnText}>Connect Strava</ThemedText>
                  )}
                </TouchableOpacity>
              </>
            )}

            {error && <ThemedText style={s.errorText}>{error}</ThemedText>}

            <ThemedText style={s.attribution}>Powered by Strava</ThemedText>
          </View>
        )}
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

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#fff1eb',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  metaText: { fontSize: 12.5, color: palette.gray300, textAlign: 'center', marginBottom: 20 },

  connectBtn: {
    alignSelf: 'stretch', backgroundColor: palette.ink900,
    borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  disconnectBtn: {
    alignSelf: 'stretch', backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: palette.danger500,
    borderRadius: radii.xl, paddingVertical: 16, alignItems: 'center', marginTop: 12,
  },
  disconnectBtnText: { fontSize: 15, fontWeight: '800', color: palette.danger500 },

  errorText: { fontSize: 12.5, color: palette.danger500, textAlign: 'center', marginTop: 16 },
  attribution: { fontSize: 11, color: palette.gray300, marginTop: 28, letterSpacing: 0.3 },
});
