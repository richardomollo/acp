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
import { palette, radii, fontSize } from '@/constants/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = (params.redirect as string) || '/(tabs)';

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSignUp = async () => {
    if (!name || !email || !password) {
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

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert([{ id: data.user.id, email: data.user.email, name }]);
        if (profileError) throw profileError;
        Alert.alert('Welcome!', 'Your account has been created.', [
          { text: 'Get started', onPress: () => router.replace(redirectTo as any) },
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
        <Text style={styles.headline}>Create your account</Text>
        <Text style={styles.subheadline}>Access gyms, studios & wellness across Nairobi</Text>

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

        {/* Footer links */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/login', params: params.redirect ? { redirect: params.redirect as string } : undefined })}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.guestBtn}
            onPress={() => router.push('/(tabs)')}
            disabled={loading}
          >
            <Text style={styles.guestText}>Continue as guest</Text>
          </TouchableOpacity>
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
    marginBottom: 28,
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
  guestBtn: {
    paddingVertical: 10,
  },
  guestText: {
    fontSize: fontSize.base,
    color: palette.gray300,
  },
});
