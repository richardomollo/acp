import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Image,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export const WALKTHROUGH_KEY = 'walkthrough_complete';

const SLIDES = [
  {
    id: '1',
    eyebrow: 'Welcome to Active CityPass',
    headline: "All of Nairobi's fitness\nin one membership",
    body: 'Gyms, yoga, boxing, swimming, spas, kids activities — one flexible pass unlocks them all. Train, play, and unwind on your terms.',
  },
  {
    id: '2',
    eyebrow: '50+ Venues across Nairobi',
    headline: 'Discover world-class\nvenues near you',
    body: 'From Westlands to Karen, Kilimani to Lavington — browse top-rated gyms, studios, pools, and wellness centres all on one map.',
  },
  {
    id: '3',
    eyebrow: 'Instant booking',
    headline: 'Pick a class, tap book,\nshow up',
    body: 'Browse real-time availability, book in seconds, and get an instant confirmation. No phone calls, no forms — just tap and go.',
  },
  {
    id: '4',
    eyebrow: 'One credit, endless choice',
    headline: 'Use credits across\nanything you love',
    body: 'Gym session Monday, yoga Tuesday, spa Friday — your credits work across every partner venue. Mix and match as your week demands.',
  },
  {
    id: '5',
    eyebrow: 'Start free today',
    headline: '14 days on us,\nno strings attached',
    body: 'Try Active CityPass completely free for 14 days. Book sessions, explore venues, and find what you love — no card needed to start.',
  },
];

// Each entry: translateX, translateY (px) to shift the image within each cell
// so each cell shows a visually distinct crop of desktop.jpg
const CROPS: [number, number][][] = [
  [[0, 0],    [0, -60]],   // col 0
  [[-60, 0],  [-40, -50]], // col 1 (offset)
  [[-100, 0], [-80, -55]], // col 2
];

const COLLAGE_H = height * 0.40;
const COL_W = (width - 36) / 3;

export default function Walkthrough() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;

  const isLast = current === SLIDES.length - 1;
  const slide = SLIDES[current];

  const finish = async () => {
    await AsyncStorage.setItem(WALKTHROUGH_KEY, 'true');
    router.replace('/login');
  };

  const goTo = (index: number) => {
    if (index < 0 || index >= SLIDES.length) return;
    const isForward = index > current;
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(translateAnim, { toValue: isForward ? 20 : -20, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(index);
      translateAnim.setValue(isForward ? -20 : 20);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>Active CityPass</Text>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Explore →</Text>
        </TouchableOpacity>
      </View>

      {/* Image collage — fixed across all slides */}
      <View style={styles.collage}>
        {CROPS.map((col, colIdx) => (
          <View
            key={colIdx}
            style={[styles.collageCol, colIdx === 1 && styles.collageColOffset]}
          >
            {col.map(([tx, ty], rowIdx) => (
              <View key={rowIdx} style={styles.cellOuter}>
                <Image
                  source={require('@/assets/images/desktop.jpg')}
                  style={[styles.cellImg, { transform: [{ translateX: tx }, { translateY: ty }] }]}
                  resizeMode="cover"
                />
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Animated slide content */}
      <Animated.View
        style={[
          styles.slideContent,
          { opacity: opacityAnim, transform: [{ translateX: translateAnim }] },
        ]}
      >
        <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
        <Text style={styles.headline}>{slide.headline}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>

      {/* Navigation */}
      <SafeAreaView edges={['bottom']} style={styles.navWrapper}>
        {isLast ? (
          <View style={styles.lastNav}>
            <TouchableOpacity style={styles.primaryBtn} onPress={finish} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Start my free 14-day trial</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={finish} activeOpacity={0.75}>
              <Text style={styles.secondaryBtnText}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.normalNav}>
            <TouchableOpacity
              style={[styles.navCircle, current === 0 && styles.navCircleInvisible]}
              onPress={() => goTo(current - 1)}
              disabled={current === 0}
            >
              <Ionicons name="chevron-back" size={18} color="#6b7280" />
            </TouchableOpacity>

            <View style={styles.dots}>
              {SLIDES.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={8}>
                  <View style={[styles.dot, i === current && styles.dotActive]} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.navCircleBlack}
              onPress={() => goTo(current + 1)}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 8,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  logoText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    letterSpacing: -0.2,
  },
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
  },

  // Collage
  collage: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 12,
    height: COLLAGE_H,
  },
  collageCol: {
    flex: 1,
    flexDirection: 'column',
    gap: 6,
  },
  collageColOffset: {
    marginTop: Platform.OS === 'ios' ? 18 : 16,
  },
  cellOuter: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cellImg: {
    width: COL_W * 2.2,
    height: COLLAGE_H * 0.8,
  },

  // Slide content
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 22,
    justifyContent: 'flex-start',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#111',
    marginBottom: 10,
    textAlign: 'center',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b7280',
    textAlign: 'center',
  },

  // Navigation
  navWrapper: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  normalNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  navCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCircleInvisible: {
    opacity: 0,
  },
  navCircleBlack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#000',
    borderRadius: 4,
  },

  // Last slide
  lastNav: {
    gap: 10,
    paddingBottom: 8,
  },
  primaryBtn: {
    backgroundColor: '#000',
    paddingVertical: 15,
    borderRadius: 100,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
});
