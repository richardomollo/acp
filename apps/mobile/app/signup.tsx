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
import { supabase } from '@/lib/supabase';
import { GoogleSignInButton, isGoogleSignInSupported } from '@/components/google-signin-button';
import { AppleSignInButton } from '@/components/apple-signin-button';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, radii, fontSize } from '@/constants/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const redirectTo = (params.redirect as string) || '/(tabs)';

  // Google/Apple sign-in can also match an existing account (already
  // completed onboarding), so — unlike the email form above, where every
  // submission is guaranteed brand-new — route through the same
  // completed-vs-not check the login screen uses instead of forcing
  // onboarding unconditionally.
  const handleSocialAuthSuccess = async (userId: string) => {
    const dest = await getPostAuthDestination(userId, redirectTo);
    const href = dest === '/onboarding/goal' ? `${dest}?redirect=${encodeURIComponent(redirectTo)}` : dest;
    router.replace(href as any);
  };

  const handleSocialAuthError = (message: string) => {
    Alert.alert('Error', message);
  };

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
      if (data.user) {
        // handle_new_user() DB trigger already created the profile row with
        // this name from options.data above — nothing left to do here.
        // Every brand-new account goes through goal-setting onboarding
        // first; the plan screen's "Start my journey" carries redirectTo
        // forward from there.
        const onboardingHref = `/onboarding/goal${params.redirect ? `?redirect=${params.redirect}` : ''}`;
        Alert.alert('Welcome!', 'Your account has been created.', [
          { text: 'Get started', onPress: () => router.replace(onboardingHref as any) },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Same top fade as the Home screen */}
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={styles.topFadeBg}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoCenter}>
          <Image
            source={require('@/assets/images/lana-wordmark.png')}
            style={styles.bigLogo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>Lana</Text>
        </View>

        {/* Hero */}
        <Text style={styles.headline}>Your active life starts here.</Text>
        <Text style={styles.subheadline}>Science-backed wellness, fitness, nutrition and experiences</Text>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={palette.gray300}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            editable={!loading}
          />
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
            placeholder="Password (min. 6 characters)"
            placeholderTextColor={palette.gray300}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Repeat password"
            placeholderTextColor={palette.gray300}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleSignUp}
          />

          <TouchableOpacity
            style={[styles.ctaBtn, loading && { opacity: 0.6 }]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.ctaBtnText}>Create account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legalText}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>

        {/* Social */}
        {(isGoogleSignInSupported || Platform.OS === 'ios') && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.socialGroup}>
              <AppleSignInButton
                onSuccess={handleSocialAuthSuccess}
                onError={handleSocialAuthError}
              />
              {isGoogleSignInSupported && (
                <GoogleSignInButton
                  disabled={loading}
                  onSuccess={handleSocialAuthSuccess}
                  onError={handleSocialAuthError}
                />
              )}
            </View>
          </>
        )}

        {/* Footer links */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/login', params: params.redirect ? { redirect: params.redirect as string } : undefined })}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  topFadeBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },

  logoCenter: {
    alignItems: 'center',
    marginBottom: 32,
  },
  bigLogo: {
    width: 150,
    height: 93,
  },
  brandName: {
    fontWeight: '700',
    color: palette.ink700,
    fontSize: fontSize.sm,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  headline: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: palette.ink700,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: fontSize.base,
    color: palette.gray450,
    marginBottom: 28,
    textAlign: 'center',
  },

  form: {
    gap: 12,
    marginBottom: 24,
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
  legalText: {
    fontSize: fontSize.xs,
    color: palette.gray300,
    textAlign: 'center',
    lineHeight: 16,
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
  socialGroup: {
    gap: 12,
    marginBottom: 24,
  },

  footer: {
    alignItems: 'center',
    gap: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.base,
    color: palette.gray450,
  },
  footerLink: {
    fontSize: fontSize.base,
    color: palette.ink700,
    fontWeight: '700',
  },
});
