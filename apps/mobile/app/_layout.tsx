import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { AuthModalProvider } from "@/contexts/auth-modal-context";
import { GlobalAuthModal } from "@/components/auth-modal";
import { UpdateBanner } from "@/components/update-banner";
import { supabase } from "@/lib/supabase";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://b9606caa5a1a649020ca77168019b9e2@o4511921771315200.ingest.de.sentry.io/4511921776033872',

  // ACP Intelligence™ Day 10 — this app handles health data (body
  // measurements, goals, training history), so PII is deliberately NOT sent
  // to Sentry, and Session Replay masks all text/images/vectors so a replay
  // can never capture a measurement, goal or coaching message.
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay — masked; error replays only (no ambient sampling).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration({ maskAllText: true, maskAllImages: true, maskAllVectors: true }),
    Sentry.feedbackIntegration(),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export default Sentry.wrap(function Layout() {
  const router = useRouter();

  useEffect(() => {
    // Navigate to reset-password when Supabase signals a recovery session,
    // and back to login the moment a session ends for any reason — the app
    // is login-only, so nothing should keep rendering without one.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      } else if (event === 'SIGNED_OUT') {
        router.replace('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Handle deep link on cold start
    Linking.getInitialURL().then(url => {
      if (url) handleAuthDeepLink(url);
    });

    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthDeepLink(url));
    return () => sub.remove();
  }, []);

  return (
    <AuthModalProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="membership-details" options={{ headerShown: false }} />
        <Stack.Screen name="walkthrough" options={{ headerShown: false }} />
      </Stack>
      <GlobalAuthModal />
      <UpdateBanner />
    </AuthModalProvider>
  );
});

// Parses the hash fragment from a Supabase recovery URL and sets the session.
// Supabase sends: acitypass://reset-password#access_token=...&type=recovery
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
    // onAuthStateChange fires PASSWORD_RECOVERY → navigates to /reset-password
  }
}
