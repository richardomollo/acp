import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { GoogleSignInButton, isGoogleSignInSupported } from '@/components/google-signin-button';
import { AppleSignInButton } from '@/components/apple-signin-button';
import { palette, radii, fontSize } from '@/constants/theme';

export function GlobalAuthModal() {
  const router = useRouter();
  const { visible, defaultTab, redirectTo, hideAuthModal, _notifySuccess } = useAuthModal();

  const [tab, setTab] = useState<'login' | 'signup' | 'forgot'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => { if (visible) setTab(defaultTab); }, [visible, defaultTab]);

  const reset = () => {
    setEmail(''); setPassword(''); setName('');
    setTab('login'); setLoading(false); setForgotSent(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { reset(); hideAuthModal(); };

  const navigateAfterAuth = (destination: string | undefined) => {
    if (!destination) return;
    setTimeout(() => router.push(destination as any), 150);
  };

  const goToSignup = () => {
    handleClose();
    const href = `/signup${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`;
    setTimeout(() => router.push(href as any), 150);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await authService.login({ email: email.trim(), password });
      const dest = redirectTo;
      reset();
      _notifySuccess(user.id);
      navigateAfterAuth(dest);
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuthSuccess = (userId: string) => {
    const dest = redirectTo;
    reset();
    _notifySuccess(userId);
    navigateAfterAuth(dest);
  };

  const handleGoogleError = (message: string) => {
    Alert.alert('Google sign-in failed', message);
  };

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await authService.signup({ name: name.trim(), email: email.trim(), password, phone: '' });
      const dest = redirectTo;
      reset();
      _notifySuccess(user.id);
      navigateAfterAuth(dest);
    } catch (err: any) {
      Alert.alert('Sign up failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Close */}
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={palette.gray450} />
          </TouchableOpacity>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ── Sign Up view ── */}
            {tab === 'signup' && (
              <>
                <View style={styles.logoRow}>
                  <Image source={require('@/assets/images/icon.png')} style={styles.logoIcon} resizeMode="contain" />
                  <ThemedText style={styles.logoText}>Active CityPass</ThemedText>
                </View>
                <ThemedText style={styles.headline}>Create your account</ThemedText>
                <ThemedText style={styles.subheadline}>Access gyms, studios & wellness across Nairobi</ThemedText>

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
                  editable={!loading}
                  returnKeyType="go"
                  onSubmitEditing={handleSignup}
                />

                <TouchableOpacity
                  style={[styles.ctaBtn, loading && { opacity: 0.6 }]}
                  onPress={handleSignup}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color={palette.white} />
                    : <ThemedText style={styles.ctaBtnText}>Create account</ThemedText>
                  }
                </TouchableOpacity>

                {(isGoogleSignInSupported || Platform.OS === 'ios') && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <ThemedText style={styles.dividerText}>or</ThemedText>
                      <View style={styles.dividerLine} />
                    </View>
                    <View style={{ gap: 12, marginBottom: 12 }}>
                      <AppleSignInButton
                        onSuccess={handleSocialAuthSuccess}
                        onError={(message) => Alert.alert('Apple sign-in failed', message)}
                      />
                      {isGoogleSignInSupported && (
                        <GoogleSignInButton
                          disabled={loading}
                          onSuccess={handleSocialAuthSuccess}
                          onError={handleGoogleError}
                        />
                      )}
                    </View>
                  </>
                )}

                <ThemedText style={styles.legalText}>
                  By signing up you agree to our Terms of Service and Privacy Policy.
                </ThemedText>

                <TouchableOpacity style={styles.switchRow} onPress={() => setTab('login')}>
                  <ThemedText style={styles.switchText}>Already have an account? </ThemedText>
                  <ThemedText style={styles.switchLink}>Sign in</ThemedText>
                </TouchableOpacity>
              </>
            )}

            {/* ── Login view ── */}
            {tab === 'login' && (
              <>
                <ThemedText style={styles.headline}>Welcome back</ThemedText>
                <ThemedText style={styles.subheadline}>Let’s keep working towards your goals.</ThemedText>

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
                  editable={!loading}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />

                <TouchableOpacity
                  style={styles.forgotRow}
                  onPress={() => { setForgotSent(false); setTab('forgot'); }}
                >
                  <ThemedText style={styles.forgotText}>Forgot password?</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.ctaBtn, loading && { opacity: 0.6 }]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color={palette.white} />
                    : <ThemedText style={styles.ctaBtnText}>Sign in</ThemedText>
                  }
                </TouchableOpacity>

                {(isGoogleSignInSupported || Platform.OS === 'ios') && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <ThemedText style={styles.dividerText}>or</ThemedText>
                      <View style={styles.dividerLine} />
                    </View>
                    <View style={{ gap: 12, marginBottom: 12 }}>
                      <AppleSignInButton
                        onSuccess={handleSocialAuthSuccess}
                        onError={(message) => Alert.alert('Apple sign-in failed', message)}
                      />
                      {isGoogleSignInSupported && (
                        <GoogleSignInButton
                          disabled={loading}
                          onSuccess={handleSocialAuthSuccess}
                          onError={handleGoogleError}
                        />
                      )}
                    </View>
                  </>
                )}

                <TouchableOpacity style={styles.switchRow} onPress={goToSignup}>
                  <ThemedText style={styles.switchText}>No account yet? </ThemedText>
                  <ThemedText style={styles.switchLink}>Create one free</ThemedText>
                </TouchableOpacity>
              </>
            )}

            {/* ── Forgot password view ── */}
            {tab === 'forgot' && (
              <>
                <TouchableOpacity style={styles.backBtn} onPress={() => setTab('login')}>
                  <Ionicons name="arrow-back" size={20} color={palette.gray450} />
                  <ThemedText style={styles.backBtnText}>Back to sign in</ThemedText>
                </TouchableOpacity>

                <ThemedText style={styles.headline}>Reset password</ThemedText>
                <ThemedText style={styles.subheadline}>
                  Enter your email and we'll send you a reset link.
                </ThemedText>

                {forgotSent ? (
                  <View style={styles.sentCard}>
                    <Ionicons name="mail-outline" size={32} color={palette.blue500} />
                    <ThemedText style={styles.sentTitle}>Check your inbox</ThemedText>
                    <ThemedText style={styles.sentBody}>
                      If an account exists for <ThemedText style={styles.sentEmail}>{email}</ThemedText>, you'll receive a reset link shortly.
                    </ThemedText>
                    <TouchableOpacity style={[styles.ctaBtn, { alignSelf: 'stretch' }]} onPress={() => setTab('login')}>
                      <ThemedText style={styles.ctaBtnText}>Back to sign in</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Email address"
                      placeholderTextColor={palette.gray300}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loading}
                      returnKeyType="send"
                      onSubmitEditing={handleForgotPassword}
                    />
                    <TouchableOpacity
                      style={[styles.ctaBtn, loading && { opacity: 0.6 }]}
                      onPress={handleForgotPassword}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      {loading
                        ? <ActivityIndicator color={palette.white} />
                        : <ThemedText style={styles.ctaBtnText}>Send reset link</ThemedText>
                      }
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    maxHeight: '93%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: palette.borderFaint,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 6,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: palette.hairline,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  logoIcon: { width: 28, height: 28, borderRadius: 7 },
  logoText: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink700, letterSpacing: -0.2 },

  headline: { fontSize: 26, fontWeight: '800', color: palette.ink700, lineHeight: 32, letterSpacing: -0.4, marginBottom: 6 },
  subheadline: { fontSize: fontSize.base, color: palette.gray450, marginBottom: 20 },

  input: {
    borderWidth: 1.5, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: fontSize.base, color: palette.ink700, backgroundColor: palette.white, marginBottom: 12,
  },

  ctaBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.pill,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  ctaBtnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700', letterSpacing: -0.1 },

  legalText: { fontSize: fontSize.xs, color: palette.gray300, textAlign: 'center', lineHeight: 16, marginBottom: 16 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.hairline },
  dividerText: { fontSize: fontSize.xs, color: palette.gray300, fontWeight: '500' },

  forgotRow: { alignItems: 'flex-end', marginBottom: 16, marginTop: -4 },
  forgotText: { fontSize: fontSize.sm, color: palette.gray450, fontWeight: '500' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backBtnText: { fontSize: fontSize.base, color: palette.gray450, fontWeight: '500' },
  sentCard: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  sentTitle: { fontSize: fontSize.xl, fontWeight: '800', color: palette.ink700 },
  sentBody: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 20 },
  sentEmail: { fontWeight: '700', color: palette.ink700 },

  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  switchText: { fontSize: fontSize.base, color: palette.gray450 },
  switchLink: { fontSize: fontSize.base, color: palette.ink700, fontWeight: '700' },
});
