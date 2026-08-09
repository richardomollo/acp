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
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { palette, radii, fontSize } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        Alert.alert(
          'Link expired',
          'This password reset link is invalid or has expired. Please request a new one.',
          [{ text: 'OK', onPress: () => router.replace('/') }],
        );
      }
    });
  }, []);

  const strength = (): 'Weak' | 'Medium' | 'Strong' | '' => {
    if (!password) return '';
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[a-z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    if (s <= 2) return 'Weak';
    if (s <= 4) return 'Medium';
    return 'Strong';
  };

  const strengthColor = () =>
    ({ Weak: palette.danger500, Medium: '#ff9500', Strong: '#00c853', '': palette.borderFaint }[strength()]);

  const handleReset = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();

      Alert.alert(
        'Password updated',
        'Your password has been reset. Please sign in with your new password.',
        [{ text: 'Sign in', onPress: () => router.replace('/') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = strength();
  const strengthWidth = s === 'Weak' ? '33%' : s === 'Medium' ? '66%' : s === 'Strong' ? '100%' : '0%';

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
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={48} color={palette.blue500} />
        </View>

        <ThemedText style={styles.title}>Create new password</ThemedText>
        <ThemedText style={styles.subtitle}>Choose a strong password to secure your account.</ThemedText>

        {/* New password */}
        <ThemedText style={styles.label}>New password</ThemedText>
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={18} color={palette.gray200} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter new password"
            placeholderTextColor={palette.gray200}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={palette.gray200} />
          </TouchableOpacity>
        </View>
        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={styles.strengthTrack}>
              <View style={[styles.strengthFill, { width: strengthWidth, backgroundColor: strengthColor() }]} />
            </View>
            <ThemedText style={[styles.strengthLabel, { color: strengthColor() }]}>{s}</ThemedText>
          </View>
        )}

        {/* Confirm password */}
        <ThemedText style={[styles.label, { marginTop: 16 }]}>Confirm password</ThemedText>
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={18} color={palette.gray200} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Re-enter new password"
            placeholderTextColor={palette.gray200}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
          <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
            <Ionicons name={showConfirm ? 'eye-outline' : 'eye-off-outline'} size={18} color={palette.gray200} />
          </TouchableOpacity>
        </View>
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <ThemedText style={styles.errorText}>Passwords do not match</ThemedText>
        )}

        {/* Requirements */}
        <View style={styles.reqBox}>
          {[
            { label: 'At least 8 characters', ok: password.length >= 8 },
            { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
            { label: 'Lowercase letter', ok: /[a-z]/.test(password) },
            { label: 'Number', ok: /[0-9]/.test(password) },
          ].map(r => (
            <View key={r.label} style={styles.reqRow}>
              <Ionicons
                name={r.ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={r.ok ? '#00c853' : palette.gray200}
              />
              <ThemedText style={styles.reqText}>{r.label}</ThemedText>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={palette.white} />
            : <ThemedText style={styles.btnText}>Reset password</ThemedText>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },
  scroll: { padding: 24, paddingTop: 80 },

  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 28,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink700, letterSpacing: -0.4, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: fontSize.base, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 32 },

  label: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700, marginBottom: 8 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, backgroundColor: palette.white, marginBottom: 6,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 13, fontSize: fontSize.base, color: palette.ink700 },
  eyeBtn: { padding: 4 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  strengthTrack: { flex: 1, height: 4, backgroundColor: palette.hairline, borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '600', width: 46 },

  errorText: { fontSize: fontSize.xs, color: palette.danger500, marginBottom: 4 },

  reqBox: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md, padding: 16,
    marginTop: 16, marginBottom: 28, gap: 10,
  },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reqText: { fontSize: fontSize.sm, color: palette.gray450 },

  btn: {
    backgroundColor: palette.ink900, borderRadius: radii.pill,
    paddingVertical: 15, alignItems: 'center',
  },
  btnText: { color: palette.white, fontSize: fontSize.base, fontWeight: '700' },
});
