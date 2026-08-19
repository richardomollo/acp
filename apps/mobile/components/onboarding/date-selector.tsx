import { useState } from 'react';
import { TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatMonthYear(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function DateSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const minimumDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // must be in the future

  const dateValue = value ? new Date(value + 'T00:00:00') : minimumDate;

  const onChangeDate = (_e: any, selected?: Date) => {
    setShowPicker(false);
    if (selected) {
      const iso = selected.toISOString().split('T')[0];
      onChange(iso);
    }
  };

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TouchableOpacity style={styles.btn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={18} color={palette.gray450} />
        <ThemedText style={[styles.btnText, !value && styles.placeholder]}>
          {value ? formatMonthYear(value) : 'Select a date'}
        </ThemedText>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          onChange={onChangeDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: palette.ink600,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: palette.white,
  },
  btnText: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: palette.ink700,
  },
  placeholder: {
    fontWeight: '500',
    color: palette.gray300,
  },
});
