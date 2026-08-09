import { useState, useEffect, useRef } from 'react';
import {
  Modal, View, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { palette, fontSize, radii } from '@/constants/theme';

export type TourStep = {
  icon: string;
  title: string;
  description: string;
};

type Props = {
  visible: boolean;
  steps: TourStep[];
  onDismiss: () => void;
};

export function TourOverlay({ visible, steps, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setStep(0);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(60);
    }
  }, [visible]);

  const animateStep = (next: number) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 20, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setStep(next));
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      animateStep(step + 1);
    } else {
      onDismiss();
    }
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />

        <Animated.View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom, 24) + 8, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name={current.icon as any} size={28} color={palette.blue500} />
          </View>

          {/* Text */}
          <ThemedText style={styles.title}>{current.title}</ThemedText>
          <ThemedText style={styles.description}>{current.description}</ThemedText>

          {/* Progress dots */}
          {steps.length > 1 && (
            <View style={styles.dots}>
              {steps.map((_, i) => (
                <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* Actions */}
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <ThemedText style={styles.nextBtnText}>
              {isLast ? 'Got it' : 'Next'}
            </ThemedText>
            {!isLast && <Ionicons name="arrow-forward" size={16} color={palette.white} />}
          </TouchableOpacity>

          <TouchableOpacity onPress={onDismiss} style={styles.skipBtn}>
            <ThemedText style={styles.skipText}>Skip tour</ThemedText>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 28,
    alignItems: 'center',
    gap: 0,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink900,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  description: {
    fontSize: fontSize.base,
    color: palette.gray450,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.borderFaint,
  },
  dotActive: {
    width: 18,
    backgroundColor: palette.blue500,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.ink900,
    borderRadius: radii.lg,
    width: '100%',
    paddingVertical: 16,
    marginBottom: 12,
  },
  nextBtnText: {
    color: palette.white,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: fontSize.sm,
    color: palette.gray300,
    fontWeight: '500',
  },
});
