import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { WALKTHROUGH_KEY } from './walkthrough';
import { palette } from '@/constants/theme';

// TEMP: forces the walkthrough to show on every launch while we're
// iterating on its redesign today. Set back to false when done.
const FORCE_WALKTHROUGH = true;

export default function Index() {
  const router = useRouter();
  // Root Layout mount race: with FORCE_WALKTHROUGH on, `seen` resolves to
  // `null` with no real await in between (the AsyncStorage branch — a real
  // native round-trip — is skipped entirely), so this effect's continuation
  // could previously fire before Expo Router's root navigator had actually
  // finished mounting, throwing "Attempted to navigate before mounting the
  // Root Layout component." Gating on the root navigation state's `key`
  // guarantees the navigator is mounted before ANY router.replace here,
  // regardless of which branch below ends up with no real async delay.
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key) return; // root navigator not mounted yet — wait for the next render

    const bootstrap = async () => {
      const seen = FORCE_WALKTHROUGH ? null : await AsyncStorage.getItem(WALKTHROUGH_KEY);
      if (!seen) {
        router.replace('/walkthrough');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      router.replace((await getPostAuthDestination(session.user.id, '/(tabs)')) as any);
    };

    bootstrap();
  }, [rootNavigationState?.key]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.blue500} />
    </View>
  );
}
