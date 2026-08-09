import { useEffect, useState } from 'react';
import { StyleSheet, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '@/services/auth';
import { radii } from '@/constants/theme';

interface AppleSignInButtonProps {
  onSuccess: (userId: string) => void;
  onError?: (message: string) => void;
}

export function AppleSignInButton({ onSuccess, onError }: AppleSignInButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  if (!available) return null;

  const handlePress = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Sign-in failed');
      const { user } = await signInWithApple(credential.identityToken, credential.fullName);
      if (!user) throw new Error('Sign-in failed');
      onSuccess(user.id);
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') return;
      onError?.(err.message || 'Apple sign-in failed');
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
      cornerRadius={radii.pill}
      style={styles.btn}
      onPress={handlePress}
    />
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 54,
    width: '100%',
  },
});
