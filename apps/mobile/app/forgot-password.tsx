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
import { useState } from 'react';
import { authService } from '@/services/auth';
import { palette, radii, fontSize } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Email validation
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleResetPassword = async () => {
    // Validation
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
      await authService.forgotPassword(email);
      
      // Clear the input
      setEmail('');
      
      Alert.alert(
        'Check your email',
        'If an account exists with this email, you will receive a password reset link shortly.',
        [
          {
            text: 'OK',
            onPress: () => router.push('/login')
          }
        ]
      );
    } catch (error: any) {
      console.error('Forgot password error:', error);
      
      // Generic message for security (don't reveal if email exists)
      Alert.alert(
        'Request Sent',
        'If an account exists with this email, you will receive a password reset link shortly.'
      );
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Form */}
        <View style={styles.formContainer}>
          <ThemedText type="title" style={styles.title}>
            Forgot Password?
          </ThemedText>

          <ThemedText style={styles.description}>
            Enter your email address and we'll send you a link to reset your password.
          </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={palette.gray300}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={handleResetPassword}
          />

          <TouchableOpacity
            style={[styles.resetButton, loading && { opacity: 0.6 }]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <ThemedText style={styles.resetButtonText}>
                Send Reset Link
              </ThemedText>
            )}
          </TouchableOpacity>

          {/* Back to Login Link */}
          <View style={styles.loginContainer}>
            <ThemedText style={styles.loginText}>
              Remember your password?{' '}
            </ThemedText>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <ThemedText style={styles.loginLink}>Login</ThemedText>
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
  scrollContent: {
    flexGrow: 1,
  },
  banner: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: palette.blue500,
  },
  bannerTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: 'bold',
    color: palette.white,
    marginBottom: 8,
  },
  bannerSubtitle: {
    fontSize: fontSize.lg,
    color: palette.white,
    opacity: 0.9,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 280,
  },
  title: {
    marginBottom: 10,
    marginTop: 10,
    color: palette.ink900,
    textAlign: 'center',
  },
  description: {
    marginBottom: 30,
    color: palette.ink900,
    textAlign: 'center',
  },
  input: {
    backgroundColor: palette.white,
    borderRadius: radii.md,
    padding: 16,
    fontSize: fontSize.lg,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.borderFaint,
  },
  resetButton: {
    backgroundColor: palette.ink900,
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  resetButtonText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  loginText: {
    color: palette.gray450,
  },
  loginLink: {
    color: palette.blue500,
    fontWeight: '600',
  },
});