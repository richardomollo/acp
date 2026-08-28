import { View, TextInput, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

// The device locale's decimal separator (e.g. ',' in the Netherlands, '.' in
// Kenya/US) — detected once via Intl rather than hardcoding '.', so typing
// and display both match what the user's own keyboard/locale expect.
const DECIMAL_SEPARATOR = (() => {
  try {
    return Intl.NumberFormat().formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
})();

// Parent state always stores the canonical, period-based numeric string
// (so existing `Number(value)` call sites throughout the app keep working
// unchanged) — only the on-screen text is transformed to the local separator.
function toDisplay(value: string) {
  return DECIMAL_SEPARATOR === '.' ? value : value.replace('.', DECIMAL_SEPARATOR);
}

// Accepts either '.' or ',' as the typed separator (keyboards vary even
// within a locale), keeps only the first one typed, and normalizes it to '.'
// for the canonical value stored in parent state.
function toCanonical(text: string) {
  const cleaned = text.replace(/[^0-9.,]/g, '');
  const sepIndex = cleaned.search(/[.,]/);
  if (sepIndex === -1) return cleaned;
  const head = cleaned.slice(0, sepIndex + 1);
  const tail = cleaned.slice(sepIndex + 1).replace(/[.,]/g, '');
  return (head + tail).replace(',', '.');
}

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
          value={toDisplay(value)}
          onChangeText={t => onChangeText(toCanonical(t))}
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
