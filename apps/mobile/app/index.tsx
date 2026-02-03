import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View, Text, Pressable, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Banner Section */}
      <View style={styles.bannerContainer}>
        <Image
          source={require('@/assets/images/desktop.jpg')} // Replace with your image
          style={styles.bannerImage}
          resizeMode="cover"
        />
        {/* Optional overlay text on banner 
        <View style={styles.bannerOverlay}>
          <ThemedText style={styles.bannerTitle}>Active CityPass</ThemedText>
          <ThemedText style={styles.bannerSubtitle}>
            Continue your fitness journey
          </ThemedText>
        </View>
        */}
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
          onPress={() => {
            router.push('/signup');
          }}
        >
          <ThemedText style={styles.primaryButtonText}>Sign Up</ThemedText>
        </TouchableOpacity>

        {/* Guest Access */}
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={() => router.push('/(tabs)')}
            >
              <ThemedText style={styles.secondaryButtonText}>
                Discover Fitness Venues
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent overlay
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
  subtitle:{
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
    padding:20,
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
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 25,
    alignItems: 'center',
    color: '#000',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#002fff',
  },
});