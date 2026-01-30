import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { ImageBackground, Text, View, TouchableOpacity, } from 'react-native';

export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#ffffff', dark: '#1D3D47' }}
      headerImage={
        <View style={styles.headerContainer}>
          <Image
           source={require('../../assets/images/desktop.jpg')}
            style={styles.image}
          />
          <Text style={styles.homeLogo}>Active City Pass</Text>
        </View>
     }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={styles.titleContainerText}>All things fitness, play, & family wellness</ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText style={styles.stepContainerText}>
          The most flexible sports and wellness membership in Nairobi. Access 50+ activities for individuals, partners, kids, and families train, play, and unwind anytime, anywhere.
        </ThemedText>
         <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryText}>Try Free Today!</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Discover our Venues</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
     
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    alignItems: 'center',
    gap: 8,
  },
  titleContainerText:{
    textAlign: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: '20%',
  },
  stepContainer: {
    gap: 8,
    marginBottom: 16,
  },
    stepContainerText: {
    textAlign: 'center',
    alignItems: 'center',
    fontSize: 14,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
    buttonContainer: {
    flexDirection: 'row',
    gap: 15, // works in RN >= 0.71, otherwise use margin
    marginTop:40,
  },
  primaryButton: {
    backgroundColor: '#000000', // primary color
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  primaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: 'black',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  secondaryText: {
    color: 'black',
    fontSize: 14,
    fontWeight: '600',
  },
  headerContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute', // fill header
  },
  homeLogo: {
    position: 'absolute',
    top: '55%',
    left: '25%',
    transform: [{ translateX: -100 }, { translateY: -20 }], // adjust to text size
    color: 'white',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    zIndex: 2,
  },

});
