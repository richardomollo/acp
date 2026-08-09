import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { Calendar } from 'react-native-calendars';

interface Props {
  visible: boolean;
  value: Date;
  minimumDate?: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}

export default function DatePickerModal({ visible, value, minimumDate, onConfirm, onCancel }: Props) {
  const selectedString = value.toISOString().split('T')[0];
  const minDateString = minimumDate?.toISOString().split('T')[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <ThemedText style={styles.cancelBtn}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.title}>Select Date</ThemedText>
            <View style={styles.placeholder} />
          </View>
          <Calendar
            current={selectedString}
            minDate={minDateString}
            onDayPress={(day) => {
              const [y, m, d] = day.dateString.split('-').map(Number);
              const picked = new Date(value);
              picked.setFullYear(y, m - 1, d);
              onConfirm(picked);
            }}
            markedDates={{
              [selectedString]: { selected: true, selectedColor: '#002fff' },
            }}
            theme={{
              selectedDayBackgroundColor: '#002fff',
              selectedDayTextColor: '#ffffff',
              todayTextColor: '#002fff',
              arrowColor: '#002fff',
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  cancelBtn: {
    fontSize: 16,
    color: '#666',
    minWidth: 60,
  },
  placeholder: {
    minWidth: 60,
  },
});
