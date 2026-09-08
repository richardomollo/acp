import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { WALKTHROUGH_KEY } from './walkthrough';
import { palette } from '@/constants/theme';

// TEMP: forces the walkthrough to show on every launch while we're
// iterating on its redesign today. Set back to false when done.
const FORCE_WALKTHROUGH = true;

// Root Layout mount race — imperative router.replace() inside a useEffect
// can fire before Expo Router's root navigator has actually finished
// mounting (throws "Attempted to navigate before mounting the Root Layout
// component"). Reproducible even gated on useRootNavigationState()'s key on
// web, where the navigation STATE can report ready a render before the
// underlying navigator container is actually mounted — state-readiness and
// mount-readiness aren't the same signal there. <Redirect> is expo-router's
// own documented pattern for exactly this ("redirect once an async check
// resolves"): it's declarative — part of the render tree, not an imperative
// side effect — so it has no "did the navigator mount yet" race on any
// platform. This screen now only ever computes WHERE to go; the actual
// navigation is entirely Redirect's responsibility.
export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const seen = FORCE_WALKTHROUGH ? null : await AsyncStorage.getItem(WALKTHROUGH_KEY);
      if (!seen) {
        if (active) setTarget('/walkthrough');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) setTarget('/login'); return; }
      const dest = await getPostAuthDestination(session.user.id, '/(tabs)');
      if (active) setTarget(dest);
    };

    bootstrap();
    return () => { active = false; };
  }, []);

  if (target) return <Redirect href={target as any} />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.blue500} />
    </View>
  );
}
