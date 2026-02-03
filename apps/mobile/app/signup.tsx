import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useState } from 'react';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSignUp = () => {
    console.log('Sign up:', { name, email, phone, password });
    router.push('/(tabs)');
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
        {/* Banner *
        <View style={styles.banner}>
          <ThemedText style={styles.bannerTitle}>Active CityPass</ThemedText>
          <ThemedText style={styles.bannerSubtitle}>
            Join us today
          </ThemedText>
        </View>
        /}

        {/* Form */}
        <View style={styles.formContainer}>
          <ThemedText type="title" style={styles.title}>
            New to Active CityPass?
          </ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
          
          </ThemedText>
          <ThemedText style={styles.description}>
             Start with a free trial and explore top gyms, fitness studios, kids activities, salons, and spas. All with one flexible membership.
            </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={styles.signUpButton}
            onPress={handleSignUp}
          >
            <ThemedText style={styles.signUpButtonText}>
              Create Account
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.signInContainer}>
        <ThemedText style={styles.signInText}>
          Already have an account?{' '}
        </ThemedText>
        <TouchableOpacity onPress={() => router.push('/login')}>
          <ThemedText style={styles.signInLink}>Sign in</ThemedText>
        </TouchableOpacity>
      </View>

          <TouchableOpacity 
            style={styles.guestButton}
            onPress={() => router.push('/(tabs)')}
          >
            <ThemedText style={styles.guestButtonText}>
              Continue as Guest
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
  scrollContent: {
    flexGrow: 1,
  },
  banner: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#667eea',
  },
  bannerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  bannerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    paddingTop:280,
  },
  title: {
    marginBottom: 10,
    marginTop: 10,
    color: '#000000',
    textAlign: 'center',
  },
  description: {
    marginBottom: 30,
    color: '#000000',
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#ffffff',
    color: '#000000',

  },
  signUpButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  signInText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  signInLink: {
   color: '#002fff',
   fontWeight: '600',
    
  },
  guestButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  guestButtonText: {
    color: '#002fff',
    fontSize: 16,
    fontWeight: '600',
  },
});