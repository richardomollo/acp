import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Text,
} from 'react-native';
import { useState } from 'react';
import { authService } from '@/services/auth';
import { GoogleSignInButton, isGoogleSignInSupported } from '@/components/google-signin-button';
import { AppleSignInButton } from '@/components/apple-signin-button';
import { palette, radii, fontSize } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = (params.redirect as string) || '/(tabs)';

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await authService.login({ email, password });
      router.replace(redirectTo as any);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logoIcon}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Active CityPass</Text>
        </View>

        {/* Hero */}
        <Text style={styles.headline}>Welcome back</Text>
        <Text style={styles.subheadline}>Sign in to book your next session</Text>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={palette.gray300}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={palette.gray300}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotRow}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctaBtn, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.ctaBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Social */}
        {(isGoogleSignInSupported || Platform.OS === 'ios') && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={{ gap: 12, marginBottom: 20 }}>
              <AppleSignInButton
                onSuccess={() => router.replace(redirectTo as any)}
                onError={(message) => Alert.alert('Error', message)}
              />
              {isGoogleSignInSupported && (
                <GoogleSignInButton
                  disabled={loading}
                  onSuccess={() => router.replace(redirectTo as any)}
                  onError={(message) => Alert.alert('Error', message)}
                />
              )}
            </View>
          </>
        )}

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>New to Active CityPass?</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.signupBtn}
          onPress={() => router.push(`/signup${params.redirect ? `?redirect=${params.redirect}` : ''}` as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.signupBtnText}>Create a free account</Text>
        </TouchableOpacity>

        {/* Guest */}
        <TouchableOpacity
          style={styles.guestBtn}
          onPress={() => router.push('/(tabs)')}
          disabled={loading}
        >
          <Text style={styles.guestText}>Continue as guest</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
  },
  logoText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
    letterSpacing: -0.2,
  },

  headline: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: palette.ink700,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subheadline: {
    fontSize: fontSize.base,
    color: palette.gray450,
    marginBottom: 32,
  },

  form: {
    gap: 12,
    marginBottom: 32,
  },
  input: {
    backgroundColor: palette.white,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSize.base,
    borderWidth: 1.5,
    borderColor: palette.border,
    color: palette.ink700,
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    fontSize: fontSize.sm,
    color: palette.gray450,
    fontWeight: '500',
  },
  ctaBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaBtnText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.hairline,
  },
  dividerText: {
    fontSize: fontSize.xs,
    color: palette.gray300,
    fontWeight: '500',
  },

  signupBtn: {
    borderWidth: 2,
    borderColor: palette.ink900,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: 12,
  },
  signupBtnText: {
    color: palette.ink900,
    fontSize: fontSize.base,
    fontWeight: '700',
  },

  guestBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  guestText: {
    fontSize: fontSize.base,
    color: palette.gray300,
  },
});
