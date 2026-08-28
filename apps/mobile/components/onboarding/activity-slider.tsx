import { View, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { ThemedText } from '@/components/themed-text';
import { palette, fontSize } from '@/constants/theme';

export function ActivitySlider({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  describe,
  disabled,
}: {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange?: (v: number) => void;
  describe: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onValueChange={onValueChange}
        disabled={disabled}
        minimumTrackTintColor={disabled ? palette.gray300 : palette.ink900}
        maximumTrackTintColor={palette.border}
        thumbTintColor={disabled ? palette.gray300 : palette.ink900}
        style={styles.slider}
      />
      <ThemedText style={styles.desc}>{describe(value)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  slider: { width: '100%', height: 32 },
  desc: {
    fontSize: fontSize.sm,
    color: palette.gray450,
  },
});
