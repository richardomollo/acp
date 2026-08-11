import { useRouter } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function PartnerLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const routeAfterLogin = async (user: any) => {
    const { data: pt } = await supabase
      .from('personal_trainers').select('status').eq('user_id', user.id).maybeSingle();

    if (pt) {
      if (pt.status === 'approved') {
        router.replace('/(pt-tabs)');
      } else {
        router.replace('/(pt-onboarding)/pending');
      }
      return;
    }

    const { data: partner } = await supabase
      .from('partners').select('id, onboarding_completed')
      .eq('user_id', user.id).maybeSingle();

    if (partner) {
      if (partner.onboarding_completed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(partner-onboarding)/venue-setup');
      }
      return;
    }

    // Fallback: gyms linked by contact_email (web-signup partners with no
    // matching `partners` row — see checkin.tsx for the same pattern).
    const { data: gym } = await supabase
      .from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle();

    if (gym) {
      router.replace('/(tabs)');
      return;
    }

    // Community owner/admin — any logged-in user can become one via self-serve
    // creation, so this is checked last (no existing partner/PT/gym role
    // implies "not yet a community organiser either", not "reject").
    const { data: membership } = await supabase
      .from('community_members')
      .select('community_id, role, communities(review_status)')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (membership) {
      const reviewStatus = (membership.communities as any)?.review_status;
      if (reviewStatus === 'approved') {
        router.replace('/(community-tabs)' as any);
      } else {
        router.replace('/(community-onboarding)/pending' as any);
      }
      return;
    }

    Alert.alert(
      'No Partner Account Found',
      'This app is for venues, trainers, and community organisers. If you run a running club, gym class, or activity group, you can start a community here.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => supabase.auth.signOut() },
        { text: 'Start a Community', onPress: () => router.replace('/(community-onboarding)/create' as any) },
      ],
    );
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          Alert.alert(
            'Login Failed',
            'Invalid email or password. Please try again.',
            [
              { text: 'OK' },
              { text: 'Forgot Password?', onPress: () => router.push('/(auth)/forgot-password') },
            ]
          );
          return;
        }
        if (error.message.includes('Email not confirmed')) {
          Alert.alert('Email Not Verified', 'Please check your email and click the verification link before logging in.');
          return;
        }
        throw error;
      }

      if (data.user) await routeAfterLogin(data.user);
    } catch (error: any) {
      Alert.alert('Login Error', error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Partner Login</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="business" size={50} color="#000000" />
            </View>
          </View>

          <ThemedText type="title" style={styles.title}>Welcome Back</ThemedText>
          <ThemedText style={styles.description}>
            Sign in to manage your fitness, wellness or kids activities venue
          </ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Email Address</ThemedText>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="partner@email.com"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.passwordHeader}>
              <ThemedText style={styles.inputLabel}>Password</ThemedText>
              <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                <ThemedText style={styles.forgotLink}>Forgot?</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithIcon]}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.loginButtonText}>Sign In</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotEmailButton}
            onPress={() => router.push('/(auth)/forgot-email')}
          >
            <ThemedText style={styles.forgotEmailText}>Forgot your email?</ThemedText>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#ffffff',
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  placeholder: { width: 40 },
  scrollContent: { flexGrow: 1 },
  formContainer: { flex: 1, padding: 20, paddingTop: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#f0f5ff', justifyContent: 'center', alignItems: 'center',
  },
  title: { marginBottom: 10, color: '#000000', textAlign: 'center' },
  description: { marginBottom: 40, color: '#666', textAlign: 'center', fontSize: 15 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 8 },
  passwordHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  forgotLink: { fontSize: 14, fontWeight: '600', color: '#002fff' },
  inputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 16, zIndex: 1 },
  input: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 12,
    padding: 16, paddingLeft: 48, fontSize: 16, color: '#000',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  inputWithIcon: { paddingRight: 48 },
  eyeIcon: { position: 'absolute', right: 16, padding: 4 },
  loginButton: {
    backgroundColor: '#000', paddingVertical: 18, borderRadius: 25,
    alignItems: 'center', marginTop: 10, marginBottom: 15,
  },
  loginButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  forgotEmailButton: { alignItems: 'center', paddingVertical: 10 },
  forgotEmailText: { fontSize: 14, color: '#002fff', fontWeight: '600' },
});
