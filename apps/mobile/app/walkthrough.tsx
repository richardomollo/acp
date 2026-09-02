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
import { palette, radii, fontSize } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

export const WALKTHROUGH_KEY = 'walkthrough_complete';

// Beta Feedback #008 — the walkthrough now tells one progressive story:
// ACP starts with the PERSON (goal → personalised plan), turns that plan
// into action (marketplace supply as a fulfilment layer, not the headline),
// and adapts as the user does. No "membership", "pass" or venue-count claims.
const SLIDES = [
  {
    id: '1',
    eyebrow: 'Welcome to Active CityPass',
    headline: 'Fitness built\naround you',
    body: 'Tell us what you want to achieve. ACP creates a personalised plan around your goals, experience, schedule and preferences.',
  },
  {
    id: '2',
    eyebrow: 'Your week, planned',
    headline: 'Know what to do —\nand when',
    body: 'Get a realistic weekly plan for strength, cardio, recovery and the activities you enjoy, built around the time you actually have.',
  },
  {
    id: '3',
    eyebrow: 'Move your way',
    headline: 'Your plan. Your choice\nof where to do it.',
    body: 'Train on your own, book an open gym, join a class or get support from a professional — ACP helps you turn your plan into action.',
  },
  {
    id: '4',
    eyebrow: 'It learns with you',
    headline: 'A plan that changes\nas you do',
    body: "ACP notices what you complete, skip or find hard, and adapts next week to fit your real life — not a fixed programme you're expected to keep up with.",
  },
  {
    id: '5',
    eyebrow: 'Your first step',
    headline: 'Start with\nyour goal',
    body: "Answer a few questions about what you want, where you're starting and the time you have — ACP builds your first week right away.",
  },
];

const COLLAGE_H = height * 0.42;

// Web collage: col 0 = ref + yoga, col 1 = desktop + plts (offset down)
const COLLAGE_COLS = [
  [
    { src: require('@/assets/images/ref.jpeg'),  alt: 'Fitness' },
    { src: require('@/assets/images/yoga.jpg'),  alt: 'Yoga' },
  ],
  [
    { src: require('@/assets/images/desktop.jpg'), alt: 'Gym' },
    { src: require('@/assets/images/plts.webp'),   alt: 'Pilates' },
  ],
];

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
      <StatusBar barStyle="dark-content" backgroundColor={palette.white} />

      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>Active CityPass</Text>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Image collage — fixed across all slides */}
      <View style={styles.collage}>
        {COLLAGE_COLS.map((col, colIdx) => (
          <View
            key={colIdx}
            style={[styles.collageCol, colIdx === 1 && styles.collageColOffset]}
          >
            {col.map((item, rowIdx) => (
              <View key={rowIdx} style={styles.cellOuter}>
                <Image
                  source={item.src}
                  style={styles.cellImg}
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
              <Text style={styles.primaryBtnText}>Get started</Text>
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
              <Ionicons name="chevron-back" size={18} color={palette.gray450} />
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
              <Ionicons name="chevron-forward" size={18} color={palette.white} />
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
    backgroundColor: palette.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 30,
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
    fontSize: fontSize.base,
    fontWeight: '700',
    color: palette.ink700,
    letterSpacing: -0.2,
  },
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: palette.gray300,
  },

  // Collage
  collage: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 100,
    height: COLLAGE_H,
  },
  collageCol: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  collageColOffset: {
    marginTop: Platform.OS === 'ios' ? 20 : 18,
  },
  cellOuter: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cellImg: {
    width: '100%',
    height: '100%',
  },

  // Slide content
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 22,
    justifyContent: 'flex-start',
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: palette.ink700,
    marginBottom: 10,
    textAlign: 'center',
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    lineHeight: 32,
    color: palette.ink700,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: 21,
    color: palette.gray450,
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
    borderColor: palette.border,
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
    backgroundColor: palette.ink900,
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
    backgroundColor: palette.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: palette.ink900,
    borderRadius: 4,
  },

  // Last slide
  lastNav: {
    gap: 10,
    paddingBottom: 8,
  },
  primaryBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: palette.white,
    fontSize: fontSize.base,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: palette.ink900,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: palette.ink900,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});
