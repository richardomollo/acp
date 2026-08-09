import {
  StyleSheet, View, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000000';

export default function ChangeEmailScreen() {
  const router = useRouter();
  const [currentEmail, setCurrentEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSave = async () => {
    if (!newEmail.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your new email address and current password.');
      return;
    }
    if (!newEmail.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user session found.');

      setCurrentEmail(user.email);

      // Verify password before changing email
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        Alert.alert('Incorrect password', 'Your password is incorrect. Please try again.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
      if (error) throw error;

      setSent(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={PRIMARY} />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Change email</ThemedText>
          <View style={{ width: 40 }} />
        </SafeAreaView>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-open-outline" size={40} color={PRIMARY} />
          </View>
          <ThemedText style={styles.successTitle}>Confirmation sent</ThemedText>
          <ThemedText style={styles.successBody}>
            We sent confirmation links to both{'\n'}
            <ThemedText style={styles.successEmail}>{currentEmail}</ThemedText>
            {'\n'}and{'\n'}
            <ThemedText style={styles.successEmail}>{newEmail}</ThemedText>
            {'\n\n'}Click the link in each email to complete the change.
          </ThemedText>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <ThemedText style={styles.doneBtnText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={PRIMARY} />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Change email</ThemedText>
          <View style={{ width: 40 }} />
        </SafeAreaView>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.subtitle}>
            Enter your new email address. We'll send confirmation links to both your current and new email to complete the change.
          </ThemedText>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>New email address</ThemedText>
            <TextInput
              style={styles.inputFlat}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="new@example.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Current password</ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Confirm your identity"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.saveBtnText}>Send confirmation</ThemedText>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },

  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },

  content: { padding: 20 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 20 },

  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputFlat: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  input: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#111827' },
  eyeBtn: { paddingHorizontal: 14 },

  saveBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: PRIMARY + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 14 },
  successBody: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 24 },
  successEmail: { fontWeight: '700', color: '#111827' },
  doneBtn: { marginTop: 32, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
