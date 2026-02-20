import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View, ActivityIndicator, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { authService } from './services/auth';

export default function WelcomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await authService.getSession();
        if (session) {
          router.replace('/(tabs)');
          return;
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setChecking(false);
      }
    };
    checkAuth();
  }, []);

  if (checking) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Banner Section */}
      <View style={styles.bannerContainer}>
        <Image
          source={require('@/assets/images/desktop.jpg')}
          style={styles.bannerImage}
          resizeMode="cover"
        />
      </View>

      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Active CityPass
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          All things fitness, play, & family wellness
        </ThemedText>
        <ThemedText style={styles.description}>
          The most flexible sports and wellness membership in Nairobi. Access 50+ activities for individuals, partners, kids, and families train, play, and unwind anytime, anywhere.
        </ThemedText>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/signup')}
        >
          <ThemedText style={styles.primaryButtonText}>Sign Up</ThemedText>
        </TouchableOpacity>

        {/* Sign Up Link */}
                  <View style={styles.signUpContainer}>
                    <ThemedText style={styles.signUpText}>
                      Don't have an account?{' '}
                    </ThemedText>
                    <TouchableOpacity onPress={() => router.push('/login')}>
                      <ThemedText style={styles.signUpLink}>Log in</ThemedText>
                    </TouchableOpacity>
                  </View>

          <TouchableOpacity
          style={styles.secondaryButton}
        >
          <ThemedText style={styles.alternateText}>
           or 
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(tabs)')}
        >
          <ThemedText style={styles.secondaryButtonText}>
            Continue as guest
          </ThemedText>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContainer: {
    height: 300,
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingTop: '40%',
  },
  bannerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  bannerSubtitle: {
    fontSize: 16,
    color: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    color: '#000000',
    fontSize: 32,
    marginBottom: 10,
  },
  subtitle: {
    marginBottom: 10,
    color: '#000000',
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
    color: '#000000',
  },
  buttonContainer: {
    gap: 15,
    marginBottom: 40,
    padding: 20,
  },
  primaryButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 0,
    borderColor: '#000',
    paddingVertical: 6,
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#002fff',
  },
  alternateText: {
    fontSize: 16,
    color: '#666',
    alignItems: 'center',
  },signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  signUpText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '600',
  },
  signUpLink: {
    color: '#002fff',
    fontWeight: '600',
  },
});