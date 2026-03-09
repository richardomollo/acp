import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const handleCodeChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    // Auto-focus next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (newCode.every(digit => digit !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verificationCode?: string) => {
    const codeToVerify = verificationCode || code.join('');
    
    if (codeToVerify.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);

    try {
      // TODO: Implement actual SMS verification
      // For now, we'll simulate verification
      
      // In production, you would:
      // 1. Send code via Twilio/AWS SNS
      // 2. Verify the code
      // 3. Update partner record
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update partner onboarding progress
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: partner } = await supabase
          .from('partners')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (partner) {
          await supabase
            .from('partner_onboarding_progress')
            .update({ phone_verified: true })
            .eq('partner_id', partner.id);
        }
      }

      Alert.alert(
        'Phone Verified!', 
        'Your phone number has been verified.',
        [
          { 
            text: 'Continue', 
            onPress: () => router.replace('/partner-onboarding/business-info')
          }
        ]
      );
    } catch (error: any) {
      console.error('Verification error:', error);
      Alert.alert('Error', 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    
    try {
      // TODO: Implement resend SMS
      await new Promise(resolve => setTimeout(resolve, 1000));
      Alert.alert('Success', 'Verification code sent!');
    } catch (error) {
      Alert.alert('Error', 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Verification?',
      'You can verify your phone number later in settings. Continue to business information?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          onPress: () => router.replace('/(partner-onboarding)/venue-setup')
        }
      ]
    );
  };

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
        <ThemedText style={styles.headerTitle}>Verify Phone</ThemedText>
        <TouchableOpacity onPress={handleSkip}>
          <ThemedText style={styles.skipButton}>Skip</ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, styles.progressDotComplete]} />
          <View style={[styles.progressLine, styles.progressLineComplete]} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
          <View style={styles.progressLine} />
          <View style={styles.progressDot} />
        </View>
        <ThemedText style={styles.stepText}>Step 2 of 3: Phone Verification</ThemedText>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="phone-portrait-outline" size={80} color="#002fff" />
        </View>

        <ThemedText type="title" style={styles.title}>
          Verify Your Phone
        </ThemedText>

        <ThemedText style={styles.description}>
          Enter the 6-digit code we sent to your phone number
        </ThemedText>

        {/* Code Input */}
        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => inputRefs.current[index] = ref}
              style={[
                styles.codeInput,
                digit && styles.codeInputFilled
              ]}
              value={digit}
              onChangeText={(text) => handleCodeChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              editable={!loading}
            />
          ))}
        </View>

        {/* Resend */}
        <TouchableOpacity 
          style={styles.resendButton}
          onPress={handleResendCode}
          disabled={resending}
        >
          {resending ? (
            <ActivityIndicator size="small" color="#002fff" />
          ) : (
            <ThemedText style={styles.resendText}>
              Didn't receive code? <ThemedText style={styles.resendLink}>Resend</ThemedText>
            </ThemedText>
          )}
        </TouchableOpacity>

        {/* Verify Button */}
        <TouchableOpacity
          style={[
            styles.verifyButton, 
            (loading || !code.every(d => d)) && styles.verifyButtonDisabled
          ]}
          onPress={() => handleVerify()}
          disabled={loading || !code.every(d => d)}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.verifyButtonText}>
              Verify Phone Number
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
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
  skipButton: {
    color: '#002fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 30,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  progressDotActive: {
    backgroundColor: '#002fff',
  },
  progressDotComplete: {
    backgroundColor: '#00c853',
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  progressLineComplete: {
    backgroundColor: '#00c853',
  },
  stepText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 30,
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
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 30,
  },
  codeInput: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#000',
  },
  codeInputFilled: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  resendButton: {
    alignItems: 'center',
    marginBottom: 40,
  },
  resendText: {
    fontSize: 14,
    color: '#666',
  },
  resendLink: {
    color: '#002fff',
    fontWeight: '600',
  },
  verifyButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.4,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});