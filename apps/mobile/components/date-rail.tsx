import { ScrollView, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { palette } from '@/constants/theme';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildDateRange(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
      date: d,
      dateStr: d.toISOString().split('T')[0],
    };
  });
}

export function DateRail({ days, selected, sessionDates, onSelect }: {
  days: Array<{ date: Date; dateStr: string }>;
  selected: string;
  sessionDates: Set<string>;
  onSelect: (d: string) => void;
}) {
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dateRailRow}
    >
      {days.map(({ date, dateStr }) => {
        const on = dateStr === selected;
        const isToday = dateStr === todayStr;
        const hasDot = sessionDates.has(dateStr);
        return (
          <TouchableOpacity
            key={dateStr}
            style={[styles.datePill, on && styles.datePillOn]}
            onPress={() => onSelect(dateStr)}
            activeOpacity={0.75}
          >
            <ThemedText style={[styles.datePillDow, on && styles.datePillTextOn]}>
              {isToday ? 'Today' : DAY[date.getDay()]}
            </ThemedText>
            <ThemedText style={[styles.datePillDay, on && styles.datePillTextOn]}>
              {date.getDate()}
            </ThemedText>
            {hasDot && <View style={[styles.dateDot, on && styles.dateDotOn]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dateRailRow: { paddingHorizontal: 20, gap: 8, paddingTop: 16, paddingBottom: 4, marginBottom: 12 },
  datePill: {
    width: 64, paddingTop: 12, paddingBottom: 12, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.white,
    borderWidth: 1, borderColor: palette.border,
    overflow: 'hidden',
  },
  datePillOn: { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  datePillDow: { fontSize: 9, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.5 },
  datePillDay: { fontSize: 20, fontWeight: '800', color: palette.ink700, lineHeight: 24 },
  datePillTextOn: { color: '#fff' },
  dateDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.blue500, marginTop: 3 },
  dateDotOn: { backgroundColor: '#fff' },
});
