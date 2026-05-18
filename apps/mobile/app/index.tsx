import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { WALKTHROUGH_KEY } from './walkthrough';

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
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    };

    bootstrap();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#050040', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#F59E0B" />
    </View>
  );
}
