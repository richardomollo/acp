import { useState } from 'react';
import { TouchableOpacity, View, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';
import { toCalendarDate, parseCalendarDateOrNull } from '@/lib/calendar-date';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatMonthYear(iso: string) {
  // LH-26 — parse the canonical calendar date to LOCAL midnight; never
  // `new Date(iso)` (UTC) which could roll the month at a boundary.
  const d = parseCalendarDateOrNull(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
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
  const minimumDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000); // at least 3 weeks out

  // LH-26 — seed the picker at LOCAL midnight of the stored calendar day so it
  // opens on exactly the day the user chose.
  const dateValue = parseCalendarDateOrNull(value) ?? minimumDate;

  const onChangeDate = (_e: any, selected?: Date) => {
    setShowPicker(false);
    if (selected) {
      // LH-26 — keep the user's LOCAL calendar components. `toISOString()`
      // here would store the previous day for any UTC+ timezone (Nairobi).
      onChange(toCalendarDate(selected));
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
          // The app is light-only (`userInterfaceStyle: "light"`). Pin the iOS
          // native picker to light so an OS dark-mode device can't render it
          // dark-on-light. Android legibility is handled by the light app
          // theme (plugins/with-light-native-theme.js); `themeVariant` is a
          // no-op there.
          themeVariant="light"
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
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
  },
  placeholder: {
    fontWeight: '500',
    color: palette.gray300,
  },
});
