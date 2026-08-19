import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity style={styles.iconBtn} onPress={onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={palette.ink700} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={styles.progressWrap}>
          <ProgressIndicator step={step} total={TOTAL_STEPS} />
        </View>

        {onExit ? (
          <TouchableOpacity style={styles.exitBtn} onPress={onExit} hitSlop={8}>
            <ThemedText style={styles.exitText}>Exit</ThemedText>
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  progressWrap: { flex: 1 },
  exitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exitText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray450,
  },
});
