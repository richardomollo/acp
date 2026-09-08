import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
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

  useEffect(() => {
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
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.blue500} />
    </View>
  );
}
