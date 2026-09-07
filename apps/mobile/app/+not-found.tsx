// Overrides Expo Router's default "Unmatched Route" screen.
//
// Root cause this specifically works around: on Android, the Google
// sign-in redirect (expo-auth-session, via google-signin-button.tsx) lands
// back in the app as a real incoming URL — but Expo Router's own linking
// listener treats ANY unrecognised incoming URL as ordinary in-app
// navigation, landing here, at the same time expo-web-browser's own
// listener (WebBrowser.maybeCompleteAuthSession(), already called at
// google-signin-button.tsx's module scope) is independently trying to
// resolve the pending auth-session promise from that same URL. Sign-in
// itself very likely already completes in the background either way — this
// screen's job is just to not strand the user on a scary dead-end 404 with
// a raw OAuth code printed in the URL text, and to give
// maybeCompleteAuthSession() one more explicit chance to fire.
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { palette } from '@/constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    const timeout = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }, 150);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white }}>
      <ActivityIndicator color={palette.ink700} />
    </View>
  );
}
