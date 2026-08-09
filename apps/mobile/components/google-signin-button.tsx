import { useEffect, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ThemedText } from '@/components/themed-text';
import { signInWithGoogle } from '@/services/auth';
import { palette, radii, fontSize } from '@/constants/theme';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Google's iOS OAuth clients only accept a redirect URI using the reversed-client-id
// scheme (already registered in app.json's ios.infoPlist.CFBundleURLTypes).
const IOS_REDIRECT_URI = IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}:/oauth2redirect/google`
  : undefined;

// expo-auth-session's Google provider throws synchronously on mount if the client ID for
// the *current* platform isn't set (ios -> iosClientId, android -> androidClientId,
// else -> webClientId) — callers must skip rendering this button entirely in that case,
// since this component is mounted inside the always-present GlobalAuthModal and an
// uncaught throw there crashes the whole app on launch, not just this button.
const PLATFORM_CLIENT_ID = Platform.select({ ios: IOS_CLIENT_ID, android: ANDROID_CLIENT_ID, default: WEB_CLIENT_ID });
export const isGoogleSignInSupported = !!PLATFORM_CLIENT_ID;

interface GoogleSignInButtonProps {
  onSuccess: (userId: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onSuccess, onError, disabled }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: IOS_CLIENT_ID,
      androidClientId: ANDROID_CLIENT_ID,
      webClientId: WEB_CLIENT_ID,
    },
    Platform.OS === 'ios' && IOS_REDIRECT_URI ? { native: IOS_REDIRECT_URI } : {}
  );

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        onError?.(response.error?.message || 'Google sign-in failed');
      }
      return;
    }
    const idToken = response.params.id_token;
    if (!idToken) {
      onError?.('Google sign-in failed');
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { user } = await signInWithGoogle(idToken);
        if (!user) throw new Error('Sign-in failed');
        onSuccess(user.id);
      } catch (err: any) {
        onError?.(err.message || 'Google sign-in failed');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const busy = loading || disabled;

  return (
    <TouchableOpacity
      style={[styles.btn, busy && { opacity: 0.6 }]}
      onPress={() => promptAsync()}
      disabled={!request || busy}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={palette.ink700} />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color={palette.ink700} style={styles.icon} />
          <ThemedText style={styles.text}>Continue with Google</ThemedText>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.white,
    borderWidth: 1.5,
    borderColor: palette.border,
    paddingVertical: 15,
    borderRadius: radii.pill,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: palette.ink700,
  },
});
