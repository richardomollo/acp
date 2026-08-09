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

export default function ForgotEmailScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundEmail, setFoundEmail] = useState<string | null>(null);

  const isValidPhone = (phone: string) => {
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    return phoneRegex.test(phone);
  };

  const handleFindEmail = async () => {
    if (!phone) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (!isValidPhone(phone)) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);

    try {
      // Search for partner by phone number
      const { data: partner, error } = await supabase
        .from('partners')
        .select('email')
        .eq('phone', phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (partner && partner.email) {
        // Mask email for privacy (show first 2 chars and domain)
        const maskedEmail = maskEmail(partner.email);
        setFoundEmail(maskedEmail);
        
        Alert.alert(
          'Email Found!',
          `Your account email is: ${maskedEmail}\n\nYou can now use this email to log in or reset your password.`,
          [
            {
              text: 'Reset Password',
              onPress: () => {
                router.replace('/(auth)/forgot-password');
              }
            },
            {
              text: 'Go to Login',
              onPress: () => {
                router.replace('/(auth)/partner-login');
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'No Account Found',
          'We couldn\'t find an account with that phone number. Please check the number and try again.'
        );
      }

    } catch (error: any) {
      console.error('Find email error:', error);
      Alert.alert(
        'Error',
        'Unable to search for your account. Please try again or contact support.'
      );
    } finally {
      setLoading(false);
    }
  };

  const maskEmail = (email: string): string => {
    const [username, domain] = email.split('@');
    if (username.length <= 2) {
      return `${username}***@${domain}`;
    }
    const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
    return `${maskedUsername}@${domain}`;
  };

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
        <ThemedText style={styles.headerTitle}>Find Your Email</ThemedText>
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
              <Ionicons name="search-outline" size={50} color="#000000" />
            </View>
          </View>

          <ThemedText type="title" style={styles.title}>
            Forgot Your Email?
          </ThemedText>

          <ThemedText style={styles.description}>
            Enter the phone number you used when creating your account, and we'll help you find your email address.
          </ThemedText>

          {/* Phone Input */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Phone Number</ThemedText>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="+254712345678"
                placeholderTextColor="#999"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!loading}
                returnKeyType="search"
                onSubmitEditing={handleFindEmail}
              />
            </View>
            <ThemedText style={styles.helperText}>
              Use the same phone number you provided during signup
            </ThemedText>
          </View>

          {/* Find Email Button */}
          <TouchableOpacity
            style={[styles.findButton, loading && { opacity: 0.6 }]}
            onPress={handleFindEmail}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.findButtonText}>
                Find My Email
              </ThemedText>
            )}
          </TouchableOpacity>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#002fff" />
            <ThemedText style={styles.infoText}>
              For your security, we'll only show a partial email address (e.g., jo***@example.com)
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

          {/* Support Link */}
          <View style={styles.supportContainer}>
            <ThemedText style={styles.supportText}>
              Still need help?{' '}
            </ThemedText>
            <TouchableOpacity>
              <ThemedText style={styles.supportLink}>Contact Support</ThemedText>
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
    paddingHorizontal: 10,
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
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  findButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  findButtonText: {
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
    marginBottom: 20,
  },
  loginLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#002fff',
  },
  supportContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  supportText: {
    fontSize: 14,
    color: '#666',
  },
  supportLink: {
    fontSize: 14,
    color: '#002fff',
    fontWeight: '600',
  },
});