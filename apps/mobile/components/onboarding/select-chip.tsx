import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

export function SelectChip({
  icon,
  label,
  selected,
  disabled,
  onPress,
}: {
  icon?: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected, disabled && !selected && styles.chipDisabled]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled && !selected}
    >
      {icon && (
        <Ionicons
          name={icon as any}
          size={16}
          color={selected ? palette.white : palette.gray450}
        />
      )}
      <ThemedText style={[styles.label, selected && styles.labelSelected]}>{label}</ThemedText>
      {selected && (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={11} color={palette.blue500} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    backgroundColor: palette.white,
  },
  chipSelected: {
    borderColor: palette.blue500,
    backgroundColor: palette.blue500,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink700,
  },
  labelSelected: {
    color: palette.white,
  },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
