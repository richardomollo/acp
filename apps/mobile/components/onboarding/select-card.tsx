import { useRef } from 'react';
import { TouchableOpacity, View, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

export function SelectCard({
  icon,
  label,
  desc,
  selected,
  onPress,
}: {
  icon?: string;
  label: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.card, selected && styles.cardSelected]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        {icon && (
          <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
            <Ionicons name={icon as any} size={20} color={selected ? palette.white : palette.gray450} />
          </View>
        )}
        <View style={styles.textWrap}>
          <ThemedText style={[styles.label, selected && styles.labelSelected]}>{label}</ThemedText>
          {desc && <ThemedText style={styles.desc}>{desc}</ThemedText>}
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    backgroundColor: palette.white,
  },
  cardSelected: {
    borderColor: palette.blue500,
    backgroundColor: palette.blue25,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  iconWrapSelected: {
    backgroundColor: palette.blue500,
  },
  textWrap: { flex: 1, gap: 2 },
  label: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: palette.ink700,
  },
  labelSelected: {
    color: palette.blue600,
  },
  desc: {
    fontSize: fontSize.sm,
    color: palette.gray450,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: palette.blue500,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.blue500,
  },
});
