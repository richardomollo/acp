import { View, TextInput, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

export function NumericGoalInput({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={[styles.inputRow, !editable && styles.inputRowDisabled]}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={palette.gray300}
          value={value}
          onChangeText={t => onChangeText(t.replace(/[^0-9.]/g, ''))}
          editable={editable}
        />
        {unit && <ThemedText style={styles.unit}>{unit}</ThemedText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, flex: 1 },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink600,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    backgroundColor: palette.white,
  },
  inputRowDisabled: {
    backgroundColor: palette.surfaceMuted,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
  },
  unit: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray300,
  },
});
