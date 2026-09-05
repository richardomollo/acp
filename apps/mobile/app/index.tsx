import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { WALKTHROUGH_KEY } from './walkthrough';
import { palette } from '@/constants/theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const bootstrap = async () => {
      const seen = await AsyncStorage.getItem(WALKTHROUGH_KEY);
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
