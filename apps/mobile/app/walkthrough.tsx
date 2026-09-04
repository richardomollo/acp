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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, radii, fontSize } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

export const WALKTHROUGH_KEY = 'walkthrough_complete';

// Beta Feedback #008 — the walkthrough now tells one progressive story:
// Lana starts with the PERSON (goal → personalised plan), turns that plan
// into action (marketplace supply as a fulfilment layer, not the headline),
// and adapts as the user does. No "membership", "pass" or venue-count claims.
const SLIDES = [
  {
    id: '1',
    eyebrow: 'Welcome to Lana Health',
    headline: 'Fitness built around you',
    body: 'Tell us what you want to achieve. Lana creates a personalised plan around your goals, experience, schedule and preferences.',
  },
  {
    id: '2',
    eyebrow: 'Your week, planned',
    headline: 'Know what to do and when',
    body: 'Get a realistic weekly plan for strength, cardio, recovery and the activities you enjoy, built around the time you actually have.',
  },
  {
    id: '3',
    eyebrow: 'Move your way',
    headline: 'Your plan. Your choice of\nwhere to do it.',
    body: 'Train on your own, book an open gym, join a class or get support from a professional — Lana helps you turn your plan into action.',
  },
  {
    id: '4',
    eyebrow: 'It learns with you',
    headline: 'A plan that changes as you do',
    body: "Lana notices what you complete, skip or find hard, and adapts next week to fit your real life — not a fixed programme you're expected to keep up with.",
  },
  {
    id: '5',
    eyebrow: 'Your first step',
    headline: 'Start with your goal',
    body: "Answer a few questions about what you want, where you're starting and the time you have — Lana builds your first week right away.",
  },
];

// Shorter devices (iPhone SE/8 and minis) get tighter vertical spacing so
// the last slide's two stacked buttons don't collide with the body text.
const SHORT = height < 750;

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

      {/* Same top fade as the Home screen */}
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={styles.topFadeBg}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>LANA HEALTH</Text>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Lana Health wordmark — fixed across all slides. Transparent so it
          sits on the same background as the rest of the screen (like Home). */}
      <View style={styles.markWrap}>
        <Image
          source={require('@/assets/images/lana-wordmark.png')}
          style={styles.mark}
          resizeMode="contain"
        />
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
  topFadeBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
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
    fontWeight: '700',
    color: palette.ink700,
    fontSize: fontSize.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
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

  // Lana Health mark — sits low, roughly centred on the page
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SHORT ? height * 0.1 : height * 0.2,
    height: 250,
  },
  mark: {
    width: 250,
    height: 250,
  },

  // Slide content
  slideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: SHORT ? 12 : 22,
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
    marginBottom: 30,
  },
  secondaryBtnText: {
    color: palette.ink900,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});
