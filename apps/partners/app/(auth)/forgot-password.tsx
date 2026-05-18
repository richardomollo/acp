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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSendResetLink = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: 'fitpass://reset-password', // Deep link to your app
        }
      );

      if (error) throw error;

      setEmailSent(true);
      
      Alert.alert(
        'Check Your Email',
        `We've sent a password reset link to ${email}. Please check your inbox and click the link to reset your password.`,
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );

    } catch (error: any) {
      console.error('Reset password error:', error);
      
      // Don't reveal if email exists or not (security)
      Alert.alert(
        'Email Sent',
        'If an account exists with this email, you will receive a password reset link shortly.',
        [{ text: 'OK' }]
      );
      
      setEmailSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    setEmailSent(false);
    setEmail('');
  };

  if (emailSent) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Reset Password</ThemedText>
          <View style={styles.placeholder} />
        </View>

        {/* Success State */}
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-outline" size={80} color="#00c853" />
          </View>

          <ThemedText type="title" style={styles.successTitle}>
            Check Your Email
          </ThemedText>

          <ThemedText style={styles.successDescription}>
            We've sent a password reset link to:
          </ThemedText>

          <ThemedText style={styles.emailText}>{email}</ThemedText>

          <ThemedText style={styles.instructionsText}>
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </ThemedText>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleResend}
          >
            <ThemedText style={styles.resendButtonText}>
              Send to Different Email
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backToLoginButton}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.backToLoginText}>
              Back to Login
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Reset Password</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed-outline" size={50} color="#000000" />
            </View>
          </View>

          <ThemedText type="title" style={styles.title}>
            Forgot Password?
          </ThemedText>

          <ThemedText style={styles.description}>
            No worries! Enter your email address and we'll send you a link to reset your password.
          </ThemedText>

          {/* Email Input */}
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
                returnKeyType="send"
                onSubmitEditing={handleSendResetLink}
              />
            </View>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, loading && { opacity: 0.6 }]}
            onPress={handleSendResetLink}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.sendButtonText}>
                Send Reset Link
              </ThemedText>
            )}
          </TouchableOpacity>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color="#002fff" />
            <ThemedText style={styles.infoText}>
              You'll receive an email with a link to reset your password. The link expires in 1 hour.
            </ThemedText>
          </View>

          {/* Back to Login */}
          <TouchableOpacity 
            style={styles.loginLinkButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back-outline" size={18} color="#002fff" />
            <ThemedText style={styles.loginLinkText}>
              Back to Login
            </ThemedText>
          </TouchableOpacity>

          {/* Forgot Email Link */}
          <TouchableOpacity 
            style={styles.forgotEmailButton}
            onPress={() => router.push('/forgot-email')}
          >
            <ThemedText style={styles.forgotEmailText}>
              Don't remember your email?
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f5ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginBottom: 10,
    color: '#000000',
    textAlign: 'center',
  },
  description: {
    marginBottom: 40,
    color: '#666',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    paddingLeft: 48,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sendButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f0f5ff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#002fff',
    lineHeight: 20,
  },
  loginLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 15,
  },
  loginLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#002fff',
  },
  forgotEmailButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  forgotEmailText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  // Success State
  successContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  successTitle: {
    marginBottom: 15,
    color: '#000000',
    textAlign: 'center',
  },
  successDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#002fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  resendButton: {
    backgroundColor: '#f0f5ff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginBottom: 15,
  },
  resendButtonText: {
    color: '#002fff',
    fontSize: 15,
    fontWeight: '700',
  },
  backToLoginButton: {
    paddingVertical: 12,
  },
  backToLoginText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
});