import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

export function ProgressIndicator({ step, total }: { step: number; total: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: step / total,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [step, total, widthAnim]);

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
      <ThemedText style={styles.label}>{step} of {total}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  track: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: palette.hairline,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: palette.ink900,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: palette.gray300,
  },
});
