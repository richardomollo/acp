import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

export function OnboardingFooter({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <TouchableOpacity
        style={[styles.btn, isDisabled && styles.btnDisabled]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={palette.white} />
          : <ThemedText style={styles.btnText}>{label}</ThemedText>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: palette.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  btn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: palette.border,
  },
  btnText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
