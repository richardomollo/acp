import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
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
      router.replace('/(tabs)');
    };

    bootstrap();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.warning500} />
    </View>
  );
}
