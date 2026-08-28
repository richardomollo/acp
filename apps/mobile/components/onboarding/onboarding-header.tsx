import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ProgressIndicator } from './progress-indicator';
import { palette, radii, fontSize } from '@/constants/theme';

const TOTAL_STEPS = 5;

export function OnboardingHeader({
  step,
  onBack,
  onExit,
}: {
  step: number;
  onBack?: () => void;
  onExit?: () => void;
}) {
  return (
    // Same soft top fade as the home page's header (palette.blue100 fading
    // to transparent) so onboarding reads as a continuation of the app,
    // not a separate flat-white flow.
    <LinearGradient colors={[palette.blue100, 'rgba(208,224,255,0)']} style={styles.safe}>
      <SafeAreaView edges={['top']}>
        <View style={styles.topRow}>
          {onBack ? (
            <TouchableOpacity style={styles.iconBtn} onPress={onBack} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={palette.ink700} />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconBtn} />
          )}

          {onExit && (
            <TouchableOpacity style={styles.exitBtn} onPress={onExit} hitSlop={8}>
              <ThemedText style={styles.exitText} numberOfLines={1}>Skip, I&apos;ll do this later</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressRow}>
          <ProgressIndicator step={step} total={TOTAL_STEPS} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: {},
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  progressRow: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    marginBottom: 8,
  },
  exitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exitText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray450,
  },
});
