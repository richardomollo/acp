import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    // Navigate to reset-password screen when Supabase signals a recovery session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/(auth)/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Process deep link on cold start
    Linking.getInitialURL().then(url => {
      if (url) handleAuthDeepLink(url);
    });

    // Process deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true, title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// Parses the hash fragment from a Supabase recovery URL and sets the session.
// Supabase sends tokens in the fragment: partners://reset-password#access_token=...&type=recovery
async function handleAuthDeepLink(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return;

  const params: Record<string, string> = {};
  url.slice(hashIndex + 1).split('&').forEach(part => {
    const eqIndex = part.indexOf('=');
    if (eqIndex !== -1) {
      params[part.slice(0, eqIndex)] = decodeURIComponent(part.slice(eqIndex + 1));
    }
  });

  if (params.type === 'recovery' && params.access_token && params.refresh_token) {
    await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    // onAuthStateChange fires PASSWORD_RECOVERY → navigates to reset-password
  }
}
